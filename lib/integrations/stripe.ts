import { createHmac, timingSafeEqual, createHash } from "node:crypto";
import type { PaymentAdapter, PaymentIntent, VerifiedPayment } from "../core/providers";
import { AppError } from "../core/validation";
import { DISCLOSURE } from "../core/model";
import { request, object, text, form, networkTransport, type Transport } from "./http";
export interface StripeConfig {
    key: string;
    webhookSecrets: readonly string[];
    account: string;
    live: boolean;
    origin: string;
    integrationId: string;
}
export class StripeAdapter implements PaymentAdapter {
    constructor(private config: StripeConfig, private transport: Transport = networkTransport, private clock: () => number = Date.now) {
        if (!/^acct_[a-zA-Z0-9]+$/.test(config.account) || !config.webhookSecrets.length || new URL(config.origin).protocol !== "https:")
            throw new Error("Invalid Stripe configuration");
    }
    private async api(path: string, method = "GET", data?: Record<string, string>, key?: string) { return object(await request(this.transport, "https://api.stripe.com/v1/" + path, { method, headers: { Authorization: "Bearer " + this.config.key, "Stripe-Version": "2026-11-18.endive", ...(method === "POST" ? { "Content-Type": "application/x-www-form-urlencoded" } : {}), ...(key ? { "Idempotency-Key": key } : {}) }, ...(data ? { body: form(data) } : {}) })); }
    private async account() { const account = await this.api("account"); if (account.id !== this.config.account)
        throw new AppError("Stripe account mismatch", 502); }
    async create(input: Omit<PaymentIntent, "id">): Promise<PaymentIntent> {
        if (!Number.isSafeInteger(input.amountCents) || ![200, 300, 400, 500].includes(input.amountCents))
            throw new AppError("Invalid platform fee");
        await this.account();
        const session = await this.api("checkout/sessions", "POST", {
            mode: "payment", "allowed_payment_method_types[0]": "card", "wallet_options[link][display]": "auto", "payment_method_options[card][restrictions][brands_blocked][0]": "link",
            "line_items[0][price_data][currency]": "usd", "line_items[0][price_data][unit_amount]": String(input.amountCents), "line_items[0][price_data][product_data][name]": "JobFray platform facilitation fee", "line_items[0][quantity]": "1",
            "metadata[jobfray_request_id]": input.requestId, "payment_intent_data[metadata][jobfray_request_id]": input.requestId, "client_reference_id": input.requestId,
            "custom_text[submit][message]": DISCLOSURE.slice(0, 1200), success_url: this.config.origin + "/confirmation", cancel_url: this.config.origin + "/confirmation", expires_at: String(Math.floor(this.clock() / 1000) + 1800),
            "automatic_tax[enabled]": "false", allow_promotion_codes: "false", integration_identifier: this.config.integrationId,
        }, input.idempotencyKey);
        this.assertSession(session, input.requestId, input.amountCents);
        const url = new URL(text(session.url));
        if (url.protocol !== "https:" || url.hostname !== "checkout.stripe.com")
            throw new AppError("Invalid checkout destination", 502);
        return { ...input, id: text(session.id), checkoutUrl: url.href };
    }
    private assertSession(s: Record<string, unknown>, id: string, amount?: number) {
        const methods = s.payment_method_types;
        if (s.livemode !== this.config.live || s.mode !== "payment" || s.currency !== "usd" || s.client_reference_id !== id || object(s.metadata).jobfray_request_id !== id || s.subscription || !Array.isArray(methods) || methods.some(m => m !== "card") || !methods.includes("card") || typeof s.amount_total !== "number" || !Number.isSafeInteger(s.amount_total) || (amount !== undefined && s.amount_total !== amount))
            throw new AppError("Checkout identity or environment mismatch", 403);
    }
    envelope(payload: string, signature: string): Record<string, unknown> {
        if (Buffer.byteLength(payload) > 1000000)
            throw new AppError("Webhook too large", 413);
        const parts = signature.split(","), stamp = parts.find(p => p.startsWith("t="))?.slice(2), macs = parts.filter(p => p.startsWith("v1=")).map(p => p.slice(3));
        if (!stamp || !/^\d+$/.test(stamp) || Math.abs(this.clock() / 1000 - Number(stamp)) > 300)
            throw new AppError("Unverified payment event", 403);
        const valid = this.config.webhookSecrets.some(secret => { const expected = createHmac("sha256", secret).update(stamp + "." + payload).digest(); return macs.some(mac => /^[a-f0-9]{64}$/.test(mac) && timingSafeEqual(expected, Buffer.from(mac, "hex"))); });
        if (!valid)
            throw new AppError("Unverified payment event", 403);
        const e = object(JSON.parse(payload));
        if (e.livemode !== this.config.live || (e.account !== undefined && e.account !== this.config.account) || typeof e.id !== "string" || !e.id.startsWith("evt_"))
            throw new AppError("Payment event environment mismatch", 403);
        return e;
    }
    async verify(payload: string, signature: string): Promise<VerifiedPayment> {
        const event = this.envelope(payload, signature);
        if (event.type !== "checkout.session.completed")
            throw new AppError("Event does not confirm payment");
        const supplied = object(object(event.data).object);
        return this.paid(text(supplied.id), text(event.id));
    }
    async paid(id: string, eventId = "reconcile_" + id): Promise<VerifiedPayment> {
        await this.account();
        const session = await this.api("checkout/sessions/" + encodeURIComponent(id) + "?expand[]=payment_intent.latest_charge");
        if (session.id !== id)
            throw new AppError("Checkout identity mismatch", 403);
        const requestId = text(object(session.metadata).jobfray_request_id);
        this.assertSession(session, requestId);
        const pi = object(session.payment_intent), charge = object(pi.latest_charge), details = object(charge.payment_method_details);
        if (session.payment_status !== "paid" || pi.status !== "succeeded" || pi.currency !== "usd" || pi.livemode !== this.config.live || pi.amount_received !== session.amount_total || object(pi.metadata).jobfray_request_id !== requestId || charge.payment_intent !== pi.id || charge.livemode !== this.config.live || charge.paid !== true || charge.currency !== "usd" || charge.amount !== session.amount_total || !["card"].includes(String(details.type)) || object(details.card).brand === "link")
            throw new AppError("Payment is not verified", 409);
        return { eventId, intentId: id, paymentId: text(pi.id), requestId, amountCents: session.amount_total as number, currency: "USD" };
    }
    async status(id: string) { const s = await this.api("checkout/sessions/" + encodeURIComponent(id)); if (s.id !== id || s.livemode !== this.config.live)
        throw new AppError("Checkout environment mismatch", 403); return { status: text(s.status), paid: s.payment_status === "paid" }; }
    async expire(id: string) { await this.api("checkout/sessions/" + encodeURIComponent(id) + "/expire", "POST", {}, "jf-expire:" + id); }
    async refund(paymentId: string, key: string) { await this.account(); const result = await this.api("refunds", "POST", { payment_intent: paymentId, reason: "requested_by_customer" }, key); if (result.payment_intent !== paymentId || result.currency !== "usd" || !["pending", "succeeded", "failed", "canceled"].includes(String(result.status)))
        throw new AppError("Refund identity mismatch", 502); if(!Number.isSafeInteger(result.amount)||Number(result.amount)<0)throw new AppError("Invalid refund amount",502);return { id: text(result.id), state: text(result.status),amountCents:Number(result.amount) }; }
    async refundStatus(id: string) { await this.account(); const result = await this.api("refunds/" + encodeURIComponent(id)); if (result.id !== id || result.currency !== "usd" || !["pending", "succeeded", "failed", "canceled"].includes(String(result.status)))
        throw new AppError("Refund identity mismatch", 502); if(!Number.isSafeInteger(result.amount)||Number(result.amount)<0)throw new AppError("Invalid refund amount",502);return { id: text(result.id), paymentId: text(result.payment_intent), state: text(result.status),amountCents:Number(result.amount) }; }
    digest(payload: string) { return createHash("sha256").update(payload).digest("hex"); }
}
