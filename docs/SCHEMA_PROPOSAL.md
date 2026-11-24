# Phase 3 schema and additive SQL review

The active Prisma schema now includes additive `Jf*` application models after the
retained legacy schema prefix. All historical migration files are unchanged. No
existing database was connected and no migration was applied.

`prisma/proposals/rebuild.prisma` is a standalone mirror for local validation.
`prisma/review/phase3-additive.sql` was generated OFFLINE from the Phase 2 legacy
schema to the Phase 3 datamodel. It creates only new Jf tables, indexes and foreign
keys. `phase3-constraints.sql` adds CHECK constraints, immutable-history triggers,
quote-allocation protection and expression indexes. Both are REVIEW artifacts,
outside `prisma/migrations`, and have NOT been executed against PostgreSQL.

## Storage alignment

JfAccount/Session/Token manage business authentication/customer proofs. JfBusiness,
Offering and Resource contain validated aggregate documents plus typed relational
identity/search/capacity columns. This preserves mode-specific configuration without
four duplicate catalog stacks. JfRequest, Allocation and CheckoutSnapshot bind tenant
and offering/resource/request identity through composite foreign keys. JfPaymentEvent,
Refund, Outbox, Media, Audit and RateBucket provide replay/remediation/delivery and
security infrastructure. No subscription, business payout, destination account or
underlying-payment model exists.

Documents are validated at command and stored-read boundaries. Indexed keys are
written from typed aggregates in the same transaction and mirrored identity CHECKs
reject tenant/id mismatches. Monetary subtotals use BigInt bounded to JavaScript
safe integers; quantities/capacity use bounded Int. Snapshots are insert-only.
Provider event IDs are primary keys; request keys are unique per business; provider
charges bind to one request via serialized payment locks and event records. Refund
remediation is unique per business/payment identity. Confirmation secrets are hashed;
confirmation references receive a unique expression index.

## Compatibility and verification boundary

The historical prefix, enums/models, three migrations and instruction files are
retained. The offline diff contains no drops or alterations to legacy tables.
Prisma validation/client generation do not prove live drift compatibility, CHECK/
trigger correctness, SQL permissions or concurrency. Those remain EXPLICITLY
UNVERIFIED until an isolated disposable database is separately authorized.

Review deployment database identity, applied migration history, backup/restore,
least-privilege roles, JSON/schema constraints and immutable-row enforcement before
integrating an additive migration. Do not reset, rebaseline, seed, db-push or apply
these artifacts to an existing database. Test tenant isolation, index/query plans,
serializable retry/deadlock handling, competing allocations, delayed payments,
event replay, outbox leases and recovery on that isolated database first.

Pricing-policy changes must add a new version while preserving prior snapshots and
version-aware constraints. Never update historical financial facts or destructively
roll back the new tables. Production secrets/keys, object storage, background jobs
and retention procedures require separate release configuration and review.
