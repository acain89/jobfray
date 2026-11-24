import { runtime, requireSandbox } from "@/lib/core/runtime";
import { body, cookieValue, COOKIE, csrf, failure, response } from "@/lib/core/http";
import { string, AppError } from "@/lib/core/validation";
import { uploadImage } from "@/lib/core/media";
import { rateLimit } from "@/lib/core/security";
export async function POST(request: Request) {
    try {
        csrf(request);
        const app = await runtime();
        if (app.sandbox)
            requireSandbox(request);
        const v = await body(request, 7100000);
        if (v.kind !== "BUSINESS" && v.kind !== "QUOTE")
            throw new AppError("Invalid upload purpose");
        const businessId = string(v.businessId, 80), encoded = string(v.bytes, 7000000);
        if (!/^[A-Za-z0-9+/]*={0,2}$/.test(encoded))
            throw new AppError("Invalid image encoding");
        await rateLimit(app.repo, "upload:" + businessId, 50, new Date());
        return response(await uploadImage(app.repo, { businessId, kind: v.kind, bytes: Buffer.from(encoded, "base64"), contentType: string(v.contentType, 40), session: cookieValue(request, COOKIE), proof: typeof v.proof === "string" ? v.proof : undefined, phone: typeof v.phone === "string" ? v.phone : undefined }, new Date()));
    }
    catch (error) {
        return failure(error);
    }
}
