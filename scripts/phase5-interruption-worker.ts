import { PrismaClient } from "@prisma/client";
import { PrismaRepository } from "../lib/core/prisma-repository";
import type { Repository, Transaction } from "../lib/core/repository";
import { BookingService } from "../lib/core/booking";
import { MockGeocoder, MockPaymentAdapter } from "../lib/core/providers";
import { url } from "./phase5-postgres-support";
async function main() {
    const [schema, encoded] = process.argv.slice(2);
    if (process.env.JOBFRAY_DISPOSABLE_PG !== "7711613122963596620" || !schema || !/^test_[a-f0-9]{32}$/.test(schema) || !encoded)
        throw new Error("Invalid disposable target");
    const client = new PrismaClient({ datasources: { db: { url: url + "?schema=" + schema + "&connection_limit=2" } } }), repo = new PrismaRepository(client);
    const wrapped: Repository = { transaction: async <T>(locks: readonly string[], fn: (tx: Transaction) => Promise<T>) => repo.transaction(locks, tx => {
            const interrupted: Transaction = { ...tx, async put(table, row) { await tx.put(table, row); if (table === "events") {
                    process.stdout.write("event-written\n");
                    await new Promise(() => { });
                } } };
            return fn(interrupted);
        }) };
    const service = new BookingService(wrapped, new MockGeocoder(), new MockPaymentAdapter("synthetic-mock-payment-signing-key-123456789"), "synthetic-confirmation-signing-key-123456789");
    const event = JSON.parse(Buffer.from(encoded, "base64url").toString()) as {
        payload: string;
        signature: string;
    };
    try {
        await service.paymentEvent(event.payload, event.signature, new Date("2026-11-23T12:00:00Z"));
    }
    finally {
        await client.$disconnect();
    }
}
void main().catch(() => { console.error("Interruption worker failed"); process.exitCode = 1; });
