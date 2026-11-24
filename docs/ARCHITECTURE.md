# Four-mode architecture

## Shared boundaries

`app/` owns public server-rendered presentation and a liveness-only GET endpoint.
`lib/domain/` owns validated domain contracts and policies without provider/ORM
imports. `lib/server/` uses Node-only imports for checkout orchestration, fee
snapshots and schema projections; never import those modules into Client Components.
There are no provider dependencies, persistence adapters or public write endpoints.

Businesses independently enable RENTAL, SERVICE, QUOTE and RESERVATION. The proposed
business-mode relation retains disabled configuration rows to preserve history.
One offering has one configuration per applicable mode. Fulfillment is an independent
set: MOBILE, STOREFRONT or both. BOTH is not a third delivery choice and REMOTE is
not part of this approved scope. A request selects exactly one supported option.
An empty business mode set is allowed for setup; an active usable offering requires
at least one enabled configuration. Disabling modes blocks new transactions, not
historical reads or fulfillment of existing obligations.

## Domain and schema alignment

Offering configurations and requests are discriminated unions with runtime parsers.
Quote configurations have no schedule; quote requests reject scheduling fields.
A requested assessment appointment must be a separate scheduled request. Service
has optional explicit timing; Rental has an optional duration unit; Reservation has
an optional capacity unit. Null means unresolved and cannot authorize scheduling.
The schema uses enum/typed nullable columns, not arbitrary configuration JSON;
`mapOfferingModeRow` rejects cross-mode fields, incomplete known prices and unsafe
BigInt conversion. Missing known prices must never fall back to UNKNOWN.

## Tenant isolation

A future session adapter must verify identity, expiry and revocation before creating
a tenant scope from active membership. Branded TypeScript IDs are not authentication.
Every repository operation must include verified business ID, including notifications,
resources, idempotency lookup and checkout history. Composite foreign keys bind
business-owned references. Public readers return only published projections and
never expose customer contacts, allocations, owner identity or payment records.
Exact normalized verified hostname resolution is separate from owner authorization;
never trust caller-supplied business IDs or forwarded Host as identity.

## Resources, availability and holds

Resources represent shared capacity; multiple offerings and modes can reference the
same resource. Requirements specify units per selected quantity. Calendar rules
and replacement exceptions belong to resources; an empty exception closes the day.
Policy explicitly supplies horizon, minimum lead time, hold duration and version;
there is no universal 14-day horizon. Business-local dates/time zones and UTC
allocation instants remain separate. UTC intervals are half-open `[start, end)`.

`assertCapacity` validates tenant/resource identity, positive safe units and intervals,
counts live holds and confirmed allocations, ignores expired holds and released
allocations, and sweeps interval events to find true concurrent occupancy. Different
request IDs share the same capacity. Adjacent intervals do not overlap. It does not
expand calendars, select assets, calculate travel, determine rental rounding, or
write bookings. It is not a standalone concurrency guarantee.

A future AllocationStore adapter MUST atomically lock all required resources in
stable order, inspect overlapping allocations across ALL offerings, check opening
windows and approved mode policy, expire/reconcile holds, check capacity and write
request/allocation state together. Confirmation, cancellation, rescheduling and
capacity/availability edits need the same locks and transactional discipline.
Database concurrency tests are a later gate; there is no in-memory booking store.

## Server-authoritative fees and history

Website creation/operation is free, without subscriptions, business commissions or
Stripe Connect. Customers pay businesses directly for underlying offerings. JobFray
collects only its own customer-paid USD platform fee and pays its processing costs.

`calculatePlatformFee` in `lib/server/fees.ts` is the only fee calculator:
0 to 3000 -> 200; 3001 to 7500 -> 300; 7501 to 15099 -> 400; 15100+ -> 500 cents.
QUOTE and explicitly UNKNOWN prices -> 300 cents. Even quotes reject malformed
monetary inputs. Zero is known, not unknown. All monetary inputs and intermediate
products must be nonnegative safe integers; fractional cents and overflow fail.

Stored pricing explicitly selects FIXED, QUANTITY or rental-only QUANTITY_DURATION.
FIXED permits only quantity 1 and no duration; QUANTITY multiplies the quantity;
QUANTITY_DURATION multiplies unit price, quantity and positive integer duration units.
The last basis needs an explicit stored HOUR/DAY unit. API adapters must derive or
verify billable duration against an approved interval/rounding policy; browser units
are never authoritative. No date-to-duration or rental rounding policy is invented.
Unknown must be an explicitly valid catalog state, never missing/invalid input.

`createCheckoutSnapshot` rejects fee/subtotal overrides and unsupported modes or
fulfillments. It freezes a primitive-only snapshot containing original subtotal,
fee, unit amount, basis, quantity, duration, mode, fulfillment and policy version.
`prepareCheckout` adds request-locked, payload-hashed idempotency through a storage
port. Identical replay returns saved facts before consulting current catalog;
conflicting payload/key or tenant mismatch fails. The adapter must authorize the
request, bind catalog to its offering, verify selected request facts and persist
snapshot/order atomically. This phase supplies no database implementation.

Snapshots are insert-only accepted facts; never update them on catalog edits or
reprice history. Adapter privileges and a reviewed immutable-row database control
are required before persistence launches. Payment state belongs to the fee order,
not the request or snapshot. Unknown-price quotes are not forced into an
AWAITING_PAYMENT request state. Settlement, event verification, refund ordering and
capacity confirmation remain separate approved workflows to implement later.

## Route and mobile architecture

Keep one `/directory`, business website route `/sites/[slug]` and `/dashboard`.
Directory mode/fulfillment filters must match the same active offering configuration,
with business + website publication and enabled business mode enforced by future
read adapters. No separate four-mode application stacks. Future public request
commands should resolve a published offering and selected mode server-side;
shared application services dispatch validated mode-specific data. Owner operations
must authenticate before any tenant lookup or write.

The shell and native GET form work without client JavaScript. Controls are labeled,
48px high and stack on narrow screens. The fee table has caption and scoped headers.
Keep mode-specific transaction inputs progressive: rental range/quantity, service
time/location, quote requirements, reservation date/capacity. No transaction UI or
browser accessibility audit is claimed. Noindex remains deliberate during development.
