# JobFray core application

Node 22, Next.js 16.4.6, React 19, strict TypeScript and Prisma 5.22.
Phase 3 adds a working local application with provider-independent core services.
Real financial checkout and production providers remain disabled.

## Review the functional application locally

Use synthetic data only. No existing database or provider credentials are needed.

```powershell
$env:JOBFRAY_SANDBOX='1'
$env:JOBFRAY_PUBLIC_ORIGIN='http://127.0.0.1:3211'
$env:NEXT_TELEMETRY_DISABLED='1'
npm.cmd run dev -- --hostname 127.0.0.1 --port 3211
```

Open `/register`, create a synthetic business account and use `/sandbox/inbox` for
mock email verification/recovery and customer phone codes. Sign in at `/login`.
The dashboard guides business setup, pooled capacity, offerings, website content,
design preview, publication, QR/sharing and notification preferences.

Mock exact-address fixtures:

- `100 Test Lane, Austin, TX 78701` (business location)
- `200 Customer Lane, Austin, TX 78701` (eligible mobile customer location)

ZIP fixtures: 78701, 60601, 10001, 94103. Unsupported addresses fail eligibility
verification; the mock never pretends to geocode arbitrary addresses.

Browse `/find`, open a published website, verify a synthetic customer phone, and
review a request. The explicit mock-payment button moves no money. Protected
confirmations reopen through fragment-based capability links in the local inbox.

Sandbox persistence lives only in ignored `artifacts/phase3-runtime/`, with atomic
file replacement and inter-process locking. It is a local verification adapter,
not a production database. Keep its signing keys with its state for recovery.
The sandbox must only be bound to loopback and must never be deployed publicly.

## Business model and policies

Business website creation/operation is free. No subscriptions, commissions,
Connect, customer accounts, internal messaging, employee assignment management,
taxes, discounts, extras, deposits or underlying-business payment collection.
Four modes share a catalog, dashboard, scheduling and payment infrastructure.
See [approved policies](docs/PHASE2_DECISIONS.md).

Customer-paid JF fees (USD cents): 0-3000 -> 200; 3001-7500 -> 300;
7501-15099 -> 400; 15100+ -> 500. Quotes/genuinely unknown prices -> 300.
Quantity, applicable party size and rental/reservation duration enter the
server-calculated underlying subtotal. Historical checkout snapshots are immutable.

All scheduled occupancy, buffers and turnaround fit one rolling 30-local-calendar-
day window including today. Holds last 15 minutes. DST gaps fail closed; repeated
times require an explicit occurrence. Overnight occupancy checks operating hours
at pickup/return/arrival endpoints, not continuously throughout an occupied stay.

## Verify

```powershell
npm.cmd test
npm.cmd run typecheck -- --incremental false
npm.cmd run lint
$env:DATABASE_URL='postgresql://unused:unused@127.0.0.1:9/never_connect'
$env:CHECKPOINT_DISABLE='1'
npm.cmd run schema:validate
npm.cmd run schema:proposal
npm.cmd run db:generate
npm.cmd run build
node scripts/http-smoke.mjs
node scripts/phase3-smoke.mjs
```

Use `NODE_OPTIONS=--import=./scripts/verification-network-guard.mjs` to block remote
and database networking during verification. The HTTP scripts sanitize child-server
environments. `phase3-smoke.mjs` can also target an already running local sandbox
via `JOBFRAY_SMOKE_ORIGIN`. It exercises all four real HTTP mock workflows.

## Production remains gated

The Prisma repository implements serializable transactions, stable advisory-lock
ordering, tenant-bound foreign keys and immutable snapshot writes. No database was
connected. `prisma/review/phase3-additive.sql` and `phase3-constraints.sql` are offline,
unapplied REVIEW artifacts outside historical migrations. Never apply them to an
existing database without separately authorized isolated-database verification.

`JOBFRAY_DATABASE_ENABLED=1` AND `JOBFRAY_RELEASE_DB_VERIFIED=1` gate production
repository activation. Do not set those flags for this phase. Production geocoding,
verification delivery, payments and notifications still fail closed. A real payment
adapter is not exposed through public HTTP routes. Object storage, notification
workers, background reconciliation, DNS/certificates and operational/legal/security
release checks are separate gates. The already installed `sharp` image decoder is
now a declared direct dependency; no package download was performed.

Read [architecture](docs/ARCHITECTURE.md), [database review](docs/SCHEMA_PROPOSAL.md)
and [Phase 3 report](docs/PHASE3_REPORT.md) for executed evidence and limitations.
Prior foundation/Phase 2 reports remain historical evidence of their earlier scope.
