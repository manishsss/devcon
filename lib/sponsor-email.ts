import { formatUsdcUnits } from './auction';

export const PAYMENT_CONFIRMED_EMAIL = 'PAYMENT_CONFIRMED';
const amountText = (value: string) => {
  const units = BigInt(value);
  return formatUsdcUnits(units, units % BigInt(1_000_000) === BigInt(0) ? 0 : 2);
};
const slotText = (slot: number) => String(slot).padStart(2, '0');

export function outbidEmail(input: { project: string; slot: number; amountUnits: string; newAmountUnits: string }) {
  return {
    subject: "You've been outbid on your Devcon spot",
    body: `Hey ${input.project},

Another project's payment has been confirmed, and they've taken over your Slot ${slotText(input.slot)}.

Your payment: ${amountText(input.amountUnits)} USDC
New claim amount: ${amountText(input.newAmountUnits)} USDC
Your full refund: ${amountText(input.amountUnits)} USDC
Refund status: Pending

You no longer hold this spot. Your refund hasn't been completed yet. I'll send a confirmation once it's verified on-chain.

Questions? Message me: https://t.me/manishweb3

Manish`,
  };
}

export function refundConfirmedEmail(input: { project: string; slot: number; amountUnits: string; network: string; wallet: string; transactionUrl: string; manual?: boolean }) {
  return {
    subject: 'Your Devcon sponsorship refund is confirmed',
    body: `Hey ${input.project},

Your full refund for Slot ${slotText(input.slot)} ${input.manual?'has been marked complete by Manish.':'has been confirmed on-chain.'}

Refund amount: ${amountText(input.amountUnits)} USDC
Network: ${input.network}
Receiving wallet: ${input.wallet}

View the transaction: ${input.transactionUrl}

Thanks for supporting the campaign.

Manish`,
  };
}

export function campaignResultEmail(input: { project: string; slot: number; amountUnits: string; successful: boolean }) {
  if (input.successful) return {
    subject: 'The trip is on. Your Devcon spot is final',
    body: `Hey ${input.project},

The auction is closed, and the campaign reached its minimum funding target.

You're the final sponsor of Slot ${slotText(input.slot)}. No further takeovers are possible.

Your sponsorship includes your logo across two Devcon days, two short-form videos, an appreciation post, and photos featuring your brand.

I'll be in touch about your logo and campaign content.

Thanks for helping bring this to life.

Manish`,
  };
  return {
    subject: 'Devcon campaign update: your full refund is pending',
    body: `Hey ${input.project},

The auction has closed with less than $1,100 in confirmed current sponsorship funds, below the campaign's 50% minimum.

The campaign won't proceed, and your confirmed sponsorship payment will be fully refunded.

Slot: ${slotText(input.slot)}
Refund amount: ${amountText(input.amountUnits)} USDC
Refund status: Pending

Your refund hasn't been completed yet. I'll send a confirmation once it's verified on-chain.

Questions? Message me: https://t.me/manishweb3

Thanks for supporting the idea.
Manish`,
  };
}

export function paymentConfirmedEmail(input: { project: string; slot: number; amountUnits: string; network: string }) {
  const units = BigInt(input.amountUnits);
  const amount = formatUsdcUnits(units, units % BigInt(1_000_000) === BigInt(0) ? 0 : 2);
  return {
    subject: 'Your Devcon spot is confirmed',
    body: `Hey ${input.project},

Your payment is confirmed. You're now the current holder of Slot ${String(input.slot).padStart(2, '0')}.

Amount paid: ${amount} USDC
Network: ${input.network}

Your spot remains open to takeovers until the auction closes. If another project successfully takes it, your confirmed payment will be fully refunded.

Your sponsorship includes:
- Your logo across two Devcon days, on one black and one white T-shirt.
- Two short-form videos featuring your project.
- An appreciation post introducing your project.
- Photos from Devcon featuring your brand.

View the campaign: https://devcon.manishh.xyz

Thanks for supporting the trip!
Manish`,
  };
}

// Enable only the five approved copies. Legacy direct sends and unrelated
// notification types remain disabled.
export function emailTypeEnabled(type?: string) {
  return ['PAYMENT_CONFIRMED', 'OUTBID', 'REFUND_CONFIRMED', 'CAMPAIGN_SUCCESS', 'CAMPAIGN_REFUND'].includes(type || '');
}

export async function sendTransactionalEmail(input: {
  key?: string; from?: string; to: string; subject: string; text: string;
  type?: string; notificationId?: string;
}, request: typeof fetch = fetch) {
  if (!emailTypeEnabled(input.type) || !input.key || !input.from || !input.notificationId) return false;
  try {
    const response = await request('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${input.key}`,
        'content-type': 'application/json',
        'Idempotency-Key': input.notificationId,
      },
      body: JSON.stringify({ from: input.from, to: [input.to], subject: input.subject, text: input.text }),
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) return false;
    const result = await response.json() as { id?: string };
    return typeof result.id === 'string' && result.id.length > 0;
  } catch {
    return false;
  }
}
