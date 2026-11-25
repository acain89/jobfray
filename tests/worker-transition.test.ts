import test from "node:test";
import assert from "node:assert/strict";
import { nonfinancialWorker } from "../lib/core/worker-transition";
import { MemoryRepository } from "../lib/core/repository";
import { validateConfiguration } from "../lib/core/configuration";
import { createRequire } from "node:module";
import { POST } from "../app/api/worker/route";
const { createWorker } = createRequire(import.meta.url)("../workers/jobfray-ingress.mjs");
const accepted = { JOBFRAY_WORKER_MODE: "nonfinancial", JOBFRAY_PRODUCTION_PROVIDERS: "1", JOBFRAY_PROVIDER_OPERATIONS_ENABLED: "1", JOBFRAY_RELEASE_PROVIDERS_VERIFIED: "1", JOBFRAY_CHECKOUT_ENABLED: "0" };
const key = "synthetic-transition-key-".repeat(3);

test("notification-only worker requires every independent opt-in before touching persistence or providers", async () => {
    const repo = new MemoryRepository(); let sent = 0;
    for (const field of ["JOBFRAY_WORKER_MODE", "JOBFRAY_PRODUCTION_PROVIDERS", "JOBFRAY_PROVIDER_OPERATIONS_ENABLED", "JOBFRAY_RELEASE_PROVIDERS_VERIFIED"])
        await assert.rejects(nonfinancialWorker(repo, { send: async () => { sent++; } }, { ...accepted, [field]: "0" }), /not authorized/);
    assert.equal(sent, 0);
    assert.throws(() => validateConfiguration({ JOBFRAY_WORKER_MODE: "typo" }), /worker mode/);
});

test("notification-only worker can deliver a synthetic outbox item with Checkout off and no payment or cleanup operations", async () => {
    const repo = new MemoryRepository(), now = new Date("2026-11-24T00:00:00Z");
    await repo.transaction([], tx => tx.put("outbox", { id: "synthetic", businessId: null, key: "synthetic-only", destination: "owner@example.test", channel: "EMAIL", kind: "TEST", body: "synthetic", state: "PENDING", attempts: 0, availableAt: now.toISOString(), leaseUntil: null }));
    const original = repo.transaction.bind(repo);
    repo.transaction = (locks, fn) => original(locks, tx => fn(new Proxy(tx, { get(target, property) {
        const value = Reflect.get(target, property);
        if (typeof value !== "function") return value;
        return (...args: unknown[]) => { assert.equal(args[0], "outbox", "notification-only worker must not touch payment, refund or cleanup tables"); return Reflect.apply(value, target, args); };
    } })));
    let sent = 0;
    const result = await nonfinancialWorker(repo, { send: async () => { sent++; } }, accepted, now);
    assert.equal(sent, 1); assert.equal(result.mode, "nonfinancial"); assert.equal(result.financialOperationsExecuted, false); assert.equal(result.mutationsExecuted, true);
    assert.equal((await repo.transaction([], tx => tx.get("outbox", "synthetic")))?.state, "SENT");
});

test("staged scheduler notification-only mode survives re-entry while other modes and bad credentials stay in maintenance", async () => {
    const env = { ACCEPTANCE_ENABLED: "0", SCHEDULER_ENABLED: "1", SCHEDULER_MODE: "nonfinancial", JOBFRAY_WORKER_KEY: key, JOBFRAY_EDGE_SECRET: key, ROUTING_MODE: "maintenance" };
    let calls = 0;
    const worker = createWorker(async (request: Request): Promise<Response> => {
        calls++;
        assert.equal(request.headers.get("x-jobfray-worker-mode"), "nonfinancial");
        if (calls === 1) { const inbound = new Request(request); inbound.headers.set("cf-connecting-ip", "203.0.113.8"); Object.defineProperty(inbound, "cf", { value: { colo: "TEST" } }); return worker.fetch(inbound, env); }
        return Response.json({ mode: "nonfinancial", financialOperationsExecuted: false, mutationsExecuted: true });
    });
    await worker.scheduled({}, env); assert.equal(calls, 2);
    const rejected: Array<[string, string]> = [["full", key], ["read_only", key], ["nonfinancial", "forged"]];
    for (const [mode, auth] of rejected) {
        const request = new Request("https://jobfray.com/api/worker", { method: "POST", headers: { Authorization: "Bearer " + auth, "x-jobfray-worker-mode": mode } });
        assert.equal((await worker.fetch(request, env)).status, 503);
    }
});

test("authenticated worker route selects notification-only execution with Checkout disabled and never reaches financial services", async () => {
    const settings = { ...accepted, JOBFRAY_WORKER_KEY: key };
    const before = Object.fromEntries(Object.keys(settings).map(name => [name, process.env[name]]));
    const previousRuntime = Object.getOwnPropertyDescriptor(globalThis, "jobfrayRuntime");
    Object.assign(process.env, settings);
    Object.defineProperty(globalThis, "jobfrayRuntime", { configurable: true, writable: true, value: Promise.resolve({
        repo: new MemoryRepository(), notifications: { send: async () => { throw new Error("No queued notification expected"); } }, sandbox: false,
        get paymentOperations() { throw new Error("Financial service accessed"); },
        get booking() { throw new Error("Booking reconciliation accessed"); },
        get storage() { throw new Error("Media cleanup accessed"); },
    }) });
    try {
        const response = await POST(new Request("https://jobfray.com/api/worker", { method: "POST", headers: { Authorization: "Bearer " + key, "x-jobfray-worker-mode": "nonfinancial" } }));
        const value = await response.json();
        assert.equal(response.status, 200); assert.equal(value.mode, "nonfinancial"); assert.equal(value.financialOperationsExecuted, false);
        assert.equal(value.notificationAttempts, 0); assert.equal(value.mutationsExecuted, false);
    } finally {
        for (const [name, value] of Object.entries(before)) { if (value === undefined) delete process.env[name]; else process.env[name] = value; }
        if (previousRuntime) Object.defineProperty(globalThis, "jobfrayRuntime", previousRuntime); else Reflect.deleteProperty(globalThis, "jobfrayRuntime");
    }
});
