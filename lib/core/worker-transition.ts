import { deliverNotifications } from "./booking";
import type { Repository } from "./repository";
import type { NotificationTransport } from "./providers";
import { AppError } from "./validation";

/** Explicitly staged notification-only transition; never runs payment or cleanup jobs. */
export async function nonfinancialWorker(
    repo: Repository,
    notifications: NotificationTransport,
    env: Readonly<Record<string, string | undefined>> = process.env,
    now = new Date(),
) {
    if (env.JOBFRAY_WORKER_MODE !== "nonfinancial" || env.JOBFRAY_PRODUCTION_PROVIDERS !== "1"
        || env.JOBFRAY_PROVIDER_OPERATIONS_ENABLED !== "1" || env.JOBFRAY_RELEASE_PROVIDERS_VERIFIED !== "1")
        throw new AppError("Nonfinancial worker transition is not authorized", 403);
    const attempted = await deliverNotifications(repo, notifications, now);
    return { mode: "nonfinancial", authenticated: true, notificationAttempts: attempted,
        financialOperationsExecuted: false, mutationsExecuted: attempted > 0 };
}
