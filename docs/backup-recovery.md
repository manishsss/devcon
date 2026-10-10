# D1 + R2 backup and recovery

## Status

Encrypted backup and restore tooling passed a synthetic local drill into a fresh SQLite database and a separate object directory. This is NOT a Cloudflare restore, production backup, or verified recovery-time guarantee. No staging credentials/resources were available. The current campaign has no confirmed real payments according to the owner.

## Cloudflare procedure (requires staging/account operator)

1. Quiesce writes/monitoring at the infrastructure boundary and record the exact database, bucket, migration version and cutoff time. The application must not accept payments while restoring/reconciling records. Keep treasury history independent; a database rollback never reverses blockchain transfers.
2. Record D1 Time Travel retention/bookmark using the account dashboard or `wrangler d1 time-travel info <database>`. Do not assume a particular retention plan. Export D1 to SQL with `wrangler d1 export <database> --remote --output <protected-file>`. This is a read operation on data but exposes private sponsor records, so restrict destination permissions and encrypt immediately.
3. Copy every R2 object referenced by sponsors using separately scoped read-only S3 credentials. Save content type, SHA-256, size and object key in a manifest; list all pages. Keep the source bucket private. Include approved, pending and historical logos. Verify both DB and object checksums before resuming writes.
4. Retain encrypted immutable copies in an independent private backup location with a separate encryption key in a secret manager. Suggested pre-launch policy: daily backups and pre-migration snapshots; retain 30 daily snapshots. This policy is not configured or running. Test the scheduler's failures and restore permissions before launch.
5. Restore only into a newly created staging D1 database and new private R2 bucket. Import exported SQL with `wrangler d1 execute <staging-database> --remote --file <protected-sql>` only after independently confirming that the ID is not production. Upload objects from the manifest to the new staging bucket with explicit normalized content types; never publish the backup bucket.
6. Verify integrity_check, expected tables/indexes/triggers, holder-to-sponsorship relationships, current prices/funds, every payment/refund record and referenced logo hashes. Reconcile blockchain payment/refund hashes since the snapshot cutoff. Never resend a refund solely because restored data says REFUND_PENDING.
7. Use `scripts/staging-auth-probe.mjs` and the R2 privacy audit before exposing staging. Disable email sending and real treasury signing in recovery tests. Record observed restore duration and independently review the evidence. Only then plan a production recovery/cutover.

## Local tool

`scripts/backup-recovery.mjs` encrypts a SQLite snapshot and object mirror with AES-256-GCM, verifies database/object checksums and refuses existing restore destinations. Supply BACKUP_KEY_HEX through an environment/secret manager, never a command argument. It is a local export validation/drill tool, not a Cloudflare backup scheduler. `tests/recovery.mjs` tests restoration, tampering, wrong keys, missing objects, existing destinations and unsafe object keys using synthetic records.

Production automation, real Cloudflare snapshot/export/import, R2 object metadata round-trip and restore evidence remain launch blockers.
