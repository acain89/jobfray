import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fixture, input, now } from "./provider-fixtures";
import { MemoryRepository } from "../lib/core/repository";
import { PaymentOperations } from "../lib/core/payment-operations";
import { StripeAdapter } from "../lib/integrations/stripe";
import { BookingService } from "../lib/core/booking";
import { financialWorker, FINANCIAL_WORKER_ID } from "../lib/core/financial-worker";
import { POST } from "../app/api/worker/route";
const { createWorker } = createRequire(import.meta.url)("../workers/jobfray-ingress.mjs");
const accepted = { JOBFRAY_WORKER_MODE: "financial", JOBFRAY_DATABASE_ENABLED: "1", JOBFRAY_RELEASE_DB_VERIFIED: "1", JOBFRAY_PRODUCTION_PROVIDERS: "1", JOBFRAY_PROVIDER_OPERATIONS_ENABLED: "1", JOBFRAY_RELEASE_PROVIDERS_VERIFIED: "1", JOBFRAY_REFUND_PROCESSING_ENABLED: "1", JOBFRAY_CHECKOUT_ENABLED: "0" };
const at = new Date(now.getTime() + 960000);
async function refundFixture() {
    const f = await fixture(), checkout = await f.service.checkout(input(f), f.capability, "refund-test", now, "synthetic-browser-capability-binding");
    const intent = await f.service.intent(checkout.requestId, checkout.confirmationToken, now), event = f.payments.event(intent);
    await f.service.paymentEvent(event.payload, event.signature, at);
    const row = (await f.repo.transaction([], tx => tx.find("refunds", { requestId: checkout.requestId })))[0]!;
    return { ...f, checkout, row };
}
const adapter = (methods: Partial<StripeAdapter>) => methods as StripeAdapter;

test("concurrent refund workers claim one lease, preserve stable key and poll the saved refund rather than recreate it", async () => {
    const f = await refundFixture(); let creates = 0, reads = 0, unblock!: () => void, began!: () => void;
    const started = new Promise<void>(r => { began = r; }), barrier = new Promise<void>(r => { unblock = r; });
    const keys: string[] = [];
    const stripe = adapter({ refund: async (payment, key) => { creates++; keys.push(key); assert.equal(payment, f.row.paymentId); began(); await barrier; return { id: "re_owned", state: "pending", amountCents: 200 }; }, refundStatus: async id => { reads++; assert.equal(id, "re_owned"); return { id, paymentId: f.row.paymentId, state: "succeeded", amountCents: 200 }; } });
    const ops = new PaymentOperations(f.repo, stripe, f.service);
    const first = ops.run(at); await started;
    await ops.run(at); assert.equal(creates, 1); unblock(); await first;
    await ops.run(at); assert.equal(creates, 1); assert.equal(reads, 0);
    await ops.run(new Date(at.getTime() + 120000));
    assert.equal(reads, 1); assert.equal(creates, 1); assert.equal(keys.length, 1);
    assert.equal((await f.repo.transaction([], tx => tx.get("refunds", f.row.id)))?.state, "REFUNDED");
});

test("refund failure backs off, retries the same idempotency key and stops after twenty attempts", async () => {
    const f = await refundFixture(); const keys: string[] = [];
    const ops = new PaymentOperations(f.repo, adapter({ refund: async (_id, key) => { keys.push(key); throw Error("simulated timeout"); } }), f.service);
    await ops.run(at); await ops.run(at); assert.equal(keys.length, 1);
    await ops.run(new Date(at.getTime() + 120000)); assert.equal(keys.length, 2); assert.equal(keys[0], keys[1]);
    await f.repo.transaction([], async tx => { const o = (await tx.get("operations", "refund-operation:" + f.row.id))!; await tx.put("operations", { ...o, attempts: 19, availableAt: at.toISOString() }); });
    await ops.run(new Date(at.getTime() + 180000)); await ops.run(new Date(at.getTime() + 7200000));
    assert.equal(keys.length, 3);
    assert.equal((await f.repo.transaction([], tx => tx.get("refunds", f.row.id)))?.state, "FAILED");
});

test("refund rejects unauthorized reasons and provider creation beyond the idempotency safety window", async () => {
    for (const mode of ["unauthorized", "expired"] as const) {
        const f = await refundFixture(); let calls = 0;
        await f.repo.transaction([], async tx => { if (mode === "unauthorized") await tx.put("refunds", { ...f.row, reason: "UNAPPROVED_MANUAL_REFUND" }); else await tx.put("operations", { id: "refund-operation:" + f.row.id, businessId: f.row.businessId, kind: "REFUND", state: "PENDING", attempts: 1, availableAt: at.toISOString(), leaseUntil: null, payload: { startedAt: new Date(at.getTime() - 23 * 3600000 - 1000).toISOString() } }); });
        await new PaymentOperations(f.repo, adapter({ refund: async () => { calls++; throw Error("forbidden"); } }), f.service).run(at);
        assert.equal(calls, 0); assert.equal((await f.repo.transaction([], tx => tx.get("refunds", f.row.id)))?.state, "FAILED");
    }
});

test("refund lease fencing ignores a stale provider result and crash recovery reuses the same key", async () => {
    const f = await refundFixture(); const keys: string[] = []; let stolen = false;
    const ops = new PaymentOperations(f.repo, adapter({ refund: async (_id, key) => { keys.push(key); if (!stolen) { stolen = true; await f.repo.transaction([], async tx => { const o = (await tx.get("operations", "refund-operation:" + f.row.id))!; await tx.put("operations", { ...o, leaseToken: "new-owner" }); }); } return { id: "re_same", state: "succeeded", amountCents: 200 }; } }), f.service);
    await ops.run(at); assert.equal((await f.repo.transaction([], tx => tx.get("refunds", f.row.id)))?.providerId, undefined);
    await ops.run(new Date(at.getTime() + 61000));
    assert.equal(keys.length, 2); assert.equal(keys[0], keys[1]); assert.equal((await f.repo.transaction([], tx => tx.get("refunds", f.row.id)))?.state, "REFUNDED");
});

test("duplicate refund rows cannot issue separate provider refunds for one payment", async () => {
    const f = await refundFixture(); let creates = 0;
    await f.repo.transaction([], tx => tx.put("refunds", { ...f.row, id: "zz-duplicate", createdAt: new Date(at.getTime() + 1).toISOString() }));
    await new PaymentOperations(f.repo, adapter({ refund: async () => { creates++; return { id: "re_once", state: "succeeded", amountCents: 200 }; } }), f.service).run(at);
    assert.equal(creates, 1); assert.equal((await f.repo.transaction([], tx => tx.get("refunds", "zz-duplicate")))?.state, "FAILED");
});

test("payment attempts exhausted by interruptions fail closed before another provider call", async () => {
    const repo = new MemoryRepository(); let calls = 0;
    await repo.transaction([], tx => tx.put("operations", { id: "interrupted", businessId: null, kind: "PAYMENT_EVENT", state: "RUNNING", attempts: 20, leaseUntil: now.toISOString(), availableAt: now.toISOString(), payload: { objectId: "cs_owned" } }));
    await new PaymentOperations(repo, adapter({ status: async () => { calls++; throw Error("forbidden"); } }), {} as BookingService).run(at);
    assert.equal(calls, 0); assert.equal((await repo.transaction([], tx => tx.get("operations", "interrupted")))?.state, "FAILED");
});

test("financial mode runs with Checkout off, gates refunds independently and excludes retention/media work", async () => {
    const f = await fixture(); const held = await f.service.checkout(input(f), f.capability, "expired-no-payment", now, "synthetic-browser-capability-binding");
    const calls: unknown[] = [];
    const ops = { run: async (_at: Date, options: unknown) => { calls.push(options); return { operations: 0, refunds: 0 }; } } as PaymentOperations;
    const result = await financialWorker(f.repo, ops, f.service, { send: async () => {} }, { ...accepted, JOBFRAY_REFUND_PROCESSING_ENABLED: "0" }, at, { source: "cron", scheduledAt: at.toISOString(), commit: "reviewed" });
    assert.equal(result.mode, "financial"); assert.equal(result.financialOperationsExecuted, true); assert.deepEqual(calls, [{ limit: 5, processRefunds: false }]);
    assert.equal((await f.repo.transaction([], tx => tx.get("requests", held.requestId)))?.status, "EXPIRED");
    assert.equal((await f.repo.transaction([], tx => tx.find("allocations", { requestId: held.requestId })))[0]?.status, "RELEASED");
    assert.equal((await f.repo.transaction([], tx => tx.get("operations", FINANCIAL_WORKER_ID)))?.payload.source, "cron");
});

test("expired-hold cleanup has a global batch cap and does not double-count a rolled-back transaction retry", async () => {
    const f = await fixture();
    for (let i = 0; i < 3; i++) await f.service.checkout(input(f), f.capability, "bounded-expiry-" + i, now, "synthetic-browser-capability-binding");
    const original = f.repo.transaction.bind(f.repo); let retried = false;
    f.repo.transaction = async (locks, fn) => {
        if (!retried && locks.includes("tenant:" + f.business.id)) {
            retried = true;
            await assert.rejects(original(locks, async tx => { await fn(tx); throw Error("simulated transaction rollback"); }));
        }
        return original(locks, fn);
    };
    assert.equal(await f.service.reconcile(at, 2), 2);
    assert.equal((await f.repo.transaction([], tx => tx.find("requests", { status: "EXPIRED" }))).length, 2);
    assert.equal(await f.service.reconcile(at, 2), 1); assert.equal(await f.service.reconcile(at, 2), 0);
});

test("financial mode denies missing release gates, serializes concurrent runs and recovers after a crashed lease", async () => {
    const repo = new MemoryRepository(); let calls = 0, unblock!: () => void, began!: () => void;
    const barrier = new Promise<void>(r => { unblock = r; }), started = new Promise<void>(r => { began = r; });
    const ops = { run: async () => { calls++; began(); await barrier; return { operations: 0, refunds: 0 }; } } as unknown as PaymentOperations;
    const booking = { reconcile: async () => 0 } as unknown as BookingService;
    for (const field of ["JOBFRAY_WORKER_MODE", "JOBFRAY_DATABASE_ENABLED", "JOBFRAY_RELEASE_DB_VERIFIED", "JOBFRAY_PRODUCTION_PROVIDERS", "JOBFRAY_PROVIDER_OPERATIONS_ENABLED", "JOBFRAY_RELEASE_PROVIDERS_VERIFIED"]) await assert.rejects(financialWorker(repo, ops, booking, { send: async () => {} }, { ...accepted, [field]: "0" }, now), /not authorized/);
    const first = financialWorker(repo, ops, booking, { send: async () => {} }, accepted, now); await started;
    const concurrent = await financialWorker(repo, ops, booking, { send: async () => {} }, accepted, now); assert.equal(concurrent.skipped, true); assert.equal(calls, 1); unblock(); await first;
    await repo.transaction([], async tx => { const row = (await tx.get("operations", FINANCIAL_WORKER_ID))!; await tx.put("operations", { ...row, state: "RUNNING", leaseUntil: now.toISOString() }); });
    await financialWorker(repo, ops, booking, { send: async () => {} }, accepted, at); assert.equal(calls, 2);
});

test("failed financial run records sanitized durable failure and permits a later retry", async () => {
    const repo = new MemoryRepository(); let fail = true;
    const ops = { run: async () => { if (fail) throw Error("private detail"); return { operations: 0, refunds: 0 }; } } as unknown as PaymentOperations;
    const booking = { reconcile: async () => 0 } as unknown as BookingService;
    await assert.rejects(financialWorker(repo, ops, booking, { send: async () => {} }, accepted, now));
    assert.equal((await repo.transaction([], tx => tx.get("operations", FINANCIAL_WORKER_ID)))?.payload.failure, "FINANCIAL_WORKER_FAILED");
    fail = false; await financialWorker(repo, ops, booking, { send: async () => {} }, accepted, at);
    assert.equal((await repo.transaction([], tx => tx.get("operations", FINANCIAL_WORKER_ID)))?.state, "DONE");
});

test("financial cron carries scheduled timestamp and requires affirmative accepted financial mode", async () => {
    const key = "synthetic-financial-worker-".repeat(3), scheduledTime = now.getTime(); let calls = 0;
    const env = { SCHEDULER_MODE: "financial", SCHEDULER_ENABLED: "1", JOBFRAY_WORKER_KEY: key, JOBFRAY_EDGE_SECRET: key, ROUTING_MODE: "maintenance", ACCEPTANCE_ENABLED: "0" };
    const worker = createWorker(async (request: Request): Promise<Response> => { calls++; assert.equal(request.headers.get("x-jobfray-scheduled-at"), String(scheduledTime)); if (calls === 1) { const inbound = new Request(request); inbound.headers.set("cf-connecting-ip", "203.0.113.9"); Object.defineProperty(inbound, "cf", { value: {} }); return worker.fetch(inbound, env); } return Response.json({ mode: "financial", executionAccepted: true, financialOperationsExecuted: true, commit: "reviewed" }); });
    await worker.scheduled({ scheduledTime }, env); assert.equal(calls, 2);
    await assert.rejects(createWorker(async () => Response.json({ mode: "read_only", financialOperationsExecuted: false })).scheduled({ scheduledTime }, env), /acceptance failed/);
});

test("authenticated deployed worker route selects financial processing with public Checkout off and no media access", async () => {
    const key = "synthetic-financial-auth-".repeat(3), settings = { ...accepted, JOBFRAY_WORKER_KEY: key, RENDER_GIT_COMMIT: "reviewed" };
    const before = Object.fromEntries(Object.keys(settings).map(k => [k, process.env[k]])), previous = Object.getOwnPropertyDescriptor(globalThis, "jobfrayRuntime");
    let ran = 0;
    Object.assign(process.env, settings);
    Object.defineProperty(globalThis, "jobfrayRuntime", { configurable: true, writable: true, value: Promise.resolve({ repo: new MemoryRepository(), sandbox: false,
        paymentOperations: { run: async (_now: Date, options: { processRefunds: boolean }) => { ran++; assert.equal(options.processRefunds, true); return { operations: 0, refunds: 0 }; } },
        booking: { reconcile: async () => 0 }, notifications: { send: async () => {} }, get storage() { throw Error("Media cleanup is forbidden"); },
    }) });
    try {
        const headers = { Authorization: "Bearer " + key, "x-jobfray-worker-mode": "financial", "x-jobfray-scheduled-at": String(now.getTime()) };
        const response = await POST(new Request("https://jobfray.com/api/worker", { method: "POST", headers }));
        const result = await response.json(); assert.equal(response.status, 200); assert.equal(result.mode, "financial"); assert.equal(result.commit, "reviewed"); assert.equal(ran, 1);
        assert.equal((await POST(new Request("https://jobfray.com/api/worker", { method: "POST", headers: { ...headers, Authorization: "Bearer forged" } }))).status, 403); assert.equal(ran, 1);
    } finally {
        for (const [k, v] of Object.entries(before)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
        if (previous) Object.defineProperty(globalThis, "jobfrayRuntime", previous); else Reflect.deleteProperty(globalThis, "jobfrayRuntime");
    }
});
