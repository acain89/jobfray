import { PrismaClient } from "@prisma/client";
import { PrismaRepository } from "../lib/core/prisma-repository";
import type { Transaction } from "../lib/core/repository";
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
export const url = "postgresql://jf_phase4_app@127.0.0.1:55487/jf_phase5_disposable";
export const clients: PrismaClient[] = [];
export const psql = "C:/Program Files/PostgreSQL/17/bin/psql.exe";
export function runSql(sql: string) {
    return execFileSync(psql, ["-X", "-h", "127.0.0.1", "-p", "55487", "-U", "jf_phase4_disposable", "-d", "jf_phase5_disposable", "-v", "ON_ERROR_STOP=1"], { input: sql, encoding: "utf8", env: { ...Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.toUpperCase().startsWith("PG"))), NODE_ENV: "test" } });
}
export class DisposableRepository {
    retries = 0;
    readonly schema = "test_" + randomUUID().replaceAll("-", "");
    private ready: Promise<PrismaRepository>;
    constructor() {
        if (process.env.JOBFRAY_DISPOSABLE_PG !== "7711613122963596620")
            throw new Error("Explicit disposable cluster identity acknowledgement required");
        const client = new PrismaClient({ datasources: { db: { url: url + "?schema=" + this.schema + "&connection_limit=12" } } });
        clients.push(client);
        this.ready = (async () => {
            const identity = runSql("SELECT system_identifier FROM pg_control_system();");
            if (!identity.includes("7711613122963596620"))
                throw new Error("Cluster identity mismatch");
            runSql(`CREATE SCHEMA "${this.schema}"; SET search_path TO "${this.schema}";` + readFileSync("prisma/migrations/20261124000100_four_mode_foundation/migration.sql", "utf8") + readFileSync("prisma/migrations/20261124000200_persistence_hardening/migration.sql", "utf8") + readFileSync("prisma/migrations/20261124000300_provider_operations_and_discovery/migration.sql", "utf8"));
            runSql(`GRANT USAGE ON SCHEMA "${this.schema}" TO jf_phase4_app; GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA "${this.schema}" TO jf_phase4_app; REVOKE UPDATE,DELETE ON "${this.schema}"."JfCheckoutSnapshot","${this.schema}"."JfPaymentEvent","${this.schema}"."JfAudit" FROM jf_phase4_app; REVOKE DELETE ON "${this.schema}"."JfRequest","${this.schema}"."JfRefund" FROM jf_phase4_app;`);
            return new PrismaRepository(client, () => { this.retries++; });
        })();
    }
    async searchDirectory(query: import("../lib/core/discovery").DirectoryQuery) { return (await this.ready).searchDirectory(query); }
    async transaction<T>(locks: readonly string[], fn: (tx: Transaction) => Promise<T>): Promise<T> { return (await this.ready).transaction(locks, fn); }
}
