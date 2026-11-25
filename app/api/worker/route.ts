import { cleanStoredMedia } from "@/lib/core/media-operations";
import { authorizeWorker } from "@/lib/core/worker-auth";
import { runtime, requireSandbox } from "@/lib/core/runtime";
import { deliverNotifications } from "@/lib/core/booking";
import { cleanup } from "@/lib/core/administration";
import { failure, response } from "@/lib/core/http";
import { nonfinancialWorker } from "@/lib/core/worker-transition";
import { financialWorker } from "@/lib/core/financial-worker";
export async function POST(request: Request) {
    try {
        authorizeWorker(request);
        const app = await runtime();
        if (app.sandbox)
            requireSandbox(request);
        if (request.headers.get("x-jobfray-worker-mode") === "financial") {
            if (!app.paymentOperations) throw new Error("Financial provider is unavailable");
            const stamp = request.headers.get("x-jobfray-scheduled-at");
            return response({ ...await financialWorker(app.repo, app.paymentOperations, app.booking, app.notifications, process.env, new Date(), {
                source: stamp ? "cron" : "authenticated", scheduledAt: stamp && /^\d{13}$/.test(stamp) ? new Date(Number(stamp)).toISOString() : null, commit: process.env.RENDER_GIT_COMMIT ?? null,
            }), commit: process.env.RENDER_GIT_COMMIT ?? null });
        }
        if (request.headers.get("x-jobfray-worker-mode") === "nonfinancial")
            return response({ ...await nonfinancialWorker(app.repo, app.notifications), commit: process.env.RENDER_GIT_COMMIT ?? null });
        if (request.headers.get("x-jobfray-worker-mode") === "read_only" || process.env.JOBFRAY_CHECKOUT_ENABLED !== "1") {
            const counts = await app.repo.transaction([], async tx => ({ pendingOperations: await tx.count("operations", { state: "PENDING" }), pendingRefunds: await tx.count("refunds", { state: "REQUIRED" }) }));
            return response({ mode: "read_only", authenticated: true, financialOperationsExecuted: false, mutationsExecuted: false, counts, commit: process.env.RENDER_GIT_COMMIT ?? null });
        }
        const providers = app.paymentOperations ? await app.paymentOperations.run(new Date()) : null;
        const expired = await app.booking.reconcile(new Date());
        const retention = await cleanup(app.repo, new Date());
        const media = app.storage ? await cleanStoredMedia(app.repo, app.storage, new Date()) : 0;
        const notifications = await deliverNotifications(app.repo, app.notifications, new Date());
        const alerts = await app.repo.transaction([], async (tx) => ({ operations: await tx.count("operations", { state: "FAILED" }), refunds: await tx.count("refunds", { state: "FAILED" }) }));
        if (alerts.operations || alerts.refunds)
            console.error(JSON.stringify({ event: "jobfray.worker_attention_required", ...alerts }));
        return response({ alerts, providers, media, expired, removed: retention.removed, notifications });
    }
    catch (error) {
        return failure(error);
    }
}
