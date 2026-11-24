import { randomUUID } from "node:crypto";
import type { Repository, Transaction } from "./repository";
import { hash, secret, rateLimit } from "./security";
import { AppError, string } from "./validation";
/** Browser possession only. This is never evidence of phone ownership. */
export async function createRequestCapability(repo: Repository, businessId: string, browser: string, now: Date) {
    string(browser, 100);
    await rateLimit(repo, "request-capability:" + hash(browser), 30, now);
    return repo.transaction(["request-capability:" + hash(browser)], async (tx) => {
        if ((await tx.get("businesses", businessId))?.status !== "PUBLISHED")
            throw new AppError("Business unavailable", 404);
        const capability = secret();
        await tx.put("tokens", { id: randomUUID(), hash: hash(capability), purpose: "REQUEST_CAPABILITY", subject: hash(browser), context: businessId, expiresAt: new Date(now.getTime() + 3600000).toISOString(), usedAt: null, attempts: 0 });
        return { capability };
    });
}
export async function requestCapability(tx: Transaction, raw: string, businessId: string, browser: string, now: Date) {
    const token = (await tx.find("tokens", { hash: hash(raw), purpose: "REQUEST_CAPABILITY" }))[0];
    if (!browser || !token || token.context !== businessId || token.subject !== hash(browser) || Date.parse(token.expiresAt) <= now.getTime())
        throw new AppError("Invalid or expired browser request capability", 403);
    return token;
}
