import { randomUUID } from "node:crypto";
import type { Repository } from "./repository";
import type { BookingService } from "./booking";
import type { Operation } from "./model";
import { audit, hash } from "./security";
import { AppError } from "./validation";
import { StripeAdapter } from "../integrations/stripe";
import { object, text } from "../integrations/http";
/** Durable metadata only: never persist webhook bodies or card/customer details. */
export class PaymentOperations {
    constructor(private repo: Repository, private stripe: StripeAdapter, private booking: BookingService) { }
    async receive(payload: string, signature: string, now: Date) {
        const event = this.stripe.envelope(payload, signature), id = "stripe-event:" + text(event.id), type = text(event.type), data = object(object(event.data).object);
        const digest = this.stripe.digest(payload);
        await this.repo.transaction([id], async (tx) => {
            const old = await tx.get("operations", id);
            if (old) {
                if (old.payload.digest !== digest)
                    throw new AppError("Event identity conflict", 409);
                return;
            }
            const supported = type === "checkout.session.completed";
            await tx.put("operations", { id, businessId: null, kind: supported ? "PAYMENT_EVENT" : "PAYMENT_ALERT", state: supported ? "PENDING" : type.startsWith("charge.dispute.")?"FAILED":"DONE", availableAt: now.toISOString(), attempts: 0, leaseUntil: null, payload: { eventId: text(event.id), type, objectId: text(data.id), digest } });
            if (type.startsWith("charge.dispute."))
                await audit(tx, null, "PAYMENT_DISPUTE:" + text(event.id), "STRIPE", now);
        });
        return { accepted: true };
    }
    async track(sessionId: string, businessId: string, expiresAt: string, now: Date) {
        const id = "checkout:" + sessionId;
        await this.repo.transaction([id], async (tx) => { if (!await tx.get("operations", id))
            await tx.put("operations", { id, businessId, kind: "CHECKOUT_RECONCILE", state: "PENDING", availableAt: now.toISOString(), attempts: 0, leaseUntil: null, payload: { sessionId, expiresAt } }); });
    }
    async run(now: Date) {
        const began = performance.now(), currentNow = () => new Date(now.getTime() + performance.now() - began);
        const batch = await this.repo.transaction(["provider-worker-claim"], async (tx) => {
            const pending = await tx.find("operations", { state: "PENDING" }, { limit: 50, oneOf: { field: "kind", values: ["PAYMENT_EVENT", "CHECKOUT_RECONCILE"] }, ranges: [{ field: "availableAt", operator: "lte", value: now.toISOString() }] }), interrupted = await tx.find("operations", { state: "RUNNING" }, { limit: 50, oneOf: { field: "kind", values: ["PAYMENT_EVENT", "CHECKOUT_RECONCILE"] }, ranges: [{ field: "leaseUntil", operator: "lte", value: now.toISOString() }] });
            const rows = [...pending, ...interrupted].filter(x => ["PAYMENT_EVENT", "CHECKOUT_RECONCILE"].includes(x.kind)).slice(0, 50);
            const claimed: Operation[] = [];
            for (const row of rows) {
                const value = { ...row, state: "RUNNING" as const, leaseUntil: new Date(now.getTime() + 60000).toISOString(), leaseToken: randomUUID(), attempts: row.attempts + 1 };
                await tx.put("operations", value);
                claimed.push(value);
            }
            return claimed;
        });
        for (const row of batch) {
            const owned=await this.repo.transaction([row.id],async tx=>{const current=await tx.get("operations",row.id);if(!current||current.leaseToken!==row.leaseToken||current.state!=="RUNNING")return false;await tx.put("operations",{...current,leaseUntil:new Date(currentNow().getTime()+60000).toISOString()});return true;});
            if(!owned)continue;
            let complete = false;
            try {
                const sessionId = text(row.payload.sessionId ?? row.payload.objectId), status = await this.stripe.status(sessionId);
                if (status.paid) {
                    const payment = await this.stripe.paid(sessionId, typeof row.payload.eventId === "string" ? row.payload.eventId : "reconcile_" + sessionId);
                    // Recover interruption after provider creation but before local identity binding.
                    const tenant = await this.repo.transaction([], async (tx) => (await tx.get("requests", payment.requestId))?.businessId);
                    if (tenant)
                        await this.repo.transaction(["tenant:" + tenant], async (tx) => { const request = await tx.get("requests", payment.requestId), prepared = await tx.get("operations", "checkout-create:" + payment.requestId); if (request && !request.paymentIntentId && prepared?.payload.amountCents === payment.amountCents) {
                            await tx.put("requests", { ...request, paymentIntentId: sessionId });
                            await tx.put("operations", { ...prepared, state: "DONE", payload: { ...prepared.payload, sessionId } });
                            await audit(tx, tenant, "CHECKOUT_BINDING_RECOVERED", "WORKER", currentNow(), request.id);
                        } });
                    await this.booking.acceptVerifiedPayment(payment, currentNow());
                    complete = true;
                }
                else if (row.kind === "PAYMENT_EVENT")
                    throw new AppError("Payment not yet settled", 409);
                else if (Date.parse(text(row.payload.expiresAt)) <= currentNow().getTime()) {
                    if (status.status === "open")
                        await this.stripe.expire(sessionId);
                    complete = true;
                }
            }
            catch { /* durable retry, sanitized operational state */ }
            await this.repo.transaction([row.id], async (tx) => { const current = await tx.get("operations", row.id); if (!current || current.leaseToken !== row.leaseToken)
                return; await tx.put("operations", { ...current, state: complete ? "DONE" : row.attempts >= 20 ? "FAILED" : "PENDING", leaseUntil: null, availableAt: new Date(now.getTime() + Math.min(3600000, 30000 * 2 ** Math.min(row.attempts, 7))).toISOString() }); });
        }
        const refunds = await this.repo.transaction([], tx => tx.find("refunds", {}, { limit: 50, oneOf: { field: "state", values: ["REQUIRED", "PROCESSING"] } }));
        for (const row of refunds) {
            const job = "refund-operation:" + row.id;
            const claimed = await this.repo.transaction([job], async (tx) => { const old = await tx.get("operations", job); if (old?.leaseUntil && Date.parse(old.leaseUntil) > now.getTime())
                return false; if (old && !row.providerId && now.getTime() - Date.parse(text(old.payload.startedAt)) >= 23 * 3600000) {
                await tx.put("operations", { ...old, state: "FAILED", leaseUntil: null });
                return false;
            } await tx.put("operations", { id: job, businessId: row.businessId, kind: "REFUND", state: "RUNNING", availableAt: now.toISOString(), attempts: (old?.attempts ?? 0) + 1, leaseUntil: new Date(now.getTime() + 60000).toISOString(), payload: { startedAt: old?.payload.startedAt ?? now.toISOString() } }); return true; });
            if (!claimed)
                continue;
            try {
                const result = row.providerId ? await this.stripe.refundStatus(row.providerId) : await this.stripe.refund(row.paymentId, "jf-refund:" + hash(row.id));
                if ("paymentId" in result && result.paymentId !== row.paymentId)
                    throw new AppError("Refund identity mismatch", 403);
                await this.repo.transaction([job, "tenant:" + row.businessId], async (tx) => { const current = await tx.get("refunds", row.id); if (!current)
                    return; const original=(await tx.find("events",{businessId:row.businessId,requestId:row.requestId,providerId:row.paymentId},{limit:1}))[0];
                    const state = original?.amountCents!==result.amountCents?"FAILED":result.state === "succeeded" ? "REFUNDED" : result.state === "pending" ? "PROCESSING" : "FAILED"; await tx.put("refunds", { ...current, providerId: result.id,amountCents:result.amountCents,providerStatus:result.state, state, resolvedAt: state === "REFUNDED" ? now.toISOString() : null }); const operation = (await tx.get("operations", job))!; await tx.put("operations", { ...operation, state: state === "PROCESSING" ? "PENDING" : "DONE", leaseUntil: null }); await audit(tx, row.businessId, "REFUND_PROVIDER:" + state+":"+result.amountCents, "WORKER", now, row.requestId); });
            }
            catch { /* retain required/processing status; stable idempotency key, bounded retry window */ }
        }
        return { operations: batch.length, refunds: refunds.length };
    }
}
