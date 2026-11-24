# Approved product decisions after Phase 2

The owner's Phase 6A customer-contact policy supersedes previous ownership-verification and delivery requirements; the other approved Phase 3 policies remain in effect.
Fee amounts remain locked; no additional owner approval is needed for ordinary
implementation choices described here.

## Product and shared business operations

- JobFray provides acquisition, communication by direct business contact, request
  delivery, booking and reservation facilitation; it is not comprehensive business
  management software. Free business websites; no subscriptions, commissions,
  Connect, customer accounts, internal messaging or employee scheduling/assignment.
- Verified email/password business accounts, recovery, secure sessions and tenant
  authorization. One primary business/location per owner account in this launch UI.
- Any combination of Rental, Service, Quote and Reservation; one offering may
  support several modes. Mobile, storefront or both are separate fulfillment sets.
- Guided single-page builder: live preview, autosave, 10 choices per each of three
  color reels, three button shapes and five letter styles. Genuine testimonials
  only. Content editing is separate from design customization. Owner publication
  uses automated readiness checks; ordinary publication needs no administrator.
- Business suspension/unpublication excludes discovery and new requests without
  erasing confirmed obligations, confirmation facts or financial history.
- Customers enter a contact phone once, confirm its displayed normalized value before payment, and provide name, necessary address and optional notes. Phone confirmation is not ownership verification or authentication.
  No customer accounts. Business contact details appear after paid confirmation.
  Protected capability links, screenshot-friendly receipts and calendar downloads.
- Mandatory verified-owner email notifications; optional provider-independent PWA
  push queue. The dashboard is authoritative if external notification delivery fails.
- `/find` uses category/offering, mode, fulfillment, ZIP/optional permitted location
  and distance ranking. No paid or artificial availability-based ranking. Private
  bases use public ZIP-centroid ranking; exact service-address eligibility is checked
  before a mobile request proceeds to checkout.

## Universal scheduled-mode rules

Exactly 30 rolling business-local calendar dates including today; no extensions.
All occupancy, buffers and turnaround fit within that window. Recurring hours,
date exceptions, blocked intervals and configurable minimum notice. UTC persistence,
explicit DST interpretation and shared pooled resource allocation. Holds are exactly
15 minutes. Confirmation requires verified payment plus a successful atomic held-
allocation transition. Expired/delayed payments cannot steal capacity and enter
refund-required remediation if JF cannot fulfill its obligation. Confirmed records
survive subsequent mode, offering, calendar or capacity changes.

## Rental

Pooled inventory only. Hourly or daily pricing, positive whole configured units,
minimum duration, pickup/delivery/both, delivery radius, pickup/return windows,
blocked occupancy and optional turnaround. Hourly units use elapsed time; daily
units use local calendar dates across DST. The conservative launch UI requires the
same local clock pickup/return time for whole daily units; no hidden partial-day
rounding. Overnight occupancy does not require continuous business opening hours.
No serialized assets, contracts, deposits, damage/late penalties or insurance.

## Service

Fixed, starting or variable prices; duration, pooled concurrent capacity, mobile/
storefront/both, radius, weekly hours/exceptions, buffers and minimum notice.
Businesses assign employees/equipment themselves. Starting prices are advertised
minimums, not guaranteed final prices. Shared pools do not require employee records.

## Quote

Name, customer-confirmed contact phone, address only where applicable, a required description up to
200 characters, and 1-3 required/optional job photos with 5 MB per image limit.
Fixed $3 JF fee. Pending checkout drafts are private; verified payment delivers the
request to the dashboard and queues business/customer notifications. Quotes never
allocate scheduling capacity. Any assessment is a separate Service booking.
No negotiation, estimate generation, proposal acceptance or response guarantees.

## Reservation

Fixed, per-person, per-night or free price. Pooled spaces or people, fixed slots or
multi-day occupancy, party limits, hours/blocks and optional arrival instructions.
Per-night pricing counts business-local calendar nights. No individually assigned
rooms/tables/seats, check-in management, deposits, food ordering or no-show penalties.

## Fees, responsibility and remediation

Server-authoritative integer cents: 0-3000 -> 200; 3001-7500 -> 300;
7501-15099 -> 400; 15100+ -> 500; quote/unknown -> 300. Quantities, applicable party
size and duration enter the underlying advertised subtotal. Customers pay businesses
directly. JF bears processing costs. No taxes, discounts, extras or deposits at launch.
Accepted subtotal, fee, price basis/units and policy version are historical facts.

JF fees buy facilitation/delivery, not the underlying business performance. Once
fulfilled, customer cancellation, no-show, nonresponse or independent business
nonperformance does not automatically refund fees. Duplicate charges and JF failures
require remediation; legal/provider-required and discretionary refunds are supported
through restricted administrative records. Draft Terms are explicitly not legally
reviewed and make no unconditional legal-immunity claim.

## Remaining external verification gates (not unresolved launch product policy)

- Separately authorize an isolated PostgreSQL test database; execute/review additive
  DDL, CHECKs, immutable triggers, SQL privileges, transactional races and recovery.
- Separately authorize real payment, business email, geocoding, object storage and optional
  push adapters. Confirm charge/refund lifecycle interoperability and event recovery.
- Configure background notification/reconciliation/retention workers and production
  support, backup, key rotation, deletion and audit procedures.
- Obtain legal/provider review of Terms and retention requirements before live data.
- Verify DNS/certificates/subdomains and custom-domain proof only under separate
  authorization. No live DNS or certificate operation occurred in this phase.
- Full browser/assistive-technology accessibility and QR scan verification remain
  release checks beyond the focused native-browser inspection executed in Phase 3.


## Phase 4 verification update

The separately authorized disposable PostgreSQL verification and hardening are
recorded in [PHASE4_REPORT.md](PHASE4_REPORT.md). That report supersedes earlier
statements that no isolated database was available or authorized. Existing/remote
databases and real providers remain outside this verification. See
[OPERATIONS.md](OPERATIONS.md) for environment, worker, migration, recovery and
versioned confirmation-key procedures. Approved product policies and fees are unchanged.

## Phase 5 implementation alignment

Approved product and fee policies above are unchanged. Production adapters are prepared for Stripe platform-fee Checkout, Resend email, permanently licensed Mapbox geocoding, authenticated Cloudinary media and optional VAPID push. No account was provisioned or connected; Stripe explicitly remains disconnected. Mock transport is verification evidence only.

Operational technical defaults: provider requests time out after eight seconds; customer draft access uses browser-bound capabilities with independent trusted-edge limits; image upload failures have durable orphan jobs; unreferenced business images become eligible for cleanup at 24 hours; optional push is limited to twenty active devices per business. These are technical safety/retention defaults, not new rental, reservation, fee or refund policies. Account/provider/privacy review is required before release.

The complete external requirements and release gates are in PROVIDER_CONFIGURATION.md, PRODUCTION_SETUP.md and RELEASE_CHECKLIST.md. Independent-business nonperformance still does not automatically refund a JF fee. Existing confirmed obligations and historical financial snapshots remain preserved.

## Phase 6A customer contact and access

No ownership challenges, codes, customer accounts, email addresses or automatic customer delivery are required. Across all four modes, Pay Now opens the accessible phone-confirmation modal. Yes proceeds; No closes and focuses the original phone field; dismissal never starts checkout; changes invalidate the review/confirmation without erasing entered data. Read-only fee review precedes any hold. The normalized affirmed phone is an immutable checkout fact.

Random browser/business-scoped capabilities, HttpOnly browser binding, CSRF and rate limits replace ownership-proof authorization. Idempotency replay cannot cross browsers; quote photos cannot cross capabilities or be attached to a second request. Protected confirmation links remain independent of phone identity and must be saved/copied by customers. Mandatory business email and optional owner device push remain unchanged.
