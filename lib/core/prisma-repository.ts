import { Prisma, PrismaClient } from "@prisma/client";
import type { Table, Tables } from "./model";
import type { Repository, Transaction } from "./repository";
import { SQL_TABLES, indexedColumns } from "./repository";
import { storedDocument } from "./documents";
import { AppError } from "./validation";
/** Construction is side-effect free. Runtime is disabled unless separately configured after DB verification. */
export class PrismaRepository implements Repository {
    constructor(private client: PrismaClient) { }
    async transaction<T>(locks: readonly string[], fn: (tx: Transaction) => Promise<T>): Promise<T> {
        for (let attempt = 0; attempt < 3; attempt++) {
            try {
                return await this.client.$transaction(async (sql) => {
                    for (const key of [...new Set(locks)].sort())
                        await sql.$queryRaw `SELECT pg_advisory_xact_lock(hashtextextended(${key},0))`;
                    const tx: Transaction = {
                        async get<K extends Table>(table: K, id: string) {
                            const rows = await sql.$queryRawUnsafe<{
                                document: Tables[K];
                            }[]>(`SELECT "document" FROM "${SQL_TABLES[table]}" WHERE "id"=$1`, id);
                            return rows[0] ? storedDocument(table, rows[0].document) : null;
                        },
                        async find<K extends Table>(table: K, filter: Partial<Tables[K]>) {
                            const entries = Object.entries(filter), values: unknown[] = [];
                            const indexed: Partial<Record<Table, string[]>> = { accounts: ["email"], sessions: ["accountId", "tokenHash", "expiresAt"], tokens: ["hash", "purpose", "expiresAt"], businesses: ["ownerId", "slug", "status"], offerings: ["businessId", "resourceId"], resources: ["businessId"], requests: ["businessId", "offeringId", "mode", "status", "idempotencyKey"], allocations: ["businessId", "requestId", "resourceId", "status"], snapshots: ["businessId", "requestId"], events: ["businessId", "requestId", "providerId"], outbox: ["businessId", "key", "state"], media: ["businessId"], audits: ["businessId", "requestId"], refunds: ["businessId", "requestId", "paymentId", "state"] };
                            const clauses = entries.map(([key, value]) => {
                                if (key === "id" || indexed[table]?.includes(key)) {
                                    if (value === null)
                                        return `"${key}" IS NULL`;
                                    values.push(value);
                                    return `"${key}"=$${values.length}`;
                                }
                                values.push(key);
                                const k = values.length;
                                if (value === null)
                                    return `("document"->>$${k}) IS NULL`;
                                values.push(String(value));
                                return `("document"->>$${k})=$${values.length}`;
                            });
                            return (await sql.$queryRawUnsafe<{
                                document: Tables[K];
                            }[]>(`SELECT "document" FROM "${SQL_TABLES[table]}"${clauses.length ? " WHERE " + clauses.join(" AND ") : ""}`, ...values)).map(r => storedDocument(table, r.document));
                        },
                        async put<K extends Table>(table: K, row: Tables[K]) {
                            const fields = { id: row.id, ...indexedColumns(table, row), document: JSON.stringify(row) }, names = Object.keys(fields), values = Object.values(fields);
                            const placeholders = names.map((key, i) => `$${i + 1}${key === "document" ? "::jsonb" : ""}`);
                            const immutable = ["snapshots", "events", "audits"].includes(table);
                            const update = immutable ? "" : ' ON CONFLICT ("id") DO UPDATE SET ' + names.filter(n => n !== "id").map(n => `"${n}"=EXCLUDED."${n}"`).join(",");
                            await sql.$executeRawUnsafe(`INSERT INTO "${SQL_TABLES[table]}" (${names.map(n => '"' + n + '"').join(",")}) VALUES (${placeholders.join(",")})${update}`, ...values);
                        },
                        async remove(table, id) {
                            if (["snapshots", "events", "audits", "requests", "refunds"].includes(table))
                                throw new AppError("Historical record cannot be deleted", 409);
                            await sql.$executeRawUnsafe(`DELETE FROM "${SQL_TABLES[table]}" WHERE "id"=$1`, id);
                        },
                    };
                    return fn(tx);
                }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 15000 });
            }
            catch (error) {
                if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034" && attempt < 2)
                    continue;
                throw error;
            }
        }
        throw new AppError("Transaction retry exhausted", 503);
    }
}
