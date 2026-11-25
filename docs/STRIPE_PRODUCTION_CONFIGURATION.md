# JobFray production Stripe configuration

Production configuration is saved and staged. This is not a production launch or a live payment acceptance result. The actual API readback, account readiness and legacy audit are recorded in [artifacts/jobfray-stripe-production](../artifacts/jobfray-stripe-production). Secrets are held by Render and Stripe; none are written in this document or the sanitized reports.

## Verified account and card configuration

The owner-provided live account ID `acct_1TYAidBM9Cu8R81S` exactly matched Stripe's authenticated account. Its business name is JobFray, country US and default currency USD. A live balance response confirmed live mode. Stripe reported charges enabled, payouts enabled, details submitted and `card_payments=active`. The default live payment-method configuration makes cards available and enabled.

The response did not expose populated account requirement/future-requirement fields. Operational readiness above is verified from the returned flags; it is not a separate Dashboard review of every future account requirement. The pending Cartes Bancaires capability is distinct from the active general card capability.

The account's global payment-method configuration also enables other methods and Link. These settings were deliberately preserved because this account retains a legacy integration. New JobFray Checkout requests use the sandbox-verified adapter's `allowed_payment_method_types[0]=card` and `wallet_options[link][display]=never`, with USD and the four supported facilitation fees, no adaptive currency pricing, promotions, automatic tax, subscriptions, Connect or business-payment charges. No live Checkout Session was created to prove this configuration; actual financial acceptance remains a later authorized procedure. The unchanged adapter's 31 affected regression tests passed locally.

## Read-only legacy audit

The paginated live audit completed without read errors. Available and pending USD balances are both zero. No subscriptions, open/draft/uncollectible invoices, disputes, refunds, PaymentIntents, open Checkout Sessions, pending/in-transit payouts or charges were returned. No API-visible financial obligation was found in those categories. No historical record, payment method configuration, account capability or account-wide API default was modified.

One enabled legacy webhook remains:

- ID `we_1ThIDEBM9Cu8R81StNNAQ8LS`
- URL `https://www.rentfray.com/api/stripe/webhook`
- API version `2026-04-22.dahlia`

That endpoint was not called, disabled, edited or deleted. Readback confirms its configuration is unchanged. Its account-wide event subscriptions overlap events produced by future JobFray payments. Before a live JobFray canary or public financial release, the owner must resolve integration isolation or authorize a legacy endpoint disposition separately. Current restrictions prohibit making that RF-related change. Zero financial history does not remove this integration conflict.

## Saved production configuration

One bulk Render environment update on `srv-d851un6q1p3s73ebcqm0` saved:

| Variable | Saved value / validation |
| --- | --- |
| STRIPE_SECRET_KEY | Owner-provided live credential; exact readback matched in memory, value not disclosed |
| STRIPE_ACCOUNT_ID | acct_1TYAidBM9Cu8R81S |
| STRIPE_WEBHOOK_SECRETS | Signing secret returned when the dedicated live endpoint was created; exact readback matched in memory |
| STRIPE_INTEGRATION_IDENTIFIER | jobfray_checkout_live_fpyxyena |

Provider environment remains production, canonical origin remains https://jobfray.com, and base hostname remains jobfray.com. The actual provider configuration validator passed using saved intended values. A local HMAC/envelope check using the configured endpoint secret passed without sending an event or accessing the database. This is a local secret/configuration check, not live webhook-delivery evidence.

All unrelated environment variables were preserved. Legacy `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` was preserved; the rebuilt hosted Checkout implementation does not reference or require it. No sandbox key or CLI signing secret was copied to production.

## Dedicated webhook

- Endpoint ID: `we_1UfVZCBM9Cu8R81S03QwFJHc`
- URL: `https://jobfray.com/api/stripe/webhook`
- Live mode: true
- Event API version: `2026-11-18.endive`
- Status: **disabled**, staged until deployment and ingress acceptance
- Scope: this account only, explicitly not Connect

Required events were saved and verified exactly:

- checkout.session.completed
- checkout.session.expired
- charge.dispute.created
- charge.dispute.updated
- charge.dispute.closed
- charge.dispute.funds_withdrawn
- charge.dispute.funds_reinstated

Stripe creates the endpoint enabled by default; it was immediately disabled, with readback confirming disabled status. The endpoint is not usable while Cloudflare maintenance returns 503. Its signing secret is stored on Render and was never saved locally. Existing endpoints were left untouched.

## Release state and remaining blockers

Cloudflare maintenance was verified before and after configuration at the apex and webhook URL. All nine release gates remain disabled. The Render service remains suspended, autodeploy remains off, and deployment IDs are unchanged. No application deployment, database mutation, charge, refund, payout, RF/RFL change or historical-record mutation was performed.

Independent credential and webhook configuration is complete. Production activation remains blocked on the legacy webhook isolation decision, the reviewed rebuild deployment and safe replacement of the suspended obsolete build, deployed ingress/database/webhook acceptance, and later authorization for webhook enablement and any financial canary. Do not enable the new webhook or Checkout solely because configuration readback passed.

Use [STRIPE_PRODUCTION_ACCEPTANCE.md](STRIPE_PRODUCTION_ACCEPTANCE.md) for the prepared production acceptance procedure. No live transaction or refund is authorized by that document. API configuration and sandbox interoperability are distinct from real deployed live-payment acceptance.

Official configuration references: [Stripe endpoint creation](https://docs.stripe.com/api/webhook_endpoints/create), [endpoint disabling](https://docs.stripe.com/api/webhook_endpoints/update), [live payment-method configuration inspection](https://docs.stripe.com/api/payment_method_configurations/list), and [Render environment replacement without deployment](https://api-docs.render.com/reference/update-env-vars-for-service).
