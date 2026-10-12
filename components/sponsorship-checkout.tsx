/* eslint-disable @typescript-eslint/no-explicit-any, react-hooks/set-state-in-effect */
'use client';

import { type CSSProperties, useEffect, useMemo, useRef, useState } from 'react';
import { Check, Copy, ExternalLink, ShieldCheck, Wallet, X } from 'lucide-react';
import { PAYMENT_NETWORKS, TREASURY_WALLET_ADDRESS } from '@/lib/payment-networks';
import { stringToHex } from 'viem';
import { discoverWallets, mobileWalletLinks, walletCheckoutUrl, type WalletOption, type WalletProvider } from '@/lib/wallet-discovery';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import QrPaymentRequest from '@/components/qr-payment-request';

type Slot = {
  id: number;
  price: number;
  position: string;
  status: string;
  currentPrice: string | null;
  claimPrice: string;
  claimPriceUnits: string;
  holder?: { project: string; x: string } | null;
  canClaim: boolean;
};

type Reservation = {
  paymentMode?: 'wallet' | 'qr';
  paymentUri?: string;
  qrPayable?: boolean;
  claimPrice?: string;
  identifyingFraction?: string;
  id: string;
  secret: string;
  reservedUntil: number;
  price: string;
  priceUnits: string;
  currentPrice: string | null;
  isChallenge: boolean;
  position: string;
  project: string;
  wallet: string;
  treasury: string;
  chainName: string;
  chainId: number;
  token: string;
  tokenLabel: string;
  gas: string;
  tokenAddress: string;
  decimals: number;
  explorer: string;
};

type Verification = {
  status: string;
  confirmations?: number;
  required?: number;
  transactionHash?: string;
  project?: string;
  slot?: number;
  position?: string;
  price?: string;
  priceUnits?: string;
  refundStatus?: string;
  claimStatus?: string;
  token?: string;
  network?: string;
  logoStatus?: string;
  explorerUrl?: string;
  message?: string;
};

type Props = {
  qrPaymentsEnabled?: boolean;
  open: boolean;
  slot: Slot | null;
  paymentsReady: boolean;
  claimsOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirmed: () => void;
};

const truncate = (value: string, start = 7, end = 5) => value ? `${value.slice(0, start)}…${value.slice(-end)}` : '';
const statusLabel = (status: string) => ({
  PENDING: 'WAITING FOR PAYMENT…',
  PAYMENT_DETECTED: 'PAYMENT DETECTED',
  CONFIRMING: 'CONFIRMING PAYMENT',
  CONFIRMED: 'PAYMENT CONFIRMED',
  LATE_CONFIRMED: 'REFUND PENDING',
  FAILED: 'TRANSACTION FAILED',
  EXPIRED: 'RESERVATION EXPIRED',
  CANCELLED: 'RESERVATION CANCELLED',
}[status] || status.replaceAll('_', ' '));

export default function SponsorshipCheckout({ open, slot, paymentsReady, claimsOpen, qrPaymentsEnabled=false, onOpenChange, onConfirmed }: Props) {
  const [paymentMode, setPaymentMode] = useState<'wallet' | 'qr'>('wallet');
  const [chainId,setChainId]=useState(8453);
  const [selectedToken,setSelectedToken]=useState('USDC');
  const network=PAYMENT_NETWORKS.find(item=>item.id===chainId)!;
  const [reservation, setReservation] = useState<Reservation | null>(null);
  const [verification, setVerification] = useState<Verification | null>(null);
  const [busy, setBusy] = useState(false);
  const [tx, setTx] = useState('');
  const [wallet, setWallet] = useState('');
  const [error, setError] = useState('');
  const [copied, setCopied] = useState('');
  const [now, setNow] = useState(0);
  const [paying,setPaying]=useState(false);
  const [viewportStyle,setViewportStyle]=useState<CSSProperties>({});
  const [walletOptions,setWalletOptions]=useState<WalletOption[]>([]);
  const [walletPicker,setWalletPicker]=useState(false);
  const [walletName,setWalletName]=useState('');
  const [walletLinks,setWalletLinks]=useState<{name:string;href:string}[]>([]);
  const provider=useRef<WalletProvider|null>(null);
  const mobileWalletUI=()=> /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || (window.matchMedia('(pointer: coarse)').matches && window.innerWidth<=900);
  useEffect(()=>discoverWallets(window,setWalletOptions),[]);
  useEffect(()=>{
    if(!open||!slot)return;
    // Mobile app links require HTTPS. Local HTTP previews must still render.
    if(window.location.protocol!=='https:'){setWalletLinks([]);return;}
    setWalletLinks(mobileWalletLinks(walletCheckoutUrl(window.location.origin,slot.id,chainId)));
  },[open,slot?.id,chainId]);
  useEffect(()=>{setWalletPicker(false);},[open,slot?.id]);
  const sending=useRef(false);
  const submitting=useRef(false);
  const checking=useRef(false);
  const cancelling=useRef(false);
  const paymentUncertain=useRef(false);
  const checkoutContent=useRef<HTMLDivElement>(null);
  const savedKey=slot?`devcon-checkout:${slot.id}`:'';

  useEffect(()=>{checkoutContent.current?.scrollTo({top:0});},[reservation?.id]);

  function remember(value: Reservation,hash='') {
    try { sessionStorage.setItem(savedKey,JSON.stringify({reservation:value,tx:hash,paymentUncertain:paymentUncertain.current})); } catch { /* Checkout still works when storage is unavailable. */ }
  }

  useEffect(() => {
    if (reservation?.paymentMode === 'qr') {
      // External wallet transfers cannot be observed before their hash is mined.
      // Never auto-cancel a displayed QR when the sponsor leaves this tab.
      paymentUncertain.current = true;
      remember(reservation, tx);
    }
  }, [reservation, tx]);

  useEffect(()=>{
    if(!open)return;
    const viewport=window.visualViewport;
    let frame=0;
    const update=()=>{
      // Let pinch zoom behave normally; only follow keyboard/browser chrome changes.
      if(viewport&&viewport.scale!==1)return;
      setViewportStyle({
        '--checkout-viewport-height':`${viewport?.height??window.innerHeight}px`,
        '--checkout-viewport-top':`${viewport?.offsetTop??0}px`,
      } as CSSProperties);
    };
    const schedule=()=>{cancelAnimationFrame(frame);frame=requestAnimationFrame(update);};
    update();
    viewport?.addEventListener('resize',schedule);
    viewport?.addEventListener('scroll',schedule);
    window.addEventListener('resize',schedule);
    return ()=>{
      cancelAnimationFrame(frame);
      viewport?.removeEventListener('resize',schedule);
      viewport?.removeEventListener('scroll',schedule);
      window.removeEventListener('resize',schedule);
    };
  },[open]);

  useEffect(() => {
    if (!open) return;
    let current=true;
    const controller=new AbortController();
    paymentUncertain.current=false;
    setReservation(null);
    setVerification(null);
    setBusy(false);
    setTx('');
    setWallet('');
    setError('');
    setCopied('');
    setNow(Date.now());
    const requestedChain=Number(new URLSearchParams(window.location.search).get('checkoutChain'));
    if(PAYMENT_NETWORKS.some(item=>item.id===requestedChain))setChainId(requestedChain);
    try {
      const saved=JSON.parse(sessionStorage.getItem(`devcon-checkout:${slot?.id}`)||'null');
      if(saved?.reservation?.id&&saved.reservation.secret&&saved.reservation.treasury?.toLowerCase()===TREASURY_WALLET_ADDRESS&&PAYMENT_NETWORKS.some(item=>item.id===saved.reservation.chainId)){
        if(saved.reservation.paymentMode==='qr'){
          // Do not trust a cached URI, amount, token or wallet on browser restore.
          setBusy(true);
          void fetch('/api/checkout/qr-details',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({id:saved.reservation.id,secret:saved.reservation.secret}),signal:controller.signal})
            .then(async response=>{const value=await response.json() as Reservation & {status:string;transactionHash?:string;error?:string};if(!response.ok)throw new Error(value.error||'Unable to restore QR payment.');return value;})
            .then(value=>{if(current){paymentUncertain.current=true;setReservation(value);setTx(value.transactionHash||'');setWallet(value.wallet);setVerification({status:value.status});}})
            .catch(error=>{if(current)setError(error.message||'Unable to restore QR payment.');})
            .finally(()=>{if(current)setBusy(false);});
        }else{
          paymentUncertain.current=Boolean(saved.paymentUncertain);
          setReservation(saved.reservation);
          setTx(saved.tx||'');
          setWallet(saved.reservation.wallet);
          setVerification({status:saved.tx?'PAYMENT_DETECTED':'PENDING'});
        }
      }
    } catch { /* Ignore an unavailable or invalid saved checkout. */ }
    return ()=>{current=false;controller.abort();};
  }, [open, slot?.id]);

  useEffect(()=>{if(!qrPaymentsEnabled)setPaymentMode('wallet');},[qrPaymentsEnabled]);

  useEffect(() => {
    if (!open || !reservation || ['CONFIRMED', 'LATE_CONFIRMED'].includes(verification?.status || '')) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [open, reservation, verification?.status]);

  const remaining = reservation ? Math.max(0, Math.ceil((reservation.reservedUntil - now) / 1000)) : 0;
  const clock = `${String(Math.floor(remaining / 60)).padStart(2, '0')}:${String(remaining % 60).padStart(2, '0')}`;
  const status = verification?.status || (reservation ? 'PENDING' : '');
  const confirmed = status === 'CONFIRMED';
  const late = status === 'LATE_CONFIRMED';
  const visibleStatus = reservation && remaining === 0 && !tx && status === 'PENDING' ? 'EXPIRED' : status;
  const connected = useMemo(() => wallet && reservation && wallet.toLowerCase() === reservation.wallet.toLowerCase(), [wallet, reservation]);

  async function cancelUnpaid(close=true) {
    if(cancelling.current)return;
    if(!reservation || tx || paymentUncertain.current || sending.current || !['PENDING','EXPIRED'].includes(status)) {
      if(close)onOpenChange(false);
      return;
    }
    cancelling.current=true;setBusy(true);
    try {
      const response=await fetch('/api/checkout/cancel',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({id:reservation.id,secret:reservation.secret}),keepalive:true});
      const result=await response.json() as {released?:boolean;error?:string};
      if(!response.ok)throw new Error(result.error||'Could not release the reservation. Please retry.');
      if(result.released) {
        try{sessionStorage.removeItem(savedKey);}catch{}
        setReservation(null);setVerification(null);setTx('');
        onConfirmed();
      }
      if(close)onOpenChange(false);
    }catch(caught:any){setError(caught?.message||'Could not release the reservation.');}
    finally{cancelling.current=false;setBusy(false);}
  }

  useEffect(()=>{
    if(!open || !reservation || tx || !['PENDING','EXPIRED'].includes(status))return;
    const leave=()=>{
      if(sending.current || paymentUncertain.current)return;
      const body=JSON.stringify({id:reservation.id,secret:reservation.secret});
      const sent=navigator.sendBeacon?.('/api/checkout/cancel',new Blob([body],{type:'application/json'}));
      if(!sent)void fetch('/api/checkout/cancel',{method:'POST',headers:{'content-type':'application/json'},body,keepalive:true}).catch(()=>{});
      // On return, the stale reservation will be checked server-side.
    };
    window.addEventListener('pagehide',leave);
    const back=()=>{void cancelUnpaid();};
    window.addEventListener('popstate',back);
    return()=>{window.removeEventListener('pagehide',leave);window.removeEventListener('popstate',back);};
  },[open,reservation,tx,status]);

  function requireProvider() {
    const legacy=(window as any).ethereum as WalletProvider|undefined;
    const selected=provider.current || (walletOptions.length===1 ? walletOptions[0].provider : null) || (!mobileWalletUI() && legacy?.request ? legacy : null);
    if(!selected)throw new Error('Tap Connect wallet to choose your wallet before continuing.');
    provider.current=selected;
    return selected;
  }

  async function connectSelected(option: WalletOption) {
    setError('');setBusy(true);
    try {
      const accounts=await option.provider.request({method:'eth_requestAccounts'});
      const account=String(accounts?.[0]||'');
      if(!/^0x[0-9a-fA-F]{40}$/.test(account))throw new Error('Your wallet did not return a valid account.');
      if(reservation && account.toLowerCase()!==reservation.wallet.toLowerCase())throw new Error('Connect the same wallet used to reserve this spot.');
      provider.current=option.provider;
      setWallet(account);setWalletName(option.name);setWalletPicker(false);
    }catch(caught:any){setError(caught?.message||'Wallet connection was cancelled.');}
    finally{setBusy(false);}
  }

  function connectWallet() {
    setError('');
    window.dispatchEvent(new Event('eip6963:requestProvider'));
    if(mobileWalletUI()){setWalletPicker(true);return;}
    const legacy=(window as any).ethereum as WalletProvider|undefined;
    const selected=provider.current || (legacy?.request ? legacy : walletOptions[0]?.provider);
    if(!selected){setError('No browser wallet detected. Open your wallet extension, then try again.');return;}
    const option=walletOptions.find(item=>item.provider===selected);
    void connectSelected(option || {id:'browser',name:'Wallet',provider:selected});
  }

  async function reserve(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!slot || !paymentsReady || !claimsOpen || !slot.canClaim || submitting.current) return;
    const form = event.currentTarget;
    const payload = new FormData(form);
    const logo = payload.get('logo') as File;
    if (!logo?.size) {
      setError('Upload a PNG, JPG or static SVG logo.');
      return;
    }
    if (logo.size > 5 * 1024 * 1024) {
      setError('Logo must be under 5 MB.');
      return;
    }
    if (!['image/png', 'image/jpeg', 'image/svg+xml'].includes(logo.type)) {
      setError('Use a PNG, JPG or static SVG logo.');
      return;
    }
    setBusy(true);
    submitting.current=true;
    setError('');
    try {
      payload.set('slot', String(slot.id));
      payload.set('chainId',String(chainId));
      payload.set('token',selectedToken);
      if (paymentMode === 'wallet') {
        const ethereum=requireProvider();
        const accounts=await ethereum.request({method:'eth_requestAccounts'});
        if(String(accounts?.[0]||'').toLowerCase()!==String(payload.get('wallet')).toLowerCase())throw new Error('Connect the payment wallet entered in your details.');
        const challengeResponse=await fetch('/api/checkout/authorize',{method:'POST',body:payload});
        const challenge=await challengeResponse.json() as {id:string;message:string;error?:string};
        if(!challengeResponse.ok)throw new Error(challenge.error||'Unable to authorize checkout.');
        const signature=await ethereum.request({method:'personal_sign',params:[stringToHex(challenge.message),accounts[0]]});
        payload.set('authorization',challenge.id);
        payload.set('signature',signature);
      }
      const response = await fetch(paymentMode === 'qr' ? '/api/checkout/qr' : '/api/reserve', { method: 'POST', body: payload });
      const result: any = await response.json();
      if (!response.ok) throw new Error(result.error || 'The reservation could not be created.');
      setReservation(result);
      remember(result);
      setWallet(result.wallet);
      setVerification({ status: 'PENDING' });
      setNow(Date.now());
    } catch (caught: any) {
      setError(caught?.message || 'The reservation could not be created.');
    } finally {
      setBusy(false);
      submitting.current=false;
    }
  }

  async function verifyPayment(hash = tx) {
    if (!reservation || checking.current) return;
    checking.current=true;
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/verify', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id: reservation.id, secret: reservation.secret, tx: hash.trim() }),
      });
      const result: Verification & { error?: string } = await response.json();
      if (!response.ok) throw new Error(result.error || 'Payment verification is temporarily unavailable.');
      setVerification(result);
      if (result.transactionHash) { setTx(result.transactionHash);remember(reservation,result.transactionHash); }
      if(result.status==='CANCELLED'){try{sessionStorage.removeItem(savedKey);}catch{}setReservation(null);setVerification(null);onConfirmed();}
      if (['CONFIRMED', 'LATE_CONFIRMED'].includes(result.status)) onConfirmed();
    } catch (caught: any) {
      setError(caught?.message || 'Payment verification is temporarily unavailable.');
    } finally {
      setBusy(false);
      checking.current=false;
    }
  }

  useEffect(() => {
    if (!reservation || confirmed || late || ['FAILED','CANCELLED'].includes(status)) return;
    const timer = window.setInterval(() => verifyPayment(tx), 12000);
    return () => window.clearInterval(timer);
    // The interval intentionally follows status changes returned by the verifier.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reservation?.id, tx, status, late]);

  async function payWithWallet() {
    if (!reservation || sending.current || tx || ['PAYMENT_DETECTED','CONFIRMING','FAILED'].includes(status)) return;
    sending.current=true;
    setPaying(true);
    setError('');
    try {
      if (reservation.reservedUntil-Date.now()<60000) throw new Error('Less than one minute remains. Do not send funds; start a new checkout when this reservation expires.');
      const ethereum = requireProvider();
      const accounts = await ethereum.request({ method: 'eth_requestAccounts' });
      const account = String(accounts?.[0] || '');
      if (account.toLowerCase() !== reservation.wallet.toLowerCase()) throw new Error('Connect the same wallet address entered in your sponsor details.');
      setWallet(account);
      const currentChain = Number(await ethereum.request({ method: 'eth_chainId' }));
      if (currentChain !== reservation.chainId) {
        try {
          await ethereum.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: `0x${reservation.chainId.toString(16)}` }] });
        } catch (caught:any) {
          if(caught?.code!==4902)throw new Error(`Switch your wallet to ${reservation.chainName} mainnet, then try again.`);
          const target=PAYMENT_NETWORKS.find(item=>item.id===reservation.chainId)!;
          await ethereum.request({method:'wallet_addEthereumChain',params:[{chainId:`0x${target.id.toString(16)}`,chainName:target.name,rpcUrls:[target.rpc],blockExplorerUrls:[new URL(target.explorer).origin],nativeCurrency:{name:target.gas,symbol:target.gas,decimals:18}}]});
          await ethereum.request({method:'wallet_switchEthereumChain',params:[{chainId:`0x${target.id.toString(16)}`}]});
        }
      }
      if(Number(await ethereum.request({method:'eth_chainId'}))!==reservation.chainId)throw new Error('The wallet is on the wrong payment network.');
      const latestAccounts=await ethereum.request({method:'eth_accounts'});
      if(String(latestAccounts?.[0]||'').toLowerCase()!==reservation.wallet.toLowerCase())throw new Error('Your wallet account changed. Reconnect the original payment wallet.');
      // Recheck server state immediately before asking the wallet to send money.
      const intentResponse=await fetch('/api/checkout/preflight',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({id:reservation.id,secret:reservation.secret})});
      const intent=await intentResponse.json() as {treasury:string;priceUnits:string;chainId:number;tokenAddress:string;error?:string};
      if(!intentResponse.ok)throw new Error(intent.error||'This checkout is no longer payable.');
      if(intent.treasury.toLowerCase()!==TREASURY_WALLET_ADDRESS||intent.priceUnits!==reservation.priceUnits||intent.chainId!==reservation.chainId||intent.tokenAddress.toLowerCase()!==reservation.tokenAddress.toLowerCase())throw new Error('Payment details changed. Refresh the checkout before sending.');
      const units = BigInt(reservation.priceUnits);
      const data = `0xa9059cbb${reservation.treasury.slice(2).toLowerCase().padStart(64, '0')}${units.toString(16).padStart(64, '0')}`;
      paymentUncertain.current=true;remember(reservation);
      const hash = await ethereum.request({
        method: 'eth_sendTransaction',
        params: [{ from: account, to: reservation.tokenAddress, data, value: '0x0' }],
      });
      setTx(String(hash));
      remember(reservation,String(hash));
      setVerification({ status: 'PAYMENT_DETECTED', transactionHash: String(hash) });
      await verifyPayment(String(hash));
    } catch (caught: any) {
      if(Number(caught?.code)===4001 || Number(caught?.cause?.code)===4001){
        paymentUncertain.current=false;sending.current=false;
        await cancelUnpaid();
      }else{setError(caught?.message || 'The wallet transaction status is uncertain. Check your wallet before trying again.');}
    } finally {
      sending.current=false;
      setPaying(false);
    }
  }

  async function copy(value: string, key: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(key);
      window.setTimeout(() => setCopied(''), 1600);
    } catch {
      setError('Copy was blocked by the browser. Select the value manually.');
    }
  }

  const explorerUrl = verification?.explorerUrl || (reservation && tx ? `${reservation.explorer}${tx}` : '');

  return (
    <Dialog open={open} onOpenChange={value=>{if(!paying&&!submitting.current){if(value)onOpenChange(true);else void cancelUnpaid();}}}>
      <DialogContent ref={checkoutContent} positioning="custom" className="checkout" style={viewportStyle} showCloseButton={false}>
        <div className="checkout-header">
        <div className="checkout-progress" aria-label="Checkout progress">
          <span className={!reservation ? 'active' : 'complete'}><b>01</b> DETAILS</span>
          <i aria-hidden="true" />
          <span className={reservation ? 'active' : ''}><b>02</b> PAYMENT</span>
        </div>
        <DialogClose className="checkout-close" aria-label="Close checkout" disabled={paying||(!reservation&&busy)}><X size={20} aria-hidden="true" /></DialogClose>
        </div>

        {confirmed ? (
          <Success reservation={reservation!} verification={verification!} tx={tx} explorerUrl={explorerUrl} onClose={() => onOpenChange(false)} />
        ) : late ? (
          <LatePayment reservation={reservation!} verification={verification!} tx={tx} explorerUrl={explorerUrl} onClose={() => onOpenChange(false)} />
        ) : (
          <>
            <DialogTitle>{reservation ? 'Confirm your claim.' : slot?.status === 'HELD' ? 'Take this spot.' : 'Claim this spot.'}</DialogTitle>
            <DialogDescription>{reservation ? `Complete one exact ${reservation.tokenLabel || reservation.token} payment on ${reservation.chainName}.` : slot?.status === 'HELD' ? 'The current holder stays in place until your payment is confirmed.' : 'Your project can become the first holder.'}</DialogDescription>

            {slot && (
              <div className="checkout-summary">
                <div>
                  <span className="mono">SLOT {String(slot.id).padStart(2, '0')}</span>
                  <p>{slot.position}</p>
                </div>
                <div className="checkout-price-stack">
                  {slot.currentPrice && <span>CURRENT PRICE <b>${slot.currentPrice}</b></span>}
                  <div className="checkout-price"><strong>${reservation?.price || slot.claimPrice}</strong><span>{slot.currentPrice ? 'YOUR CLAIM' : 'CLAIM PRICE'} · {reservation?.token || selectedToken}</span></div>
                </div>
              </div>
            )}

            {!reservation ? (
              <form onSubmit={reserve} className="sponsor-form">
                {qrPaymentsEnabled && <fieldset className="checkout-payment-choice"><legend>HOW WOULD YOU LIKE TO PAY?</legend>
                  <label><input type="radio" name="paymentMode" value="wallet" checked={paymentMode==='wallet'} onChange={()=>setPaymentMode('wallet')} /> CONNECT & SIGN</label>
                  <label><input type="radio" name="paymentMode" value="qr" checked={paymentMode==='qr'} onChange={()=>setPaymentMode('qr')} /> QR · NO CONNECTION OR SIGNATURE</label>
                </fieldset>}
                {paymentMode==='qr' && <p className="field-note">A tiny identifying fraction below 0.01 USDC is added to your payment. Send the full amount from the wallet address you enter. It is included in eligible refunds and excluded from auction pricing. QR requests remain reserved until expiry, even if closed.</p>}
                <div className="form-grid">
                  <label>PAYMENT NETWORK<select value={chainId} onChange={event=>{setChainId(Number(event.target.value));setSelectedToken('USDC');}}>{PAYMENT_NETWORKS.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
                  <label>PAYMENT TOKEN<select value={selectedToken} onChange={event=>setSelectedToken(event.target.value)}>{network.tokens.map(item=><option key={item.symbol} value={item.symbol}>{item.label}</option>)}</select></label>
                  <p className="field-note full">{network.tokens.length===1?'USDC only on this network. ':''}Gas is paid in {network.gas}. Refunds return the same token on the original payment network.</p>
                  <label>PROJECT NAME *<input name="project" placeholder="Example Protocol" required maxLength={120} autoComplete="organization" enterKeyHint="next" /></label>
                  <label>X / TWITTER HANDLE *<input name="x" placeholder="@example" pattern="@[A-Za-z0-9_]{1,15}" required maxLength={16} autoCapitalize="none" autoCorrect="off" spellCheck={false} enterKeyHint="next" /></label>
                  <label className="full">PROJECT WEBSITE <span>OPTIONAL</span><input name="website" type="url" inputMode="url" placeholder="https://example.com" maxLength={300} autoComplete="url" autoCapitalize="none" autoCorrect="off" spellCheck={false} enterKeyHint="next" /></label>
                  <label>CONTACT NAME *<input name="contact" placeholder="John" required maxLength={120} autoComplete="name" enterKeyHint="next" /></label>
                  <label>EMAIL *<input name="email" type="email" inputMode="email" placeholder="john@example.com" required maxLength={254} autoComplete="email" autoCapitalize="none" spellCheck={false} enterKeyHint="next" /></label>
                  <label className="full">WALLET ADDRESS *<input name="wallet" value={wallet} onChange={(event) => setWallet(event.target.value)} placeholder="0x…" pattern="0x[0-9a-fA-F]{40}" required maxLength={42} autoComplete="off" autoCapitalize="none" autoCorrect="off" spellCheck={false} enterKeyHint="next" /></label>
                </div>
                {paymentMode==='wallet' && <button type="button" className="wallet-connect" onClick={connectWallet}><Wallet size={16} /> {wallet ? `${walletName || 'WALLET'} · ${truncate(wallet)}` : 'CONNECT WALLET TO FILL ADDRESS'}</button>}
                <label className="file-field">LOGO UPLOAD *<input name="logo" type="file" accept="image/png,image/jpeg,image/svg+xml" required /><span>PNG, JPG or static SVG · max 5 MB · high-resolution transparent artwork preferred.</span></label>
                <label>SHORT PROJECT DESCRIPTION <span>OPTIONAL</span><textarea name="description" rows={3} maxLength={500} placeholder="A short line about what you're building." /></label>
                <label className="terms-row"><input type="checkbox" name="terms" value="accepted" required /><span>I agree to the <a href="/terms" target="_blank" rel="noopener noreferrer">Terms &amp; Conditions</a> and understand the sponsorship rules.</span></label>
                <button className="button primary checkout-primary" disabled={busy || !paymentsReady || !claimsOpen || !slot?.canClaim}>{busy ? (paymentMode==='qr'?'CREATING PAYMENT REQUEST…':'AUTHORIZE IN YOUR WALLET…') : (paymentMode==='qr'?'RESERVE & SHOW QR':'SIGN & CONTINUE TO PAYMENT')}</button>
              </form>
            ) : (
              <div className="payment-step">
                <div className={`reservation-banner ${remaining ? '' : 'expired'}`}>
                  <span>SLOT {String(slot?.id || 0).padStart(2, '0')} RESERVED FOR YOU</span>
                  <strong>{clock}</strong>
                </div>
                <div className="payment-method">
                  <div><span className="mono">PAY WITH CRYPTO</span><h3>{reservation.tokenLabel || reservation.token} on {reservation.chainName}</h3></div>
                  <span className="network-mark">{reservation.chainName.toUpperCase()}</span>
                </div>

                {reservation.paymentMode==='qr' ? <>
                  <QrPaymentRequest uri={reservation.paymentUri!} amount={reservation.price} network={reservation.chainName} treasury={reservation.treasury} wallet={reservation.wallet} claimPrice={reservation.claimPrice!} fraction={reservation.identifyingFraction!} active={reservation.qrPayable!==false&&remaining>=60&&!tx&&status==='PENDING'} copy={(value,label)=>void copy(value,label)} />
                  {copied && <p role="status">{copied==='amount'?'Exact amount':'Receiver'} copied.</p>}
                  <label className="qr-hash-field">TRANSACTION HASH · OPTIONAL<input value={tx} onChange={event=>setTx(event.target.value)} placeholder="0x…" autoCapitalize="none" spellCheck={false} /></label>
                  <button type="button" className="button secondary" disabled={busy} onClick={()=>void verifyPayment(tx)}>CHECK PAYMENT</button>
                </> : <>
                <button className="button wallet-button" type="button" onClick={connectWallet}>
                  <Wallet size={17} /> {wallet ? `${connected ? 'CONNECTED' : 'WRONG WALLET'} · ${truncate(wallet)}` : 'CONNECT WALLET'}
                </button>
                {wallet && <div className="wallet-state"><span>Connected wallet</span><code>{wallet}</code></div>}
                <button className="button primary checkout-primary" type="button" onClick={payWithWallet} disabled={remaining<60 || busy || paying || Boolean(tx) || status==='FAILED'}>
                  {paying ? 'CONFIRM IN YOUR WALLET…' : tx ? 'PAYMENT SENT · VERIFYING' : `PAY $${reservation.price} ${reservation.token}`}
                </button>

                </>}

                <div className={`payment-status ${['PAYMENT_DETECTED', 'CONFIRMING'].includes(visibleStatus) ? 'is-live' : ''}`} aria-live="polite">
                  <span className="status-dot" />
                  <div><b>{statusLabel(visibleStatus)}</b><p>{visibleStatus === 'CONFIRMING' ? `${verification?.confirmations || 0} of ${verification?.required || 0} confirmations` : visibleStatus === 'EXPIRED' ? 'The claim reservation has been released. Close this window and reserve again before sending funds.' : verification?.message || 'Your payment is checked automatically.'}</p></div>
                </div>
                <p className="payment-warning"><ShieldCheck size={16} /> Only send {reservation.tokenLabel || reservation.token} on {reservation.chainName} for this checkout. You will need {reservation.gas} on {reservation.chainName} for gas. Never share your seed phrase.</p>
                {(!remaining||status==='FAILED')&&<button type="button" className="button slot-button" onClick={()=>{try{sessionStorage.removeItem(savedKey);}catch{}setReservation(null);setVerification(null);setTx('');onConfirmed();}}>START A NEW CHECKOUT</button>}
              </div>
            )}
            {error && <p className="error" role="alert">{error}</p>}
          </>
        )}
        <Dialog open={walletPicker && open} onOpenChange={setWalletPicker}>
          <DialogContent positioning="custom" className="wallet-picker-modal" style={viewportStyle} showCloseButton={false}>
            <div className="wallet-picker-heading"><DialogTitle>Connect wallet</DialogTitle><DialogClose aria-label="Close wallet chooser"><X size={20}/></DialogClose></div>
            <DialogDescription>Choose your wallet to continue.</DialogDescription>
            <div className="wallet-options">
              {walletOptions.map(option=><button type="button" key={option.id} disabled={busy||paying} onClick={()=>void connectSelected(option)}><Wallet size={20}/><span>{option.name}<small>Connect wallet</small></span><ExternalLink size={16}/></button>)}
              {!reservation && walletLinks.filter(link=>!walletOptions.some(option=>option.name.toLowerCase().replace(/[^a-z]/g,'').includes(link.name.toLowerCase().replace(/[^a-z]/g,'')))).map(option=><a key={option.name} href={option.href}><Wallet size={20}/><span>{option.name}<small>Open mobile app</small></span><ExternalLink size={16}/></a>)}
            </div>
            {!reservation && <button className="wallet-copy-link" type="button" onClick={()=>void copy(walletCheckoutUrl(window.location.origin,slot!.id,chainId),'wallet-link')}>{copied==='wallet-link'?'LINK COPIED':'USE ANOTHER WALLET · COPY LINK'}</button>}
            {!reservation && <p className="field-note">Mobile app options open this spot in your wallet’s browser.</p>}
            {reservation && !walletOptions.length && <p className="field-note">Return to the wallet browser used for this reservation.</p>}
            {error && <p className="error" role="alert">{error}</p>}
          </DialogContent>
        </Dialog>
      </DialogContent>
    </Dialog>
  );
}

function Success({ reservation, verification, tx, explorerUrl, onClose }: { reservation: Reservation; verification: Verification; tx: string; explorerUrl: string; onClose: () => void }) {
  return (
    <div className="checkout-success">
      <span className="success-mark"><Check size={30} /></span>
      <DialogTitle>YOU&apos;RE THE CURRENT HOLDER.</DialogTitle>
      <DialogDescription>Your claim is confirmed. The spot remains open to a 1.5 times claim until the auction deadline.</DialogDescription>
      <dl className="success-grid">
        <div><dt>PROJECT</dt><dd>{verification.project || reservation.project}</dd></div>
        <div><dt>SPOT</dt><dd>Slot {String(verification.slot || '').padStart(2, '0')}</dd></div>
        <div><dt>POSITION</dt><dd>{verification.position || reservation.position}</dd></div>
        <div><dt>PAYMENT</dt><dd>${verification.price || reservation.price} {verification.token || reservation.token}</dd></div>
        <div><dt>NETWORK</dt><dd>{verification.network || reservation.chainName}</dd></div>
        <div className="wide"><dt>TRANSACTION</dt><dd>{truncate(verification.transactionHash || tx, 10, 8)}</dd></div>
      </dl>
      {explorerUrl && <a className="button secondary-cta" href={explorerUrl} target="_blank" rel="noreferrer">VIEW TRANSACTION <ExternalLink size={14} /></a>}
      <p className="logo-review-note">Your logo is now displayed on the campaign. You can contact me if it needs replacing. If another project successfully takes this spot before the deadline, your confirmed payment becomes eligible for a full refund.</p>
      <div className="checkout-actions">
        <a className="button primary" href="https://x.com/web3manish" target="_blank" rel="noreferrer">FOLLOW @WEB3MANISH <ExternalLink size={14} /></a>
        <button className="button slot-button" type="button" onClick={onClose}>CLOSE</button>
      </div>
    </div>
  );
}

function LatePayment({ reservation, verification, tx, explorerUrl, onClose }: { reservation: Reservation; verification: Verification; tx: string; explorerUrl: string; onClose: () => void }) {
  return (
    <div className="checkout-success late-payment-result">
      <span className="success-mark"><ShieldCheck size={28} /></span>
      <DialogTitle>THE CLAIM DID NOT REPLACE THE HOLDER.</DialogTitle>
      <DialogDescription>The exact payment was confirmed outside the active claim window.</DialogDescription>
      <dl className="success-grid">
        <div><dt>SPOT</dt><dd>Slot {String(verification.slot || '').padStart(2, '0')}</dd></div>
        <div><dt>PAYMENT</dt><dd>${verification.price || reservation.price} {verification.token || reservation.token}</dd></div>
        <div><dt>CLAIM STATUS</dt><dd>NOT APPLIED</dd></div>
        <div><dt>REFUND STATUS</dt><dd>{verification.refundStatus || 'REFUND_PENDING'}</dd></div>
        <div className="wide"><dt>TRANSACTION</dt><dd>{truncate(verification.transactionHash || tx, 10, 8)}</dd></div>
      </dl>
      <p className="logo-review-note">The current holder was not changed. Your refund is pending and is not complete until the on-chain refund transaction is recorded.</p>
      {explorerUrl && <a className="button secondary-cta" href={explorerUrl} target="_blank" rel="noreferrer">VIEW TRANSACTION <ExternalLink size={14} /></a>}
      <div className="checkout-actions single-action"><button className="button slot-button" type="button" onClick={onClose}>CLOSE</button></div>
    </div>
  );
}
