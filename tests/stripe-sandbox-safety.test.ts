import test from "node:test";
import assert from "node:assert/strict";
import { StripeAdapter, STRIPE_API_VERSION } from "../lib/integrations/stripe";
import { fixture, input, now } from "./provider-fixtures";
import { BookingService } from "../lib/core/booking";
import type { PaymentIntent } from "../lib/core/providers";
const config = { key: "sk_test_synthetic", account: "acct_synthetic", live: false, webhookSecrets: ["whsec_synthetic"], origin: "https://jobfray.example.test", integrationId: "jobfray_checkout_abcdefgh" };
const json = (v: unknown) => new Response(JSON.stringify(v));
const paidSession = () => ({ id: "cs_test_synthetic", livemode: false, mode: "payment", currency: "usd", client_reference_id: "request", metadata: { jobfray_request_id: "request" }, subscription: null, payment_method_types: ["card"], amount_total: 300, payment_status: "paid", payment_intent: { id: "pi_synthetic", amount: 300, amount_received: 300, status: "succeeded", currency: "usd", livemode: false, metadata: { jobfray_request_id: "request" }, latest_charge: { id: "ch_synthetic", payment_intent: "pi_synthetic", livemode: false, paid: true, currency: "usd", amount: 300, payment_method_details: { type: "card", card: { brand: "visa" } } } } });
test("Stripe rejects environment-key mismatches and non-USD/unsupported fees before HTTP", async () => {
    for (const key of ["sk_live_synthetic", "rk_live_synthetic", "not-a-key"]) assert.throws(() => new StripeAdapter({ ...config, key }));
    assert.throws(() => new StripeAdapter({ ...config, live: true }));
    let calls = 0; const adapter = new StripeAdapter(config, async () => { calls++; return json({}); });
    for (const amount of [0, -200, 199, 250, 600, 50000]) await assert.rejects(adapter.create({ requestId: "request", amountCents: amount, currency: "USD", idempotencyKey: "key" }));
    await assert.rejects(adapter.create({ requestId: "request", amountCents: 300, currency: "EUR" as "USD", idempotencyKey: "key" }));
    assert.equal(calls, 0);
});
test("paid verification rejects non-fee totals, PaymentIntent amount mismatch and Connect fields", async () => {
    for (const tamper of [
        (s: ReturnType<typeof paidSession>) => { s.amount_total = 50000; },
        (s: ReturnType<typeof paidSession>) => { s.payment_intent.amount = 400; },
        (s: ReturnType<typeof paidSession>) => { Object.assign(s.payment_intent, { transfer_data: { destination: "acct_other" } }); },
        (s: ReturnType<typeof paidSession>) => { Object.assign(s.payment_intent, { on_behalf_of: "acct_other" }); },
        (s: ReturnType<typeof paidSession>) => { Object.assign(s.payment_intent, { application_fee_amount: 1 }); },
    ]) {
        const session = paidSession(); tamper(session);
        const adapter = new StripeAdapter(config, async url => json(url.endsWith("/account") ? { id: config.account } : session));
        await assert.rejects(adapter.paid("cs_test_synthetic"));
    }
});
test("status and expiry check the intended account before touching a session", async () => {
    let calls = 0;
    const adapter = new StripeAdapter(config, async () => { calls++; return json({ id: "acct_wrong" }); });
    await assert.rejects(adapter.status("cs_test_synthetic"), /account mismatch/);
    await assert.rejects(adapter.expire("cs_test_synthetic"), /account mismatch/);
    assert.equal(calls, 2);
});
test("explicit provider expiry keeps idempotent creation parameters stable as the clock advances", async () => {
    let time = now.getTime(); const bodies: string[] = [];
    const adapter = new StripeAdapter(config, async (url, init) => {
        assert.equal((init.headers as Record<string, string>)["Stripe-Version"], STRIPE_API_VERSION);
        if (url.endsWith("/account")) return json({ id: config.account });
        bodies.push(String(init.body)); return json({ ...paidSession(), url: "https://checkout.stripe.com/c/pay/synthetic" });
    }, () => time);
    const value = { requestId: "request", amountCents: 300, currency: "USD" as const, idempotencyKey: "stable", providerExpiresAt: Math.floor(time / 1000) + 3600 };
    await adapter.create(value); time += 30000; await adapter.create(value);
    assert.equal(bodies[0], bodies[1]);
});
test("BookingService supplies the same request-bound provider deadline on intent retries", async () => {
    const f = await fixture(); const captured: Omit<PaymentIntent, "id">[] = [];
    const service = new BookingService(f.repo, f.geo, { create: async value => { captured.push(value); return { ...value, id: "test-intent" }; }, verify: () => { throw new Error("unused"); } }, "synthetic-confirmation-signing-key-123456789", "v1", {}, true);
    const c = await service.checkout(input(f), f.capability, "expiry", now, "synthetic-browser-capability-binding");
    await service.intent(c.requestId, c.confirmationToken, now);
    await service.intent(c.requestId, c.confirmationToken, new Date(now.getTime() + 30000));
    assert.equal(captured.length, 2);
    assert.equal(captured[0]!.providerExpiresAt, captured[1]!.providerExpiresAt);
    assert.equal(captured[0]!.providerExpiresAt, Math.floor(now.getTime() / 1000) + 3600);
});
