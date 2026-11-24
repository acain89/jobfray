import { createRequestCapability } from "../lib/core/request-capability";
import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import sharp from "sharp";
import { fixture, input, now } from "./provider-fixtures";
import { StripeAdapter } from "../lib/integrations/stripe";
import { BookingService } from "../lib/core/booking";
import { PaymentOperations } from "../lib/core/payment-operations";
import { uploadImage, readImage } from "../lib/core/media";
import { cleanStoredMedia } from "../lib/core/media-operations";
import type { BusinessMode } from "../lib/core/model";
import type { MediaStorage } from "../lib/integrations/cloudinary";
const key = "synthetic-production-key-never-used-with-provider", webhook = "whsec_synthetic";
async function setup(mode: BusinessMode) {
    const f = await fixture(), idempotencyKey = "production-" + mode, capability = (await createRequestCapability(f.repo, f.business.id, "synthetic-browser-capability-binding", now)).capability;
    let paid = false, delay = 0, requestId = "", amount = 0, refundCalls = 0;
    let refundAmountOverride: number | undefined;
    const sid = "cs_test_" + f.business.id;
    const adapter = new StripeAdapter({ key: "sk_test_synthetic", webhookSecrets: [webhook], account: "acct_synthetic", live: false, origin: "https://jobfray.example.test", integrationId: "synthetic" }, async (url, init) => {
        if (delay)
            await new Promise(r => setTimeout(r, delay));
        let value: unknown;
        if (url.endsWith("/account"))
            value = { id: "acct_synthetic" };
        else if (url.endsWith("/refunds")) {
            refundCalls++;
            value = { id: "re_synthetic", payment_intent: "pi_synthetic", currency: "usd", amount: refundAmountOverride ?? amount, status: "succeeded" };
        }
        else {
            if (url.endsWith("/checkout/sessions")) {
                const params = new URLSearchParams(String(init.body));
                requestId = params.get("client_reference_id")!;
                amount = Number(params.get("line_items[0][price_data][unit_amount]"));
            }
            value = { id: sid, mode: "payment", livemode: false, currency: "usd", client_reference_id: requestId, metadata: { jobfray_request_id: requestId }, payment_method_types: ["card"], amount_total: amount, url: "https://checkout.stripe.com/c/pay/synthetic", status: paid ? "complete" : "open", payment_status: paid ? "paid" : "unpaid", payment_intent: { id: "pi_synthetic", status: "succeeded", currency: "usd", livemode: false, amount_received: amount, metadata: { jobfray_request_id: requestId }, latest_charge: { id: "ch_synthetic", payment_intent: "pi_synthetic", livemode: false, paid: true, currency: "usd", amount, payment_method_details: { type: "card", card: { brand: "visa" } } } } };
        }
        return new Response(JSON.stringify(value));
    }, () => now.getTime());
    const booking = new BookingService(f.repo, f.geo, adapter, key, "v1", {}, true), operations = new PaymentOperations(f.repo, adapter, booking);
    const selection = input(f, mode);
    const storage: MediaStorage = { put: async (b, id) => ({ provider: "CLOUDINARY", publicId: "jobfray/" + b + "/" + id, version: 1 }), url: () => "", read: async () => Buffer.from("synthetic"), remove: async () => { } };
    if (mode === "QUOTE") {
        const image = await uploadImage(f.repo, { businessId: f.business.id, kind: "QUOTE", bytes: await sharp({ create: { width: 10, height: 10, channels: 3, background: "white" } }).png().toBuffer(), contentType: "image/png", capability, browser: "synthetic-browser-capability-binding" }, now, storage);
        selection.photos = [image.id];
    }
    const checkout = await booking.checkout(selection, capability, idempotencyKey, now, "synthetic-browser-capability-binding");
    return { ...f, selection, capability, booking, operations, adapter, checkout, storage, idempotencyKey, sid, paid: () => { paid = true; }, delay: (ms: number) => { delay = ms; }, refundAmount: (cents: number) => { refundAmountOverride = cents; }, refundCalls: () => refundCalls };
}
for (const mode of ["SERVICE", "RENTAL", "QUOTE", "RESERVATION"] as const)
    test("Production-adapter mock workflow: " + mode, async () => {
        const f = await setup(mode), again = await f.booking.checkout(f.selection, f.capability, f.idempotencyKey, now, "synthetic-browser-capability-binding");
        assert.equal(again.requestId, f.checkout.requestId);
        await assert.rejects(f.booking.checkout(f.selection, f.capability, "different", now, "another-browser"), /capability/);
        await f.booking.intent(f.checkout.requestId, f.checkout.confirmationToken, now);
        f.paid();
        const event = { id: "evt_synthetic", type: "checkout.session.completed", livemode: false, data: { object: { id: f.sid } } }, payload = JSON.stringify(event), stamp = now.getTime() / 1000, signature = "t=" + stamp + ",v1=" + createHmac("sha256", webhook).update(stamp + "." + payload).digest("hex");
        await Promise.all(Array.from({ length: 5 }, () => f.operations.receive(payload, signature, now)));
        await Promise.all([f.operations.run(now), f.operations.run(now)]);
        const receipt = await f.booking.confirmation(f.checkout.confirmationToken);
        assert.ok(receipt.request);
        assert.equal(receipt.snapshot.platformFeeCents, f.checkout.snapshot.platformFeeCents);
        assert.equal((await f.repo.transaction([], tx => tx.find("operations", { kind: "PAYMENT_EVENT" }))).length, 1);
        const allocations = await f.repo.transaction([], tx => tx.find("allocations", { requestId: f.checkout.requestId, status: "CONFIRMED" }));
        assert.equal(allocations.length, mode === "QUOTE" ? 0 : 1);
        if (mode === "QUOTE") {
            const media = await readImage(f.repo, f.selection.photos[0]!, undefined, f.checkout.confirmationToken, now);
            assert.equal(media.bytes, "");
            assert.ok(media.storage);
        }
    });
test("Payment settling during expiry produces one real-adapter mock refund, no booking", async () => {
    const f = await setup("SERVICE");
    await f.booking.intent(f.checkout.requestId, f.checkout.confirmationToken, now);
    f.paid();
    f.delay(10);
    await f.operations.run(new Date(now.getTime() + 15 * 60000 - 1));
    const rows = await f.repo.transaction([], tx => tx.find("refunds", { requestId: f.checkout.requestId }));
    assert.equal(rows.length, 1);
    assert.equal(rows[0]!.state, "REFUNDED");
    assert.equal(f.refundCalls(), 1);
    assert.equal((await f.booking.confirmation(f.checkout.confirmationToken)).status, "REFUND_REQUIRED");
    await f.operations.run(new Date(now.getTime() + 16 * 60000));
    assert.equal(f.refundCalls(), 1);
});
test("Checkout binding interruption recovers from canonical provider identity", async () => {
    const f = await setup("SERVICE"), requestId = f.checkout.requestId;
    await f.repo.transaction([], tx => tx.put("operations", { id: "checkout-create:" + requestId, businessId: f.business.id, kind: "CHECKOUT_CREATE", state: "RUNNING", attempts: 1, availableAt: now.toISOString(), leaseUntil: null, payload: { requestId, amountCents: f.checkout.snapshot.platformFeeCents, startedAt: now.toISOString() } }));
    await f.adapter.create({ requestId, amountCents: f.checkout.snapshot.platformFeeCents, currency: "USD", idempotencyKey: "jf-fee:" + requestId });
    f.paid();
    await f.operations.track(f.sid, f.business.id, new Date(now.getTime() + 900000).toISOString(), now);
    await f.operations.run(now);
    assert.ok((await f.booking.confirmation(f.checkout.confirmationToken)).request);
});
test("Timed-out durable media upload leaves recoverable orphan cleanup", async () => {
    const f = await fixture(), storage: MediaStorage = { put: async () => { throw new Error("synthetic timeout"); }, url: () => "", read: async () => Buffer.alloc(0), remove: async () => { } }, bytes = await sharp({ create: { width: 10, height: 10, channels: 3, background: "white" } }).png().toBuffer();
    await assert.rejects(uploadImage(f.repo, { businessId: f.business.id, kind: "BUSINESS", session: f.owner.token, bytes, contentType: "image/png", browser: "synthetic-browser-capability-binding" }, now, storage));
    assert.equal((await f.repo.transaction([], tx => tx.find("operations", { kind: "MEDIA_DELETE", state: "PENDING" }))).length, 1);
    await cleanStoredMedia(f.repo, storage, new Date(now.getTime() + 3600001));
    assert.equal((await f.repo.transaction([], tx => tx.find("media", { businessId: f.business.id }))).length, 0);
});
test("Refund amount mismatch remains failed and auditable rather than falsely refunded", async () => {
    const f = await setup("SERVICE");
    await f.booking.intent(f.checkout.requestId, f.checkout.confirmationToken, now);
    f.paid();
    f.refundAmount(1);
    await f.operations.run(new Date(now.getTime() + 900001));
    const row = (await f.repo.transaction([], tx => tx.find("refunds", { requestId: f.checkout.requestId })))[0]!;
    assert.equal(row.state, "FAILED");
    assert.equal(row.amountCents, 1);
    assert.equal(row.providerStatus, "succeeded");
});
test("Signed dispute creates a deduplicated operator alert without changing booking finances", async () => {
    const f = await setup("SERVICE"), payload = JSON.stringify({ id: "evt_dispute", type: "charge.dispute.created", livemode: false, data: { object: { id: "dp_synthetic" } } }), stamp = now.getTime() / 1000, signature = "t=" + stamp + ",v1=" + createHmac("sha256", webhook).update(stamp + "." + payload).digest("hex");
    await f.operations.receive(payload, signature, now);
    await f.operations.receive(payload, signature, now);
    const alerts = await f.repo.transaction([], tx => tx.find("operations", { kind: "PAYMENT_ALERT", state: "FAILED" }));
    assert.equal(alerts.length, 1);
    assert.equal((await f.booking.confirmation(f.checkout.confirmationToken)).status, "PENDING_PAYMENT");
});
