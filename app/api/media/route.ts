import { trustedPrincipal } from "@/lib/core/edge";
import { runtime, requireSandbox } from "@/lib/core/runtime";
import { body, cookieValue, COOKIE, csrf, failure, response } from "@/lib/core/http";
import { string, AppError } from "@/lib/core/validation";
import { uploadImage } from "@/lib/core/media";
import { ownerScope, contactProof, hash, rateLimit } from "@/lib/core/security";
export async function POST(request: Request) {
    try {
        csrf(request);
        const app = await runtime();
        if (app.sandbox)
            requireSandbox(request);
        if (!app.sandbox)
            await rateLimit(app.repo, "upload-edge:" + trustedPrincipal(request), 30, new Date(), 1);
        const v = await body(request, 7100000);
        if (v.kind !== "BUSINESS" && v.kind !== "QUOTE")
            throw new AppError("Invalid upload purpose");
        const businessId = string(v.businessId, 80), encoded = string(v.bytes, 7000000);
        if (!/^[A-Za-z0-9+/]*={0,2}$/.test(encoded))
            throw new AppError("Invalid image encoding");
        await app.repo.transaction([], async (tx) => {
            if (v.kind === "BUSINESS")
                await ownerScope(tx, cookieValue(request, COOKIE), businessId, new Date());
            else {
                const verified = await contactProof(tx, string(v.proof, 100), string(v.phone, 32), new Date());
                if (!app.sandbox && (verified.usedAt || !verified.context.startsWith(businessId + ":")))
                    throw new AppError("Invalid upload scope", 403);
                if ((await tx.get("businesses", businessId))?.status !== "PUBLISHED")
                    throw new AppError("Business not available", 404);
            }
        });
        await rateLimit(app.repo, "upload-principal:" + hash(v.kind === "BUSINESS" ? cookieValue(request, COOKIE) ?? "" : string(v.proof, 100)), 50, new Date());
        await rateLimit(app.repo, "upload:" + businessId + ":" + hash(v.kind === "BUSINESS" ? cookieValue(request, COOKIE) ?? "" : string(v.proof, 100)), 50, new Date());
        return response(await uploadImage(app.repo, { businessId, kind: v.kind, bytes: Buffer.from(encoded, "base64"), contentType: string(v.contentType, 40), session: cookieValue(request, COOKIE), proof: typeof v.proof === "string" ? v.proof : undefined, phone: typeof v.phone === "string" ? v.phone : undefined }, new Date(), app.storage));
    }
    catch (error) {
        return failure(error);
    }
}
