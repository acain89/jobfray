# Phase 4: comprehensive verification and hardening

Date: 2026-11-24. Worktree: `C:/Users/acain/.codex/worktrees/jobfray-rebuild`.
Branch: `feat/jobfray-rebuild`.
Baseline: `06d0bc4e8197af541038fb3c5507993d67120b87`.
Implementation commit: `40a1f60d6934dacd831a12fcc7cdff0fe0f24d99`.
This report is recorded by a following documentation-only commit; its SHA is the
final branch HEAD and is supplied in the completion response.

## Executive summary

Implemented remediation rather than another architecture proposal. Tenant history,
availability, media quotas/access, directory reads and maintenance batches now avoid
unbounded aggregate materialization; ordinary read paths no longer take global
advisory locks. Payment/confirmation integrity, production mock isolation, SQL
constraints/history preservation, operational authentication and several form defects
were hardened. All approved modes, fulfillment rules, free-business model, fee tiers,
immutable prices and refund responsibilities remain unchanged. No live checkout exists.

Actual results: **87/87 unit/integration tests** and **47/47 PostgreSQL parity/adversarial
cases** passed, plus strict TypeScript, zero-warning ESLint, both schemas, client
generation, production build and three HTTP suites. The PostgreSQL run reuses core
scenarios and includes pure scheduling/file tests as well as actual SQL cases; these
counts are overlapping verification layers, not 134 distinct database tests.

Application code is ready for review, with explicit remaining release gates below.
**JobFray is not production-ready.** Full end-to-end browser/accessibility coverage,
real providers and deployment-environment verification remain incomplete.

## Defects discovered and remediation

| Severity | Finding | Completed remediation |
| --- | --- | --- |
| High | Full tenant history/snapshot reads; global workspace/session/confirmation/read locks; one HTTP operation bucket shared by all businesses | Chronological 100-record keyset pages with navigation, batched snapshots, scoped principal limits, removal of global/read-only scheduling locks; retain sorted tenant/payment locks for mutations |
| High | PostgreSQL range values bound as text, unsupported advisory return projection and missing raw-SQL retry classification | Bind timestamp ranges as Dates, cast advisory return to text, retry P2034 and SQLSTATE 40001/40P01 with capped jitter; eight bounded attempts |
| High | Three retries failed a 24-tenant burst despite independent business locks | Measured the conflict and increased the bounded retry budget; final burst completes without request errors, with retries explicitly counted |
| High | SQL CHECK NULL loopholes and incomplete relational/document consistency; no versioned additive migrations | Two versioned migrations, IS TRUE financial/scheduling guards, identity/tenant/state/capacity/time projection triggers, immutable request/allocation facts and additional indexes |
| High | Capacity could be reduced below already promised obligations | Reject reductions below peak live held/confirmed occupancy; calendar edits cannot rewrite allocations |
| High | Missing scheduled allocations could produce a false paid confirmation | Require exactly one scheduled allocation; otherwise retain payment history and enter refund-required remediation |
| High | A production build could select mock providers using only the sandbox flag | Require explicit local-test acknowledgement, loopback public origin and loopback CLI listener; production cookies remain secure; the inbox page itself is 404 outside sandbox |
| High | Rejecting Next instrumentation configuration could leave a half-started process alive | Sanitized startup failure and explicit nonzero termination for invalid production configuration; executed HTTP startup rejection test |
| Medium | Date changes retained an old appointment; accepted checkout facts remained visually editable; overlapping UI actions | Clear stale slot choices, guard concurrent actions and disable request inputs after snapshot acceptance/while processing |
| Medium | Manual verification-token input disappeared after its first character; expired email verification could strand an account | Separate link-token presentation state, and safely reissue verification without replacing an existing password |
| Medium | Uploads consumed another business's rate budget before authorization | Authorize owner/proof and published business first; apply both principal and scoped upload limits |
| Medium | Image quotas loaded inline image bytes; paid-image access scanned full request history | SQL count queries and indexed, tenant-scoped photo membership lookup |
| Medium | Directory N+1 reads/provider calls inside transactions | Bounded business pages, batched offering reads, provider work outside transactions, bounded ZIP cache, server-derived public ZIP centroids on new profile writes |
| Medium | Availability loaded a pool's entire history and did expensive work for invalid/out-of-window dates | Overlap/date-bound queries, live-state predicates and early calendar validation; bound the timezone formatter cache |
| Medium | QR/readiness operations unnecessarily fetched customer history; readiness repeatedly fetched shared pools | Minimal authenticated business read and one scoped resource batch |
| Medium | Outbox leases allowed stale acknowledgements; batch/cleanup scans could starve newer work | Lease tokens, due/expired-lease filtering before bounded reads, and exclusion of already redacted rows |
| Medium | Manual refunds could select an arbitrary charge after a duplicate; key rotation broke historical token derivation | Persist settled charge identity, refuse ambiguous historical selection, version confirmation keys and retain old derivation keys |
| Medium | Host-based canonical construction could reinterpret a double-slash path; public directory errors exposed internal messages | Assign pathname/search onto a trusted origin and return generic public errors; direct redirect regression test |
| Medium | Missing operational readiness/worker/startup controls | Fail-closed configuration, separate readiness endpoint, constant-time bearer worker authorization and operational runbook |
| Low | Internal failures were reported as client errors; operational diagnostics lacked safe references | Typed input errors; generic 500 responses and structured opaque error references without payload/database error logging |
| Low | Synthetic browser fixture selected a random older confirmation from the shared local inbox | Record the token for the workflow actually just completed |

The new allocation immutability trigger initially failed during real confirmation
updates. The regression was corrected before the successful final SQL run. Earlier
failed runs also exposed timestamp binding, insufficient retries and startup liveness
issues; failures were not counted as successful verification.

## Database identity, isolation and migration evidence

A separate PostgreSQL 17 cluster was initialized from the installed local binaries:

- Data directory: `artifacts/phase4-postgres/data`, newly created after an existence guard.
- Bind: **127.0.0.1:55487 only**, not the installed/default server port.
- System identifier: **7711613122963596620**, recorded from pg_controldata before connecting.
- New migration role: `jf_phase4_disposable`; new restricted app role: `jf_phase4_app`.
- Initial administrative identity query used the newly initialized cluster's own
  `postgres` database. Every application test database/schema was newly created here.
- No existing environment credentials, application database, RF/RFL database, Render
  database or remote database was used. Local trust is solely for disposable synthetic
  data and is not a production authentication recommendation.

Fresh `prisma migrate deploy` applied all five migrations in `jf_phase4_release_check`.
Final `migrate diff` reports an empty migration against the active schema. SQL-only
checks/triggers and expression/partial indexes require additional verification beyond
Prisma drift; they were exercised directly rather than inferred from that empty diff.
The three historical migration files and both repository instruction files pass the
byte-preservation regression tests.

A synthetic Worker inserted immediately after the initial historical migration
survived the remaining two historical migrations and both final additive migrations
in `jf_phase4_legacy_final`. Backup/restore preserved the synthetic legacy row.
A separate financial-fixture backup/restore preserved **one snapshot, one verified
payment event and one confirmed allocation** in `jf_phase4_financial_restore`.

Direct negative SQL tests returned the expected SQLSTATEs: foreign key 23503,
uniqueness 23505, NULL-safe CHECK 23514, immutable request facts 23514, immutable
snapshot P0001 and denied restricted-role snapshot UPDATE 42501. SQL rollback,
compound tenant references, immutable history and restricted-role application writes
were executed. No production grants, backup storage, encryption or live migration
compatibility was verified.

The test cluster was stopped after verification. Synthetic cluster files, backups and
logs are retained under ignored artifacts for review; they were not committed.

## Concurrency, interruption and measured performance

Real PostgreSQL application tests include final-slot competition, shared offerings,
rental quantities, reservation party occupancy and cross-mode pool contention;
calendar edits racing checkout; expired holds/delayed payment remediation; concurrent
payment event deduplication; retained obligations after edits/mode disabling; DST and
30-calendar-day boundaries. The date/DST calculations are pure application tests within
the SQL-backed suite, not a different PostgreSQL scheduling implementation.

Four independent Node processes competed for the final slot: one accepted and three
rejected. A separate child was killed after inserting its payment event but before
transaction commit: the event rolled back, a fresh replay confirmed once, and a further
replay retained exactly one confirmed allocation. A forced deadlock/serialization
scenario required three callback executions and preserved both intended increments.
There was no overbooking in the executed cases; this is evidence for these workloads,
not a formal proof for arbitrary future code or provider behavior.

Conditions: Windows, Node 22.20.0, AMD Ryzen 3 3250U, four logical processors, about
3.42 GiB physical RAM; PostgreSQL shared_buffers 128 MB, app pool limit 12. Normal
background desktop activity remained running. Measurements are local samples, not a
production SLA or a sustained capacity/soak certification.

| Workload | Actual measured result |
| --- | --- |
| 20 competing cross-mode checkouts, pool capacity 3 | 3 accepted, 17 expected capacity rejections; 18 serialization retries; reported p50 1034 ms, p95 1144 ms; 1.79 s including subsequent concurrent event replay |
| 24 independent tenant checkouts | 0 request errors; 52 internal retries; 1.77 s, 13.54 requests/s; reported p50 1321 ms, p95 1689 ms |
| Workspace over 100,000 synthetic history rows plus original template | 219 ms; returned 100 requests and only the relevant visible snapshot; next keyset page verified |
| Executed history EXPLAIN ANALYZE | JfRequest_history_idx index scan; 100 returned rows; 1.974 ms execution in the captured plan |
| Directory over 1,001 published synthetic businesses | 100 bounded results; three runs 847/801/490 ms, average 713 ms; 0 errors and no private address/coordinate fields |

Percentiles are the harness's reported upper-middle/nearest sample values. The 100,000
history rows are a synthetic read-load fixture, not 100,000 executed paid transactions.
The directory fixture predates precomputed centroid population and exercises cached
legacy ZIP fallback. Separate tests verify precomputed centroid searches make no
per-business provider calls. PostgreSQL SSI contention remains measurable even after
application-wide locks are removed; production workload testing must monitor retries.

## Verification results

| Executed verification | Result |
| --- | --- |
| Full npm test suite | PASS: 87 tests, 0 failed, 0 skipped |
| PostgreSQL parity/adversarial runner | PASS: 47 cases, 0 failed, 0 skipped; restricted application role |
| Strict TypeScript | PASS, incremental disabled |
| ESLint | PASS, zero warnings |
| Active and standalone Prisma schemas | Both PASS |
| Prisma Client generation | PASS, local 5.22.0 client |
| Optimized production webpack build | PASS |
| Existing public HTTP smoke | PASS |
| Existing four-mode application HTTP smoke | PASS, real local HTTP with FileRepository/mock providers |
| New production HTTP security/startup suite | PASS, including worker/inbox fail-closed behavior |
| Fresh migrations, legacy compatibility, direct SQL guards, rollback/retry, process races and backup/restore | Executed as detailed above |
| Fee tiers and immutable facts | PASS, existing boundary/each-cent tests retained and SQL snapshots protected |
| Tenant/authentication/payment/refund/privacy tests | PASS in unit and SQL-backed application suites |
| Curated palette contrast | PASS, tested combinations meet 4.5:1 |
| Git diff/staged whitespace and historical file checks | PASS; Windows line-ending notices are not ESLint warnings |
| Tracked-file and available committed-history secret-pattern scan | No matches for the four tested live-key/private-key patterns; not an exhaustive secret certification |
| npm audit --offline --omit=dev | Reported zero vulnerabilities in available offline information; fresh upstream advisory verification remains required |

The three HTTP suites run sanitized, loopback-only production child servers and block
external/provider networking. They verify auth/verification/login, CSRF, onboarding,
catalog/shared capacity, autosave/publication, directory privacy, QR output, validated
images, phone proof, all four idempotent mock checkout/confirmation/calendar workflows,
production mock/private gates, malformed/oversized bodies and startup rejection.
HTTP and mock results do not claim real payment, email, SMS, geocoding, storage or push
interoperability. No packages or new dependencies were installed.

Durable evidence: `artifacts/phase4-unit-final.log`, `phase4-release-postgres.log`,
`phase4-build-final.log`, `phase4-final-drift.sql`, `phase4-database-guards.log`,
`phase4-legacy-compatibility.log`, `phase4-history-query-plan.log`,
`phase4-directory-performance.log`, `phase4-audit.json` and synthetic backup dumps.
Earlier failure logs also remain ignored for diagnosis.

## Browser and accessibility findings ? partial verification

The DOM/browser automation host was unavailable. Native Chrome was used against a
loopback mock server in a separate window; the original user window was retained.
Observed: synthetic owner login, dashboard/history, content editing, live preview,
Saving-to-Saved acknowledgement, saved-draft publication, QR presentation, service
request controls and a protected rental confirmation with calendar link. The token
fragment was removed from the address bar before protected receipt access.

Dashboard header/navigation layout was visually inspected at desktop and 320, 390
and 430 CSS pixel widths after correcting inherited page zoom. No clipping was seen
in those inspected sections; dashboard tabs intentionally scroll within their own
container. Form labels and semantic regions were visible in the accessibility tree,
and the edited input displayed a visible focus outline. This is focused visual/AX
inspection before the final small server/read/navigation changes, not a completed
final browser matrix or an automated overflow/focus assertion.

**Not completed:** browser end-to-end registration/recovery/onboarding/catalog and
all four full customer flows, all form/error states at every width, exhaustive keyboard
navigation, screen-reader testing and an axe audit. All four workflows were exercised
through HTTP, which does not replace browser verification. No suitable independent QR
decoder was used; exact scanner decoding remains unverified. Native sharing/printing
controls were inspected, not used to send to an external app or physical printer.
These remain release requirements and are not represented as passing tests.

## Remaining limitations and release requirements

1. **Browser/accessibility gate:** finish the full owner/customer flow and viewport
   matrix, automated accessibility/overflow checks, keyboard/screen-reader checks and
   independent QR destination decoding with dependable browser/decoder tooling.
2. **Public search scale limitation:** directory reads are bounded and batched but
   still scan the published catalog in pages to filter/rank in the application. The
   1,001-business measurement is evidence, not proof for larger sustained search load.
   Validate a production latency budget and consider SQL filter/top-result pushdown
   before higher search volume; no distributed infrastructure is necessary.
3. **Persistence release gate:** separately verify the actual target identity, applied
   legacy history, restored-copy migration, privileges, encryption/TLS, backup retention
   and restore/failure procedures. The isolated role/tests do not certify live grants.
   Financial/allocation writes must continue through the shared transactional service.
4. **Real providers remain disabled:** implement/authorize platform-fee checkout,
   signed payment ingress, payment-status reconciliation and real refund lifecycle;
   business email, customer SMS, exact geocoding, production image storage/lifecycle
   and optional push. Inline image bytes remain in the present repository model;
   production storage/volume and backup cost require provider integration review.
5. **Operational release gate:** configure a protected scheduler, provider timeouts and
   delivery idempotency, alerts, support/reconciliation procedures and trusted-edge
   abuse controls. Principal/subject limits are not a complete distributed/IP abuse
   defense. Local reconciliation expires holds; it does not query a real payment provider.
6. **Security/review gate:** current dependency advisories, deployment header/CSP/TLS
   configuration, independent security review and sustained production-like soak/load
   testing remain unverified. Retry exhaustion can still return an error under heavier
   contention; the executed burst tests do not establish a universal throughput limit.
7. **Legal/domain gate:** Terms remain explicitly draft and unreviewed. Obtain legal/
   provider review of disclosures, retention/deletion and support obligations. DNS,
   certificates/subdomains, hosting and publication/indexing release configuration need
   separate authorization. No unconditional legal immunity is claimed.

No business policy change is proposed or required by this report. JF fees remain
200/300/400/500 cents at the locked boundaries and 300 cents for quotes/unknown prices;
JF pays processing costs. Independent business nonperformance, nonresponse, customer
cancellation or no-show does not automatically refund a fulfilled JF obligation.
Duplicate charges and JF/legal/provider-required remediation remain supported.

## Scope preservation and commits

No original-checkout working files, RF or RFL were modified. Shared Git metadata was
used only for the authorized local branch commits. The protected original checkout's
five local modifications were not re-inspected/re-fingerprinted in this phase; no
repository operation targeted its working files. The worktree's node_modules is a
real local directory, not a junction into the original checkout.

No existing/remote database, live provider, payment, email/SMS/push, production storage,
Render, DNS, push, merge or deployment was operated. No destructive Git operation or
historical migration rewrite occurred. The isolated cluster is stopped and retained.

- Baseline: `06d0bc4e8197af541038fb3c5507993d67120b87`.
- Verified implementation: `40a1f60d6934dacd831a12fcc7cdff0fe0f24d99`.
- Following report-only commit: final HEAD, recorded in the completion response.

## Changed-file inventory

55 files relative to the Phase 4 baseline, including this report. Generated
clients/builds, synthetic data, keys, raw logs and backups are ignored and excluded.

- `.env.example`
- `README.md`
- `app/admin/page.tsx`
- `app/api/core/route.ts`
- `app/api/media/route.ts`
- `app/api/qr/route.ts`
- `app/api/ready/route.ts`
- `app/api/worker/route.ts`
- `app/find/page.tsx`
- `app/globals.css`
- `app/sandbox/inbox/page.tsx`
- `components/core/AuthForm.tsx`
- `components/core/Dashboard.tsx`
- `components/core/RequestForm.tsx`
- `components/core/SandboxInbox.tsx`
- `components/core/api.ts`
- `docs/ARCHITECTURE.md`
- `docs/OPERATIONS.md`
- `docs/PHASE2_DECISIONS.md`
- `docs/PHASE4_REPORT.md`
- `docs/SCHEMA_PROPOSAL.md`
- `eslint.config.mjs`
- `instrumentation.ts`
- `lib/core/administration.ts`
- `lib/core/booking.ts`
- `lib/core/business.ts`
- `lib/core/configuration.ts`
- `lib/core/documents.ts`
- `lib/core/http.ts`
- `lib/core/media.ts`
- `lib/core/model.ts`
- `lib/core/prisma-repository.ts`
- `lib/core/providers.ts`
- `lib/core/repository.ts`
- `lib/core/runtime.ts`
- `lib/core/security.ts`
- `lib/core/time.ts`
- `lib/core/worker-auth.ts`
- `lib/domain/validation.ts`
- `prisma/migrations/20261124000100_four_mode_foundation/migration.sql`
- `prisma/migrations/20261124000200_persistence_hardening/migration.sql`
- `prisma/proposals/rebuild.prisma`
- `prisma/schema.prisma`
- `scripts/phase3-smoke.mjs`
- `scripts/phase4-directory-benchmark.ts`
- `scripts/phase4-directory-load.sql`
- `scripts/phase4-http.mjs`
- `scripts/phase4-interruption-worker.ts`
- `scripts/phase4-postgres-support.ts`
- `scripts/phase4-postgres.mjs`
- `scripts/phase4-process-worker.ts`
- `tests/core.test.ts`
- `tests/hardening.test.ts`
- `tests/schema-compatibility.test.ts`
- `tsconfig.json`

## Separate readiness assessments

| Area | Assessment |
| --- | --- |
| Application code | Ready for code review; functional local four-mode paths verified, full browser/accessibility gate still open |
| Database persistence | Strong isolated PostgreSQL evidence and versioned artifacts; actual release target, privileges and recovery environment remain unverified |
| Security | Material hardening and adversarial local checks completed; no claim of comprehensive production security certification |
| Provider integrations | Not ready; real adapters and interoperability deliberately disabled/unverified |
| Production deployment | Not ready; provider, full-browser/accessibility, operational, legal and deployment gates remain open |
