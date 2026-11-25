import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { createRequire } from "node:module";
import { POST } from "../app/api/stripe/webhook/route";
import { StripeAdapter } from "../lib/integrations/stripe";
import { PaymentOperations } from "../lib/core/payment-operations";
import { MemoryRepository } from "../lib/core/repository";
import { requireTrustedIngress } from "../lib/core/ingress";
const { createWorker } = createRequire(import.meta.url)("../workers/jobfray-ingress.mjs");
const edge = "synthetic-webhook-edge-".repeat(3), secret = "whsec_synthetic_webhook_maintenance";
const env = { WEBHOOK_INGRESS_ENABLED: "1", ROUTING_MODE: "maintenance", ACCEPTANCE_ENABLED: "0", JOBFRAY_EDGE_SECRET: edge, JOBFRAY_BASE_HOST: "jobfray.com", JOBFRAY_PUBLIC_ORIGIN: "https://jobfray.com", NODE_ENV: "production" };
const payload = '{ "id":"evt_synthetic_maintenance", "livemode":true, "type":"customer.created", "data":{"object":{"id":"cus_synthetic","description":"é"}} }\r\n';
function incoming(body = payload, headers: Record<string, string> = {}, path = "/api/stripe/webhook", method = "POST") {
    const stamp = Math.floor(Date.now() / 1000);
    const request = new Request("https://jobfray.com" + path, { method, headers: { "content-type": "application/json", "stripe-signature": "t=" + stamp + ",v1=" + createHmac("sha256", secret).update(stamp + "." + payload).digest("hex"), "cf-connecting-ip": "203.0.113.9", "x-jf-edge-secret": "forged", "x-jf-client-ip": "127.0.0.1", ...headers }, ...(method === "POST" ? { body } : {}) });
    Object.defineProperty(request, "cf", { value: { colo: "TEST" } }); return request;
}

test("maintenance callback preserves raw bytes and verifies a genuine-format nonfinancial signature at the origin", async () => {
    const repo = new MemoryRepository(); let calls = 0;
    const stripe = new StripeAdapter({ key: "sk_live_synthetic", account: "acct_synthetic", live: true, origin: "https://jobfray.com", integrationId: "jobfray_checkout_abcdefgh", webhookSecrets: [secret] }, async () => { throw new Error("No provider API call allowed"); });
    const operations = new PaymentOperations(repo, stripe, {} as never);
    const previous = Object.getOwnPropertyDescriptor(globalThis, "jobfrayRuntime"), acceptance = process.env.JOBFRAY_ACCEPTANCE_ENABLED;
    process.env.JOBFRAY_ACCEPTANCE_ENABLED = "0";
    Object.defineProperty(globalThis, "jobfrayRuntime", { configurable: true, writable: true, value: Promise.resolve({ sandbox: false, paymentOperations: operations }) });
    try {
        const worker = createWorker(async (request: Request) => {
            calls++; requireTrustedIngress(request, env);
            assert.equal(request.headers.get("x-jf-edge-secret"), edge); assert.equal(request.headers.get("x-jf-client-ip"), "203.0.113.9");
            return POST(request);
        });
        assert.equal((await worker.fetch(incoming(), env)).status, 200);
        assert.equal((await worker.fetch(incoming(), env)).status, 200);
        assert.equal((await worker.fetch(incoming(payload + " "), env)).status, 403);
        const rows = await repo.transaction([], tx => tx.find("operations", {}));
        assert.equal(rows.length, 1); assert.equal(rows[0]!.state, "DONE"); assert.equal(rows[0]!.kind, "PAYMENT_ALERT");
        assert.equal(rows[0]!.payload.type, "customer.created"); assert.equal(calls, 3);
    } finally {
        if (acceptance === undefined) delete process.env.JOBFRAY_ACCEPTANCE_ENABLED; else process.env.JOBFRAY_ACCEPTANCE_ENABLED = acceptance;
        if (previous) Object.defineProperty(globalThis, "jobfrayRuntime", previous); else Reflect.deleteProperty(globalThis, "jobfrayRuntime");
    }
});

test("webhook maintenance exception never opens customer routes, ignores missing signatures and bounds declared body size", async () => {
    let calls = 0; const worker = createWorker(async () => { calls++; return new Response("origin"); });
    for (const request of [incoming(payload, { "stripe-signature": "" }), incoming(payload, { "content-type": "text/plain" }), incoming(payload, {}, "/api/core"), incoming(payload, {}, "/api/worker"), incoming(payload, {}, "/", "GET"), incoming(payload, {}, "/api/stripe/webhook", "GET")])
        assert.equal((await worker.fetch(request, env)).status, 503);
    assert.equal((await worker.fetch(incoming(), { ...env, WEBHOOK_INGRESS_ENABLED: "0" })).status, 503);
    assert.equal((await worker.fetch(incoming(payload, { "content-length": "1000001" }), env)).status, 413);
    const noMetadata = new Request(incoming());
    assert.equal((await worker.fetch(noMetadata, env)).status, 403);
    assert.equal(calls, 0);
});
