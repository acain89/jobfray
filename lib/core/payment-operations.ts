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
    async run(now: Date, options: { limit?: number; processRefunds?: boolean } = {}) {
        const limit = options.limit ?? 50;
        if (!Number.isInteger(limit) || limit < 1 || limit > 50) throw new AppError("Invalid financial batch limit");
        const began = performance.now(), currentNow = () => new Date(now.getTime() + performance.now() - began);
        const batch = await this.repo.transaction(["provider-worker-claim"], async (tx) => {
            const pending = await tx.find("operations", { state: "PENDING" }, { limit: 50, oneOf: { field: "kind", values: ["PAYMENT_EVENT", "CHECKOUT_RECONCILE"] }, ranges: [{ field: "availableAt", operator: "lte", value: now.toISOString() }] }), interrupted = await tx.find("operations", { state: "RUNNING" }, { limit: 50, oneOf: { field: "kind", values: ["PAYMENT_EVENT", "CHECKOUT_RECONCILE"] }, ranges: [{ field: "leaseUntil", operator: "lte", value: now.toISOString() }] });
            const rows = [...pending, ...interrupted].filter(x => ["PAYMENT_EVENT", "CHECKOUT_RECONCILE"].includes(x.kind)).slice(0, limit);
            const claimed: Operation[] = [];
            for (const row of rows) {
                if (row.attempts >= 20) { await tx.put("operations", { ...row, state: "FAILED", leaseUntil: null }); continue; }
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
        const refunds = options.processRefunds === false ? [] : await this.repo.transaction([], tx => tx.find("refunds", {}, { limit: 50, oneOf: { field: "state", values: ["REQUIRED", "PROCESSING"] } }));
        let refundAttempts = 0;
        for (const row of refunds) {
            if (refundAttempts >= limit) break;
            const job = "refund-operation:" + row.id;
            const claimed = await this.repo.transaction([job, "refund-payment:" + row.paymentId], async (tx) => {
                const current = await tx.get("refunds", row.id), old = await tx.get("operations", job), at = currentNow();
                if (!current || !["REQUIRED", "PROCESSING"].includes(current.state) || old?.state === "FAILED" || old?.state === "DONE"
                    || old?.leaseUntil && Date.parse(old.leaseUntil) > at.getTime() || old && Date.parse(old.availableAt) > at.getTime()) return null;
                const original = (await tx.find("events", { businessId: current.businessId, requestId: current.requestId, providerId: current.paymentId }, { limit: 1 }))[0];
                const request = await tx.get("requests", current.requestId);
                const peers = await tx.find("refunds", { paymentId: current.paymentId });
                const canonical = [...peers].sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))[0];
                const authorized = ["JF_ALLOCATION_MISSING", "PAYMENT_AMOUNT_MISMATCH", "DUPLICATE_CHARGE", "HOLD_EXPIRED", "BUSINESS_UNAVAILABLE"].includes(current.reason)
                    && original?.currency === "USD" && [200, 300, 400, 500].includes(original.amountCents)
                    && request?.businessId === current.businessId && canonical?.id === current.id
                    && !peers.some(peer => peer.id !== current.id && (peer.providerId || peer.state === "REFUNDED"));
                const exhausted = (old?.attempts ?? 0) >= 20 || old && !current.providerId && at.getTime() - Date.parse(text(old.payload.startedAt)) >= 23 * 3600000;
                if (!authorized || exhausted) {
                    await tx.put("refunds", { ...current, state: "FAILED" });
                    await tx.put("operations", { id: job, businessId: current.businessId, kind: "REFUND", state: "FAILED", attempts: old?.attempts ?? 0, availableAt: at.toISOString(), leaseUntil: null, payload: { ...old?.payload, startedAt: old?.payload.startedAt ?? at.toISOString(), failure: authorized ? "RETRY_LIMIT" : "REFUND_AUTHORIZATION" } });
                    await audit(tx, current.businessId, authorized ? "REFUND_RETRY_LIMIT" : "REFUND_AUTHORIZATION_REJECTED", "WORKER", at, current.requestId);
                    return null;
                }
                const operation: Operation = { id: job, businessId: current.businessId, kind: "REFUND", state: "RUNNING", availableAt: at.toISOString(), attempts: (old?.attempts ?? 0) + 1, leaseToken: randomUUID(), leaseUntil: new Date(at.getTime() + 60000).toISOString(), payload: { startedAt: old?.payload.startedAt ?? at.toISOString() } };
                await tx.put("operations", operation);
                return { refund: current, operation, amountCents: original!.amountCents };
            });
            if (!claimed)
                continue;
            refundAttempts++;
            try {
                const currentRefund = claimed.refund;
                const result = currentRefund.providerId ? await this.stripe.refundStatus(currentRefund.providerId) : await this.stripe.refund(currentRefund.paymentId, "jf-refund:" + hash(currentRefund.id));
                if ("paymentId" in result && result.paymentId !== row.paymentId)
                    throw new AppError("Refund identity mismatch", 403);
                await this.repo.transaction([job, "tenant:" + row.businessId], async (tx) => { const current = await tx.get("refunds", row.id); if (!current)
                    return; const operation = (await tx.get("operations", job))!;
                    if (operation.leaseToken !== claimed.operation.leaseToken || operation.state !== "RUNNING") return;
                    const state = claimed.amountCents!==result.amountCents?"FAILED":result.state === "succeeded" ? "REFUNDED" : result.state === "pending" ? "PROCESSING" : "FAILED"; await tx.put("refunds", { ...current, providerId: result.id,amountCents:result.amountCents,providerStatus:result.state, state, resolvedAt: state === "REFUNDED" ? currentNow().toISOString() : null });
                    await tx.put("operations", { ...operation, state: state === "PROCESSING" ? "PENDING" : state === "FAILED" ? "FAILED" : "DONE", leaseUntil: null, availableAt: new Date(currentNow().getTime() + Math.min(3600000, 30000 * 2 ** Math.min(operation.attempts, 7))).toISOString() }); await audit(tx, row.businessId, "REFUND_PROVIDER:" + state+":"+result.amountCents, "WORKER", currentNow(), row.requestId); });
            }
            catch {
                await this.repo.transaction([job], async tx => {
                    const operation = await tx.get("operations", job), current = await tx.get("refunds", row.id);
                    if (!operation || !current || operation.leaseToken !== claimed.operation.leaseToken || operation.state !== "RUNNING") return;
                    const exhausted = operation.attempts >= 20;
                    if (exhausted) await tx.put("refunds", { ...current, state: "FAILED" });
                    await tx.put("operations", { ...operation, state: exhausted ? "FAILED" : "PENDING", leaseUntil: null, availableAt: new Date(currentNow().getTime() + Math.min(3600000, 30000 * 2 ** Math.min(operation.attempts, 7))).toISOString() });
                });
            }
        }
        return { operations: batch.length, refunds: refundAttempts };
    }
}
