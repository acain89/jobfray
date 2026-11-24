# Decisions and implementation gates after Phase 2

## Locked and implemented in contracts

Four independent business modes, shared multi-mode offerings, MOBILE/STOREFRONT
fulfillment sets, free business websites, direct customer/business underlying
payments, and customer-paid JobFray-only platform fees. No subscriptions,
commissions, Connect or processing surcharge. The fee bands and $3 quote/unknown
rule are implemented; there is no remaining fee-amount approval question.

## Owner decisions still required

- Rental: serialized versus pooled inventory; allowed duration units/granularity;
  calendar-day versus elapsed-hour counting across DST; rounding/minimum periods;
  pickup/delivery/return windows, turnaround, maintenance, deposits, late/damage rules.
- Reservation: party versus person/resource units; fixed sessions versus flexible
  stays; assigned spaces versus pooled capacity; duration and arrival/no-show rules.
- Service: staff/equipment assignment, travel buffers, multi-location operations,
  supported timing/lead-time horizons and whether confirmation is instant or manual.
- Quote: required request information, response/expiry process, conversion to an
  offering/request, whether a separately requested assessment appointment is needed.
- All modes: fulfillment applicability, address/contact handling, cancellation,
  rescheduling/refund outcomes, hold durations, mode-disable behavior for existing
  obligations, and when checkout is charged relative to acceptance/capacity confirmation.
- Commercial subtotal definition beyond unit price: treatment of discounts, tax or
  optional extras if introduced. None are added here. Customer/business price edits
  must not permit platform-fee overrides or retroactive snapshot changes.
- Authentication/customer request access, staff permissions, notifications and
  retention/audit requirements before exposing private or write routes.

## Recommended next sequence

1. Approve the above mode policies and request/payment state transitions.
2. Implement verified sessions, tenant-scoped repositories and publication checks.
3. Review/test an additive schema migration only in a separately authorized isolated
   database, including CHECK constraints, immutable snapshots and scoped idempotency.
4. Add catalog editing and published reads with mode/fulfillment validation.
5. Add quote submission without scheduling; then calendar expansion/DST and atomic
   shared allocation adapters. Test conflicting service/rental/reservation requests
   against the same resources, expiry, rescheduling and availability changes.
6. Add mode-specific fulfillment flows and mobile/accessibility verification.
7. Add a separately authorized payment adapter only after charge/hold/refund order
   is resolved, with signed events, durable deduplication and reconciliation.

No real bookings or financial checkout should be exposed by the current foundation.
