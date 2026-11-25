# JobFray production payment acceptance procedure

This procedure prepares a later, explicitly authorized production acceptance window. It does not authorize a charge, refund, deployment, database mutation, gate change, service resumption or maintenance cutover. Historical configuration preparation is in [STRIPE_PRODUCTION_CONFIGURATION.md](STRIPE_PRODUCTION_CONFIGURATION.md). Current deployment and nonfinancial acceptance evidence is retained locally in ignored `artifacts/final-deployment-acceptance/` and summarized below.

Subsequent acceptance: RentFray's production credential established a distinct account. Green dot was disabled exclusively in JobFray's account and the dedicated seven financial subscriptions were activated. The one authorized $2 live canary passed actual signed financial delivery, reconciliation, durable confirmation and duplicate-fulfillment checks. No refund was required; the synthetic fixture was retired with financial history retained. See [recurring processing, December 2 settlement verification and exact public activation procedure](FINANCIAL_PROCESSING.md). Staging statements below describe the earlier phase.

## Current deployment and nonfinancial acceptance

The application is pinned to `08d21883e04704d0bd23b27e1c4ff92a13d2d93e` on Render service `srv-d851un6q1p3s73ebcqm0`. The JobFray Worker has a separately reviewed, explicit `WEBHOOK_INGRESS_ENABLED` exception for canonical JSON webhook POSTs with a Stripe-signature header. This is a transport exception: origin ingress authentication and raw-body HMAC verification still run before persistence. General maintenance stays active, private responses remain no-store, and Checkout/indexing stay disabled.

The dedicated live endpoint `we_1UfVZCBM9Cu8R81S03QwFJHc` is enabled for `customer.created` only during this nonfinancial phase. An actual Stripe-created synthetic Customer event was accepted by the deployed normal webhook handler and stored as completed metadata-only work; this was not a locally signed replay. The synthetic Customer was then deleted. The legacy RentFray-URL endpoint was not changed. Account ownership is verified, but exclusive application ownership and absence of dependencies were not established, so disabling it is not authorized by the available evidence.

The notification-only minute worker is independent of financial processing. `JOBFRAY_WORKER_MODE=nonfinancial` and Cloudflare `SCHEDULER_MODE=nonfinancial` require the existing accepted provider gates. They authorize the bounded notification outbox, not Stripe reconciliation, refunds, booking reconciliation, retention deletion or media cleanup. Provider technical readiness is not approval for financial or public release. Actual delivery and worker evidence is retained in ignored `artifacts/final-deployment-acceptance/`.

## Preconditions

The live audit found an enabled legacy RentFray webhook on this account. It can receive future JobFray payment events. Resolve integration isolation or obtain separate authorization for its disposition before a financial canary; this assignment does not authorize changing the RF endpoint. No financial obligations were found in the audited live categories, but the legacy integration still exists.

The dedicated live account ID must match the configured Stripe account. Card payments must be active, charges enabled, verification requirements reviewed and any limitations resolved. Review the legacy-obligation audit with the owner; preserve old records and integrations until obligations have a separately approved disposition. Old subscriptions or open invoices can continue creating account activity independently of JobFray's new Checkout gate.

The reviewed rebuild, including global ingress and the sandbox-verified adapter, must be deployed through a procedure that safely replaces the suspended obsolete application. Keep the default Render hostname disabled. Keep Cloudflare maintenance active while performing deployment-dependent acceptance, and never briefly expose the obsolete build. Confirm database TLS, restricted-role access, backups, persistence and the authenticated background worker through separately authorized checks.

Verify current Render configuration without printing secrets: the dedicated LIVE key, correct live account ID, actual live webhook endpoint signing secret and stable integration identifier; provider environment production; canonical origin https://jobfray.com. The new implementation uses hosted Checkout and requires no browser publishable key. Do not reuse sandbox keys or a CLI webhook secret.

## Ingress and webhook readiness

1. Obtain authorization for the controlled ingress cutover and necessary database/provider release gates. Checkout and indexing stay disabled until their own approvals. Confirm that deployment actually contains the ingress guard and payment fixes.
2. Verify direct-origin denial, client-header stripping, actual Cloudflare-derived IP, preserved hostname, canonical HTTPS/www redirects, wildcard tenant dispatch and private/no-store behavior on the deployed application. Local tests and maintenance responses do not prove live forwarding correctness.
3. Verify the deployed webhook route is reachable through the trusted edge and rejects missing/invalid signatures without recording an event. Confirm raw-body handling preserves bytes and that no proxy parses or rewrites JSON. Do not inject fake payment records into the production database.
4. Enable the dedicated production webhook only after the application, ingress and durable event worker are ready. Read back its exact URL, live mode, pinned API version and required events. Confirm that the configured Render signing secret belongs to this live endpoint, not a sandbox listener. Enabling and deployment are separate actions from today's staged configuration.

Required endpoint: https://jobfray.com/api/stripe/webhook. Required events: checkout.session.completed, checkout.session.expired, charge.dispute.created, charge.dispute.updated, charge.dispute.closed, charge.dispute.funds_withdrawn, charge.dispute.funds_reinstated. This is an account endpoint, not a Connect endpoint. Refund reconciliation uses authoritative provider readback. Async payment methods, ACH, subscriptions, transfers and business payments remain excluded.

Before a financial window, resolve the legacy endpoint's dependencies with authoritative application/account evidence. Disable it only if it is exclusively a JobFray resource, obsolete and unused by other applications. Otherwise isolate JobFray in a genuinely separate account without modifying RF/RFL. Keep Checkout off during any key/account/endpoint transition, and repeat the affected identity/signature checks. Do not infer obsolescence from a zero balance or an old URL.

After isolation is accepted, replace the temporary `customer.created` subscription with the seven required events above and read back the endpoint URL, enabled status, API version `2026-11-18.endive`, account scope and metadata. Preserve the endpoint's proven signing secret unless a separately verified rotation or account transition requires changing it. Leave maintenance active and indexing disabled.

## Separately authorized financial canary

The owner must approve the exact amount, payment instrument, real transaction, any refund and permitted total exposure before this section is executed. Never use Stripe test card numbers or test PaymentMethods in live mode. Do not create a live Checkout Session merely to test configuration during the current no-charge assignment.

Start with one $2 USD SERVICE platform-fee canary if approved. Expand to $3 QUOTE, $4 RENTAL and $5 RESERVATION only if the additional real payments are explicitly authorized; all four total $14 before any separately authorized refunds. Charge only JobFray's disclosed platform fee. The underlying business price stays outside Stripe.

The minimum authorization must identify one controlled request/business fixture, the real payer/instrument, a maximum charge of 200 USD cents, and whether any refund is authorized. If refunds are not explicitly approved, deny refund-creation calls in the acceptance transport. Use hosted Checkout for real card entry; never request card data in chat or use a test card in live mode. Complete payment inside the application's 15-minute resource hold; the longer provider Session expiry does not extend that hold.

Prepare financial settlement before creating the Session. The active notification-only scheduler cannot settle a payment. Do not set `SCHEDULER_MODE=full`: the separately reviewed financial mode is now the bounded recurring path; full includes unrelated retention/media work. Also do not invoke the full `/api/worker` under these restrictions: it includes retention and media cleanup as well as financial work. For a controlled canary, use a separately authorized invocation of the existing `PaymentOperations.run` with an empty/unrelated-work queue check and a provider transport restricted to the approved Session, PaymentIntent and charge IDs; deny refund creation and unrelated objects unless separately authorized. A public financial release additionally needs reviewed recurring financial processing, not just the notification scheduler.

For the canary, enable Checkout only for the approved creation window, create one stable-idempotency Session and immediately return the gate to `0` if no further creations are approved. This does not cancel the owned hosted Session or prevent its signed callback. Retrieve authoritative payment status before retrying anything. Expire only the approved unpaid Session if the window is abandoned; an uncertain payment or refund must not be blindly repeated. Do not remove maintenance or enable indexing during this window.

For each approved canary:

- Use a controlled synthetic application scenario with an owner-approved real payer/instrument; do not save card data or screenshots containing sensitive payment details.
- Verify one fee-only line item, USD, the approved amount, card-only allowlist, Link disabled, no subscriptions/Connect/ACH, no tax/promotions/adaptive currency changes, intended account and the stable production integration identifier.
- Repeat the same application request/idempotency key before payment and confirm the same Checkout Session; do not initiate a second payment to test duplication. Keep the internal 15-minute hold distinct from the stable provider Session deadline.
- After the approved payment, confirm a genuine signed Stripe event reaches the deployed route, is stored idempotently, and is processed by the authenticated worker. Verify Session, PaymentIntent and charge identity, immutable request metadata, amount, currency and live mode through API readback. A browser success redirect never establishes payment.
- Verify the local request/confirmation, capacity allocation and notification outcome exactly once. Confirm duplicate delivery does not duplicate fulfillment. Use a separately authorized provider redelivery if needed; clearly distinguish it from local replay.
- Under separately authorized database/worker operations, confirm reconciliation recovers a genuine paid Session if event processing is delayed, without creating another charge or resurrecting expired capacity. Do not drop or tamper with real production events casually.
- If a refund is separately approved, issue only the authorized fee refund, verify provider identity/USD/amount/status and full charge readback, and repeat the same refund idempotency key to verify one refund. Today's configuration assignment authorizes no live refund.

Do not deliberately cause live issuer declines or fraud challenges to reproduce sandbox tests without separate approval and provider-compliant guidance. Successful/failed test-card behavior was already exercised in the dedicated sandbox.

## Acceptance and stop conditions

Stop the financial window on any account mismatch, amount/currency/metadata mismatch, non-card method, signature failure, missing durable event, duplicate allocation, unsettled refund, expired-hold fulfillment or unreviewed legacy obligation. Disable Checkout and return edge traffic to maintenance using the reviewed operational plan; preserve evidence and financial history. Do not delete historical records, blindly retry uncertain charges/refunds, or assume rollback undoes a payment.

Record only sanitized provider IDs, approved cents/currency, timestamps, event IDs, idempotency evidence and expected application outcomes. Keep secrets and customer/card details out of reports. Public indexing remains a final independent approval. Production readiness requires actual deployed acceptance; sandbox interoperability and saved configuration alone are insufficient.
