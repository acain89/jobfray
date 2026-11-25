import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requireTrustedIngress } from "./lib/core/ingress";
import { AppError } from "./lib/core/validation";
export function proxy(request: NextRequest) {
    try { requireTrustedIngress(request); }
    catch (error) { return new NextResponse("Trusted ingress is required", { status: error instanceof AppError ? error.status : 403, headers: { "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex, nofollow" } }); }
    const base = process.env.JOBFRAY_BASE_HOST ?? "jobfray.com", host = (request.headers.get("host") ?? "").toLowerCase().split(":")[0] ?? "";
    if (host === "www." + base) { const canonical = new URL(process.env.JOBFRAY_PUBLIC_ORIGIN ?? "https://jobfray.com"); canonical.pathname = request.nextUrl.pathname; canonical.search = request.nextUrl.search; return NextResponse.redirect(canonical, 308); }
    if (!host.endsWith("." + base)) return NextResponse.next();
    const slug = host.slice(0, -base.length - 1);
    if (!/^[a-z][a-z0-9-]{1,38}[a-z0-9]$/.test(slug) || ["www", "app", "api", "admin", "auth", "find", "mail", "support"].includes(slug)) return NextResponse.next();
    // Keep all request bytes and headers intact. Only public document navigation
    // dispatches a business homepage or redirects to the canonical origin.
    if (request.nextUrl.pathname.startsWith("/api/") || request.nextUrl.pathname.startsWith("/_next/") || request.nextUrl.pathname.startsWith("/media/")) return NextResponse.next();
    if (request.nextUrl.pathname === "/") { const url = request.nextUrl.clone(); url.pathname = "/sites/" + slug; return NextResponse.rewrite(url); }
    const canonical = new URL(process.env.JOBFRAY_PUBLIC_ORIGIN ?? "https://jobfray.com"); canonical.pathname = request.nextUrl.pathname; canonical.search = request.nextUrl.search; return NextResponse.redirect(canonical, 308);
}
export const config = { matcher: ["/:path*"] };
