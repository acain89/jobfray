import { authorizeWorker } from "@/lib/core/worker-auth";
import { StripeAdapter } from "@/lib/integrations/stripe";
import { createHash } from "node:crypto";
import { runtime } from "@/lib/core/runtime";
import { failure, response } from "@/lib/core/http";
import { AppError } from "@/lib/core/validation";
export async function POST(request: Request) {
    try {
        const acceptance = process.env.JOBFRAY_ACCEPTANCE_ENABLED === "1" && request.headers.get("x-jobfray-acceptance") === "raw-body";
        if (acceptance) authorizeWorker(request);
        const reader = request.body?.getReader();
        if (!reader)
            throw new AppError("Missing webhook body");
        let size = 0;
        const chunks: Uint8Array[] = [];
        try {
            for (;;) {
                const value = await reader.read();
                if (value.done)
                    break;
                size += value.value.byteLength;
                if (size > 1000000)
                    throw new AppError("Webhook too large", 413);
                chunks.push(value.value);
            }
        }
        finally {
            await reader.cancel();
        }
        const bytes = Buffer.concat(chunks), payload = bytes.toString("utf8"), signature = request.headers.get("stripe-signature") ?? "";
        if (acceptance) {
            const stripe = new StripeAdapter({ key: process.env.STRIPE_SECRET_KEY ?? "", account: process.env.STRIPE_ACCOUNT_ID ?? "", live: true, origin: process.env.JOBFRAY_PUBLIC_ORIGIN ?? "", integrationId: process.env.STRIPE_INTEGRATION_IDENTIFIER ?? "", webhookSecrets: (process.env.STRIPE_WEBHOOK_SECRETS ?? "").split(",") });
            const event = stripe.envelope(payload, signature);
            if (event.type !== "jobfray.infrastructure.acceptance") throw new AppError("Invalid acceptance event", 400);
            return response({ acceptance: true, sha256: createHash("sha256").update(bytes).digest("hex"), bytes: bytes.length, signatureVerified: true, financialOperationsExecuted: false, databaseMutations: false });
        }
        const app = await runtime();
        if (app.sandbox || !app.paymentOperations) throw new AppError("Not found", 404);
        return response(await app.paymentOperations.receive(payload, signature, new Date()));
    }
    catch (error) {
        return failure(error);
    }
}
