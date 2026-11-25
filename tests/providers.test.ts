import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { StripeAdapter } from "../lib/integrations/stripe";
import { ResendAdapter } from "../lib/integrations/email";
import { CloudinaryAdapter } from "../lib/integrations/cloudinary";
import { networkTransport, request, type Transport } from "../lib/integrations/http";
import { trustedPrincipal } from "../lib/core/edge";
import { pushEndpoint } from "../lib/core/push";
import { validateConfiguration } from "../lib/core/configuration";
const now = new Date("2026-11-24T12:00:00Z"), secret = "whsec_synthetic_signature", config = { key: "sk_test_synthetic", webhookSecrets: [secret], account: "acct_synthetic", live: false, origin: "https://jobfray.example.test", integrationId: "synthetic" };
const json = (value: unknown) => new Response(JSON.stringify(value), { headers: { "Content-Type": "application/json" } });
const session = () => ({ id: "cs_test_synthetic", livemode: false, mode: "payment", currency: "usd", client_reference_id: "request", metadata: { jobfray_request_id: "request" }, subscription: null, payment_method_types: ["card"], amount_total: 300, url: "https://checkout.stripe.com/c/pay/synthetic", status: "complete", payment_status: "paid", payment_intent: { id: "pi_synthetic", status: "succeeded", currency: "usd", livemode: false, amount: 300, amount_received: 300, metadata: { jobfray_request_id: "request" }, latest_charge: { id: "ch_synthetic", payment_intent: "pi_synthetic", livemode: false, paid: true, currency: "usd", amount: 300, payment_method_details: { type: "card", card: { brand: "visa" } } } } });
const event = () => ({ id: "evt_synthetic", type: "checkout.session.completed", livemode: false, data: { object: { id: "cs_test_synthetic" } } });
function signed(value: unknown, stamp = now.getTime() / 1000) { const payload = JSON.stringify(value); return { payload, signature: "t=" + stamp + ",v1=" + createHmac("sha256", secret).update(stamp + "." + payload).digest("hex") }; }
function stripe(override: Record<string, unknown> = {}) {
    const calls: {
        url: string;
        init: RequestInit;
    }[] = [];
    const transport: Transport = async (url, init) => { calls.push({ url, init }); return json(url.endsWith("/account") ? { id: config.account } : { ...session(), ...override }); };
    return { adapter: new StripeAdapter(config, transport, () => now.getTime()), calls };
}
test("network provider transport fails closed without authorization", async () => { assert.notEqual(process.env.JOBFRAY_PROVIDER_OPERATIONS_ENABLED, "1"); await assert.rejects(networkTransport("https://api.stripe.com", {}), /disabled/); });
test("Stripe creates only JF fee checkout with stable identity, cards and 30-minute provider expiry", async () => { const f = stripe(); const result = await f.adapter.create({ requestId: "request", amountCents: 300, currency: "USD", idempotencyKey: "stable" }); assert.equal(result.id, session().id); const call = f.calls[1]!, params = new URLSearchParams(String(call.init.body)); assert.equal(params.get("line_items[0][price_data][unit_amount]"), "300"); assert.equal(params.get("expires_at"), String(now.getTime() / 1000 + 1800)); assert.equal(params.get("allowed_payment_method_types[0]"), "card"); assert.equal(params.get("allowed_payment_method_types[1]"), null); assert.equal(params.get("payment_method_options[card][restrictions][brands_blocked][0]"), null); assert.equal(params.get("wallet_options[link][display]"), "never"); assert.equal((call.init.headers as Record<string, string>)["Idempotency-Key"], "stable"); assert.ok(!String(call.init.body).includes("transfer_data")); });
for (const [name, override] of Object.entries({ amount: { amount_total: 500 }, environment: { livemode: true }, currency: { currency: "eur" }, identity: { client_reference_id: "other" }, method: { payment_method_types: ["card", "us_bank_account"] }, redirect: { url: "https://evil.example/" } }))
    test("Stripe checkout rejects " + name + " tampering", async () => { await assert.rejects(stripe(override).adapter.create({ requestId: "request", amountCents: 300, currency: "USD", idempotencyKey: "stable" })); });
test("Stripe raw signed event verifies by retrieving authoritative session and charge", async () => { const f = stripe(), e = signed(event()); assert.equal((await f.adapter.verify(e.payload, e.signature)).paymentId, "pi_synthetic"); assert.equal(f.calls.length, 2); });
test("Stripe rejects stale, altered, unsigned and wrong-environment events before transport", async () => {
    const f = stripe(), e = signed(event());
    for (const bad of [signed(event(), now.getTime() / 1000 - 301), { payload: e.payload + " ", signature: e.signature }, { payload: e.payload, signature: "" }, signed({ ...event(), livemode: true })])
        await assert.rejects(f.adapter.verify(bad.payload, bad.signature));
    assert.equal(f.calls.length, 0);
});
test("Stripe checks retrieved session identity and synthetic non-card Link brand", async () => { await assert.rejects(stripe({ id: "cs_other" }).adapter.paid(session().id), /identity/); const value = session(); value.payment_intent.latest_charge.payment_method_details.card.brand = "link"; await assert.rejects(stripe({ payment_intent: value.payment_intent }).adapter.paid(value.id), /verified/); });
test("Stripe refund transport uses original payment identity and stable operation key", async () => { const calls: RequestInit[] = []; const adapter = new StripeAdapter(config, async (url, init) => { calls.push(init); return json(url.endsWith("/account") ? { id: config.account } : { id: "re_synthetic", payment_intent: "pi_synthetic", currency: "usd", amount: 300, status: "pending" }); }); assert.equal((await adapter.refund("pi_synthetic", "stable-refund")).state, "pending"); assert.equal((calls[1]!.headers as Record<string, string>)["Idempotency-Key"], "stable-refund"); });
test("Provider failures and oversized streamed responses are sanitized", async () => { await assert.rejects(request(async () => { throw new Error("private secret"); }, "https://synthetic.test", {}), error => error instanceof Error && error.message === "Provider transport failed"); await assert.rejects(request(async () => new Response("x".repeat(2000001)), "https://synthetic.test", {}), /too large/); await assert.rejects(request(async () => new Response("private", { status: 429 }), "https://synthetic.test", {}), /temporarily/); });
test("Resend uses escaped templates, fixed sender and durable outbox idempotency", async () => { let captured: RequestInit = {}; const adapter = new ResendAdapter("synthetic", "JF <verify@example.test>", config.origin, async (_url, init) => { captured = init; return json({ id: "email_synthetic" }); }); await adapter.send({ id: "one", businessId: null, destination: "owner@example.test", channel: "EMAIL", kind: "VERIFY_EMAIL", body: "synthetic-token", key: "unique", state: "PENDING", attempts: 0, availableAt: now.toISOString(), leaseUntil: null }); const body = JSON.parse(String(captured.body)); assert.ok(body.html.includes("synthetic-token")); assert.equal((captured.headers as Record<string, string>)["Idempotency-Key"], "unique"); });
test("Cloudinary uses authenticated assets and short-lived signed retrieval", async () => { let upload: FormData | undefined; const adapter = new CloudinaryAdapter("synthetic", "key", "secret", async (_url, init) => { upload = init.body as FormData; return json({ public_id: "jobfray/business/media", type: "authenticated", format: "webp", version: 1 }); }, () => now.getTime()); const asset = await adapter.put("business", "media", Buffer.from("synthetic")); assert.equal(upload!.get("type"), "authenticated"); assert.equal(upload!.get("overwrite"), "false"); const url = new URL(adapter.url(asset)); assert.equal(url.searchParams.get("expires_at"), String(now.getTime() / 1000 + 60)); assert.ok(url.searchParams.get("signature")); assert.throws(() => adapter.url({ ...asset, publicId: "../other" })); });
test("Trusted edge rejects spoofed IP headers and push rejects SSRF endpoints", () => {
    assert.throws(() => trustedPrincipal(new Request("https://jobfray.test", { headers: { "x-jf-client-ip": "127.0.0.1" } }), "x".repeat(32)), /Trusted/);
    assert.ok(trustedPrincipal(new Request("https://jobfray.test", { headers: { "x-jf-edge-secret": "x".repeat(32), "x-jf-client-ip": "192.0.2.1" } }), "x".repeat(32)));
    for (const url of ["http://127.0.0.1/", "https://evil.test/", "https://fcm.googleapis.com.evil.test/"])
        assert.throws(() => pushEndpoint(url));
});
test("Production provider and checkout gates fail closed", () => { assert.throws(() => validateConfiguration({ JOBFRAY_PROVIDER_OPERATIONS_ENABLED: "1" }), /verification/); assert.throws(() => validateConfiguration({ JOBFRAY_CHECKOUT_ENABLED: "1" }), /verified/); assert.throws(() => validateConfiguration({ JOBFRAY_PRODUCTION_PROVIDERS: "1" }), /persistence/); });
