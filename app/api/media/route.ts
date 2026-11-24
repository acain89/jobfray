import { requestCapability } from "@/lib/core/request-capability";
import { trustedPrincipal } from "@/lib/core/edge";
import { runtime, requireSandbox } from "@/lib/core/runtime";
import { body, cookieValue, COOKIE, REQUEST_BROWSER, csrf, failure, response } from "@/lib/core/http";
import { string, AppError } from "@/lib/core/validation";
import { uploadImage } from "@/lib/core/media";
import { ownerScope, hash, rateLimit } from "@/lib/core/security";
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
                await requestCapability(tx, string(v.capability, 100), businessId, cookieValue(request, REQUEST_BROWSER) ?? "", new Date());
                if ((await tx.get("businesses", businessId))?.status !== "PUBLISHED")
                    throw new AppError("Business not available", 404);
            }
        });
        await rateLimit(app.repo, "upload-principal:" + hash(v.kind === "BUSINESS" ? cookieValue(request, COOKIE) ?? "" : string(v.capability, 100)), 50, new Date());
        await rateLimit(app.repo, "upload:" + businessId + ":" + hash(v.kind === "BUSINESS" ? cookieValue(request, COOKIE) ?? "" : string(v.capability, 100)), 50, new Date());
        return response(await uploadImage(app.repo, { businessId, kind: v.kind, bytes: Buffer.from(encoded, "base64"), contentType: string(v.contentType, 40), session: cookieValue(request, COOKIE), capability: typeof v.capability === "string" ? v.capability : undefined, browser: cookieValue(request, REQUEST_BROWSER) }, new Date(), app.storage));
    }
    catch (error) {
        return failure(error);
    }
}
