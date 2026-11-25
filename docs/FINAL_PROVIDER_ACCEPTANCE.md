# Final provider acceptance and activation preparation

The deployed baseline remains `8c880f349088414b9fc16d89df8ec06279204ed3`. This assignment prepares application and Worker updates; it does not deploy them or activate providers. Public maintenance, disabled Checkout/indexing, Auto-Deploy off and the live read-only scheduler are preserved. Sanitized live evidence is in ignored `artifacts/final-provider-acceptance/`.

## Resend

`GET /domains` returned HTTP 401 with `restricted_api_key` and the explicit message that the key can only send emails. This confirms the expected restriction, rather than an invalid credential. Domain administration is not required by JobFray's sender. The acceptance probe now distinguishes this response from an invalid API key, and never infers successful sending from administrative access.

Exactly one authorized test message was sent to the first configured administrator using the actual `ResendAdapter`, configured sender, normal template and idempotency header. Resend accepted it with HTTP 200 and an email ID. No broader key permissions were requested. API acceptance establishes sending interoperability; inbox placement was not independently verified.

Evidence: `credential-diagnostics.json`, `resend-acceptance.json`.

## Cloudinary

The original credentials returned `api_secret mismatch` through Basic-authenticated ping; whitespace, quoting and encoding issues were ruled out. The owner supplied the matching secret. The existing adapter's SHA-256 upload, short-lived private download and deletion formats match Cloudinary's official SDK.

The actual `CloudinaryAdapter` passed a live test with a synthetic 16-by-16 WebP:

- Credential ping, authenticated upload and signed retrieval returned 200; decoded pixels matched.
- Unsigned delivery, a tampered signature and an expired signed URL returned 401.
- Deletion returned `ok`; subsequent private retrieval returned 404.

Only the synthetic test asset was created and removed. Only `CLOUDINARY_API_SECRET` was corrected on the pinned JobFray Render service, in one bulk write using a fresh environment snapshot. API readback verified every saved value, preserved all unrelated variables and gates, and confirmed deployment IDs were unchanged. The new secret takes effect in the deployed runtime at the next reviewed deployment.

Evidence: `cloudinary-acceptance.json`, `render-configuration-readback.json`.

## Other nonfinancial evidence

Existing successful live Geocodio ZIP and public street-address receipts match the currently configured key. No additional geocoding requests were made. VAPID private/public derivation, the browser public key and the notification subject match; real device delivery remains an optional, separately controlled test requiring a valid owner subscription.

The current deployed worker returned 200 in `read_only` mode, with zero pending operations/refunds and no financial operations or mutations. This observation does not authorize processing any future queue.

## Stripe restriction

The owner explicitly stopped Stripe connections during this assignment. No further Stripe account, webhook or event calls were made. Existing historical evidence of a RentFray-URL endpoint on the JobFray account is not a fresh exclusivity or obsolescence determination. No endpoint was disabled, enabled or otherwise changed. Actual Stripe webhook delivery was not tested. These checks require renewed Stripe authorization; no live charge or refund is authorized.

Before any legacy endpoint change, establish current account/endpoint/application ownership, active integrations and outstanding obligations; report that evidence and the proposed disposition first. Zero balances or an old URL alone do not prove an endpoint is obsolete. Do not change any RF/RFL resource.

## Prepared notification-only transition

The prepared `nonfinancial` worker mode only runs the bounded notification outbox. It does not run Stripe operations, booking/payment reconciliation, retention deletion or media cleanup. It requires all of:

- Render `JOBFRAY_WORKER_MODE=nonfinancial`.
- `JOBFRAY_PRODUCTION_PROVIDERS=1`, `JOBFRAY_PROVIDER_OPERATIONS_ENABLED=1` and `JOBFRAY_RELEASE_PROVIDERS_VERIFIED=1`, after their independent acceptance requirements are met.
- Cloudflare `SCHEDULER_MODE=nonfinancial`, with the existing authenticated one-minute scheduler enabled.

Checkout and indexing can remain `0`. Maintenance and the closed operator channel remain in place. Unknown/full scheduler modes fall back to read-only in the Worker, and the scoped publisher rejects a financial mode or an unaccepted notification-only transition. The application independently verifies its worker key and provider/mode gates. Scheduler readback checks the returned mode, financial exclusion and read-only mutation exclusion. Unit and route-level tests trap access to financial and cleanup services.

Default mode is `read_only`. No live worker mode or provider gate was changed in this assignment. Do not claim the staged notification-only mode has executed against production: its execution tests use synthetic in-memory data and mock transports.

## Exact release sequence

1. Review and deploy the prepared application commit to the pinned JobFray service, retaining Auto-Deploy off, `/api/health`, the reviewed commands, maintenance, read-only scheduling and disabled financial/indexing gates. This loads the corrected Cloudinary secret.
2. Obtain renewed Stripe authorization, resolve legacy endpoint isolation within scope, and verify actual signed nonfinancial delivery where Stripe supports it. Report endpoint-disposition evidence before making a change. Local HMAC probes are not Stripe deliveries.
3. Complete the provider release review before setting the existing provider verification/selection/operation gates. Do not mark the global provider gate verified while required Stripe acceptance remains unresolved.
4. Review pending notification destinations and effects, obtain authorization for queued deliveries, then set the paired Render/Worker modes above. Publish the reviewed Worker only after the application supports the mode. Verify an actual one-minute event with the operator channel closed; it must report `nonfinancial` and no financial operations. Roll back the Worker mode to `read_only` on a mismatch.
5. Full financial reconciliation remains outside this notification-only transition. It requires separately reviewed financial scheduling, safe Stripe isolation/delivery acceptance and explicit financial authorization. Follow `STRIPE_PRODUCTION_ACCEPTANCE.md` for any later charge/refund canary.
6. Remove maintenance or enable Checkout/indexing only after the corresponding explicit final release decision and readiness evidence.

Official references: [Resend sending-only permissions](https://resend.com/changelog/new-api-key-permissions), [Cloudinary authenticated media](https://cloudinary.com/documentation/control_access_to_media), [Cloudinary API signatures](https://cloudinary.com/documentation/authentication_signatures), [Cloudinary Node SDK private download/signing](https://github.com/cloudinary/cloudinary_npm/blob/master/lib/utils/index.js).
