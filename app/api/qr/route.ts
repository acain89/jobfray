import { runtime } from "@/lib/core/runtime";
import { workspace } from "@/lib/core/business";
import { cookieValue, COOKIE, failure } from "@/lib/core/http";
import { qrSvg } from "@/lib/core/qr";
import { siteOrigin } from "@/lib/site";
import { AppError } from "@/lib/core/validation";
export async function GET(request: Request) {
    try {
        const app = await runtime(), w = await workspace(app.repo, cookieValue(request, COOKIE), new Date());
        if (!w.business)
            throw new AppError("Create a business first", 404);
        const url = app.sandbox ? `${siteOrigin}/sites/${w.business.slug}` : `https://${w.business.slug}.jobfray.com`;
        return new Response(qrSvg(url), { headers: { "Content-Type": "image/svg+xml", "Cache-Control": "private, no-store", "Content-Security-Policy": "default-src 'none'; sandbox" } });
    }
    catch (error) {
        return failure(error);
    }
}
