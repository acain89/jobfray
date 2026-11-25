# Controlled deployment and acceptance

This release incorporates the reviewed changes since Phase 6A: strict PostgreSQL validation, the Geocodio replacement, Stripe sandbox-verified fee binding/idempotency, and globally authenticated ingress. Financial Checkout and indexing remain disabled. The live account retains a legacy RentFray webhook; do not edit RF/RFL resources. Account-wide event delivery cannot be safely isolated by changing only JobFray, so financial activation stays blocked pending an authorized isolation decision.

The deployment is pinned to the reviewed commit on feat/jobfray-rebuild. Main and the original worktree are preserved. Render build/start commands use npm ci, Prisma generation, a Next production build, and next start on 0.0.0.0:$PORT; health checks use /api/health. Autodeploy stays off.

## Acceptance controls

Cloudflare public routing remains maintenance. A separately authenticated operator channel, controlled by ACCEPTANCE_ENABLED and the existing worker bearer key, permits infrastructure probes without public activation. It never bypasses application authentication and cannot POST customer checkout. Both the Worker and application still enforce their independent authentication contracts.

/api/acceptance GET reports only ingress principal hash, hostname and commit. Its POST uses the restricted pending URL, strict certificate/hostname verification, a read-only transaction, exact schema/catalog comparison and effective ACL checks. The role must be jobfray_app and pool/role limits remain two, pool timeout ten seconds and connect timeout ten seconds. Credentials are never returned. The database URL is not promoted until deployed-runtime acceptance and isolated restore acceptance pass.

Render internal PostgreSQL TLS may use a self-signed certificate. Do not disable verification or learn trust from its presented certificate. This release uses the dedicated database's externally named, publicly verified TLS endpoint with a fingerprint-checked public ISRG root; the credentials and connection limits are unchanged. Internal-path acceptance is not claimed.

The Stripe route has a narrowly authenticated raw-body acceptance branch requiring the worker bearer key, the actual webhook HMAC secret, the acceptance flag and the fixed nonfinancial jobfray.infrastructure.acceptance event type. It returns byte count/hash only, never records an event and cannot process a real payment event in that branch. It verifies the actual deployed ingress and route byte preservation without creating a Stripe event or changing the production database. Real Stripe delivery remains a later acceptance item while the live webhook is disabled.

When Checkout is disabled, /api/worker executes read-only authenticated status work and cannot reconcile payments, issue refunds, deliver notifications or perform retention deletion. Cloudflare's scheduled handler explicitly requests this read-only mode every minute. Scheduled invocations use an internal fixed principal, separate from an Internet user's Cloudflare-derived principal. Worker bearer authorization is still required independently of edge assertions.

## Recovery and evidence

The dedicated database's migration ledger and exact schema are inspected read-only. No migrations are rerun without missing, reviewed migration evidence. A newly issued Render-managed owner credential replaces the exposed password; the application role/password is preserved. The historical owner role remains to preserve ownership, and its exposed password must fail a fresh login.

Managed recovery availability and logical export/isolated restore results are recorded in ignored artifacts/controlled-deployment. Restore targets are fresh loopback-only PostgreSQL instances, never the production database. Archive credentials and signed download URLs must remain in process memory. Restored data and logs are sensitive, ignored artifacts and must never be committed.

The final deployed commit, deployment IDs, provider checks, restore results and remaining blockers are recorded in the sanitized controlled-deployment report. Full readiness must remain false until all required provider and ingress gates have genuine acceptance evidence. Email sending, device push, live charges/refunds, RF endpoint changes and public activation require separate authorization when not exercised here.
