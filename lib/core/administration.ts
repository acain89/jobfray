import { randomUUID } from "node:crypto";
import type { Repository } from "./repository";
import { AppError, string } from "./validation";
import { session, audit } from "./security";
export async function adminOverview(repo: Repository, token: string | undefined, admins: readonly string[], now: Date) {
    return repo.transaction(["admin-read"], async (tx) => {
        const { account } = await session(tx, token, now);
        if (!admins.includes(account.email))
            throw new AppError("Forbidden", 403);
        return { businesses: (await tx.find("businesses", {})).map(b => ({ id: b.id, name: b.name, status: b.status })), refunds: await tx.find("refunds", {}) };
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
        const payment = (await tx.find("events", { businessId, requestId }))[0];
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
            for (const row of await tx.find(table, {}))
                if (Date.parse(row.expiresAt) <= now.getTime()) {
                    await tx.remove(table, row.id);
                    removed++;
                }
        for (const image of await tx.find("media", {}))
            if (image.expiresAt && Date.parse(image.expiresAt) <= now.getTime()) {
                await tx.remove("media", image.id);
                removed++;
            }
        for (const item of await tx.find("outbox", {}))
            if (item.state === "SENT" && Date.parse(item.availableAt) < now.getTime() - 86400000 && item.body !== "[delivery content redacted]")
                await tx.put("outbox", { ...item, body: "[delivery content redacted]" });
        return { removed };
    });
}
