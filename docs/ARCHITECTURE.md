# Phase 3 application architecture

## Implemented layers

`lib/core/model.ts` is the application aggregate model; `validation.ts` validates
untrusted commands and `documents.ts` validates stored JSON on adapter reads.
Business modes and fulfillment reuse the Phase 2 domain primitives. The original
pure capacity checker and single fee calculator remain shared across modes.
Phase 2 standalone contracts/tests remain regression references; HTTP application
commands are implemented by `lib/core/business.ts`, `security.ts`, `booking.ts`,
`media.ts` and `administration.ts`.

`Repository.transaction` supplies generic typed aggregate repositories. Memory is a
rollback-capable test adapter; FileRepository is an explicitly local, durable sandbox
adapter with atomic replacement and inter-process lock. PrismaRepository is the
production adapter with parameter-bound queries, relational indexed identity keys,
JSON documents and serializable transactions. It was generated/typechecked but was
NOT executed against PostgreSQL. Database activation requires two explicit gates.

The lock discipline sorts application lock keys. All scheduling, capacity and owner
availability mutations share the same tenant advisory lock, which is deliberately
stronger/simpler than separate resource locks and serializes competing offerings
inside a business. Different businesses remain independent. SQL constraints/FKs
and immutable triggers are supplied as unapplied review artifacts. Database races
and operational performance remain unverified until an isolated database is allowed.

## Authentication and privacy

Scrypt hashes use random salts, N=32768/r=8/p=1, 64-byte keys and constant-time
comparison. Hashing concurrency/queue is bounded. New passwords require 12-128
characters and preserve whitespace. Verification/recovery tokens and sessions are
random, hashed at rest, expiring and single-use where applicable. Recovery revokes
all sessions/reset tokens. Host-only HttpOnly/SameSite cookies use __Host- prefixes
and Secure in production. Origin plus double-submit CSRF protection covers writes.
Rate buckets and bounded bodies/uploads reduce abuse; no private payload logging.

Every private application read/write verifies the session and owner business. Public
site/directory projections omit owner identity, contact/confirmation/payment data,
private base coordinates and nonpublic address. Private base discovery uses public
ZIP centroids/coarse distance; exact mobile eligibility is geocoded before checkout.
Contact verification produces a short-lived phone-bound proof, not a customer account.

Images are preauthorized, limited to 5 MB/24 megapixels, magic-byte checked, decoded,
rotated, resized and re-encoded as WebP with metadata stripped. Decoding is bounded.
Business images require owner access unless explicitly referenced by a published
site/offering. Quote images require paid confirmation before business access.
Unsubmitted quote images expire after 24 hours; confirmed images after 180 days.
The cleanup service removes expired image bytes but retains financial/confirmation
history. Production storage encryption, deletion procedures and retention/legal
review remain release requirements. Inline media is for the local review adapter;
an authorized object-storage adapter is needed before production media scale.

## Scheduling and payment lifecycle

One shared engine: exactly 30 business-local calendar dates, exactly 15-minute holds,
minimum notice, resource calendars/exceptions, blocked occupancy and UTC persistence.
DST gaps are rejected, folds require earlier/later selection, and day boundaries
handle midnight transitions. Service slots check duration/buffers against hours;
overnight rental/reservation occupancy checks pickup/return/arrival opening endpoints
without requiring continuous opening. Whole daily rental units use local day counts;
hourly units use elapsed time. Per-night reservation billing uses local date counts.

Checkout verifies customer proof, publication/enabled mode, offering, fulfillment,
address/radius, photos and selection; checks all shared-pool overlaps; writes pending
request, held allocation and immutable snapshot atomically. Quotes have no allocations.
Existing confirmed obligations are not rewritten by catalog/calendar edits. Customer
idempotency keys are scoped to business and normalized selection hashes.

Payment intent creation has a stable idempotency key and persists the provider intent
identity. Verified events bind intent, charge, request, amount and currency. Events,
confirmation, allocation transition, audit and outbox are one transaction. Replays
are durable and cannot duplicate delivery/booking. Interrupted transactions roll back
and can be retried. Delayed payments on expired holds enter refund-required state,
never consume reallocated capacity. Second verified charges on one intent create
remediation while preserving the original earned confirmation. Administrative
legal/provider/discretionary refund records are explicit; cancellation/release does
not automatically refund. Real provider checkout/webhooks are not publicly exposed.

Notification outbox claims use expiring leases, retry/backoff and stable delivery
keys. Verified-owner email is mandatory; optional push queues through the same port.
A failed delivery cannot remove the authoritative dashboard record. Production
workers/transports and provider idempotency semantics require separate verification.

Confirmation capabilities are HMAC-derived opaque secrets, hashed in requests and
carried in URL fragments that are removed before exchanging for an HttpOnly cookie.
No predictable reference grants private access. Pending/refund-required receipts do
not expose business contacts or customer facts. Scheduled confirmations export ICS
without customer address/phone data. Owner release changes operational capacity only.

## UI and routes

- `/register`, `/login`, `/verify-email`, `/recover`, `/reset-password`.
- One `/dashboard` for onboarding, offerings, shared availability, content/design,
  publication/share, requests/history and notifications.
- Builder has curated palettes (10 each), five type styles, three button shapes,
  live preview, debounced serialized autosave, conflict detection, retry and draft
  flush before state-changing operations. Unsaved changes warn on page unload.
- `/find` is the canonical directory; `/directory` redirects there.
- `/sites/[slug]`, `/request/[slug]/[offeringId]`, `/confirmation`, private media and
  calendar routes. Proxy dispatches exact public subdomain slugs only; owner auth
  remains application-layer authorization. No DNS/certificate operation is performed.
- `/admin` requires a verified account in the explicit administrator allowlist for
  business suspension and remediation. No live money movement exists.
- `/sandbox/inbox` and mock-pay are loopback-only, explicit-sandbox-only facilities.
  Production defaults fail closed. Noindex remains intentional until release review.

Native browser inspection covered the public desktop and 390px-emulated layout and
accessibility tree. Automated HTTP workflows cover application routes. This does
not constitute an exhaustive browser, screen-reader or accessibility certification.


## Phase 4 verification update

The separately authorized disposable PostgreSQL verification and hardening are
recorded in [PHASE4_REPORT.md](PHASE4_REPORT.md). That report supersedes earlier
statements that no isolated database was available or authorized. Existing/remote
databases and real providers remain outside this verification. See
[OPERATIONS.md](OPERATIONS.md) for environment, worker, migration, recovery and
versioned confirmation-key procedures. Approved product policies and fees are unchanged.
