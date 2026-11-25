# JobFray Stripe sandbox verification and production activation

Direct sandbox verification completed on 2026-11-24 against the owner-pinned dedicated JobFray sandbox account `acct_1TYAj2PmCLhiYoQg`. The account identity and JobFray name matched before writes. The provided test key stayed in process memory and was not saved to source, reports or CLI configuration. No live account, Render, deployment, production database, RF or RFL operations were performed. Production release gates remain unchanged and disabled.

## Actual Stripe results

| Platform fee | Real Checkout payment | Full refund | Signed event and reconciliation |
| --- | --- | --- | --- |
| $2 USD, SERVICE | Succeeded | Succeeded | Passed |
| $3 USD, QUOTE | Succeeded | Succeeded | Passed |
| $4 USD, RENTAL | Declined test card rejected, then succeeded | Succeeded | Passed |
| $5 USD, RESERVATION | Succeeded | Succeeded | Passed |

The final independent read-only audit verified $14 USD paid and $14 refunded, exactly one successful full refund for each PaymentIntent, and each charge marked fully refunded. All six unpaid Sessions created during browser-test repairs were verified expired and unpaid. The sanitized machine-readable evidence is in [jobfray-stripe-direct-report.json](../artifacts/jobfray-stripe-direct-report.json) and [jobfray-stripe-final-audit.json](../artifacts/jobfray-stripe-final-audit.json). No sandbox blockers remain.

The actual application Stripe adapter, booking service and payment worker created and reconciled the four real hosted Checkout Sessions. Independent provider readback verified account, USD, allowed fee amounts, request metadata, Session/PaymentIntent/charge identity and amounts, card payment details, one fee-only line item, API version `2026-11-18.endive`, integration identifier and Link disabled. Checkout retries returned the same Session; refund retries returned the same refund. No Connect, subscriptions, ACH, transfers or underlying business payments were involved.

Real Stripe events were received through Stripe CLI forwarding and their real signatures verified by the application. The same signed payload was then replayed locally to verify duplicate-event handling and single fulfillment allocation. This proves local duplicate handling; it does not claim that a provider-originated redelivery was forced. Altering the signed body was rejected. Reconciliation recovered actual paid Sessions through Stripe API reads before webhook processing was required.

Local application state used MemoryRepository throughout. Production database durability, deployed HTTP ingress and worker scheduling were deliberately outside this sandbox assignment. Local HMAC fixture tests are separate from the real signed-event evidence above. All 171 regression tests, the complete mocked harness, affected-source lint and TypeScript checking pass.

## Corrections made

- Stripe CLI v1.55.15 uses `stripe-windows-checksums.txt`; the installer previously expected a name ending in `_checksums.txt`. Selection now uses the correct Windows manifest, verifies SHA256, rejects unsupported architectures explicitly, and has regression coverage. The official CLI was installed locally under artifacts; no CLI login was used.
- The adapter previously sent `link` as a blocked card brand. Stripe rejected it. That invalid parameter was removed and the supported `wallet_options[link][display]=never` added alongside the card-only allowlist. Real API readback confirmed the setting. The observed Link interface could offer additional payment choices, so the explicit wallet setting is necessary.
- Hosted-form verification now handles the collapsed Card choice, iframe submit and error controls, and current required ZIP field. Stripe's ordinary fraud-check assets are allowed to load; no interactive challenge was bypassed.

The earlier owner-run PowerShell artifact is superseded for this assignment and was not rerun or reissued. Direct execution used the existing internal harness with test-only input in process memory, not another owner credential-transfer workflow. The CLI was used only for signed-event forwarding; account, Checkout, payment and refund operations used API requests.

## Application contract

The adapter pins `2026-11-18.endive`, accepts only card payment methods, disables Link, adaptive pricing, automatic tax and promotion codes, and binds payment identity, USD and one of the four supported fees. Integration identifiers end in eight random lowercase letters; this run's identifier is in the sanitized report. These parameters were accepted by the actual sandbox.

Booking requests use a stable provider expiry of creation time plus one hour, preserving identical parameters under the same idempotency key. The internal resource hold remains 15 minutes. Workers expire open Sessions when internal holds expire; late payments require remediation and cannot resurrect capacity. Direct adapter callers without a supplied expiry retain a 30-minute default. Paid verification rejects unsupported fees, mismatched PaymentIntent amounts and Connect-related fields.

## Exact production configuration, not applied

| Variable | Required production value |
| --- | --- |
| STRIPE_SECRET_KEY | Dedicated JobFray live secret (`sk_live_...`, or a suitably restricted `rk_live_...` supported by the adapter). Never the sandbox key. |
| STRIPE_ACCOUNT_ID | Independently verified intended LIVE `acct_...`; do not assume it equals the sandbox ID. |
| STRIPE_WEBHOOK_SECRETS | Comma-separated signing secrets of the actual live webhook endpoint; allow controlled rotation overlap. Never the CLI secret. |
| STRIPE_INTEGRATION_IDENTIFIER | Stable JobFray integration label ending in eight random lowercase letters. Generate once and retain it. |
| JOBFRAY_PROVIDER_ENV | production |
| JOBFRAY_PUBLIC_ORIGIN | https://jobfray.com |
| JOBFRAY_BASE_HOST | jobfray.com |

Account access must cover account identity reads, Checkout Session creation/read/expiry, PaymentIntent/charge reads, and refund creation/read. Validate any restricted key's exact permissions before enabling Checkout. Keep secrets server-side. All existing database, email, geocoding, media, confirmation, worker, edge and VAPID requirements still apply.

Register the LIVE snapshot webhook at `https://jobfray.com/api/stripe/webhook`, pinned to `2026-11-18.endive`, for `checkout.session.completed`, `checkout.session.expired`, and the dispute events `charge.dispute.created`, `charge.dispute.updated`, `charge.dispute.closed`, `charge.dispute.funds_withdrawn`, `charge.dispute.funds_reinstated`. This is an account webhook, not a Connect endpoint. Refund completion is reconciled by provider readback; refund webhook delivery is not the worker's completion dependency.

The route requires raw UTF-8 payload bytes, a valid timestamped signature within 300 seconds, matching environment/account and authoritative payment readback. It records events idempotently and delegates processing to the worker; a success redirect never authorizes fulfillment. Production ingress, raw-body preservation, durable database replay, public endpoint delivery, worker scheduling and operational recovery require deployed acceptance testing. Local CLI forwarding does not verify those production boundaries.

## Future production activation steps

1. Complete the owner-controlled live account's business verification and card capability requirements. Confirm its live identity and intended platform-fee-only business model.
2. Under separate production authorization, register the live webhook above, securely configure the live credentials and identifier, and verify the saved values. Never copy the sandbox credential or CLI signing secret to Render.
3. Complete pending database TLS acceptance, backup/restore and restricted-role checks, plus all non-Stripe provider and ingress acceptance requirements. Authorize any deployment separately.
4. After those checks, enable the required database/provider gates in the documented release sequence and arrange authenticated worker execution. Verify durable webhook replay, expiry, reconciliation, refund recovery and alerting against the deployed application.
5. Enable Checkout only after explicit release approval and any separately authorized live-payment acceptance test. Enable public indexing only after the publication checklist passes. Never enable production sandbox/local-test flags.

Until then retain `JOBFRAY_DATABASE_ENABLED=0`, `JOBFRAY_RELEASE_DB_VERIFIED=0`, `JOBFRAY_PRODUCTION_PROVIDERS=0`, `JOBFRAY_PROVIDER_OPERATIONS_ENABLED=0`, `JOBFRAY_RELEASE_PROVIDERS_VERIFIED=0`, `JOBFRAY_CHECKOUT_ENABLED=0`, `JOBFRAY_PUBLIC_INDEXING_ENABLED=0`, `JOBFRAY_SANDBOX=0` and `JOBFRAY_LOCAL_TEST=0`. This assignment does not alter Render or any of these gates.

Official references: [Stripe testing](https://docs.stripe.com/testing), [webhook testing](https://docs.stripe.com/webhooks/test), [PaymentIntent confirmation](https://docs.stripe.com/api/payment_intents/confirm), and [Stripe CLI](https://docs.stripe.com/cli). These describe provider behavior; passing local fixtures does not prove account eligibility or real API compatibility.

Production Stripe credentials and a separate live endpoint are now saved and staged disabled. See [STRIPE_PRODUCTION_CONFIGURATION.md](STRIPE_PRODUCTION_CONFIGURATION.md) and the [production acceptance procedure](STRIPE_PRODUCTION_ACCEPTANCE.md) for the current release state and legacy webhook isolation blocker. This does not supersede the no-launch restriction.
