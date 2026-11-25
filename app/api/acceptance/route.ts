import { authorizeWorker } from "@/lib/core/worker-auth";
import { trustedPrincipal } from "@/lib/core/edge";
import { acceptDatabase } from "@/lib/core/database-acceptance";
import { response, failure } from "@/lib/core/http";
import { AppError } from "@/lib/core/validation";
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
    try {
        if (process.env.JOBFRAY_ACCEPTANCE_ENABLED !== "1") throw new AppError("Not found", 404);
        authorizeWorker(request);
        const principal = trustedPrincipal(request);
        const result = await acceptDatabase(process.env.JF_PENDING_DATABASE_URL ?? "");
        return response({ ...result, principal, commit: process.env.RENDER_GIT_COMMIT ?? null });
    } catch (error) {
        if (error instanceof AppError) return failure(error);
        return response({ accepted: false, reason: "database_acceptance_failed", code: typeof error === "object" && error && "code" in error && typeof error.code === "string" && /^P\d{4}$/.test(error.code) ? error.code : "VERIFICATION_FAILED" }, 503);
    }
}
export async function GET(request: Request) {
    try {
        if (process.env.JOBFRAY_ACCEPTANCE_ENABLED !== "1") throw new AppError("Not found", 404);
        authorizeWorker(request);
        return response({ kind: "ingress", principal: trustedPrincipal(request), host: request.headers.get("host"), commit: process.env.RENDER_GIT_COMMIT ?? null, financialOperationsExecuted: false, databaseMutations: false });
    } catch (error) { return failure(error); }
}
