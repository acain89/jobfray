# JobFray foundation

Isolated rebuild based on `83acd16460239747f732523faddc3d65511cace2`.
Node 22, Next.js 16 App Router, React 19, strict TypeScript, Prisma 5.22 and
PostgreSQL. This is a foundation, not a launch-ready paid booking application.

## Run locally

```sh
npm ci --ignore-scripts
npm run dev
```

No database or provider credentials are needed to render the application. Do not
copy an existing production `.env` into this worktree. `.env.example` contains
only a public-origin setting and an intentionally unusable local DB example.

## Verify

```sh
npm test
npm run typecheck -- --incremental false
npm run lint
npm run build
node scripts/http-smoke.mjs
```

For Prisma CLI validation/generation, set `DATABASE_URL` to the isolated example
in the current process only, then run `npm run schema:validate`,
`npm run schema:proposal` and `npm run db:generate`. These commands do not connect
to a database. There are deliberately no seed, migration or payment scripts.
Use `scripts/verification-network-guard.mjs` via Node's `--import` option during
build/verification to block accidental remote/database connections.

## Implemented boundary

- Server-rendered public shell: `/`, `/for-businesses`, `/how-it-works`, `/directory`.
- Working GET directory filters and an honest empty state; no listing DB reads.
- GET `/api/health` is process liveness only, not database/provider readiness.
- `/dashboard` and `/sites/[slug]` fail closed with 404 until approved adapters exist.
- Typed domain models, tenant-access checks, fee policy and read-port interfaces.
- No registrations, editor, booking engine, quote submissions, notifications,
  checkout, payment/webhook adapters, subdomain dispatch or custom-domain setup.
- Foundation pages deliberately have noindex headers/metadata and robots exclusion.

Customer fees in the approved model are $3 per quote request and $5 per confirmed
appointment, payable to JobFray. Businesses receive no payments through JobFray;
customers pay providers directly for actual work. No Stripe Connect dependencies.

## Architecture and preservation

Read [architecture](docs/ARCHITECTURE.md), [schema proposal](docs/SCHEMA_PROPOSAL.md)
and [Render preparation](docs/RENDER.md). Historical application code remains in
Git history. All three existing migrations and all 11 legacy models are retained;
no database was inspected, reset, migrated or seeded. The active schema adds only
the datasource URL declaration required by Prisma 5. The new schema proposal is
not the active schema. Do not run migrations from that proposal alone.

The repository's installed older Next.js package did not contain `dist/docs`.
Its README and the relevant official Next.js 16 installation/page/configuration
guides were read before implementation. After installation, the bundled Next.js
16.4.6 routing, server/client, error-handling and TypeScript guides were also read.
