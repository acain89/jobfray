# JobFray production payment acceptance procedure

This procedure prepares a later, explicitly authorized production acceptance window. It does not authorize a charge, refund, deployment, database mutation, gate change, service resumption or maintenance cutover. Current results are in [STRIPE_PRODUCTION_CONFIGURATION.md](STRIPE_PRODUCTION_CONFIGURATION.md).

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

## Separately authorized financial canary

The owner must approve the exact amount, payment instrument, real transaction, any refund and permitted total exposure before this section is executed. Never use Stripe test card numbers or test PaymentMethods in live mode. Do not create a live Checkout Session merely to test configuration during the current no-charge assignment.

Start with one $2 USD SERVICE platform-fee canary if approved. Expand to $3 QUOTE, $4 RENTAL and $5 RESERVATION only if the additional real payments are explicitly authorized; all four total $14 before any separately authorized refunds. Charge only JobFray's disclosed platform fee. The underlying business price stays outside Stripe.

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
