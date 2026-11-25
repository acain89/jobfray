import { randomUUID } from "node:crypto";
import { deliverNotifications, type BookingService } from "./booking";
import type { PaymentOperations } from "./payment-operations";
import type { Repository } from "./repository";
import type { NotificationTransport } from "./providers";
import { AppError } from "./validation";

export const FINANCIAL_WORKER_ID = "financial-worker:minute";
/** Independent of new Checkout creation. Never runs retention or media deletion. */
export async function financialWorker(
    repo: Repository, payments: PaymentOperations, booking: BookingService, notifications: NotificationTransport,
    env: Readonly<Record<string, string | undefined>> = process.env,
    now = new Date(), context: { source?: string; scheduledAt?: string | null; commit?: string | null } = {},
) {
    if (env.JOBFRAY_WORKER_MODE !== "financial" || ["JOBFRAY_DATABASE_ENABLED", "JOBFRAY_RELEASE_DB_VERIFIED", "JOBFRAY_PRODUCTION_PROVIDERS", "JOBFRAY_PROVIDER_OPERATIONS_ENABLED", "JOBFRAY_RELEASE_PROVIDERS_VERIFIED"].some(key => env[key] !== "1"))
        throw new AppError("Financial worker transition is not authorized", 403);
    const token = randomUUID(), began = performance.now(), currentNow = () => new Date(now.getTime() + performance.now() - began);
    const claimed = await repo.transaction([FINANCIAL_WORKER_ID], async tx => {
        const old = await tx.get("operations", FINANCIAL_WORKER_ID);
        if (old?.state === "RUNNING" && old.leaseUntil && Date.parse(old.leaseUntil) > now.getTime()) return false;
        await tx.put("operations", { id: FINANCIAL_WORKER_ID, businessId: null, kind: "FINANCIAL_WORKER", state: "RUNNING", availableAt: now.toISOString(), attempts: (old?.attempts ?? 0) + 1, leaseUntil: new Date(now.getTime() + 15 * 60000).toISOString(), leaseToken: token,
            payload: { startedAt: now.toISOString(), source: context.source ?? "authenticated", scheduledAt: context.scheduledAt ?? null, commit: context.commit ?? null, previousCompletedAt: old?.payload.completedAt ?? old?.payload.previousCompletedAt ?? null } });
        return true;
    });
    if (!claimed) return { mode: "financial", authenticated: true, executionAccepted: true, skipped: true, financialOperationsExecuted: false, mutationsExecuted: false };
    try {
        const providers = await payments.run(currentNow(), { limit: 5, processRefunds: env.JOBFRAY_REFUND_PROCESSING_ENABLED === "1" });
        const expired = await booking.reconcile(currentNow());
        const notificationAttempts = await deliverNotifications(repo, notifications, currentNow(), 5);
        const alerts = await repo.transaction([], async tx => ({ operations: await tx.count("operations", { state: "FAILED" }), refunds: await tx.count("refunds", { state: "FAILED" }) }));
        const result = { mode: "financial", authenticated: true, executionAccepted: true, skipped: false, providers, expired, notificationAttempts, alerts, financialOperationsExecuted: true, mutationsExecuted: true };
        await repo.transaction([FINANCIAL_WORKER_ID], async tx => {
            const row = await tx.get("operations", FINANCIAL_WORKER_ID);
            if (row?.leaseToken !== token || row.state !== "RUNNING") throw new AppError("Financial worker lease changed", 409);
            await tx.put("operations", { ...row, state: "DONE", leaseUntil: null, payload: { ...row.payload, completedAt: currentNow().toISOString(), result } });
        });
        if (alerts.operations || alerts.refunds) console.error(JSON.stringify({ event: "jobfray.worker_attention_required", ...alerts }));
        return result;
    } catch (error) {
        await repo.transaction([FINANCIAL_WORKER_ID], async tx => {
            const row = await tx.get("operations", FINANCIAL_WORKER_ID);
            if (row?.leaseToken === token && row.state === "RUNNING") await tx.put("operations", { ...row, state: "FAILED", leaseUntil: null, payload: { ...row.payload, failedAt: currentNow().toISOString(), failure: "FINANCIAL_WORKER_FAILED" } });
        });
        throw error;
    }
}
