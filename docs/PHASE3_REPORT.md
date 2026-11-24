# Phase 3: core application implementation

Worktree: `C:/Users/acain/.codex/worktrees/jobfray-rebuild`
Branch: `feat/jobfray-rebuild`
Baseline: `3c99dd8a1c32712fd8afa874e429d7ca3c2031f7`
Date: 2026-11-23

## Implementation

This phase implements a functional local application, not another architecture-only
proposal. Registration/recovery, onboarding, management, builder, publishing,
discovery and all four customer workflows run against an explicit, durable local
sandbox. Production persistence/providers remain disabled until separately verified.

- Verified business email/password accounts, recovery/session revocation, salted
  scrypt, bounded hashing, hashed expiring tokens, secure production __Host- cookies,
  CSRF/origin protection, rate limits and bounded request bodies.
- Tenant-authorized business/profile/slug management, shared pooled resources,
  hours/exceptions/blocked intervals and multi-mode offerings. No employee management.
- Single-page builder with live preview, serialized/retried/versioned autosave and
  flush-before-mutation, curated 10/10/10 color choices, three buttons/five letter
  styles, photos/gallery and optional genuine testimonials. Content/design separation.
- Automated readiness/publication, draft/published separation, unpublication and
  restricted administrator suspension. Free operation without bank details.
- Public responsive sites/SEO/structured data, exact subdomain dispatch architecture,
  QR generation/printing, copy/native share, and the canonical `/find` directory.
- One 30-local-calendar-day scheduling engine and shared capacity checker for all
  scheduled modes, 15-minute holds, explicit DST gaps/folds, elapsed-hour/calendar-
  day/night pricing, minimum notice, buffers/turnaround and overnight occupancy
  separated from endpoint opening windows. Shared pools prevent cross-offering
  overbooking under the selected adapter's transaction discipline.
- Verified account-free customer contact, exact mocked mobile-address eligibility,
  quotes with 200-character descriptions and 1-3 secure photos, services, pooled
  rentals and space/person reservations with clear underlying prices and JF fees.
- Server-derived quantity/party/duration subtotals and the unchanged centralized
  $2-$5 fee policy; immutable versioned accepted checkout facts.
- Mock payment intents/events with signatures, intent/charge binding, idempotency,
  durable deduplication, transactional confirmation/allocations/outbox, late-payment
  remediation, explicit administrative refunds, audits and reconciliation services.
- Protected fragment-to-cookie confirmation access, private contact disclosure only
  after fulfillment, screenshot-friendly receipts and escaped/folded ICS export.
- Mandatory verified-owner email outbox and optional push port with leases/backoff;
  notification failure cannot erase dashboard records. Retention cleanup removes
  expired media/tokens without deleting financial/confirmation history.
- Runtime-validated aggregate repositories: rollback-capable Memory, durable local
  File, and generated/typechecked Prisma/parameter-bound SQL implementation. Active
  schema promoted additively; offline DDL/CHECK/trigger review artifacts prepared.

## Actual verification

Executed with Node 22.20.0, Next.js 16.4.6 and Prisma 5.22.0. Remote/database
networking was blocked by the verification guard; schema commands used a synthetic,
unreachable loopback database URL. No package download was needed.

| Executed check | Result |
| --- | --- |
| `npm.cmd test` | PASS: 74 tests, 0 failed, 0 skipped |
| `npm.cmd run typecheck -- --incremental false` | PASS, strict TypeScript |
| `npm.cmd run lint` | PASS, zero warnings |
| `npm.cmd run schema:validate` | PASS, active legacy + additive schema |
| `npm.cmd run schema:proposal` | PASS, standalone additive mirror |
| `npm.cmd run db:generate` | PASS, Prisma Client 5.22.0 generated locally |
| `npm.cmd run build` | PASS, optimized production webpack build |
| `node scripts/http-smoke.mjs` | PASS, production server/public routes/metadata/escaping/fees/legacy removal |
| `node scripts/phase3-smoke.mjs` | PASS, production server with isolated FileRepository and mock providers; all four HTTP workflows |
| Native Chrome desktop + 390px emulation | Public site visually rendered; headings/navigation/links inspected in AX tree |
| Automated curated-palette contrast | PASS: all configured text/background combinations meet 4.5:1 |
| `git diff --check` and preservation tests | PASS; historical migrations/instructions retained |

The 74 automated tests cover business authentication/recovery/revocation and
contact proofs, cross-tenant denial, publication/draft/suspension privacy, all four
mock workflows, exact-address eligibility, all fee boundaries (including every
cent through 15101), immutable snapshots, shared-capacity contention, expired holds,
delayed payments, payment identity/signature/event replay, duplicate-charge refund
replay, notifications/outage retry, image security/retention and private access,
30-local-date windows, spring gaps/fall folds, both repeated-hour appointments with
independent endpoint choices, fixed reservation-slot alignment, whole daily/night
pricing, file rollback/durability, DNS slugs, safe ICS folding and offline SQL safety.
Autosave tests cover queued undo, duplicate drafts, lost acknowledgements, canonical
property order and refusing conflicting edits. Disabled mode configurations remain
editable without blocking enabled modes on the same offering.

HTTP verification actually performs registration, email verification, login, CSRF
rejection, onboarding, shared-capacity/catalog creation, draft autosave/publication,
public directory privacy, QR generation, secure quote-image upload, verified phone,
and idempotent checkout/verified mock payment/protected confirmation/calendar flows
for RENTAL, SERVICE, QUOTE and RESERVATION. These are real local HTTP requests with
mock provider behavior and local file persistence, NOT live money or database tests.
Local raw unit/build logs survive in ignored `artifacts/phase3-tests.log` and
`artifacts/phase3-build.log`. Browser fixtures contain synthetic data only.

## Deliberately unverified / external release requirements

- PostgreSQL: no database connection, migration application, reset or seed. SQL CHECKs,
  triggers, privileges, serializable retries, real database races, query plans and
  backup/restore remain unverified. Memory/File concurrency tests do not prove them.
- Real payments/refunds/webhooks, email/SMS, geocoding, production object storage,
  push subscriptions/delivery and background workers are not connected or operated.
  Production adapters fail closed; public financial checkout is not exposed.
- Browser inspection is focused native Chrome public-site desktop/390px emulation
  and AX-tree inspection, not end-to-end browser automation of every owner/customer
  form. Browser automation host was unavailable. Full axe/screen-reader/keyboard
  audit and device matrix are not claimed.
- QR structure/generation is tested; independent QR scanner decoding is not claimed.
- Crash tests cover transaction rollback, fresh-service event replay and independent
  local repository instances. Power-loss/fsync recovery and PostgreSQL failover are
  not claimed. Sandbox state/signing-key backups must stay paired.
- Draft Terms, privacy/retention, operator support, key rotation, least-privilege
  deployment and legacy provider obligations require release review. No claim of
  legal immunity or legal review. DNS/TLS/custom domains require separate approval.
- Current owner UI intentionally uses one primary business/location per account,
  pooled units rather than employees/assets/individual rooms, and conservative whole
  daily rentals returning at the same local clock time. These technical defaults are
  documented in the approved decision file; no hidden partial-unit rounding exists.

## Preservation and scope

All changes are confined to the isolated rebuild worktree. Original checkout, RF
and RFL were not modified or operated. Historical migrations and instruction files
are retained byte-for-byte. Next dev automatically refreshed its managed AGENTS.md
block during local review; the baseline bytes were restored after stopping the test
server. No live provider operation, database connection, hosting/DNS change, push,
merge, deployment, destructive Git command or package download occurred. The already
installed sharp decoder was declared directly in package metadata/lockfile.

## Commits

Implementation: the local commit introducing this report and its associated application changes. Its SHA is recorded in the subsequent report-only commit.

## Changed files

The following inventory includes all Phase 3 changes relative to the supplied baseline.
Generated client/build files, synthetic sandbox state/keys and raw test artifacts
are ignored and are not committed.


69 changed files:

- `README.md`
- `app/admin/page.tsx`
- `app/api/calendar/route.ts`
- `app/api/core/route.ts`
- `app/api/media/route.ts`
- `app/api/qr/route.ts`
- `app/confirmation/page.tsx`
- `app/dashboard/page.tsx`
- `app/directory/page.tsx`
- `app/find/page.tsx`
- `app/globals.css`
- `app/how-it-works/page.tsx`
- `app/login/page.tsx`
- `app/media/[id]/route.ts`
- `app/page.tsx`
- `app/recover/page.tsx`
- `app/register/page.tsx`
- `app/request/[slug]/[offeringId]/page.tsx`
- `app/reset-password/page.tsx`
- `app/sandbox/inbox/page.tsx`
- `app/sites/[slug]/page.tsx`
- `app/terms/page.tsx`
- `app/verify-email/page.tsx`
- `components/SiteShell.tsx`
- `components/core/AuthForm.tsx`
- `components/core/Builder.tsx`
- `components/core/Confirmation.tsx`
- `components/core/Dashboard.tsx`
- `components/core/LocateButton.tsx`
- `components/core/ManagementForms.tsx`
- `components/core/RequestForm.tsx`
- `components/core/SiteView.tsx`
- `components/core/api.ts`
- `docs/ARCHITECTURE.md`
- `docs/PHASE2_DECISIONS.md`
- `docs/PHASE3_REPORT.md`
- `docs/SCHEMA_PROPOSAL.md`
- `lib/core/administration.ts`
- `lib/core/booking.ts`
- `lib/core/business.ts`
- `lib/core/documents.ts`
- `lib/core/http.ts`
- `lib/core/media.ts`
- `lib/core/model.ts`
- `lib/core/prisma-repository.ts`
- `lib/core/providers.ts`
- `lib/core/qr.ts`
- `lib/core/repository.ts`
- `lib/core/runtime.ts`
- `lib/core/security.ts`
- `lib/core/time.ts`
- `lib/core/validation.ts`
- `lib/domain/draft-save.ts`
- `lib/domain/scheduling.ts`
- `next.config.ts`
- `package-lock.json`
- `package.json`
- `prisma/proposals/rebuild.prisma`
- `prisma/review/phase3-additive.sql`
- `prisma/review/phase3-constraints.sql`
- `prisma/schema.prisma`
- `proxy.ts`
- `scripts/http-smoke.mjs`
- `scripts/phase3-smoke.mjs`
- `tests/accessibility.test.ts`
- `tests/autosave.test.ts`
- `tests/core.test.ts`
- `tests/domain.test.ts`
- `tests/schema-compatibility.test.ts`
