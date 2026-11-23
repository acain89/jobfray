# Foundation architecture

## Boundaries

`app/` contains server-rendered public pages and a liveness-only GET endpoint.
`components/` contains the shared presentation shell. `lib/domain/` contains pure
contracts and policies, without Next.js, Prisma clients or provider imports.
`lib/site.ts` validates an explicitly configured public origin; it does not infer
identity from request Host or forwarded headers. No write adapters are wired.

Owner routes fail closed with 404. Domain interfaces are not an authentication
implementation. A future server session adapter must verify identity, expiry and
revocation before calling `requireTenantScope`; never construct verified sessions
from JSON, query strings, host headers or a client-supplied owner/business ID.
Membership must be checked server-side on every operation. Every owner repository
query must include the verified business ID; customer-facing readers may return
only published public projections, never owner/contact/payment records.

## Product contracts

- Business: membership-isolated workspace and explicit publication status.
- Website/domain: structured content; free subdomain or optional custom domain.
  Never publish arbitrary HTML/scripts. Reserve platform/admin/auth hostnames,
  normalize hostnames, prove exact domain ownership and require verified status.
  No wildcard DNS, TLS automation or domain dispatch is implemented here.
- Directory: location, service category and mode (`AT_CUSTOMER`, `AT_BUSINESS`,
  `REMOTE`). Inputs are bounded and output is React-escaped. Actual pagination,
  matching and published-listing queries belong in a later read adapter.
- Services: duration, buffers and concurrent capacity. Scheduling contracts
  describe 14 business-local calendar dates `[today, today + 14)`. Business IANA
  time zone and UTC appointment instants are separate. Weekly local windows are
  replaced by dated exception windows; an empty replacement closes the day.
- Booking: a future engine must handle DST gaps/overlaps explicitly, apply buffers
  to overlap checks and reserve capacity transactionally under a shared lock.
  Serializable transactions/locks and hold expiry must protect all competing
  booking, cancellation, confirmation and availability-edit paths. Do not use an
  in-memory count, a blanket single-slot unique key or trust displayed availability.
  No availability expansion or booking writes are implemented in this foundation.
- Quotes: a submitted request belongs to one business/service; no claims about
  provider acceptance or response guarantees. Jobs link to quotes or bookings;
  actual work and its payment remain between customer and service provider.
- Platform fees: exact integer cents, $3 quote request / $5 confirmed appointment,
  USD, JobFray recipient only. Purpose and fee are paired in the domain union.
  Future checkout must derive the fee server-side; never accept amount, destination
  or paid status from a browser. No business payouts or Connect onboarding.
- Notifications: business/owner-scoped event references and read state only.
  Delivery channels, consent, worker and retries are intentionally not implemented.

## Before paid requests can exist

Choose and approve the quote submission/payment ordering and appointment payment/
capacity-confirmation sequence. Define hold expiry, abandoned checkout, capacity
loss after payment, cancellation, duplicate charge prevention and refund handling.
A browser return must never confirm payment. Provider signature verification,
durable event deduplication, verified financial transitions and reconciliation
must be designed and tested before a checkout endpoint is introduced. No live
payment dependencies or credentials are required by this foundation.

## Safety and scope

Legacy worker, post, billing, identity and SMS application routes were removed,
not repointed into the new model. Existing legacy records and external accounts
are not deleted or cancelled. Confirm any live subscriptions, pending obligations,
retention needs and service callbacks before an eventual production replacement.
Legacy users are not automatically converted into new business owners.

Public pages clearly say the service is in development. No fake businesses,
accounts, testimonials or functional-looking signup/pay/booking buttons exist.
Public navigation works without client JavaScript. CSS is mobile-first responsive,
with labels, skip navigation, visible focus and no remote font/asset dependency.

## Documentation consulted

- https://nextjs.org/docs/app/getting-started/installation
- https://nextjs.org/docs/app/api-reference/file-conventions/page
- https://nextjs.org/docs/app/api-reference/config/next-config-js
- https://www.prisma.io/docs/orm/v6/reference/prisma-schema-reference

Use version-appropriate Prisma 5 behavior; current Prisma 7 config examples do
not apply to the retained Prisma 5 datasource/client setup.
