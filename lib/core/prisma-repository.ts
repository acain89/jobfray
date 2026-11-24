import { Prisma, PrismaClient } from "@prisma/client";
import type { Table, Tables } from "./model";
import type { Repository, Transaction } from "./repository";
import { SQL_TABLES, indexedColumns, queryLimit } from "./repository";
import { storedDocument } from "./documents";
import { AppError } from "./validation";
/** Construction is side-effect free. Runtime is disabled unless separately configured after DB verification. */
import { indexedDirectory, type DirectoryQuery } from "./discovery";
export class PrismaRepository implements Repository {
    searchDirectory(query: DirectoryQuery) { return indexedDirectory(this.client, query); }
    constructor(private client: PrismaClient, private onRetry: () => void = () => { }) { }
    async transaction<T>(locks: readonly string[], fn: (tx: Transaction) => Promise<T>): Promise<T> {
        for (let attempt = 0; attempt < 8; attempt++) {
            try {
                return await this.client.$transaction(async (sql) => {
                    for (const key of [...new Set(locks)].sort())
                        await sql.$queryRaw `SELECT pg_advisory_xact_lock(hashtextextended(${key},0))::text`;
                    const tx: Transaction = {
                        async count(table, filter) {
                            const columns = new Set(["id", ...Object.keys(indexedColumns(table, {} as Tables[typeof table]))]);
                            const values: unknown[] = [];
                            const clauses = Object.entries(filter).map(([key, value]) => {
                                if (!/^[a-zA-Z][a-zA-Z0-9]*$/.test(key))
                                    throw new AppError("Invalid query field");
                                const expression = columns.has(key) ? `"${key}"` : `("document"->>'${key}')`;
                                if (value === null)
                                    return `${expression} IS NULL`;
                                values.push(columns.has(key) ? value : String(value));
                                return `${expression}=$${values.length}`;
                            });
                            const rows = await sql.$queryRawUnsafe<{
                                count: bigint;
                            }[]>(`SELECT count(*) AS count FROM "${SQL_TABLES[table]}"${clauses.length ? " WHERE " + clauses.join(" AND ") : ""}`, ...values);
                            return Number(rows[0]!.count);
                        },
                        async get<K extends Table>(table: K, id: string) {
                            const rows = await sql.$queryRawUnsafe<{
                                document: Tables[K];
                            }[]>(`SELECT "document" FROM "${SQL_TABLES[table]}" WHERE "id"=$1`, id);
                            return rows[0] ? storedDocument(table, rows[0].document) : null;
                        },
                        async find<K extends Table>(table: K, filter: Partial<Tables[K]>, options?: import("./repository").QueryOptions) {
                            const limit = queryLimit(options);
                            const entries = Object.entries(filter), values: unknown[] = [];
                            const indexed: Partial<Record<Table, string[]>> = { operations: ["businessId", "kind", "state", "availableAt"], push: ["businessId", "accountId", "sessionHash", "endpointHash", "active"], accounts: ["email"], sessions: ["accountId", "tokenHash", "expiresAt"], tokens: ["hash", "purpose", "expiresAt"], businesses: ["ownerId", "slug", "status"], offerings: ["businessId", "resourceId"], resources: ["businessId"], requests: ["businessId", "offeringId", "mode", "status", "idempotencyKey"], allocations: ["businessId", "requestId", "resourceId", "status"], snapshots: ["businessId", "requestId"], events: ["businessId", "requestId", "providerId"], outbox: ["businessId", "key", "state"], media: ["businessId"], audits: ["businessId", "requestId"], refunds: ["businessId", "requestId", "paymentId", "state"] };
                            const clauses = entries.map(([key, value]) => {
                                if (key === "id" || indexed[table]?.includes(key)) {
                                    if (value === null)
                                        return `"${key}" IS NULL`;
                                    values.push(value);
                                    return `"${key}"=$${values.length}`;
                                }
                                if (!/^[a-zA-Z][a-zA-Z0-9]*$/.test(key))
                                    throw new AppError("Invalid query field");
                                if (value === null)
                                    return `("document"->>'${key}') IS NULL`;
                                values.push(String(value));
                                return `("document"->>'${key}')=$${values.length}`;
                            });
                            if (options?.containsPhoto) {
                                values.push(JSON.stringify([options.containsPhoto]));
                                clauses.push(`("document"->'photos') @> $${values.length}::jsonb`);
                            }
                            if (options?.oneOf) {
                                const { field, values: matches } = options.oneOf;
                                if (!/^[a-zA-Z][a-zA-Z0-9]*$/.test(field) || matches.length > 200)
                                    throw new AppError("Invalid query set");
                                const expression = field === "id" || indexed[table]?.includes(field) ? `"${field}"` : `("document"->>'${field}')`;
                                const positions = matches.map(value => { values.push(value); return `$${values.length}`; });
                                clauses.push(positions.length ? `${expression} IN (${positions.join(",")})` : "FALSE");
                            }
                            if (options?.afterId) {
                                if (options.orderBy) {
                                    if (!options.afterValue)
                                        throw new AppError("Invalid query cursor");
                                    values.push(options.afterValue, options.afterId);
                                    clauses.push(`("document"->>'createdAt',"id") < ($${values.length - 1},$${values.length})`);
                                }
                                else {
                                    values.push(options.afterId);
                                    clauses.push(`"id">$${values.length}`);
                                }
                            }
                            const rangeColumns = new Set(Object.keys(indexedColumns(table, {} as Tables[K])));
                            for (const range of options?.ranges ?? []) {
                                // Field names are validated and quoted; no untrusted identifier interpolation.
                                if (!/^[a-zA-Z][a-zA-Z0-9]*$/.test(range.field))
                                    throw new AppError("Invalid query field");
                                const expression = rangeColumns.has(range.field) ? `"${range.field}"` : `("document"->>'${range.field}')`;
                                if (range.operator === "notNull")
                                    clauses.push(`${expression} IS NOT NULL`);
                                else {
                                    const operator = { lt: "<", lte: "<=", gt: ">", gte: ">=", ne: "<>" }[range.operator];
                                    if (!operator || range.value === undefined)
                                        throw new AppError("Invalid query range");
                                    values.push(rangeColumns.has(range.field) && ["start", "end", "expiresAt", "availableAt"].includes(range.field) ? new Date(range.value) : range.value);
                                    clauses.push(`${expression}${operator}$${values.length}`);
                                }
                            }
                            values.push(limit + (options?.limit ? 0 : 1));
                            const rows = await sql.$queryRawUnsafe<{
                                document: Tables[K];
                            }[]>(`SELECT "document" FROM "${SQL_TABLES[table]}"${clauses.length ? " WHERE " + clauses.join(" AND ") : ""} ORDER BY ${options?.orderBy ? `("document"->>'createdAt') DESC,"id" DESC` : '"id"'} LIMIT $${values.length}`, ...values);
                            if (!options?.limit && rows.length > limit)
                                throw new AppError("Collection requires pagination", 503);
                            return rows.map(r => storedDocument(table, r.document));
                        },
                        async put<K extends Table>(table: K, row: Tables[K]) {
                            const fields = { id: row.id, ...indexedColumns(table, row), document: JSON.stringify(row) }, names = Object.keys(fields), values = Object.values(fields);
                            const placeholders = names.map((key, i) => `$${i + 1}${key === "document" ? "::jsonb" : ""}`);
                            const immutable = ["snapshots", "events", "audits"].includes(table);
                            const update = immutable ? "" : ' ON CONFLICT ("id") DO UPDATE SET ' + names.filter(n => n !== "id").map(n => `"${n}"=EXCLUDED."${n}"`).join(",");
                            try {
                                await sql.$executeRawUnsafe(`INSERT INTO "${SQL_TABLES[table]}" (${names.map(n => '"' + n + '"').join(",")}) VALUES (${placeholders.join(",")})${update}`, ...values);
                            }
                            catch (error) {
                                if (immutable && error instanceof Prisma.PrismaClientKnownRequestError && ["23505", "23514"].includes(String(error.meta?.code)))
                                    throw new AppError("Immutable or invalid historical record", 409);
                                throw error;
                            }
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
                if (isRetryableTransactionError(error) && attempt < 7) {
                    this.onRetry();
                    await new Promise(resolve => setTimeout(resolve, Math.min(1000, 25 * 2 ** attempt) + Math.random() * 100));
                    continue;
                }
                throw error;
            }
        }
        throw new AppError("Transaction retry exhausted", 503);
    }
}
/** Raw SQL reports PostgreSQL SQLSTATE inside P2010, unlike Prisma model writes. */
export function isRetryableTransactionError(error: unknown): boolean {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError))
        return false;
    return error.code === "P2034" || error.code === "P2010" && ["40001", "40P01"].includes(String(error.meta?.code));
}
