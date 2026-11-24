# JobFray four-mode foundation

Isolated rebuild based on foundation commit `4b1c7dc442e96362a3bd2f53d3d03f33837ded21`.
Node 22, Next.js 16.4.6 App Router, React 19, strict TypeScript and Prisma 5.22.
This is an architecture and fee-engine foundation, not a live transaction platform.

## Business model

Business website creation and operation are free. No subscriptions, business
commissions or Stripe Connect. Businesses enable any combination of RENTAL,
SERVICE, QUOTE and RESERVATION. One offering can have multiple mode configurations.
Each configuration permits MOBILE, STOREFRONT or both. Customers pay businesses
directly for underlying offerings. JobFray collects only customer-paid platform
fees and bears its own Stripe processing costs.

## Platform fees (USD integer cents)

| Underlying subtotal | Platform fee |
| --- | --- |
| 0 to 3000 cents | 200 cents |
| 3001 to 7500 cents | 300 cents |
| 7501 to 15099 cents | 400 cents |
| 15100 cents or more | 500 cents |
| Quote request or genuinely unknown price | 300 cents |

`lib/server/fees.ts` is the sole calculator. Checkout derives the subtotal from
stored catalog prices and validated quantity/duration selections, not browser
amounts. Known zero is different from unknown. Snapshots record original cents,
pricing basis, selections and policy version. Historical reads and retries never
recalculate against current prices. No provider checkout is wired.

## Run and verify locally

```sh
npm ci --ignore-scripts
npm run dev
npm test
npm run typecheck -- --incremental false
npm run lint
npm run schema:validate
npm run schema:proposal
npm run build
npm run test:http
```

On Windows PowerShell, use `npm.cmd` if script execution policy blocks `npm.ps1`.
Schema validation requires only a synthetic unreachable local `DATABASE_URL`, such
as the example; it does not connect to a database. Use Node's `--import` with
`scripts/verification-network-guard.mjs` during verification to block remote and
database networking. Do not copy production environment files into this worktree.
No credentials are required to render the public application.

## Implemented boundary

- Public server-rendered pages, accessible GET directory filters, development notice.
- `/api/health` is liveness only. Owner/site routes deliberately return 404.
- Runtime-validated offering and request unions, tenant scope checks and schema mapper.
- Shared resource calendars, requirements, allocations and explicit scheduling policy contracts.
- Pure capacity checks across all offerings sharing a resource, including held capacity.
- Server fee snapshots and transactional checkout/idempotency application boundary.
- No auth adapter, persistence, availability expansion, booking writes or live payments.

Read [architecture](docs/ARCHITECTURE.md), [schema proposal](docs/SCHEMA_PROPOSAL.md),
[Phase 2 report](docs/PHASE2_REPORT.md) and [remaining decisions](docs/PHASE2_DECISIONS.md).
The original [foundation report](docs/FOUNDATION_REPORT.md) is historical evidence
for the prior scope; its $3/$5 and universal 14-day assumptions are superseded.
All legacy models, migration files and repository instructions remain unchanged
from the original foundation. The four-mode Prisma schema remains an unapplied
proposal, not the active database schema.

Relevant bundled Next.js guides were read before Phase 2 changes: server/client
components, layouts/pages and route handlers in `node_modules/next/dist/docs/`.
