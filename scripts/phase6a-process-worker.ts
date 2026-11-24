import { PrismaClient } from "@prisma/client";
import { PrismaRepository } from "../lib/core/prisma-repository";
import { BookingService } from "../lib/core/booking";
import { MockGeocoder, MockPaymentAdapter } from "../lib/core/providers";
async function main() {
    const [schema, encoded] = process.argv.slice(2);
    if (process.env.JOBFRAY_DISPOSABLE_PG !== "7711613122963596620" || !schema || !/^test_[a-f0-9]{32}$/.test(schema) || !encoded)
        throw new Error("Invalid disposable test target");
    const { url } = await import("./phase6a-postgres-support");
    const client = new PrismaClient({ datasources: { db: { url: url + "?schema=" + schema + "&connection_limit=2" } } });
    try {
        const job = JSON.parse(Buffer.from(encoded, "base64url").toString()) as {
            selection: unknown;
            capability: string;
            key: string;
        };
        const service = new BookingService(new PrismaRepository(client), new MockGeocoder(), new MockPaymentAdapter("synthetic-mock-payment-signing-key-123456789"), "synthetic-confirmation-signing-key-123456789");
        try {
            await service.checkout(job.selection, job.capability, job.key, new Date("2026-11-23T12:00:00Z"), "synthetic-browser-capability-binding");
            console.log("accepted");
        }
        catch {
            console.log("rejected");
        }
    }
    finally {
        await client.$disconnect();
    }
}
void main().catch(() => { console.error("Disposable worker failed"); process.exitCode = 1; });
