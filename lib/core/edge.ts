import { createHash, timingSafeEqual } from "node:crypto";
import { isIP } from "node:net";
import { AppError } from "./validation";
export function trustedPrincipal(request: Request, secret = process.env.JOBFRAY_EDGE_SECRET) {
    const supplied = request.headers.get("x-jf-edge-secret") ?? "", ip = request.headers.get("x-jf-client-ip") ?? "";
    const digest = (v: string) => createHash("sha256").update(v).digest();
    if (!secret || secret.length < 32 || !isIP(ip) || supplied.length > 256 || !timingSafeEqual(digest(secret), digest(supplied)))
        throw new AppError("Trusted ingress is required", 403);
    return createHash("sha256").update(ip).digest("hex");
}
