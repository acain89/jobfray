# Four-mode Prisma proposal - not applied

Active `prisma/schema.prisma` and all three legacy migration SQL files remain
unchanged in Phase 2. The proposal is standalone validation input only. Never
migrate it alone, reset, rebaseline, seed, or use db push.

## Structure

| Shared area | Proposed models |
| --- | --- |
| Identity / tenancy | JfOwner, JfBusiness, JfMembership, JfBusinessModeConfig |
| Website / discovery | JfWebsite, JfDomain, JfCategory, JfServiceArea |
| Catalog | JfOffering, JfOfferingMode |
| Scheduling | JfResource, JfResourceRequirement, JfSchedulingPolicy, JfAvailabilityRule, JfAvailabilityException |
| Requests / allocation | JfRequest, JfAllocation |
| Platform fees / history | JfCheckoutSnapshot, JfFeeOrder, JfPaymentEvent |
| Notifications | JfNotification |

BusinessModeConfig is keyed by business and mode; OfferingMode references it and
one shared offering. Disabled records remain for history. Fulfillment is an enum
array allowing mobile, storefront or both. Mode-specific fields are typed nullable
columns validated by the server projection into the domain union. Only calendar
replacement windows use JSON. Resources and their calendars are shared across
offerings; resource requirements are mode-specific. Requests reference a catalog
mode; notifications reference a tenant-owned request instead of an untyped subject.

Monetary unit amounts and underlying subtotals use PostgreSQL BigInt because Prisma
Int cannot represent the domain's safe-integer monetary range. Server projection
checks conversion before use. Fee cents remain Int. Snapshots retain original
pricing facts and policy version. FeeOrder references the snapshot and carries
mutable payment state separately. Tenant-scoped request and order idempotency keys
are unique. Request payload hashes detect replay conflicts; provider event IDs are
globally unique. No transfer destinations, business payouts or recurring billing.

## Required invariants before a future migration/adapter

Prisma schema validation does not enforce these rules. Implement/review database
CHECKs, transaction guards and adapter validation together, then test them on an
independently approved disposable database:

- OfferingMode fulfillment arrays nonempty, unique and valid; selected request
  fulfillment belongs to that configuration; enabled state gates NEW requests only.
- Known prices require nonnegative safe-integer unit cents and a basis; unknown
  prices require null amount/basis. QUANTITY_DURATION is rental-only and needs an
  explicit duration unit. Cross-mode fields must be null; service timing is either
  all null or complete with positive duration/nonnegative buffers and safe sum.
- Resources/requirements have positive capacity/units. QUOTE has no scheduling
  policy, resource requirements or allocations. Calendars have weekday 0 to 6 and
  0 <= startMinute < endMinute <= 1440; validate local date/time-zone/JSON windows.
- Scheduled requests have valid increasing UTC endpoints and explicit time zone;
  quote requests have neither schedule nor hold fields. State values match mode;
  quantity is positive. HELD requires expiry; nonheld states have no active expiry.
- Allocations are within the same tenant, reference a scheduled request and a
  configured resource, have positive units/increasing intervals, and count live
  holds atomically under shared resource locks. No blanket single-slot unique key.
- Snapshot mode, offering, fulfillment and quantity match its immutable request
  facts. Money/quantity/duration fields are within safe integer bounds. New snapshots
  are created only by the approved versioned calculator, not browser inserts.
  Currency USD, recipient JOBFRAY, processingCostPayer JOBFRAY. Historical snapshots
  cannot UPDATE/DELETE; do not constrain historical fees to the current policy alone.
- Unique snapshot per tenant/request; unique fee order per snapshot. Request key +
  payload hash and fee-order key are checked inside their locking transactions.
  Payment transition/event handling is verified, deduplicated and tenant-bound.

The proposal expresses tenant-bound foreign keys but cannot by itself enforce
publication, permissions, shared-resource capacity or immutable accepted pricing.
Do not treat schema validation as production compatibility or concurrency evidence.

## Additive integration gate

Finalize unresolved decisions in PHASE2_DECISIONS.md. Retain all legacy models and
migration history; merge additive models only after an approved isolated migration
review, backup/restore planning and SQL inspection. No database was accessed in
Phase 2. No destructive rollback: retain historical transaction tables and facts.
