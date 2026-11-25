import { localSandboxAllowed } from "./configuration";
import { trustedPrincipal } from "./edge";
import { AppError } from "./validation";
const reserved = new Set(["app", "api", "admin", "auth", "find", "mail", "support"]);
/** Global production boundary, including APIs, webhooks, media and Next assets. */
export function requireTrustedIngress(request: Request, env: Readonly<Record<string, string | undefined>> = process.env): void {
    if (env.NODE_ENV !== "production" || localSandboxAllowed(env)) return;
    const url = new URL(request.url);
    // Render health checks must work before application persistence is enabled.
    // This endpoint contains no tenant or operational data and accepts no writes.
    if (url.pathname === "/api/health" && ["GET", "HEAD"].includes(request.method)) return;
    trustedPrincipal(request, env.JOBFRAY_EDGE_SECRET);
    const authority = request.headers.get("host") ?? url.host;
    let host: string;
    try { const parsed = new URL("https://" + authority); if (parsed.username || parsed.password || parsed.pathname !== "/" || parsed.search || parsed.hash) throw new Error(); host = parsed.hostname.toLowerCase(); }
    catch { throw new AppError("Invalid request host", 421); }
    const base = env.JOBFRAY_BASE_HOST ?? "jobfray.com";
    const origin = new URL(env.JOBFRAY_PUBLIC_ORIGIN ?? "https://jobfray.com");
    const local = ["localhost", "127.0.0.1", "[::1]"];
    if (local.includes(origin.hostname) && local.includes(host)) return; // Still requires the edge assertion above.
    const slug = host.endsWith("." + base) ? host.slice(0, -base.length - 1) : "";
    if (host !== base && host !== "www." + base && (!/^[a-z][a-z0-9-]{1,38}[a-z0-9]$/.test(slug) || reserved.has(slug))) throw new AppError("Invalid request host", 421);
}
