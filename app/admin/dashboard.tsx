/* eslint-disable @typescript-eslint/no-explicit-any, react-hooks/set-state-in-effect */
'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { PAYMENT_NETWORKS } from '@/lib/payment-networks';
import { Download, ExternalLink, RefreshCw, ShieldCheck } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

const human = (value: string | null | undefined) => value ? value.replaceAll('_', ' ') : 'Not set';
const when = (value: number | null | undefined) => value ? new Date(value).toLocaleString() : 'Not set';
const shortHash = (value: string | null | undefined) => value ? `${value.slice(0, 9)}…${value.slice(-7)}` : 'Not set';
const money = (units:string|null|undefined,fallback='0') => {
  if(!units)return fallback;
  const scale=BigInt(1_000_000),value=BigInt(units),whole=value/scale,fraction=(value%scale).toString().padStart(6,'0').replace(/0+$/,'');
  const visible=fraction?fraction.padEnd(Math.max(2,fraction.length),'0'):'';
  return `${whole.toLocaleString('en-US')}${visible?`.${visible}`:''}`;
};

export default function Dashboard() {
  const [data, setData] = useState<any>(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  async function load() {
    try {
      const response = await fetch('/api/admin');
      const result:any = await response.json();
      if (!response.ok) throw new Error(result.error || 'Dashboard unavailable.');
      setData(result);
    } catch (caught: any) {
      setMessage(caught?.message || 'Dashboard unavailable.');
    }
  }

  useEffect(() => { load(); }, []);

  async function save(path: string, body: any, success = 'Saved.') {
    setBusy(true);
    setMessage('');
    try {
      const response = await fetch(`/api/admin/${path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      const result:any = await response.json();
      if (!response.ok) throw new Error(result.error || 'The action could not be saved.');
      setMessage(result.emailSent ? `${success} Sponsor email sent.` : success);
      await load();
    } catch (caught: any) {
      setMessage(caught?.message || 'The action could not be saved.');
    } finally {
      setBusy(false);
    }
  }

  function exportData() {
    const clean = (value: any) => {
      let output = String(value ?? '');
      if (/^[=+@-]/.test(output)) output = `'${output}`;
      return `"${output.replaceAll('"', '""')}"`;
    };
    const columns = ['slotId','project','contact','x','email','website','wallet','chain','token','claimPriceUnits','claimSequence','sponsorshipStatus','paymentStatus','tx','refundStatus','refundAmountUnits','refundTx','logoStatus','createdAt','confirmedAt'];
    const csv = [columns.join(','), ...data.claims.map((claim: any) => columns.map(column => clean(claim[column])).join(','))].join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'devcon-auction-ledger.csv';
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async function replaceLogo(event: React.FormEvent<HTMLFormElement>, sponsorId: string) {
    event.preventDefault();
    setBusy(true);
    setMessage('');
    try {
      const form = new FormData(event.currentTarget);
      const response = await fetch(`/api/admin-logo/${sponsorId}`, { method: 'POST', body: form });
      const result:any = await response.json();
      if (!response.ok) throw new Error(result.error || 'Logo replacement failed.');
      setMessage('Replacement uploaded and returned to pending review.');
      event.currentTarget.reset();
      await load();
    } catch (caught: any) {
      setMessage(caught?.message || 'Logo replacement failed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="wrap admin">
      <header className="admin-header">
        <div><Link href="/">← Back to the T-shirt</Link><h1>Auction dashboard</h1><p className="muted">Private operations for the four-day escalating spot auction.</p></div>
        <div className="admin-actions"><button className="button" onClick={load}><RefreshCw size={14} /> REFRESH</button>{data && <button className="button" onClick={exportData}><Download size={14} /> EXPORT LEDGER</button>}</div>
      </header>
      {message && <div className="status-message notice" role="status">{message}</div>}

      {!data ? <p>Loading dashboard…</p> : (
        <>
          <section className="admin-metrics auction-metrics">
            <article><span>AUCTION</span><strong>{human(data.inventory.auction.status)}</strong></article>
            <article><span>CURRENT FUNDS</span><strong>${data.inventory.raisedDisplay} <small>/ ${data.inventory.targetDisplay}</small></strong></article>
            <article><span>HOLDERS</span><strong>{data.inventory.count} <small>/ 8</small></strong></article>
            <article><span>CHECKOUT</span><strong className={data.inventory.claimsOpen ? 'ready' : 'paused'}>{data.inventory.claimsOpen ? 'OPEN' : 'CLOSED'}</strong></article>
          </section>

          {!data.inventory.paymentsReady && <div className="admin-alert"><ShieldCheck size={21} /><div><b>Checkout is securely paused.</b><p>Add and validate the treasury wallet below. The auction cannot launch until the payment configuration passes server checks.</p></div></div>}
          {!data.emailDeliveryReady && <div className="admin-alert"><ShieldCheck size={21} /><div><b>Email delivery is not configured.</b><p>Outbid and refund notices are still written to the durable notification queue. Add RESEND_API_KEY and SPONSOR_FROM_EMAIL to deliver them automatically.</p></div></div>}

          <section className="panel launch-panel">
            <div className="panel-heading"><div><span className="mono">CAMPAIGN CLOCK</span><h2>One launch. Four days.</h2></div><span className="config-badge">{human(data.inventory.auction.status)}</span></div>
            {data.inventory.auction.status==='UPCOMING' ? <>
              <p>The timer begins from the server timestamp when this button is pressed. Launch is irreversible; the auction cannot be restarted or extended.</p>
              <button className="button primary" disabled={busy||!data.inventory.paymentsReady} onClick={()=>{
                if(window.confirm('Launch the four-day auction now? The server deadline will be permanent.'))save('auction/launch',{},'The four-day auction is live.');
              }}>LAUNCH 4-DAY AUCTION</button>
            </> : <div className="record-grid"><div><span>STARTED</span><p>{when(data.inventory.auction.startsAt)}</p></div><div><span>ENDS</span><p>{when(data.inventory.auction.endsAt)}</p></div><div><span>FINALIZED</span><p>{when(data.inventory.auction.finalizedAt)}</p></div><div><span>FINAL VALUE</span><p>{data.inventory.auction.finalValue?`$${data.inventory.auction.finalValue}`:'Not set'}</p></div></div>}
          </section>

          <form className="panel admin-config" key={JSON.stringify(data.config)} onSubmit={event => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            const next = { ...data.config };
            for (const [key, value] of form) next[key] = ['confirmations', 'reservationMinutes', 'maxUploadMB'].includes(key) ? Number(value) : String(value);
            save('config', next, 'Payment configuration validated and saved.');
          }}>
            <div className="panel-heading"><div><span className="mono">PAYMENT RAILS</span><h2>EVM payment configuration</h2></div><span className="config-badge">{data.inventory.auction.status==='UPCOMING'?'EDITABLE':'LOCKED'}</span></div>
            <p className="small muted">The same EVM treasury address receives payments on all five networks. Each checkout locks its token and network. Refund using that original token and network.</p>
            <div className="record-grid">{PAYMENT_NETWORKS.map(network=><div key={network.id}><span>{network.name.toUpperCase()} · {network.id}</span><p>{network.tokens.map(token=>token.label).join(' / ')}<br />Gas: {network.gas}</p></div>)}</div>
            <fieldset disabled={data.inventory.auction.status!=='UPCOMING'||busy}>
              <div className="admin-grid">
                <label className="full">TREASURY WALLET ADDRESS<input name="treasury" defaultValue={data.config.treasury} placeholder="0x…" pattern="0x[0-9a-fA-F]{40}" required spellCheck={false} /></label>
                <label>RESERVATION MINUTES<input name="reservationMinutes" type="number" min="5" max="60" defaultValue={data.config.reservationMinutes} required /></label>
                <label>MAX LOGO SIZE (MB)<input name="maxUploadMB" type="number" min="1" max="10" defaultValue={data.config.maxUploadMB} required /></label>
                <label>CAMPAIGN TARGET<input value="$2,200" readOnly /></label>
              </div>
              <label>CAMPAIGN / REFUND POLICY<textarea rows={4} value={data.config.policy} readOnly /></label>
              <button className="button primary" disabled={busy||data.inventory.auction.status!=='UPCOMING'}>{busy ? 'VALIDATING…' : 'VALIDATE & SAVE CONFIGURATION'}</button>
            </fieldset>
          </form>

          <section className="panel admin-table">
            <div className="panel-heading"><div><span className="mono">LIVE INVENTORY</span><h2>All eight spots</h2></div></div>
            <Table>
              <TableHeader><TableRow><TableHead>Slot</TableHead><TableHead>Holder</TableHead><TableHead>Current</TableHead><TableHead>Next claim</TableHead><TableHead>Claims</TableHead><TableHead>Checkout</TableHead></TableRow></TableHeader>
              <TableBody>{data.inventory.slots.map((slot: any) => <TableRow key={slot.id}>
                <TableCell><b>{String(slot.id).padStart(2, '0')}</b></TableCell>
                <TableCell>{slot.holder?.project || 'Not claimed'}</TableCell>
                <TableCell>{slot.currentPrice?`$${slot.currentPrice}`:'Not claimed'}</TableCell>
                <TableCell>${slot.claimPrice}</TableCell>
                <TableCell>{slot.claimCount}</TableCell>
                <TableCell>{slot.checkoutInProgress?'RESERVED':human(slot.status)}</TableCell>
              </TableRow>)}</TableBody>
            </Table>
          </section>

          <div className="admin-slots">
            {data.slots.map((rawSlot: any) => {
              const slot=data.inventory.slots.find((item:any)=>item.id===rawSlot.id);
              const holder=data.claims.find((claim:any)=>claim.sponsorshipId===rawSlot.holder_sponsorship_id);
              return <section className="panel slot-admin" key={rawSlot.id}>
                <div className="slot-admin-head"><div><span className="mono">SLOT {String(rawSlot.id).padStart(2, '0')}</span><h3>{holder?.project || 'No current holder'}</h3></div><strong>{slot?.currentPrice?`$${slot.currentPrice}`:`$${slot?.startingPrice}`}</strong></div>
                <form className="slot-control" onSubmit={event => {
                  event.preventDefault();
                  const form = new FormData(event.currentTarget);
                  save('slot', { id: rawSlot.id, disabled: form.get('disabled') === 'on' }, `Slot ${String(rawSlot.id).padStart(2, '0')} updated.`);
                }}>
                  <label className="admin-check"><input name="disabled" type="checkbox" defaultChecked={Boolean(rawSlot.disabled)} /> Pause new claims for this spot</label>
                  <p className="small muted">Current holder stays unchanged. The next claim remains ${slot?.claimPrice}.</p>
                  <button className="button" disabled={busy||slot?.checkoutInProgress}>SAVE SLOT STATE</button>
                </form>
                {holder && <div className="private-order">
                  <div className="record-grid">
                    <div><span>SPONSOR</span><p>{holder.project}<br />{holder.contact}<br /><a href={`mailto:${holder.email}`}>{holder.email}</a></p></div>
                    <div><span>PROJECT</span><p>{holder.x}<br />{holder.website ? <a href={holder.website} target="_blank" rel="noreferrer">Website <ExternalLink size={11} /></a> : 'No website'}</p></div>
                    <div className="wide"><span>PAYMENT WALLET</span><p className="break">{holder.wallet}</p></div>
                    <div><span>CLAIM</span><p>${money(holder.claimPriceUnits)} {holder.token} on {holder.chain}<br />{human(holder.sponsorshipStatus)}</p></div>
                    <div><span>PAYMENT</span><p>{human(holder.paymentStatus)}<br />{holder.confirmations || 0} confirmations<br />{when(holder.confirmedAt)}</p></div>
                  </div>
                  {holder.tx && <a className="transaction-link" href={`${holder.explorer}${holder.tx}`} target="_blank" rel="noreferrer">{shortHash(holder.tx)} <ExternalLink size={13} /></a>}
                  <div className="review-block">
                    <div><span className="mono">LOGO REVIEW · {human(holder.logoStatus)}</span><a href={`/api/admin-logo/${holder.sponsorId}`} target="_blank" rel="noreferrer">VIEW UPLOAD <ExternalLink size={12} /></a></div>
                    <div className="review-actions">
                      <button className="button" disabled={busy} onClick={() => save('review', { sponsorId: holder.sponsorId, action: 'APPROVED' }, 'Logo approved.')}>APPROVE</button>
                      <button className="button" disabled={busy} onClick={() => save('review', { sponsorId: holder.sponsorId, action: 'REPLACEMENT_REQUESTED' }, 'Replacement requested.')}>REQUEST REPLACEMENT</button>
                      <button className="button" disabled={busy} onClick={() => save('review', { sponsorId: holder.sponsorId, action: 'REJECTED' }, 'Logo rejected.')}>REJECT</button>
                    </div>
                    <form className="replacement-form" onSubmit={event => replaceLogo(event, holder.sponsorId)}><label>REPLACE LOGO<input name="logo" type="file" accept="image/png,image/jpeg" required /></label><button className="button" disabled={busy}>UPLOAD</button></form>
                  </div>
                </div>}
              </section>;
            })}
          </div>

          <section className="panel admin-table ledger-table">
            <div className="panel-heading"><div><span className="mono">IMMUTABLE CLAIM LEDGER</span><h2>Payments and refunds</h2></div></div>
            <Table>
              <TableHeader><TableRow><TableHead>Slot</TableHead><TableHead>Project</TableHead><TableHead>Claim</TableHead><TableHead>Sponsorship</TableHead><TableHead>Payment</TableHead><TableHead>Refund</TableHead><TableHead>Confirmed</TableHead></TableRow></TableHeader>
              <TableBody>{data.claims.map((claim:any)=><TableRow key={claim.sponsorshipId}>
                <TableCell>{String(claim.slotId).padStart(2,'0')}</TableCell><TableCell>{claim.project}</TableCell><TableCell>${money(claim.claimPriceUnits)}</TableCell><TableCell>{human(claim.sponsorshipStatus)}</TableCell><TableCell>{human(claim.paymentStatus)}<br />{claim.token} · {claim.chain}</TableCell><TableCell>{human(claim.refundStatus)}</TableCell><TableCell>{when(claim.confirmedAt)}</TableCell>
              </TableRow>)}</TableBody>
            </Table>
            {data.claims.filter((claim:any)=>claim.refundStatus&&claim.refundStatus!=='NONE').map((claim:any)=><form className="refund-workflow" key={`refund-${claim.paymentId}`} onSubmit={event=>{
              event.preventDefault();
              const form=new FormData(event.currentTarget);
              const status=String(form.get('status'));
              const refundTx=String(form.get('refundTx')||'').trim();
              const note=String(form.get('note')||'').trim();
              const question=status==='REFUNDED'?'Confirm that this refund transaction is final and on-chain?':'Update this refund state?';
              if(window.confirm(question))save('refund',{paymentId:claim.paymentId,status,refundTx,note},`Refund status changed to ${human(status)}.`);
            }}>
              <div><span className="mono">SLOT {String(claim.slotId).padStart(2,'0')} · {claim.project}</span><p>${money(claim.refundAmountUnits||claim.claimPriceUnits)} {claim.token} on {claim.chain} · {human(claim.refundStatus)}</p></div>
              <label>STATUS<select name="status" defaultValue={claim.refundStatus==='REFUNDED'?'REFUNDED':'REFUND_PROCESSING'}><option value="REFUND_PROCESSING">REFUND PROCESSING</option><option value="REFUNDED">REFUNDED</option><option value="REFUND_FAILED">REFUND FAILED</option></select></label>
              <label>ON-CHAIN REFUND TX<input name="refundTx" defaultValue={claim.refundTx||''} placeholder="Required when refunded" /></label>
              <label>NOTE / FAILURE REASON<input name="note" defaultValue={claim.refundNote||claim.refundError||''} placeholder="Required if failed" /></label>
              <button className="button" disabled={busy}>UPDATE REFUND</button>
            </form>)}
            <p className="small muted">Changing a status never moves funds. Send the full refund from the treasury in the original token on the original network, then record the transaction hash. The server verifies the transfer before marking it refunded.</p>
          </section>

          <section className="panel admin-table">
            <div className="panel-heading"><div><span className="mono">NOTIFICATION QUEUE</span><h2>Outbid and refund notices</h2></div></div>
            {data.notifications.length ? <Table><TableHeader><TableRow><TableHead>Type</TableHead><TableHead>Recipient</TableHead><TableHead>Status</TableHead><TableHead>Created</TableHead><TableHead>Action</TableHead></TableRow></TableHeader><TableBody>{data.notifications.map((notice:any)=><TableRow key={notice.id}><TableCell>{human(notice.type)}</TableCell><TableCell>{notice.recipient}</TableCell><TableCell>{human(notice.status)}{notice.lastError&&<small className="queue-error">{notice.lastError}</small>}</TableCell><TableCell>{when(notice.createdAt)}</TableCell><TableCell><button className="button compact-button" disabled={busy||notice.status==='SENT'} onClick={()=>save('notification/retry',{id:notice.id},'Notification retry completed.')}>RETRY</button></TableCell></TableRow>)}</TableBody></Table> : <p className="muted">No notifications have been queued.</p>}
          </section>
        </>
      )}
    </main>
  );
}
