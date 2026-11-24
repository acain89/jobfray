# Phase 2: four-mode architecture and platform fee engine

Branch: `feat/jobfray-rebuild`
Worktree: `C:/Users/acain/.codex/worktrees/jobfray-rebuild`
Baseline: `4b1c7dc442e96362a3bd2f53d3d03f33837ded21`
Implementation date: 2026-11-23

## Completed

- One catalog offering with independently configurable Rental, Service, Quote and
  Reservation modes; mobile/storefront fulfillment is a separate validated set.
- Disabled mode configuration remains historical; an enabled mode on the same
  offering continues to work. Quote requests reject calendar/hold fields.
- Shared resources, mode-specific requirements, calendars, scheduling policy,
  allocations and holds; pure concurrent-capacity checks count all requests sharing
  a resource, including live holds. Transactional lock requirements are explicit.
- One Node/server fee calculator with exact 200/300/400/500-cent tiers and a
  300-cent quote/explicit unknown-price rule. Known zero gets the 200-cent tier.
- Catalog-derived subtotals include quantity and, when configured, rental duration.
  No fee/subtotal overrides; malformed money, fractional cents and unsafe products
  are rejected. Quantities/timing/capacity respect Prisma Int bounds, while monetary
  BigInt storage supports JavaScript safe-integer cents.
- Frozen checkout facts include subtotal, fee, original unit price/basis, quantity,
  rental duration count/unit, fulfillment, mode and pricing-policy version.
- Transactional checkout port/orchestration includes canonical payload hashing,
  scoped idempotency conflicts, tenant checks and historical replay without current
  catalog reads or fee recalculation. No persistence/payment adapter is installed.
- Unapplied normalized Prisma proposal aligned with the four-mode contracts;
  runtime projection validates typed nullable columns and BigInt conversion.
- Updated public copy, accessible directory mode/fulfillment controls, fee table,
  documentation, smoke assertions and focused automated tests.

## Verification

Node 22.20.0; Next.js 16.4.6; React 19.2.4; Prisma/client 5.22.0.
No package installation or dependency changes were needed.

| Check | Result |
| --- | --- |
| `npm.cmd test` | PASS: 35 tests, 0 failed |
| `npm.cmd run typecheck -- --incremental false` | PASS |
| `npm.cmd run lint` | PASS, zero warnings |
| `npm.cmd run schema:validate` | PASS, active legacy schema |
| `npm.cmd run schema:proposal` | PASS, unapplied four-mode proposal |
| `npm.cmd run build` | PASS, production webpack build |
| `npm.cmd run test:http` | PASS, ephemeral loopback production server |

Fee tests cover every cent 0 through 15101, explicit boundary neighbors and the
maximum safe monetary integer. Required $30.00/$30.01, $75.00/$75.01 and
$150.99/$151.00 transitions are asserted for all non-quote modes; quotes always
assert $3. Tests cover unknown versus zero, invalid monetary types/values, selection
overrides, quantity/duration math, overflow, 15 nonempty mode combinations,
fulfillment combinations, independent mode disabling, tenant isolation, shared
capacity, half-open intervals, hold expiry, request validation, snapshot replay,
schema projection/enums and historical migration/instruction byte preservation.

Verification uses the local network guard. Prisma validation used a synthetic
unreachable loopback URL only; no database was connected, migrated, reset or seeded.
Restricted execution initially failed before tests in Node's OS user lookup;
the authorized worktree-access run passed. An earlier smoke assertion still used
the prior service-provider wording; it was aligned to direct business payments
and expanded to all four fee bands before the final smoke run.
No interactive browser visual/accessibility audit is claimed.

## Architecture decisions and limits

- Preserve the free-business/direct-payment model. No subscription, commission,
  Connect, business payout or customer processing surcharge exists.
- Shared resources and allocation transactions avoid four duplicate scheduling
  stacks. Pure capacity checking alone does not guarantee concurrent writes.
- Price availability is explicit, never inferred from a missing/invalid amount.
  Quote fees remain separate from underlying commercial price and scheduling.
- Scheduling horizon/lead/hold configuration has no hidden defaults. Unresolved
  timing/unit policy cannot authorize scheduling. No rental rounding, reservation
  duration, travel, cancellation, refund or financial state sequencing was invented.
- Public routes remain one directory, business website and owner workspace. Owner
  and tenant-site placeholders still fail closed; no write route was opened.
- Active legacy schema/migrations are unchanged. The proposal is not an applied
  migration and schema validation does not prove database invariants. Required
  CHECKs, immutable snapshot enforcement and allocation locks are documented.

## Remaining implementation requirements

See [owner decisions](PHASE2_DECISIONS.md) and [schema gates](SCHEMA_PROPOSAL.md).
Next work requires policy decisions followed by verified sessions and tenant-scoped
repositories, published catalog reads/editing, calendar expansion/DST, atomic
resource allocation adapters and concurrency tests, request/fulfillment flows,
immutable snapshot persistence, and only then separately authorized payment/refund
adapters and mobile/accessibility verification. Date ranges must be converted to
billable rental duration using an approved policy before checkout is exposed.

This phase is ready for architecture/code review; all listed checks passed. It does not enable real booking or financial checkout.

## Scope preservation

All implementation occurred in the isolated rebuild worktree. No original-checkout,
RF or RFL operation; no live provider/payment operation; no database access;
no hosting/DNS change; no push, merge or deployment. Legacy migration files,
active schema and repository instruction files are byte-for-byte retained in this
phase. The original checkout was intentionally not inspected in Phase 2.

## Changed-file inventory

27 files relative to the Phase 2 baseline:

- `README.md`
- `app/directory/page.tsx`
- `app/for-businesses/page.tsx`
- `app/globals.css`
- `app/how-it-works/page.tsx`
- `app/layout.tsx`
- `app/page.tsx`
- `components/SiteShell.tsx`
- `docs/ARCHITECTURE.md`
- `docs/FOUNDATION_REPORT.md`
- `docs/PHASE2_DECISIONS.md`
- `docs/PHASE2_REPORT.md`
- `docs/SCHEMA_PROPOSAL.md`
- `lib/domain/capacity.ts`
- `lib/domain/policy.ts`
- `lib/domain/ports.ts`
- `lib/domain/requests.ts`
- `lib/domain/scheduling.ts`
- `lib/domain/types.ts`
- `lib/domain/validation.ts`
- `lib/server/catalog-mapping.ts`
- `lib/server/checkout.ts`
- `lib/server/fees.ts`
- `prisma/proposals/rebuild.prisma`
- `scripts/http-smoke.mjs`
- `tests/domain.test.ts`
- `tests/schema-compatibility.test.ts`
