# JobFray foundation verification and file inventory

Branch: `feat/jobfray-rebuild`
Base: `83acd16460239747f732523faddc3d65511cace2`
Scope: foundation only; no push, merge, deployment, database connection, migration,
seed, production write, provider operation, Render change or DNS change.

## Verification

- Node 22.20.0; locked Next.js 16.4.6, React 19.2.4, TypeScript 5.9.3,
  Prisma/client 5.22.0.
- Both active and standalone proposed schemas pass Prisma validation with a
  synthetic, unreachable local DB URL. Local client generation passes.
- 11 focused tests pass: purpose/fee pairing, access expiry and tenant isolation,
  scheduling configuration, directory parsing, legacy schema and migration/
  instruction byte preservation, absence of provider/write adapters and seeds.
- Strict TypeScript, full-project ESLint (zero warnings), and production build pass.
- HTTP smoke passes against the production build on an ephemeral loopback port:
  initial HTML, unique titles/configured canonicals, navigation, directory escaping,
  $3/$5 fees, health, noindex headers/robots, fail-closed owner/site routes,
  removal of legacy routes, and rejection of non-GET health requests.
- Build/verification network guard blocks external/database access. Smoke server
  receives no database or provider credentials. No real customer fixtures.
- Original checkout's dirty diff/status fingerprint is unchanged; all five original
  local changes are preserved. Remote main still matches the baseline.
- Responsive CSS, labels, focus, skip navigation and reduced-motion styling were
  reviewed. No interactive browser visual/accessibility audit is claimed.

## Remaining gates

No foundation implementation blocker. Further work needs explicit approval.
Actual Render deployment settings/database identity and production data/schema
state are unverified. Legacy provider obligations must be reviewed before release.
Authentication, tenant-scoped persistence, booking/DST/capacity transactions,
checkout/refund sequencing, notifications and domain verification are not built.
New schema is a proposal only; retain history and merge additive models into the
active schema only after isolated migration review/approval. Noindex is deliberate.

## Complete changed-file inventory

115 files: 26 added, 11 modified, 78 deleted (rename detection disabled for an explicit inventory).

| Status | Path |
| --- | --- |
| A | `.env.example` |
| M | `.gitignore` |
| A | `.node-version` |
| M | `README.md` |
| D | `app/admin/dashboard/page.tsx` |
| D | `app/admin/login/page.tsx` |
| D | `app/admin/page.tsx` |
| D | `app/api/admin/login/route.ts` |
| D | `app/api/admin/logout/route.ts` |
| D | `app/api/admin/moderation/post/route.ts` |
| D | `app/api/admin/moderation/worker/route.ts` |
| D | `app/api/categories/route.ts` |
| D | `app/api/free-stuff/create/route.ts` |
| A | `app/api/health/route.ts` |
| D | `app/api/jobs/[postId]/interest/route.ts` |
| D | `app/api/post/create/route.ts` |
| D | `app/api/post/manage/close/route.ts` |
| D | `app/api/post/manage/complete/route.ts` |
| D | `app/api/post/manage/interest/route.ts` |
| D | `app/api/post/verify/route.ts` |
| D | `app/api/uploads/images/route.ts` |
| D | `app/api/worker/billing/save-card/route.ts` |
| D | `app/api/worker/billing/setup-intent/route.ts` |
| D | `app/api/worker/identity/start/route.ts` |
| D | `app/api/worker/identity/sync/route.ts` |
| D | `app/api/worker/login/route.ts` |
| D | `app/api/worker/logout/route.ts` |
| D | `app/api/worker/signup/route.ts` |
| A | `app/dashboard/page.tsx` |
| A | `app/directory/page.tsx` |
| A | `app/error.tsx` |
| D | `app/favicon.ico` |
| A | `app/for-businesses/page.tsx` |
| D | `app/free-stuff/[postId]/page.tsx` |
| D | `app/free-stuff/page.tsx` |
| D | `app/free-stuff/post/page.tsx` |
| D | `app/free-stuff/zip/[zip]/page.tsx` |
| D | `app/free-stuff/zip/page.tsx` |
| M | `app/globals.css` |
| A | `app/how-it-works/page.tsx` |
| D | `app/jobs/[postId]/offer/page.tsx` |
| D | `app/jobs/[postId]/page.tsx` |
| D | `app/jobs/page.tsx` |
| D | `app/jobs/zip/[zip]/page.tsx` |
| M | `app/layout.tsx` |
| A | `app/not-found.tsx` |
| M | `app/page.tsx` |
| D | `app/post/manage/page.tsx` |
| D | `app/post/page.tsx` |
| D | `app/post/success/page.tsx` |
| A | `app/robots.ts` |
| A | `app/sites/[slug]/page.tsx` |
| D | `app/worker/billing/page.tsx` |
| D | `app/worker/dashboard/page.tsx` |
| D | `app/worker/identity/page.tsx` |
| D | `app/worker/login/page.tsx` |
| D | `app/worker/signup/page.tsx` |
| D | `components/AdminLoginForm.tsx` |
| A | `components/SiteShell.tsx` |
| D | `components/jobs/JobOfferForm.tsx` |
| D | `components/maps/JobMiniMap.tsx` |
| D | `components/post-manage/ManageInterestButtons.tsx` |
| D | `components/post-manage/ManagePostActions.tsx` |
| D | `components/post/FreeStuffPostForm.tsx` |
| D | `components/post/PostWizard.tsx` |
| D | `components/worker/WorkerLoginForm.tsx` |
| D | `components/worker/WorkerLogoutButton.tsx` |
| D | `components/worker/WorkerSignupForm.tsx` |
| D | `components/worker/billing/BillingChecklist.tsx` |
| D | `components/worker/billing/BillingStatusCard.tsx` |
| D | `components/worker/billing/WorkerBillingForm.tsx` |
| D | `components/worker/identity/WorkerIdentityForm.tsx` |
| A | `docs/ARCHITECTURE.md` |
| A | `docs/FOUNDATION_REPORT.md` |
| A | `docs/RENDER.md` |
| A | `docs/SCHEMA_PROPOSAL.md` |
| M | `eslint.config.mjs` |
| D | `jobfray-file-list.txt` |
| D | `lib/admin-auth.ts` |
| D | `lib/cloudinary.ts` |
| A | `lib/domain/access.ts` |
| A | `lib/domain/policy.ts` |
| A | `lib/domain/ports.ts` |
| A | `lib/domain/types.ts` |
| D | `lib/location-fuzz.ts` |
| D | `lib/mapbox.ts` |
| D | `lib/post-token.ts` |
| D | `lib/post-validation.ts` |
| D | `lib/prisma.ts` |
| D | `lib/rate-limit.ts` |
| A | `lib/site.ts` |
| D | `lib/stripe.ts` |
| D | `lib/twilio.ts` |
| D | `lib/worker-auth.ts` |
| D | `lib/worker-validation.ts` |
| D | `lib/worker-verification.ts` |
| D | `lib/zip-radius.ts` |
| M | `next.config.ts` |
| M | `package-lock.json` |
| M | `package.json` |
| D | `postcss.config.mjs` |
| D | `prisma.config.ts` |
| A | `prisma/proposals/rebuild.prisma` |
| M | `prisma/schema.prisma` |
| D | `prisma/seed.ts` |
| D | `public/file.svg` |
| D | `public/globe.svg` |
| D | `public/next.svg` |
| D | `public/vercel.svg` |
| D | `public/window.svg` |
| A | `scripts/http-smoke.mjs` |
| A | `scripts/verification-network-guard.mjs` |
| A | `tests/domain.test.ts` |
| A | `tests/schema-compatibility.test.ts` |
| M | `tsconfig.json` |
