# Phase 6A ? Remove customer delivery and simplify checkout

## Result and revisions

The rebuilt application no longer has an active customer phone-ownership challenge, code, SMS transport, phone-proof authorization or Twilio adapter/configuration dependency. Customers enter a phone once, review their request and fee, then use the accessible phone-confirmation modal before checkout. Confirmation is explicitly self-affirmation, never proof of ownership or authentication.

- Worktree: `C:\Users\acain\.codex\worktrees\jobfray-rebuild`
- Branch: `feat/jobfray-rebuild`
- Baseline: `076749e119565a9f2fb9e514c7ee6fe849298d95`
- Implementation commit: `55a82829cea4350f203d10d9d1becf98044cdadb`
- This report is committed separately; the final response supplies the report commit SHA.

**Completed locally; not a production deployment. Stripe remains disconnected.** No live provider operation, existing/remote application database access, RF/RFL change, original-checkout source change, Render/DNS change, push, merge or deployment was performed.

## Application changes

Deleted `lib/integrations/twilio.ts` and `lib/core/phone-verification.ts`; removed customer code/proof helpers, purposes, routes and UI. Removed customer confirmation delivery enqueueing and the native HTTP SMS transport. Supported new notification channels are now business EMAIL and optional business PUSH. Workers explicitly select only those channels, so retired message rows cannot execute. The local sandbox inbox likewise excludes retired channels and no longer has the obsolete customer-message link.

There was no installed Twilio SDK to uninstall: the removed integrations used native HTTP. No additional dependency was introduced, and package manifests/lockfiles did not need changes. Unused code/imports were removed.

### Customer flow in every mode

1. Enter contact details once, applicable scheduling/fulfillment and quote images.
2. Review the server-calculated underlying subtotal and separate JF fee. Review is read-only: no request, capacity allocation, hold or payment session is created.
3. Press **Pay Now** to open the centered native dialog:
   - **Confirm your phone number**
   - The business will use this number to contact you.
   - Large bold formatted phone number.
   - Is this number correct?
   - Green **Yes ? Continue to Payment**.
   - Outlined **No ? Edit Phone Number**.
4. Yes authorizes the existing checkout flow: normalize/validate the phone, verify current accepted pricing, atomically create the request/hold, and proceed to mock payment locally or the separately gated real adapter.
5. No closes the dialog and immediately focuses the original phone field. Escape/backdrop dismissal cannot initiate checkout. Editing the phone invalidates the review/affirmation and preserves entered name, notes, schedule, fulfillment and uploaded photos.

The dialog has an accessible name/description, initial focus, explicit keyboard cycling, native background modality, adequate touch targets and bounded mobile dimensions. Duplicate submissions are blocked by the UI execution guard and server idempotency. Phone self-confirmation is not a second entry field, OTP, customer account or email requirement.

If the business changes pricing between review and Yes, checkout rejects the stale accepted facts with a review-required error and rolls back any intermediate writes. Client-supplied fee changes cannot set the actual fee. The accepted normalized phone is stored on the immutable request and checkout snapshot; the database enforces matching values for new browser-authorized requests. Historical snapshots may omit this added field and are not rewritten or recalculated.

## Security implications and boundaries

Phone reachability/ownership is deliberately no longer established. A syntactically valid self-affirmed number can still be incorrect or belong to someone else. It grants no access to requests, images, owner sessions or confirmations.

Authorization instead uses a cryptographically random capability stored hashed, a business scope and a separate random HttpOnly browser cookie. Production uses Secure, SameSite=Strict, host-only cookie semantics. Capabilities expire after one hour; the browser cookie lasts one day. Browser binding is checked at both media and checkout service boundaries, including before/after image decoding. The normalized phone never substitutes for either secret.

- Another browser cannot use a stolen capability, even with the correct phone.
- Another valid capability cannot attach someone else's quote photo.
- An image already attached to one request cannot be attached to a second request.
- Idempotency replay checks the original immutable browser binding before returning any confirmation capability.
- Public review only returns offering/selection price facts, not stored private request data.
- Protected receipt access continues to require the opaque confirmation capability; guessing a phone/reference does not grant access.
- Owner authentication, tenant-scoped repositories, CSRF, input validation, upload decoding/type/size limits, shared capacity, payment verification, immutable financial records and provider gates remain in place.

New browser limits supplement existing principal/trusted-edge controls: capability issuance 30/15 minutes, first checkout attempts 10/15 minutes per browser/business, quote uploads 12/15 minutes per browser, six quote assets per capability. A valid historical idempotency replay does not consume another first-checkout attempt. These limits are abuse controls, not identity verification; actual trusted ingress remains a production-release prerequisite.

## Confirmations and business notifications

Mandatory verified-owner email through Resend and optional owner device push are retained. Booking/quote confirmation remains authoritative if external notification delivery fails.

No automatic customer SMS or email is required or generated. The screenshot-friendly protected confirmation page retains business contact information and scheduled add-to-calendar access, adds a secure copy-link control with selectable fallback, and explicitly asks customers to save their confirmation/link. Links use an opaque token in the URL fragment. Access is checked server-side, responses are private/no-store, and the fragment is removed from the visible URL after opening.

All four saved links were reopened in fresh isolated browser contexts without customer accounts. No phone-based recovery is offered: customers need their saved link or existing protected browser access. Historical confirmation signing and financial snapshot mechanisms are preserved.

## Schema and history

Added only `20261124000400_browser_request_capabilities/migration.sql`. The six prior migration artifacts were not modified. The new migration adds insert guards for supported token/notification purposes and a NULL-safe phone/snapshot binding trigger. Modern request browser binding is protected by the existing immutable-request-facts guard. Both active/reference Prisma schemas document the JSON contract; the generated client remains aligned.

A synthetic retired token and a pending retired notification were inserted before the new migration; both survived unchanged afterward. New retired-purpose insertion was rejected. A worker regression proves that retired pending delivery history stays inert. Existing financial, confirmation and audit records are not erased; ordinary pre-existing retention policies remain documented. Historical phase reports were not edited.

## Executed verification

| Check | Actual result |
| --- | --- |
| Full unit/domain/security/provider suite | **126 passed, 0 failed, 0 skipped** |
| Strict TypeScript | PASS: `tsc --noEmit --incremental false` |
| ESLint | PASS, zero warnings |
| Both Prisma schemas | Validated |
| Prisma Client generation | PASS, Prisma 5.22.0 |
| Production build | PASS, Next 16.4.6 webpack build |
| Foundation HTTP suite | PASS |
| Four-mode application HTTP suite | PASS, real local HTTP with mock providers |
| Production HTTP/startup security suite | PASS |
| Core PostgreSQL harness | **47 passed, 0 failed** |
| Provider/capability/retention PostgreSQL harness | **20 passed, 0 failed**; SQL-backed fixtures where applicable, with explicitly static/configuration and in-memory retired-queue cases also included |
| Independent-browser capacity race | 20 distinct browser capabilities, capacity 3: 3 accepted holds, 17 rejections; no excess allocation; event replay remained deduplicated |
| Fresh migration deployment | All **7 migrations** applied in a new disposable database |
| Prisma drift | Empty migration on the fresh final target |
| Historical-row preservation | 1 retired token and 1 retired message retained; new retired token creation rejected |
| Direct negative SQL | Mismatched snapshot phone rejected; immutable request browser-binding change rejected |
| Customer/responsive browser suite | **53 checks**, all four modal/payment workflows, dismissal, edit/focus, data preservation, edited-phone snapshots and fresh-context link reopening |
| Owner browser suite | **8 checks**, registration through publication/edit/recovery/logout |
| Automated accessibility | **60 axe page/viewport scans**, zero violations in tested states |
| Independent QR decode | Exact generated local website URL matched |
| Active source/config scan | No active retired provider/code/proof path or production credential requirement found |
| Client chunk scan | No retired provider URL, credential-variable or verification-service references found |
| Git diff check | PASS before commit |

HTTP tests include missing/mismatched phone affirmation, absent retired endpoints (404), stolen browser capability (403), fee tampering (409), normalization/snapshot equality, idempotency, protected media/confirmation and scheduled calendar export. Capability tests additionally exercise expiry, cross-business access, cross-browser replay, private uploads, image reuse, immutable phone facts and rollback after stale pricing.

Browser tooling: isolated headless Chrome 157.0.8103.79 on Windows; viewport widths **320, 390, 430 and 1280**, height 900. Modal centering and viewport bounds were asserted, all 16 mode/width modal screenshots were captured, and the 320px screenshot was visually inspected. Native clipboard interoperability, real mobile virtual keyboards, Safari/iOS, Firefox and screen readers are not certified by these checks. Actual external providers were mocked; no live interoperability is claimed.

Initial failures were corrected rather than counted as passes: a retained email-auth assertion still expected an obsolete error label; early HTTP runs overlapped a build; the old sandbox history view exposed retired message rows; modal keyboard cycling/focus restoration and a Windows text-encoding defect required correction; one SQL-check harness command had a quoting error. Affected verification was rerun successfully. Provider/source contracts were not weakened to make tests pass.

### PostgreSQL isolation

The previously authorized disposable PostgreSQL 17 cluster was verified before restart and again before shutdown:

- Identifier: **7711613122963596620**.
- Loopback only: **127.0.0.1:55487**.
- Data directory: worktree `artifacts/phase4-postgres/data`.
- New application test database: `jf_phase6a_disposable`, unique synthetic schemas.
- Fresh final migration database: `jf_phase6a_migration_final`.
- A prior Phase 6A-only migration rehearsal target was also created; no existing application database or remote target was used.
- Restricted disposable application role: `jf_phase4_app`; administration used the recorded disposable cluster role.
- **Cluster shutdown was verified**; no test server was left running.

Evidence is retained under ignored `artifacts/phase6a-*`: unit/type/lint/schema/build/HTTP logs, PostgreSQL suites, migration/negative-guard JSON, browser/axe JSON, modal screenshots and cluster identity/shutdown records. Some browser JSON is emitted by the retained Phase 5-named reusable harness. Test data, keys, local runtime state and cluster files are not committed.

## Updated configuration and release requirements

Updated the production setup, provider configuration, release checklist, production environment example, Render example, local environment example, approved decisions and operational runbook. No Twilio/Verify/Messaging account, credential, service identifier, destination prefix list, SMS consent setup or customer message-delivery provider remains an active release requirement. No new production environment variable was introduced.

Still required, unchanged: verified persistence; Stripe platform-fee configuration and separately authorized interoperability; Resend sender; Mapbox permanent geocoding permissions; authenticated Cloudinary storage; optional VAPID configuration; signing/worker keys; administrator allowlist; canonical domain and trusted ingress; release/operation/checkout/indexing gates. Existing CSP inline allowances, sustained staging load, actual database permissions/backup operations, legal/provider review and deployed browser/device acceptance remain release work.

Only a schema-compatible no-ownership-verification build should be used after the new insert guards. Historical code that tries to create retired contact tokens/deliveries is intentionally incompatible; preserve history and use forward repair, not destructive rollback.

**No unresolved Phase 6A local implementation/test blocker remains. Production readiness is still blocked by the unchanged external integration, infrastructure, independent security/legal and deployment acceptance requirements. Stripe remains disconnected, and no deployment is authorized.**

## Changed files

- `.env.example`
- `app/api/core/route.ts`
- `app/api/media/route.ts`
- `app/globals.css`
- `app/terms/page.tsx`
- `components/core/Confirmation.tsx`
- `components/core/ManagementForms.tsx`
- `components/core/RequestForm.tsx`
- `components/core/SandboxInbox.tsx`
- `components/core/api.ts`
- `docs/OPERATIONS.md`
- `docs/PHASE2_DECISIONS.md`
- `docs/PHASE6A_REPORT.md`
- `docs/PRODUCTION_SETUP.md`
- `docs/PROVIDER_CONFIGURATION.md`
- `docs/RELEASE_CHECKLIST.md`
- `docs/RENDER.md`
- `docs/production.env.example`
- `docs/render.example.yaml`
- `lib/core/booking.ts`
- `lib/core/documents.ts`
- `lib/core/http.ts`
- `lib/core/media.ts`
- `lib/core/model.ts`
- `lib/core/phone-verification.ts`
- `lib/core/request-capability.ts`
- `lib/core/runtime.ts`
- `lib/core/security.ts`
- `lib/integrations/configuration.ts`
- `lib/integrations/notifications.ts`
- `lib/integrations/twilio.ts`
- `prisma/migrations/20261124000400_browser_request_capabilities/migration.sql`
- `prisma/proposals/rebuild.prisma`
- `prisma/schema.prisma`
- `scripts/phase3-smoke.mjs`
- `scripts/phase4-postgres.mjs`
- `scripts/phase4-process-worker.ts`
- `scripts/phase5-browser.mjs`
- `scripts/phase5-postgres.mjs`
- `scripts/phase5-process-worker.ts`
- `scripts/phase6a-interruption-worker.ts`
- `scripts/phase6a-migrations.mjs`
- `scripts/phase6a-postgres-support.ts`
- `scripts/phase6a-postgres.mjs`
- `scripts/phase6a-process-worker.ts`
- `scripts/phase6a-provider-postgres.mjs`
- `scripts/phase6a-sql-guards.ts`
- `tests/core.test.ts`
- `tests/customer-capabilities.test.ts`
- `tests/provider-fixtures.ts`
- `tests/provider-workflows.test.ts`
- `tests/providers.test.ts`
- `tests/push-and-retention.test.ts`
- `tests/schema-compatibility.test.ts`
