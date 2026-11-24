import { runtime } from "@/lib/core/runtime";
import { failure, response } from "@/lib/core/http";
import { AppError } from "@/lib/core/validation";
export async function POST(request: Request) {
    try {
        const app = await runtime();
        if (app.sandbox || !app.paymentOperations)
            throw new AppError("Not found", 404);
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
        return response(await app.paymentOperations.receive(Buffer.concat(chunks).toString("utf8"), request.headers.get("stripe-signature") ?? "", new Date()));
    }
    catch (error) {
        return failure(error);
    }
}
