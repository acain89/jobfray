# JobFray current operational runbook

Use [PRODUCTION_SETUP.md](PRODUCTION_SETUP.md), [PROVIDER_CONFIGURATION.md](PROVIDER_CONFIGURATION.md) and [RELEASE_CHECKLIST.md](RELEASE_CHECKLIST.md) as the current configuration and recovery instructions. Historical phase reports remain evidence of their respective revisions.

The production runtime requires verified Prisma persistence and explicit provider/operation release gates. It never falls back to local files or mocks. Stripe remains disconnected; checkout and outbound operations stay disabled until separately authorized and verified. No existing/remote database, deployment or DNS operation is authorized here.

Customers affirm the displayed normalized phone; no ownership verification or automatic customer notification is performed. Browser-bound capabilities authorize checkout/uploads; opaque protected links authorize receipt access. Require customers to save/copy their link. Keep private media and customer details protected, enforce tenant isolation, CSRF and trusted-edge/principal limits, and never use phone as authentication.

Business email is mandatory; owner PWA push is optional. Workers process only these supported channels; retired delivery records remain historical and cannot be executed. Monitor leases, outbox backlog, financial reconciliation, expiry, provider errors, failed refunds and disputes. Preserve immutable snapshots, audits, confirmed obligations, financial/refund history and original migration files.

Use the dedicated migration role only in a separately authorized job; application roles must remain least privileged. Verify target identity, backups/restores, constraints/indexes and private ingress before release. For recovery, disable new checkout first, reconcile original provider identities and use forward repair rather than deleting history. Complete legal/provider, real integration and deployed accessibility/security review before production acceptance.

Geocoding now uses the US-only Geocodio adapter; current licensing, pricing, account setup and migration limits are in [GEOCODING_PROVIDER_REVIEW.md](GEOCODING_PROVIDER_REVIEW.md). Historical Phase 5/6A reports describe Mapbox as it existed then; they are not the current geocoding configuration. Old owner-run Render preparation artifacts are tied to the old manifest and must not be used to configure this provider; no remote configuration is authorized by this change.
