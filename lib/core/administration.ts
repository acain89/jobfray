import { randomUUID } from "node:crypto";
import type { Repository } from "./repository";
import { AppError, string } from "./validation";
import { session, audit } from "./security";
export async function adminOverview(repo: Repository, token: string | undefined, admins: readonly string[], now: Date, cursors: {
    business?: string | undefined;
    refund?: string | undefined;
} = {}) {
    return repo.transaction([], async (tx) => {
        const { account } = await session(tx, token, now);
        if (!admins.includes(account.email))
            throw new AppError("Forbidden", 403);
        const businesses = await tx.find("businesses", {}, { limit: 100, afterId: cursors.business }), refunds = await tx.find("refunds", {}, { limit: 100, afterId: cursors.refund });
        return { alerts: await tx.find("operations", { state: "FAILED" }, { limit: 100 }), businesses: businesses.map(b => ({ id: b.id, name: b.name, status: b.status })), refunds, businessCursor: cursors.business ?? null, refundCursor: cursors.refund ?? null, nextBusinessCursor: businesses.length === 100 ? businesses.at(-1)!.id : null, nextRefundCursor: refunds.length === 100 ? refunds.at(-1)!.id : null };
    });
}
export async function requestRefund(repo: Repository, token: string | undefined, admins: readonly string[], businessId: string, requestId: string, reason: string, now: Date) {
    if (!["LEGAL_REQUIREMENT", "PROVIDER_REQUIREMENT", "DISCRETIONARY", "DUPLICATE_CHARGE", "JF_FULFILLMENT_FAILURE"].includes(reason))
        throw new AppError("Invalid remediation reason");
    return repo.transaction(["tenant:" + businessId], async (tx) => {
        const { account } = await session(tx, token, now);
        if (!admins.includes(account.email))
            throw new AppError("Forbidden", 403);
        const request = await tx.get("requests", requestId);
        if (!request || request.businessId !== businessId)
            throw new AppError("Request not found", 404);
        const events = await tx.find("events", { businessId, requestId });
        const identities = [...new Set(events.map(e => e.providerId))];
        if (!request.settledPaymentId && identities.length > 1)
            throw new AppError("Historical payment identity requires operator reconciliation", 409);
        const payment = events.find(e => e.providerId === (request.settledPaymentId ?? identities[0]));
        if (!payment)
            throw new AppError("No verified payment exists");
        const previous = (await tx.find("refunds", { businessId, requestId, paymentId: payment.providerId }))[0];
        if (previous)
            return previous;
        const refund = { id: randomUUID(), businessId, requestId, paymentId: payment.providerId, reason, state: "REQUIRED" as const, createdAt: now.toISOString(), resolvedAt: null };
        await tx.put("refunds", refund);
        await tx.put("requests", { ...request, payment: "REFUND_REQUIRED", refundReason: reason });
        await audit(tx, businessId, "REFUND_REQUESTED:" + reason, account.id, now, requestId);
        return refund;
    });
}
export async function simulateRefund(repo: Repository, token: string | undefined, admins: readonly string[], refundId: string, now: Date) {
    string(refundId, 80);
    return repo.transaction(["refund:" + refundId], async (tx) => {
        const { account } = await session(tx, token, now);
        if (!admins.includes(account.email))
            throw new AppError("Forbidden", 403);
        const refund = await tx.get("refunds", refundId);
        if (!refund)
            throw new AppError("Refund not found", 404);
        if (refund.state === "SIMULATED_REFUNDED")
            return { simulated: true };
        await tx.put("refunds", { ...refund, state: "SIMULATED_REFUNDED", resolvedAt: now.toISOString() });
        await audit(tx, refund.businessId, "REFUND_SIMULATED", account.id, now, refund.requestId);
        return { simulated: true };
    });
}
/** Retention cleanup is repository-local. Financial snapshots, confirmations and audits are never deleted. */
export async function cleanup(repo: Repository, now: Date) {
    return repo.transaction(["retention"], async (tx) => {
        let removed = 0;
        for (const table of ["sessions", "tokens", "rates"] as const)
            for (const row of await tx.find(table, {}, { limit: 100, ranges: [{ field: "expiresAt", operator: "lte", value: now.toISOString() }] }))
                if (Date.parse(row.expiresAt) <= now.getTime()) {
                    await tx.remove(table, row.id);
                    removed++;
                }
        for (const image of await tx.find("media", {}, { limit: 100, ranges: [{ field: "expiresAt", operator: "lte", value: now.toISOString() }] }))
            if (image.expiresAt && Date.parse(image.expiresAt) <= now.getTime()) {
                if (image.storage)
                    await tx.put("operations", { id: "media-delete:" + image.id, businessId: image.businessId, kind: "MEDIA_DELETE", state: "PENDING", availableAt: now.toISOString(), attempts: 0, leaseUntil: null, payload: { asset: image.storage } });
                await tx.remove("media", image.id);
                removed++;
            }
        const cursor=await tx.get("operations","business-media-retention");
        const businessImages=await tx.find("media",{kind:"BUSINESS"},{limit:100,...(typeof cursor?.payload.afterId==="string"&&cursor.payload.afterId?{afterId:cursor.payload.afterId}:{})});
        for(const image of businessImages){
            if(Date.parse(image.createdAt)>now.getTime()-86400000)continue;
            const b=await tx.get("businesses",image.businessId);
            if(b?.draft.gallery.includes(image.id)||b?.published?.gallery.includes(image.id)||(await tx.find("offerings",{businessId:image.businessId},{limit:1,containsPhoto:image.id})).length)continue;
            if(image.storage)await tx.put("operations",{id:"media-delete:"+image.id,businessId:image.businessId,kind:"MEDIA_DELETE",state:"PENDING",availableAt:now.toISOString(),attempts:0,leaseUntil:null,payload:{asset:image.storage}});
            await tx.remove("media",image.id);removed++;
        }
        await tx.put("operations",{id:"business-media-retention",businessId:null,kind:"RETENTION_CURSOR",state:"DONE",availableAt:now.toISOString(),attempts:0,leaseUntil:null,payload:{afterId:businessImages.length===100?businessImages.at(-1)!.id:""}});
        for (const item of await tx.find("outbox", { state: "SENT" }, { limit: 100, ranges: [{ field: "availableAt", operator: "lt", value: new Date(now.getTime() - 86400000).toISOString() }, { field: "body", operator: "ne", value: "[delivery content redacted]" }] }))
            if (item.state === "SENT" && Date.parse(item.availableAt) < now.getTime() - 86400000 && item.body !== "[delivery content redacted]")
                await tx.put("outbox", { ...item, body: "[delivery content redacted]" });
        return { removed };
    });
}
