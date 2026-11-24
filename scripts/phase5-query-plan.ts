import { PrismaClient } from "@prisma/client";
import { runSql } from "./phase5-postgres-support";
import { indexedDirectory } from "../lib/core/discovery";
import { writeFileSync } from "node:fs";
async function main() {
    if (process.env.JOBFRAY_DISPOSABLE_PG !== "7711613122963596620" || !runSql("SELECT system_identifier FROM pg_control_system();").includes("7711613122963596620"))
        throw new Error("Disposable identity required");
    const schemas = runSql("SELECT nspname FROM pg_namespace WHERE nspname LIKE 'test_%';").match(/test_[a-f0-9]{32}/g) ?? [];
    let schema = "";
    for (const candidate of schemas) {
        const result = runSql(`SELECT count(*) FROM "${candidate}"."JfDirectoryBusiness";`);
        if (Number(result.match(/\n\s*(\d+)\s*\r?\n/)?.[1] ?? 0) === 10000) {
            schema = candidate;
            break;
        }
    }
    if (!schema)
        throw new Error("Existing synthetic 10000-business fixture required");
    const client = new PrismaClient({ datasources: { db: { url: "postgresql://jf_phase4_app@127.0.0.1:55487/jf_phase5_disposable?schema=" + schema } }, log: [{ emit: "event", level: "query" }] });
    let query: {
        query: string;
        params: string;
    } | undefined;
    client.$on("query", event => { if (event.query.includes('FROM "JfDirectoryBusiness"'))
        query = event; });
    try {
        await indexedDirectory(client, { text: "", mode: "SERVICE", fulfillment: "MOBILE", point: { latitude: 30.271, longitude: -97.743 } });
        if (!query)
            throw new Error("Query capture failed");
        const plan = await client.$queryRawUnsafe("EXPLAIN (ANALYZE,BUFFERS,FORMAT JSON) " + query.query, ...JSON.parse(query.params));
        writeFileSync("artifacts/phase5-directory-actual-plan.json", JSON.stringify(plan, null, 2));
        console.log(JSON.stringify(plan));
    }
    finally {
        await client.$disconnect();
    }
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
