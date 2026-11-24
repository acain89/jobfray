import { response } from "@/lib/core/http";
import { validateConfiguration } from "@/lib/core/configuration";
import { runtime } from "@/lib/core/runtime";
export const dynamic = "force-dynamic";
export async function GET() {
    try {
        validateConfiguration();
    }
    catch {
        return response({ ready: false, reason: "configuration" }, 503);
    }
    if (process.env.JOBFRAY_PRODUCTION_PROVIDERS !== "1" || process.env.JOBFRAY_RELEASE_PROVIDERS_VERIFIED !== "1" || process.env.JOBFRAY_PROVIDER_OPERATIONS_ENABLED !== "1")
        return response({ ready: false, reason: "production_provider_verification_required" }, 503);
    try {
        const app = await runtime();
        await app.repo.transaction([], tx => tx.find("businesses", {}, { limit: 1 }));
        return response({ ready: true });
    }
    catch {
        return response({ ready: false, reason: "persistence" }, 503);
    }
}
