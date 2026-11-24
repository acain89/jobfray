import { mkdir, readFile, writeFile, rename, rm, open, stat } from "node:fs/promises";
import { resolve, join, relative, isAbsolute } from "node:path";
import { randomUUID } from "node:crypto";
import type { Table, Tables } from "./model";
import { storedDocument } from "./documents";
import { AppError } from "./validation";
export interface Transaction {
    get<K extends Table>(table: K, id: string): Promise<Tables[K] | null>;
    find<K extends Table>(table: K, filter: Partial<Tables[K]>): Promise<Tables[K][]>;
    put<K extends Table>(table: K, row: Tables[K]): Promise<void>;
    remove<K extends Table>(table: K, id: string): Promise<void>;
}
export interface Repository {
    transaction<T>(locks: readonly string[], fn: (tx: Transaction) => Promise<T>): Promise<T>;
}
type State = {
    [K in Table]: Record<string, Tables[K]>;
};
export const TABLES: Table[] = ["accounts", "sessions", "tokens", "businesses", "offerings", "resources", "requests", "allocations", "snapshots", "events", "outbox", "media", "audits", "refunds", "rates"];
function empty(): State { return Object.fromEntries(TABLES.map(t => [t, {}])) as State; }
function transactionFor(state: State): Transaction {
    return {
        async get(table, id) { return state[table][id] ? storedDocument(table, structuredClone(state[table][id])) : null; },
        async find(table, filter) { return Object.values(state[table]).filter(row => Object.entries(filter).every(([k, v]) => (row as unknown as Record<string, unknown>)[k] === v)).map(row => storedDocument(table, structuredClone(row))); },
        async put(table, row) {
            if ((table === "snapshots" || table === "events" || table === "audits") && state[table][row.id])
                throw new AppError("Immutable record", 409);
            (state[table] as Record<string, Tables[typeof table]>)[row.id] = structuredClone(row);
        },
        async remove(table, id) {
            if (["snapshots", "events", "audits", "requests", "refunds"].includes(table))
                throw new AppError("Historical record cannot be deleted", 409);
            delete state[table][id];
        },
    };
}
/** Test-only transactional repository. Serializes concurrent callbacks and rolls back thrown operations. */
export class MemoryRepository implements Repository {
    private state = empty();
    private queue = Promise.resolve();
    async transaction<T>(_locks: readonly string[], fn: (tx: Transaction) => Promise<T>): Promise<T> {
        let release!: () => void;
        const previous = this.queue;
        this.queue = new Promise<void>(r => release = r);
        await previous;
        try {
            const state = structuredClone(this.state), result = await fn(transactionFor(state));
            this.state = state;
            return result;
        }
        finally {
            release();
        }
    }
}
/** Explicit local sandbox only. Atomic replacement and inter-process lock; never a production DB substitute. */
export class FileRepository implements Repository {
    constructor(private directory: string) {
        const location = relative(resolve(process.cwd(), "artifacts"), resolve(directory));
        if (location.startsWith("..") || isAbsolute(location))
            throw new Error("Sandbox data must remain in this worktree's artifacts directory");
    }
    async transaction<T>(_locks: readonly string[], fn: (tx: Transaction) => Promise<T>): Promise<T> {
        await mkdir(this.directory, { recursive: true });
        const lock = join(this.directory, "transaction.lock"), file = join(this.directory, "state.json");
        let acquired = false;
        for (let i = 0; i < 200; i++) {
            try {
                await mkdir(lock);
                acquired = true;
                await writeFile(join(lock, "owner"), String(process.pid));
                break;
            }
            catch (error) {
                if ((error as NodeJS.ErrnoException).code !== "EEXIST")
                    throw error;
                try {
                    const pid = Number(await readFile(join(lock, "owner"), "utf8"));
                    if (Number.isInteger(pid) && pid > 0) {
                        try {
                            process.kill(pid, 0);
                        }
                        catch (e) {
                            if ((e as NodeJS.ErrnoException).code === "ESRCH")
                                await rm(lock, { recursive: true });
                        }
                    }
                }
                catch {
                    if (Date.now() - (await stat(lock).catch(() => ({ mtimeMs: Date.now() }))).mtimeMs > 300000)
                        throw new AppError("Sandbox lock requires recovery", 503);
                }
                await new Promise(r => setTimeout(r, 25));
            }
        }
        if (!acquired)
            throw new AppError("Storage busy; retry shortly", 503);
        try {
            let state: State;
            try {
                state = JSON.parse(await readFile(file, "utf8")) as State;
            }
            catch (e) {
                if ((e as NodeJS.ErrnoException).code !== "ENOENT")
                    throw e;
                state = empty();
            }
            const result = await fn(transactionFor(state)), temp = join(this.directory, randomUUID() + ".tmp");
            const handle = await open(temp, "wx", 0o600);
            try {
                await handle.writeFile(JSON.stringify(state));
                await handle.sync();
            }
            finally {
                await handle.close();
            }
            await rename(temp, file);
            return result;
        }
        finally {
            await rm(lock, { recursive: true });
        }
    }
}
export const SQL_TABLES: Record<Table, string> = { accounts: "JfAccount", sessions: "JfSession", tokens: "JfToken", businesses: "JfBusiness", offerings: "JfOffering", resources: "JfResource", requests: "JfRequest", allocations: "JfAllocation", snapshots: "JfCheckoutSnapshot", events: "JfPaymentEvent", outbox: "JfOutbox", media: "JfMedia", audits: "JfAudit", refunds: "JfRefund", rates: "JfRateBucket" };
/** Columns are fixed code-owned identifiers. All values, including JSON lookup keys, are bound parameters. */
export function indexedColumns<K extends Table>(table: K, row: Tables[K]): Record<string, unknown> {
    const r = row as unknown as Record<string, unknown>, out: Record<string, unknown> = {};
    const names: Partial<Record<Table, string[]>> = { accounts: ["email"], sessions: ["accountId", "tokenHash", "expiresAt"], tokens: ["hash", "purpose", "expiresAt"], businesses: ["ownerId", "slug", "status"], offerings: ["businessId", "resourceId"], resources: ["businessId", "capacity"], requests: ["businessId", "offeringId", "mode", "status", "idempotencyKey", "payloadHash"], allocations: ["businessId", "requestId", "resourceId", "units", "start", "end", "status", "expiresAt"], snapshots: ["businessId", "requestId", "platformFeeCents", "underlyingSubtotalCents", "pricingPolicyVersion"], events: ["businessId", "requestId", "providerId"], outbox: ["businessId", "key", "state", "availableAt"], media: ["businessId", "expiresAt"], audits: ["businessId", "requestId"], refunds: ["businessId", "requestId", "paymentId", "state"], rates: ["expiresAt"] };
    for (const key of names[table] ?? []) {
        let value = r[key] ?? null;
        if (["start", "end", "expiresAt", "availableAt"].includes(key) && typeof value === "string")
            value = new Date(value);
        if (key === "underlyingSubtotalCents" && typeof value === "number")
            value = BigInt(value);
        out[key] = value;
    }
    return out;
}
