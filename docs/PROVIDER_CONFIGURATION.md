# Provider configuration

No provider account was connected during Phase 5. In particular, Stripe was not connected, authenticated, or called. Adapters were exercised with injected HTTP transports and synthetic signed events. Existing RF/RFL resources and credentials are prohibited.

## Required environment manifest

| Variable | Purpose |
| --- | --- |
| `NODE_ENV` | `production` for deployed builds |
| `DATABASE_URL` | Least-privilege application PostgreSQL URL; never migration-owner credentials |
| `JOBFRAY_DATABASE_ENABLED` | Default `0`; enable only after persistence acceptance |
| `JOBFRAY_RELEASE_DB_VERIFIED` | Default `0`; explicit persistence release gate |
| `JOBFRAY_PRODUCTION_PROVIDERS` | Default `0`; select configured real adapters, never mocks |
| `JOBFRAY_PROVIDER_OPERATIONS_ENABLED` | Default `0`; authorizes actual outbound adapter operations |
| `JOBFRAY_RELEASE_PROVIDERS_VERIFIED` | Default `0`; separately verified provider release gate |
| `JOBFRAY_CHECKOUT_ENABLED` | Default `0`; customer financial checkout gate |
| `JOBFRAY_PUBLIC_INDEXING_ENABLED` | Default `0`; public SEO release gate; private pages remain noindex |
| `JOBFRAY_PROVIDER_ENV` | `staging` uses Stripe test keys; `production` requires live keys |
| `JOBFRAY_SANDBOX`, `JOBFRAY_LOCAL_TEST` | Must be unset or `0` in staging/production |
| `JOBFRAY_PUBLIC_ORIGIN` | Canonical HTTPS origin without trailing slash, path, credentials, or query |
| `JOBFRAY_BASE_HOST` | Must equal canonical origin hostname; staging must use a distinct hostname |
| `JOBFRAY_CONFIRMATION_KEY` | Random secret of at least 32 characters; secure confirmation capabilities |
| `JOBFRAY_CONFIRMATION_KEY_VERSION` | Signing-key identifier, e.g. `v1` |
| `JOBFRAY_CONFIRMATION_PREVIOUS_KEYS` | JSON map of preserved old signing versions; default `{}` |
| `JOBFRAY_ADMIN_EMAILS` | Comma-separated exact verified account emails |
| `JOBFRAY_WORKER_KEY` | Separate random secret, at least 32 characters; Bearer worker authentication |
| `JOBFRAY_EDGE_SECRET` | Separate random secret, at least 32 characters; authenticated ingress headers |
| `STRIPE_SECRET_KEY` | Environment-specific platform account key; server only |
| `STRIPE_ACCOUNT_ID` | Expected platform `acct_...` identity; no Connect accounts |
| `STRIPE_WEBHOOK_SECRETS` | Comma-separated `whsec_...` secrets, supporting rotation |
| `STRIPE_INTEGRATION_IDENTIFIER` | Identifier accepted by the pinned Stripe API integration configuration |
| `RESEND_API_KEY` | Scoped transactional sending key |
| `JOBFRAY_EMAIL_FROM` | Authenticated sender on an owner-controlled verified domain |
| `TWILIO_ACCOUNT_SID` | Newly authorized JobFray `AC...` account |
| `TWILIO_API_KEY_SID`, `TWILIO_API_KEY_SECRET` | Separate restricted server credentials |
| `TWILIO_VERIFY_SERVICE_SID` | Newly authorized `VA...` Verify service |
| `TWILIO_MESSAGING_SERVICE_SID` | Separate `MG...` sender for protected confirmation links, not Verify codes |
| `TWILIO_ALLOWED_PHONE_PREFIXES` | Explicit E.164 destination allowlist, e.g. owner-approved prefixes |
| `MAPBOX_ACCESS_TOKEN` | Server-side geocoding token with required account permissions |
| `MAPBOX_PERMANENT_GEOCODING` | Must be `1`, only after permanent-storage entitlement is confirmed |
| `CLOUDINARY_CLOUD_NAME` | Dedicated, separately authorized environment cloud |
| `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` | Server-only authenticated upload, download and deletion credentials |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | Optional complete VAPID configuration; subject `mailto:` or HTTPS contact |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | Must exactly match VAPID public key; this public key may enter client bundles |
| `NEXT_TELEMETRY_DISABLED` | Set `1` where telemetry is not desired |
| `PORT` | Hosting-provided listener port |

Only the VAPID public key belongs in a `NEXT_PUBLIC_` variable. Do not copy actual secrets into examples, reports, shell history, source control or customer-visible errors. The committed `docs/production.env.example` contains placeholders only.

## Stripe

The adapter uses native HTTP, pins `2026-11-18.endive`, and requests only the disclosed JF platform fee in USD. No subscriptions, Connect, transfers, application commissions, taxes, promotions or underlying business payments are created. Card wallets are eligible through Checkout. Non-card Link's synthetic `link` card brand is blocked at creation and rejected during charge verification; real-card wallet eligibility must be verified separately.

The current API uses `allowed_payment_method_types`, not the removed creation parameter `payment_method_types`. Confirm the pinned version, integration identifier, restriction parameter and returned response shapes against an independently authorized Stripe sandbox before enabling anything. These are public-document and mock-contract checks, not interoperability evidence. [Stripe migration guidance](https://support.stripe.com/questions/fix-the-payment-method-types-error), [Checkout creation API](https://docs.stripe.com/api/checkout/sessions/create), [Link non-card brand behavior](https://docs.stripe.com/changelog/acacia/2024-11-20/link-card-brand).

Set the platform account's card/wallet settings and verified payment domains as required. Configure signed events at `/api/stripe/webhook`, including `checkout.session.completed`, `checkout.session.expired`, and applicable `charge.dispute.*` events. Completion events enter a durable queue; a redirect never confirms payment. Expiration is reconciled by worker/session status; dispute events create durable audit and operator attention records. Other signed event types are retained as metadata-only acknowledgments. Refunds are status-polled; no dependency on browser redirects or a refund webhook.

Stripe's hosted Session minimum expiration is 30 minutes. The internal resource hold remains exactly 15 minutes. Workers expire open sessions after internal expiry; a successful late payment is remediated and cannot resurrect lost capacity. Creation and refund retries use stable keys. Checkout preparation and signed-event records permit recovery after interruption. Refunds with uncertain creation and no provider ID stop automated creation before the provider's idempotency retention expires; reconcile manually rather than risking a second refund.

No Stripe operations are authorized by this document. Obtain separate explicit permission before connecting or conducting any provider test.

## Email and SMS

Recommended email transport: Resend's HTTP API. Configure an authenticated sender, domain ownership, SPF/DKIM/DMARC, applicable region/processing terms, sending limits and a monitored operational mailbox. Templates escape content and provide secure account links. Stable outbox keys become Resend idempotency keys. [Resend send API](https://resend.com/docs/api-reference/emails/send-email).

Twilio Verify performs six-digit customer verification with a 10-minute local challenge, five attempts and destination/principal/trusted-edge limits. Configure Verify Fraud Guard, destination geography, account spending alerts and a Verify Service Rate Limit with the unique name `principal`. Codes are never generated by the production app, returned to browsers, queued as plaintext production codes, or logged. Proofs bind business, offering, mode and checkout idempotency key, and are consumed atomically. Browser principal binding survives ordinary IP changes while trusted-edge limits remain independent.

Confirmation links use the separate Messaging Service. Configure new JobFray senders, required registration/consent, geography and delivery policies. A timed-out SMS with uncertain acceptance is not automatically resent: the durable operation becomes operator-visible. Business email retries and dashboard confirmation are independent of SMS/push delivery. Do not claim exactly-once physical email/SMS delivery across provider outages.

## Geocoding

All geocoding is server-side Mapbox v6. The application persists validated business/service coordinates; therefore permanent geocoding rights are required before use. Every request sets `permanent=true`. Temporary-only entitlement is rejected. ZIP results use a bounded 256-entry, 24-hour cache; exact customer addresses are not cached. Confirm token restrictions and permanent-storage entitlement/account billing independently. [Mapbox geocoding and storage permissions](https://docs.mapbox.com/api/search/geocoding/).

Private mobile bases do not enter the public search projection. A public ZIP centroid is used instead; discovery distance is approximate and does not replace exact server-side service-address eligibility.

## Images

Cloudinary uploads use `authenticated` delivery for business and quote assets, including derivatives. All inbound images are decoded, bounded and re-encoded to WebP by Sharp before transfer. Draft/public image access is determined by JobFray authorization, then served through same-origin routes; quote access requires owner or protected paid confirmation. Signed download URLs expire after 60 seconds and are fetched server-side, not exposed as permanent public photo URLs. [Cloudinary authenticated asset behavior](https://cloudinary.com/documentation/control_access_to_media).

Require a dedicated cloud, correct authenticated-delivery configuration, SHA-256 API-signature support and provider retention/deletion terms. The database stores an asset locator and empty image bytes after durable upload; legacy local bytes remain readable. Pending-upload orphan records and expired/unreferenced image deletion jobs recover timeouts. Business images unreferenced by draft, published gallery or any offering become eligible after 24 hours; bounded worker batches can introduce cleanup lag. Quote retention remains 24 hours unpaid and 180 days confirmed.

## Optional push

Generate dedicated VAPID keys offline, place the private key only on the server, and use the identical public key at build and runtime. Permission is requested only by an explicit owner action. The dashboard manifest supports installation; Apple push additionally depends on platform/browser installation eligibility. Supported endpoint hosts are FCM, Mozilla and Apple; arbitrary endpoints are rejected to prevent SSRF. Twenty active devices per business, tenant/session ownership, logout/recovery revocation, expired-session checks, per-device delivery leases and browser deduplication apply. No private customer details enter payloads. Real browser-service interoperability remains untested.

## Trusted edge

Ingress must strip incoming `x-jf-edge-secret` and `x-jf-client-ip`, derive the actual client IP from a trusted connection/proxy chain, and inject both headers server-side. The secret authenticates this assertion; raw client-controlled forwarding headers are insufficient. Direct requests without valid assertions fail closed on protected production operations. Configure access restrictions so an attacker cannot bypass the trusted ingress. Render does not automatically provide these custom authenticated headers. This ingress configuration is an essential unresolved deployment requirement, not an implied connection or DNS change.
