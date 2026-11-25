# Release checklist

Local completion does not authorize release. All unchecked external steps remain blockers.

## Local evidence

- [x] Four-mode fee, pricing, scheduling and immutable-history contracts retained.
- [x] Production adapter code uses injectable transports; no live provider operation required for tests.
- [x] New additive migration, fresh PostgreSQL application and synthetic legacy preservation exercised.
- [x] Financial synthetic backup/restore and schema drift checks executed.
- [x] Indexed 1,000/10,000-business directory measurements and exact application query plan captured.
- [x] Mock provider workflows exercised against memory and PostgreSQL repositories.
- [x] Local Chrome owner/customer workflows, four mobile/desktop widths, axe and independent QR decoding executed.
- [x] Dependency advisory audit remediated; credential-pattern scan performed with synthetic example classified.
- [x] Final regression/commit evidence: see PHASE6A_REPORT.md for current checkout verification and commits; PHASE5_REPORT.md retains the provider and directory benchmark evidence.

- [ ] Confirm Phase 6A phone modal, browser capability isolation and saved confirmation links against the deployed application.

- [x] Customer phone modal, browser-bound authorization, immutable normalized phone and stale-price rejection verified locally across all four modes.

## Essential external gates

- [ ] Separate authorization to connect Stripe; none granted or used in Phase 5.
- [ ] Confirm Stripe API/version/integration identifier, card-only restrictions and eligible wallets with the actual intended account; verify signed webhooks, refunds, reconciliation and disputes in an authorized environment.
- [ ] Verify Resend sender/domain authentication, delivery, provider rate limits/idempotency and processing terms.
- [ ] Verify dedicated Geocodio account, US data-source terms, server-key/billing controls and provider processing retention; validate real ZIP/address quality and unchanged radius behavior. See GEOCODING_PROVIDER_REVIEW.md.
- [ ] Verify authenticated Cloudinary original/derivative isolation, signed private downloads, deletion, retention and recovery after ambiguous uploads.
- [ ] If enabling optional push, verify VAPID/browser interoperability, install/permission behavior, logout/recovery and subscription expiry on supported real devices.
- [ ] Provision a separately authorized isolated staging then production database, application/migration roles, TLS/private access and real backup/PITR/restore operations.
- [ ] Validate actual migration compatibility, SQL-only constraints/functions/indexes, permissions and public projection backfill on the approved target.
- [ ] Configure trusted ingress assertions, header stripping, actual client IP and origin-bypass prevention; verify rate limits through the deployed edge.
- [ ] Complete staging soak/load testing. Local SSI retries remain significant; retry-budget exhaustion under heavier bursts is still a release risk.
- [ ] Review CSP inline allowances, independent security findings, actual session/media protection, alerting and least privilege.
- [ ] Verify worker cadence, bounded batch/backlog recovery, reconciliation, timeout ambiguity, operational alert delivery and refund escalation ownership.
- [ ] Obtain Terms/privacy and payment-provider review. Draft language is not legal approval.
- [ ] Obtain explicit deployment, domain/DNS/TLS and any payment-test authorization.
- [ ] Complete deployed desktop/mobile, accessibility, SEO, wildcard subdomain and provider end-to-end acceptance.
- [ ] Enable release, outbound-operation, financial-checkout and public-indexing flags only in the reviewed order; never use sandbox flags in staging/production.

Application code, database, security, adapter contracts, real interoperability and deployment have separate assessments in the report. No unchecked external item is implied to have passed.
