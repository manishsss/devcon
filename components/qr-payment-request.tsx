'use client';

import { useEffect, useState } from 'react';
import QRCode from 'qrcode';

type Props = {
  uri: string; amount: string; network: string; treasury: string; wallet: string;
  claimPrice: string; fraction: string; active: boolean;
  copy: (value: string, label: string) => void;
};

export default function QrPaymentRequest(props: Props) {
  const [image, setImage] = useState('');
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let current = true;
    setImage(''); setFailed(false);
    if (props.active) {
      void QRCode.toDataURL(props.uri, { width: 256, margin: 4, errorCorrectionLevel: 'M' })
        .then(value => { if (current) setImage(value); })
        .catch(() => { if (current) setFailed(true); });
    }
    return () => { current = false; };
  }, [props.uri, props.active]);
  return (
    <section className="qr-payment-request" aria-label="Unique-amount QR payment">
      <p>No website wallet connection or signature is needed. Approve one USDC transfer in your wallet app.</p>
      {props.active ? (image ? <img src={image} width={256} height={256} alt={`USDC payment request for ${props.amount} on ${props.network}`} /> : <p role="status">{failed ? 'QR generation failed. Use the exact payment details below.' : 'Preparing payment QR…'}</p>) : <p role="status">Do not send funds: this request is closed, already detected, or too close to expiry.</p>}
      <dl>
        <dt>EXACT AMOUNT · DO NOT ROUND</dt><dd><strong>{props.amount} USDC</strong></dd>
        <dt>NETWORK</dt><dd>{props.network}</dd>
        <dt>RECEIVER</dt><dd><code>{props.treasury}</code></dd>
        <dt>SEND FROM YOUR ENTERED WALLET</dt><dd><code>{props.wallet}</code></dd>
      </dl>
      <p>Sponsorship: {props.claimPrice} USDC + identifying fraction: {props.fraction} USDC. The fraction is excluded from auction prices and fundraising totals, and included in an eligible full refund.</p>
      {props.active && <div className="checkout-actions">
        <button className="button secondary" type="button" onClick={() => props.copy(props.amount, 'amount')}>COPY EXACT AMOUNT</button>
        <button className="button secondary" type="button" onClick={() => props.copy(props.treasury, 'receiver')}>COPY RECEIVER</button>
        <a className="button secondary" href={props.uri}>OPEN WALLET REQUEST</a>
      </div>}
      <p>Wallet QR support varies. If it imports only an address, select USDC on {props.network} and enter the full amount yourself. Exchange withdrawals, contract wallets and native-token transfers are unsupported.</p>
      <p>Send once, leave enough time for confirmations, and check the network, token, receiver and amount before approving. Never reuse this QR. Closing this window keeps the reservation until its timer expires; late payments can only be queued for manual refund.</p>
    </section>
  );
}
