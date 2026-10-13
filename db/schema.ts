import { index, integer, primaryKey, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
export const checkoutAuthorizations=sqliteTable('checkout_authorizations',{
  id:text('id').primaryKey(),
  walletAddress:text('wallet_address').notNull(),
  intentHash:text('intent_hash').notNull(),
  message:text('message').notNull(),
  expiresAt:integer('expires_at').notNull(),
  consumedBy:text('consumed_by'),
},t=>[index('idx_checkout_authorizations_expiry').on(t.expiresAt)]);
export const slots=sqliteTable('slots',{
  id:integer('id').primaryKey(),
  price:integer('price').notNull(),
  disabled:integer('disabled').notNull().default(0),
  orderId:text('order_id'),
  expires:integer('expires'),
  currentPriceUnits:text('current_price_units'),
  holderSponsorshipId:text('holder_sponsorship_id'),
  claimCount:integer('claim_count').notNull().default(0),
},t=>[index('idx_slots_holder').on(t.holderSponsorshipId)]);
export const orders=sqliteTable('orders',{id:text('id').primaryKey(),secret:text('secret').notNull(),slot:integer('slot').notNull(),price:integer('price').notNull(),project:text('project').notNull(),contact:text('contact').notNull(),x:text('x').notNull(),email:text('email').notNull(),website:text('website').notNull(),wallet:text('wallet').notNull(),logo:text('logo'),approved:integer('approved').notNull().default(0),review:text('review').notNull().default('Pending review'),status:text('status').notNull().default('Awaiting payment'),tx:text('tx').unique(),config:text('config').notNull(),created:integer('created').notNull(),expires:integer('expires').notNull(),audit:text('audit')});
export const settings=sqliteTable('settings',{id:integer('id').primaryKey(),value:text('value').notNull()});
export const paymentMonitorState=sqliteTable('payment_monitor_state',{
  id:integer('id').primaryKey(),
  lastStartedAt:integer('last_started_at'),lastFinishedAt:integer('last_finished_at'),lastScheduledAt:integer('last_scheduled_at'),
  lastSource:text('last_source'),processed:integer('processed').notNull().default(0),failed:integer('failed').notNull().default(0),
  lastError:text('last_error'),lockToken:text('lock_token'),lockUntil:integer('lock_until'),
});
export const sponsors=sqliteTable('sponsors',{
  id:text('id').primaryKey(),
  projectName:text('project_name').notNull(),
  xHandle:text('x_handle').notNull(),
  website:text('website'),
  contactName:text('contact_name').notNull(),
  email:text('email').notNull(),
  walletAddress:text('wallet_address').notNull(),
  logoUrl:text('logo_url').notNull(),
  logoStatus:text('logo_status').notNull().default('PENDING_REVIEW'),
  description:text('description').notNull().default(''),
  createdAt:integer('created_at').notNull(),
},t=>[index('idx_sponsors_wallet').on(t.walletAddress)]);
export const sponsorships=sqliteTable('sponsorships',{
  id:text('id').primaryKey(),
  secret:text('secret').notNull(),
  slotNumber:integer('slot_number').notNull(),
  position:text('position').notNull(),
  priceUsd:integer('price_usd').notNull(),
  claimPriceUnits:text('claim_price_units'),
  previousHolderSponsorshipId:text('previous_holder_sponsorship_id'),
  claimSequence:integer('claim_sequence'),
  isChallenge:integer('is_challenge').notNull().default(0),
  status:text('status').notNull().default('RESERVED'),
  sponsorId:text('sponsor_id').notNull(),
  reservedUntil:integer('reserved_until').notNull(),
  termsAccepted:integer('terms_accepted').notNull().default(0),
  createdAt:integer('created_at').notNull(),
  updatedAt:integer('updated_at').notNull(),
},t=>[index('idx_sponsorships_slot_status').on(t.slotNumber,t.status),index('idx_sponsorships_sponsor').on(t.sponsorId)]);
export const payments=sqliteTable('payments',{
  id:text('id').primaryKey(),
  sponsorId:text('sponsor_id').notNull(),
  sponsorshipId:text('sponsorship_id').notNull(),
  slotId:integer('slot_id'),
  walletAddress:text('wallet_address').notNull(),
  token:text('token').notNull(),
  tokenContract:text('token_contract').notNull(),
  chain:text('chain').notNull(),
  chainId:integer('chain_id').notNull(),
  amount:text('amount').notNull(),
  amountUsd:integer('amount_usd').notNull(),
  amountUnits:text('amount_units'),
  transactionHash:text('transaction_hash'),
  status:text('status').notNull().default('PENDING'),
  confirmations:integer('confirmations').notNull().default(0),
  verificationConfig:text('verification_config').notNull(),
  paymentMethod:text('payment_method').notNull().default('WALLET'),
  createdAt:integer('created_at').notNull(),
  confirmedAt:integer('confirmed_at'),
  refundNote:text('refund_note'),
  refundStatus:text('refund_status').notNull().default('NONE'),
  refundAmountUnits:text('refund_amount_units'),
  refundTransactionHash:text('refund_transaction_hash'),
  refundUpdatedAt:integer('refund_updated_at'),
  refundError:text('refund_error'),
},t=>[index('idx_payments_sponsorship').on(t.sponsorshipId),index('idx_payments_refund_status').on(t.refundStatus),uniqueIndex('payments_transaction_hash_unique').on(t.transactionHash),uniqueIndex('payments_refund_transaction_hash_unique').on(t.refundTransactionHash)]);

export const auctionCampaign=sqliteTable('auction_campaign',{
  id:integer('id').primaryKey(),
  status:text('status').notNull().default('UPCOMING'),
  startsAt:integer('starts_at'),
  endsAt:integer('ends_at'),
  durationSeconds:integer('duration_seconds').notNull().default(345600),
  targetUnits:text('target_units').notNull().default('2200000000'),
  thresholdUnits:text('threshold_units').notNull().default('1100000000'),
  finalValueUnits:text('final_value_units'),
  finalHolderCount:integer('final_holder_count'),
  finalizedAt:integer('finalized_at'),
  createdAt:integer('created_at').notNull(),
});

export const notifications=sqliteTable('notifications',{
  id:text('id').primaryKey(),
  sponsorId:text('sponsor_id').notNull(),
  sponsorshipId:text('sponsorship_id').notNull(),
  paymentId:text('payment_id'),
  type:text('type').notNull(),
  recipient:text('recipient').notNull(),
  subject:text('subject').notNull(),
  body:text('body').notNull(),
  status:text('status').notNull().default('PENDING'),
  lastError:text('last_error'),
  createdAt:integer('created_at').notNull(),
  sentAt:integer('sent_at'),
},t=>[index('idx_notifications_status').on(t.status),uniqueIndex('notifications_type_sponsorship_unique').on(t.type,t.sponsorshipId)]);

export const qrPaymentAmounts=sqliteTable('qr_payment_amounts',{
 chainId:integer('chain_id').notNull(),tokenContract:text('token_contract').notNull(),treasury:text('treasury').notNull(),
 amountUnits:text('amount_units').notNull(),reservationId:text('reservation_id').notNull().unique(),allocatedAt:integer('allocated_at').notNull(),
},t=>[primaryKey({columns:[t.chainId,t.tokenContract,t.treasury,t.amountUnits]})]);
