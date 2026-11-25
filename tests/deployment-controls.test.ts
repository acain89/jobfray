import test from "node:test";
import assert from "node:assert/strict";
import { verifiedDatabaseURL } from "../lib/core/database-acceptance";
import { createRequire } from "node:module";
const { createWorker } = createRequire(import.meta.url)("../workers/jobfray-ingress.mjs");
const key = "synthetic-worker-control-".repeat(3);
const url = "postgresql://jobfray_app:synthetic@dpg-dc2u9qmtlv9c738ork2g-a.oregon-postgres.render.com/jobfray?sslmode=require&sslaccept=strict&schema=public&connection_limit=2&pool_timeout=10&connect_timeout=10";
test("deployment database URL pins restricted identity, verified public TLS and bounded pool", () => {
    const accepted = new URL(verifiedDatabaseURL(url));
    assert.equal(accepted.searchParams.get("sslaccept"), "strict"); assert.equal(accepted.searchParams.get("connection_limit"), "2"); assert.match(accepted.searchParams.get("sslcert")!, /isrg-root-x1.pem$/);
    for (const bad of [url.replace("jobfray_app:", "jobfray_owner:"), url.replace(".oregon-postgres.render.com", ""), url.replace("sslaccept=strict", "sslaccept=accept_invalid_certs"), url.replace("connection_limit=2", "connection_limit=20"), url + "&sslmode=disable", url + "&sslrootcert=arbitrary"]) assert.throws(() => verifiedDatabaseURL(bad));
});
test("maintenance operator channel is authenticated and cannot create customer checkout", async () => {
    let calls = 0; const worker = createWorker(async () => { calls++; return new Response("operator-only"); });
    const request = (pathname: string, method = "POST", auth = key) => { const req = new Request("https://jobfray.com" + pathname, { method, headers: { Authorization: "Bearer " + auth, "cf-connecting-ip": "203.0.113.10" } }); Object.defineProperty(req, "cf", { value: { colo: "TEST" } }); return req; };
    const env = { ACCEPTANCE_ENABLED: "1", JOBFRAY_WORKER_KEY: key, JOBFRAY_EDGE_SECRET: key, ROUTING_MODE: "maintenance" };
    assert.equal((await worker.fetch(request("/api/acceptance", "POST", "forged"), env)).status, 503);
    assert.equal((await worker.fetch(request("/api/core"), env)).status, 503);
    assert.equal((await worker.fetch(request("/api/acceptance"), { ...env, ACCEPTANCE_ENABLED: "0" })).status, 503);
    assert.equal((await worker.fetch(request("/api/acceptance"), env)).status, 200); assert.equal(calls, 1);
});
test("one-minute scheduled handler requests read-only authenticated work and never a payment operation", async () => {
    let calls = 0;
    const worker = createWorker(async (request: Request) => { calls++; assert.equal(request.url, "https://jobfray.com/api/worker"); assert.equal(request.method, "POST"); assert.equal(request.headers.get("authorization"), "Bearer " + key); assert.equal(request.headers.get("x-jobfray-worker-mode"), "read_only"); assert.equal(request.headers.get("x-jf-edge-secret"), key); return Response.json({ mode: "read_only", financialOperationsExecuted: false, mutationsExecuted: false }); });
    await worker.scheduled({}, { SCHEDULER_ENABLED: "0", JOBFRAY_WORKER_KEY: key, JOBFRAY_EDGE_SECRET: key }); assert.equal(calls, 0);
    await worker.scheduled({}, { SCHEDULER_ENABLED: "1", JOBFRAY_WORKER_KEY: key, JOBFRAY_EDGE_SECRET: key }); assert.equal(calls, 1);
});
test("closed maintenance operator channel permits only separately authenticated read-only worker requests", async () => {
    let calls = 0;
    const worker = createWorker(async (request: Request) => { calls++; assert.equal(request.headers.get("x-jf-client-ip"), "203.0.113.10"); assert.equal(request.headers.get("x-jf-edge-secret"), key); assert.equal(request.headers.get("x-jobfray-worker-mode"), "read_only"); return Response.json({ accepted: true }); });
    const env = { ACCEPTANCE_ENABLED: "0", SCHEDULER_ENABLED: "1", JOBFRAY_WORKER_KEY: key, JOBFRAY_EDGE_SECRET: key, ROUTING_MODE: "maintenance" };
    const request = (path = "/api/worker", mode = "read_only", auth = key, method = "POST") => { const value = new Request("https://jobfray.com" + path, { method, headers: { Authorization: "Bearer " + auth, "x-jobfray-worker-mode": mode, "cf-connecting-ip": "203.0.113.10", "x-jf-edge-secret": "forged", "x-jf-client-ip": "127.0.0.1" } }); Object.defineProperty(value, "cf", { value: { colo: "TEST" } }); return value; };
    for (const bad of [request("/api/core"), request("/api/stripe/webhook"), request("/api/worker", "full"), request("/api/worker", "read_only", "forged"), request("/api/worker", "read_only", key, "GET")]) assert.equal((await worker.fetch(bad, env)).status, 503);
    assert.equal((await worker.fetch(request(), { ...env, SCHEDULER_ENABLED: "0" })).status, 503);
    assert.equal((await worker.fetch(request(), env)).status, 200); assert.equal(calls, 1);
});
test("scheduled fetch can re-enter maintenance without opening the operator channel", async () => {
    let calls = 0;
    const env = { ACCEPTANCE_ENABLED: "0", SCHEDULER_ENABLED: "1", JOBFRAY_WORKER_KEY: key, JOBFRAY_EDGE_SECRET: key, ROUTING_MODE: "maintenance" };
    const worker = createWorker(async (request: Request): Promise<Response> => {
        calls++;
        if (calls === 1) { const incoming = new Request(request); incoming.headers.set("cf-connecting-ip", "203.0.113.10"); Object.defineProperty(incoming, "cf", { value: { colo: "TEST" } }); return worker.fetch(incoming, env); }
        assert.equal(request.headers.get("x-jobfray-worker-mode"), "read_only"); assert.equal(request.headers.get("authorization"), "Bearer " + key);
        return Response.json({ mode: "read_only", financialOperationsExecuted: false, mutationsExecuted: false });
    });
    await worker.scheduled({}, env); assert.equal(calls, 2);
});
