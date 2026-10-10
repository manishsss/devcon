/* eslint-disable @typescript-eslint/no-explicit-any, react-hooks/set-state-in-effect */
'use client';

import { type CSSProperties, useEffect, useMemo, useRef, useState } from 'react';
import { Check, Copy, ExternalLink, ShieldCheck, Wallet, X } from 'lucide-react';
import { PAYMENT_NETWORKS, TREASURY_WALLET_ADDRESS } from '@/lib/payment-networks';
import { stringToHex } from 'viem';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';

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
}[status] || status.replaceAll('_', ' '));

export default function SponsorshipCheckout({ open, slot, paymentsReady, claimsOpen, onOpenChange, onConfirmed }: Props) {
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
  const sending=useRef(false);
  const submitting=useRef(false);
  const checking=useRef(false);
  const savedKey=slot?`devcon-checkout:${slot.id}`:'';

  function remember(value: Reservation,hash='') {
    try { sessionStorage.setItem(savedKey,JSON.stringify({reservation:value,tx:hash})); } catch { /* Checkout still works when storage is unavailable. */ }
  }

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
    setReservation(null);
    setVerification(null);
    setBusy(false);
    setTx('');
    setWallet('');
    setError('');
    setCopied('');
    setNow(Date.now());
    try {
      const saved=JSON.parse(sessionStorage.getItem(`devcon-checkout:${slot?.id}`)||'null');
      if(saved?.reservation?.id&&saved.reservation.secret&&saved.reservation.treasury?.toLowerCase()===TREASURY_WALLET_ADDRESS&&PAYMENT_NETWORKS.some(item=>item.id===saved.reservation.chainId)){
        setReservation(saved.reservation);
        setTx(saved.tx||'');
        setWallet(saved.reservation.wallet);
        setVerification({status:saved.tx?'PAYMENT_DETECTED':'PENDING'});
      }
    } catch { /* Ignore an unavailable or invalid saved checkout. */ }
  }, [open, slot?.id]);

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

  async function connectWallet() {
    setError('');
    try {
      const ethereum = (window as any).ethereum;
      if (!ethereum) throw new Error('Open this site in your wallet’s browser or use a browser wallet to sign your checkout.');
      const accounts = await ethereum.request({ method: 'eth_requestAccounts' });
      const account = String(accounts?.[0] || '');
      if (!account) throw new Error('Your wallet did not return an account.');
      setWallet(account);
      if (reservation && account.toLowerCase() !== reservation.wallet.toLowerCase()) {
        throw new Error('Connect the same wallet address entered in your sponsor details.');
      }
    } catch (caught: any) {
      setError(caught?.message || 'Wallet connection was cancelled.');
    }
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
      const ethereum=(window as any).ethereum;
      if(!ethereum)throw new Error('Open this site in your wallet’s browser or use a browser wallet to sign your checkout.');
      const accounts=await ethereum.request({method:'eth_requestAccounts'});
      if(String(accounts?.[0]||'').toLowerCase()!==String(payload.get('wallet')).toLowerCase())throw new Error('Connect the payment wallet entered in your details.');
      const challengeResponse=await fetch('/api/checkout/authorize',{method:'POST',body:payload});
      const challenge=await challengeResponse.json() as {id:string;message:string;error?:string};
      if(!challengeResponse.ok)throw new Error(challenge.error||'Unable to authorize checkout.');
      const signature=await ethereum.request({method:'personal_sign',params:[stringToHex(challenge.message),accounts[0]]});
      payload.set('authorization',challenge.id);
      payload.set('signature',signature);
      const response = await fetch('/api/reserve', { method: 'POST', body: payload });
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
      if (['CONFIRMED', 'LATE_CONFIRMED'].includes(result.status)) onConfirmed();
    } catch (caught: any) {
      setError(caught?.message || 'Payment verification is temporarily unavailable.');
    } finally {
      setBusy(false);
      checking.current=false;
    }
  }

  useEffect(() => {
    if (!reservation || confirmed || late || status === 'FAILED') return;
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
      const ethereum = (window as any).ethereum;
      if (!ethereum) throw new Error('No browser wallet was detected. Use the manual payment details and paste the transaction hash.');
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
      const hash = await ethereum.request({
        method: 'eth_sendTransaction',
        params: [{ from: account, to: reservation.tokenAddress, data, value: '0x0' }],
      });
      setTx(String(hash));
      remember(reservation,String(hash));
      setVerification({ status: 'PAYMENT_DETECTED', transactionHash: String(hash) });
      await verifyPayment(String(hash));
    } catch (caught: any) {
      setError(caught?.message || 'The wallet transaction was not sent.');
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
    <Dialog open={open} onOpenChange={value=>{if(!paying&&!submitting.current)onOpenChange(value);}}>
      <DialogContent className="checkout" style={viewportStyle} showCloseButton={false}>
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
                <button type="button" className="wallet-connect" onClick={connectWallet}><Wallet size={16} /> {wallet ? `CONNECTED ${truncate(wallet)}` : 'CONNECT WALLET TO FILL ADDRESS'}</button>
                <label className="file-field">LOGO UPLOAD *<input name="logo" type="file" accept="image/png,image/jpeg,image/svg+xml" required /><span>PNG, JPG or static SVG · max 5 MB · high-resolution transparent artwork preferred.</span></label>
                <label>SHORT PROJECT DESCRIPTION <span>OPTIONAL</span><textarea name="description" rows={3} maxLength={500} placeholder="A short line about what you're building." /></label>
                <label className="terms-row"><input type="checkbox" name="terms" value="accepted" required /><span>I understand that this is a sponsorship claim payment, not a donation. If another project later pays 1.5 times the current price before the deadline, I will be outbid and my confirmed payment will be eligible for a full refund.</span></label>
                <p className="field-note">Sign a message to prove ownership of your payment wallet, then reserve for up to 15 minutes. The signature does not transfer funds. You need the full USDC amount on your chosen network before reserving.</p>
                <button className="button primary checkout-primary" disabled={busy || !paymentsReady || !claimsOpen || !slot?.canClaim}>{busy ? 'AUTHORIZE IN YOUR WALLET…' : 'SIGN & CONTINUE TO PAYMENT'}</button>
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

                <button className="button wallet-button" type="button" onClick={connectWallet}>
                  <Wallet size={17} /> {wallet ? `${connected ? 'CONNECTED' : 'WRONG WALLET'} · ${truncate(wallet)}` : 'CONNECT WALLET'}
                </button>
                {wallet && <div className="wallet-state"><span>Connected wallet</span><code>{wallet}</code></div>}
                <div className="wallet-state"><span>Paid directly to Manish</span><code>{reservation.treasury}</code></div>
                <button className="button primary checkout-primary" type="button" onClick={payWithWallet} disabled={remaining<60 || busy || paying || Boolean(tx) || status==='FAILED'}>
                  {paying ? 'CONFIRM IN YOUR WALLET…' : tx ? 'PAYMENT SENT · VERIFYING' : `PAY $${reservation.price} ${reservation.token}`}
                </button>

                <details className="manual-payment">
                  <summary>Prefer to send manually?</summary>
                  <p>Send one exact transfer from the registered wallet before the timer ends. The holder changes only after the server confirms the payment.</p>
                  <dl className="payment-details">
                    <div><dt>NETWORK</dt><dd>{reservation.chainName}</dd></div>
                    <div><dt>TOKEN</dt><dd>{reservation.tokenLabel || reservation.token}</dd></div>
                    <div><dt>AMOUNT</dt><dd>${reservation.price} {reservation.token}</dd></div>
                    <div className="wide"><dt>TREASURY ADDRESS</dt><dd><code>{reservation.treasury}</code><button type="button" onClick={() => copy(reservation.treasury, 'treasury')} aria-label="Copy treasury address">{copied === 'treasury' ? <Check size={16} /> : <Copy size={16} />} <span>{copied === 'treasury' ? 'COPIED' : 'COPY ADDRESS'}</span></button></dd></div>
                    <div className="wide"><dt>TOKEN CONTRACT</dt><dd><code>{reservation.tokenAddress}</code><button type="button" onClick={() => copy(reservation.tokenAddress, 'token')} aria-label="Copy token contract">{copied === 'token' ? <Check size={16} /> : <Copy size={16} />}</button></dd></div>
                  </dl>
                </details>

                <div className="verify-box">
                  <label>TRANSACTION HASH<input value={tx} onChange={(event) => setTx(event.target.value)} placeholder="0x…" maxLength={66} autoComplete="off" autoCapitalize="none" autoCorrect="off" spellCheck={false} enterKeyHint="done" /></label>
                  <button className="button slot-button" type="button" onClick={() => verifyPayment()} disabled={!tx || busy}>{busy ? 'VERIFYING…' : 'VERIFY PAYMENT'}</button>
                </div>

                <div className={`payment-status ${['PAYMENT_DETECTED', 'CONFIRMING'].includes(visibleStatus) ? 'is-live' : ''}`} aria-live="polite">
                  <span className="status-dot" />
                  <div><b>{statusLabel(visibleStatus)}</b><p>{visibleStatus === 'CONFIRMING' ? `${verification?.confirmations || 0} of ${verification?.required || 0} confirmations` : visibleStatus === 'EXPIRED' ? 'The claim reservation has been released. Close this window and reserve again before sending funds.' : verification?.message || 'Your payment is checked automatically. A transaction hash can also be provided if needed.'}</p></div>
                </div>
                <p className="payment-warning"><ShieldCheck size={16} /> Only send {reservation.tokenLabel || reservation.token} on {reservation.chainName} for this checkout. You will need {reservation.gas} on {reservation.chainName} for gas. Never share your seed phrase.</p>
                {(!remaining||status==='FAILED')&&<button type="button" className="button slot-button" onClick={()=>{try{sessionStorage.removeItem(savedKey);}catch{}setReservation(null);setVerification(null);setTx('');onConfirmed();}}>START A NEW CHECKOUT</button>}
              </div>
            )}
            {error && <p className="error" role="alert">{error}</p>}
          </>
        )}
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
        <div><dt>CURRENT PRICE</dt><dd>${verification.price || reservation.price} {verification.token || reservation.token}</dd></div>
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
