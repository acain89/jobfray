import { response } from "@/lib/core/http";
import { validateConfiguration } from "@/lib/core/configuration";
export const dynamic = "force-dynamic";
/** Liveness is separate. Providers are deliberately not connected, so release readiness is false. */
export function GET() {
    try { validateConfiguration(); } catch { return response({ready:false, reason:"configuration"},503); }
    return response({ready:false,reason:"production_provider_verification_required"},503);
}
