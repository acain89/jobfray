import { randomUUID } from "node:crypto";
import type { Repository } from "./repository";
import type { PhoneVerifier } from "../integrations/twilio";
import { hash, secret, rateLimit } from "./security";
import { AppError, phone } from "./validation";
export const contactBinding = (businessId: string, offeringId: string, mode: string, key: string) => hash(JSON.stringify([businessId, offeringId, mode, key]));
export class PhoneVerificationService {
    constructor(private repo: Repository, private provider: PhoneVerifier, private prefixes: readonly string[]) { }
    async start(input: string, binding: string, principal: string, now: Date, businessId?: string) {
        const number = phone(input);
        if (!this.prefixes.some(prefix => number.startsWith(prefix)))
            throw new AppError("Phone destination is not enabled", 422);
        await rateLimit(this.repo, "verify-destination:" + number, 3, now);
        await rateLimit(this.repo, "verify-principal:" + principal, 5, now);
        const id = randomUUID(), expiresAt = new Date(now.getTime() + 600000).toISOString();
        await this.repo.transaction(["contact:" + id], tx => tx.put("tokens", { id, hash: hash(id), purpose: "CUSTOMER_CODE", subject: number, context: JSON.stringify({ binding, principal, businessId, sid: null }), expiresAt, usedAt: null, attempts: 0 }));
        // No automatic resend after a transport timeout. A fresh challenge consumes limits again.
        const sid = await this.provider.start(number, principal);
        await this.repo.transaction(["contact:" + id], async (tx) => { const token = (await tx.get("tokens", id))!; await tx.put("tokens", { ...token, context: JSON.stringify({ binding, principal, businessId, sid }) }); });
        return { challengeId: id };
    }
    async verify(id: string, code: string, principal: string, now: Date) {
        const began = performance.now();
        const data = await this.repo.transaction(["contact:" + id], async (tx) => {
            const token = await tx.get("tokens", id);
            if (!token || token.purpose !== "CUSTOMER_CODE" || token.usedAt || token.attempts >= 5 || Date.parse(token.expiresAt) <= now.getTime())
                throw new AppError("Invalid or expired verification");
            const context = JSON.parse(token.context) as {
                sid: string | null;
                principal: string;
                binding: string;
                businessId?: string;
            };
            if (!context.sid || context.principal !== principal)
                throw new AppError("Verification scope mismatch", 403);
            await tx.put("tokens", { ...token, attempts: token.attempts + 1 });
            return { token, context };
        });
        if (!await this.provider.check(data.context.sid!, data.token.subject, code))
            throw new AppError("Invalid or expired verification");
        return this.repo.transaction(["contact:" + id], async (tx) => { const current = (await tx.get("tokens", id))!; if (current.usedAt || Date.parse(current.expiresAt) <= now.getTime() + performance.now() - began)
            throw new AppError("Verification already consumed"); const proof = secret(); await tx.put("tokens", { ...current, usedAt: now.toISOString() }); await tx.put("tokens", { id: randomUUID(), hash: hash(proof), purpose: "CUSTOMER_PROOF", subject: current.subject, context: data.context.businessId ? data.context.businessId + ":" + data.context.binding : data.context.binding, expiresAt: new Date(now.getTime() + 3600000).toISOString(), usedAt: null, attempts: 0 }); return { proof }; });
    }
}
