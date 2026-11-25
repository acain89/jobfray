import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { requireTrustedIngress } from "../lib/core/ingress";
import { NextRequest } from "next/server";
import { proxy } from "../proxy";
const { createWorker, validClientIP } = createRequire(import.meta.url)("../workers/jobfray-ingress.mjs");
const edge = "synthetic-ingress-".repeat(4);
const env = { NODE_ENV: "production", JOBFRAY_EDGE_SECRET: edge, JOBFRAY_PUBLIC_ORIGIN: "https://jobfray.com", JOBFRAY_BASE_HOST: "jobfray.com" };
const assertion = { "x-jf-edge-secret": edge, "x-jf-client-ip": "203.0.113.8" };
function cfRequest(url: string, init: RequestInit = {}) { const request = new Request(url, init); Object.defineProperty(request, "cf", { value: { colo: "TEST" } }); return request; }
test("global production ingress blocks origin bypass on documents, APIs, webhooks and assets", () => {
    for (const path of ["/", "/admin", "/confirmation?token=private", "/api/core", "/api/worker", "/api/stripe/webhook", "/media/private", "/_next/static/app.js", "/api/health/extra"]) {
        assert.throws(() => requireTrustedIngress(new Request("https://jobfray.com" + path), env), /Trusted ingress/);
        assert.throws(() => requireTrustedIngress(new Request("https://jobfray.com" + path, { headers: { ...assertion, "x-jf-edge-secret": "forged", "x-forwarded-for": "203.0.113.8" } }), env), /Trusted ingress/);
        assert.doesNotThrow(() => requireTrustedIngress(new Request("https://jobfray.com" + path, { headers: assertion }), env));
    }
    assert.throws(() => requireTrustedIngress(new Request("https://jobfray.com", { headers: assertion }), { ...env, JOBFRAY_EDGE_SECRET: undefined }), /Trusted ingress/);
});
test("health is a read-only exception; authenticated ingress rejects unexpected or reserved hosts", () => {
    for (const method of ["GET", "HEAD"]) assert.doesNotThrow(() => requireTrustedIngress(new Request("https://jobfray.onrender.com/api/health", { method }), env));
    assert.throws(() => requireTrustedIngress(new Request("https://jobfray.com/api/health", { method: "POST" }), env), /Trusted ingress/);
    for (const host of ["jobfray.onrender.com", "jobfray.com.evil.test", "nested.biz.jobfray.com", "admin.jobfray.com"]) assert.throws(() => requireTrustedIngress(new Request("https://" + host, { headers: assertion }), env), /Invalid request host/);
    for (const host of ["jobfray.com", "www.jobfray.com", "sample-business.jobfray.com"]) assert.doesNotThrow(() => requireTrustedIngress(new Request("https://" + host, { headers: assertion }), env));
});
test("local sandbox remains local; malformed or spoofed IP assertions cannot authenticate", () => {
    assert.doesNotThrow(() => requireTrustedIngress(new Request("http://127.0.0.1/"), { ...env, JOBFRAY_PUBLIC_ORIGIN: "http://127.0.0.1:3000", JOBFRAY_SANDBOX: "1", JOBFRAY_LOCAL_TEST: "1" }));
    for (const ip of ["203.0.113.8, 127.0.0.1", "999.1.1.1", "evil", ""]) assert.throws(() => requireTrustedIngress(new Request("https://jobfray.com", { headers: { ...assertion, "x-jf-client-ip": ip } }), env), /Trusted ingress/);
});
test("maintenance cannot forward obsolete app traffic even with spoofed release or auth headers", async () => {
    let calls = 0; const worker = createWorker(async () => { calls++; return new Response("obsolete"); });
    for (const mode of [undefined, "maintenance", "LIVE", "unknown"]) {
        const response = await worker.fetch(cfRequest("https://business.jobfray.com/api/core", { method: "POST", body: "secret", headers: { ...assertion, "x-jf-routing-mode": "live" } }), { JOBFRAY_EDGE_SECRET: edge, ROUTING_MODE: mode });
        assert.equal(response.status, 503); assert.match(response.headers.get("cache-control") ?? "", /no-store/); assert(!((await response.text()).includes("obsolete")));
    }
    assert.equal(calls, 0);
});
test("worker canonical redirects preserve method semantics and path/query without origin access", async () => {
    const worker = createWorker(() => { throw Error("must not fetch"); });
    for (const [from, to] of [["http://jobfray.com/path?q=1", "https://jobfray.com/path?q=1"], ["https://www.jobfray.com/path?q=1", "https://jobfray.com/path?q=1"], ["http://business.jobfray.com/", "https://business.jobfray.com/"]]) {
        const request = new Request(from!, { method: "POST", body: "unchanged" }); const response = await worker.fetch(request, {}); assert.equal(response.status, 308); assert.equal(response.headers.get("location"), to); assert.equal(await request.text(), "unchanged");
    }
});
test("worker strips forged assertions, trusts Cloudflare IP metadata and streams exact webhook bytes", async () => {
    const raw = Buffer.from('{ "type": "synthetic.local.test", "text": "é", "space":  1 }\r\n', "utf8");
    let called = false;
    const worker = createWorker(async (request: Request, options: { cache: string; cf: { cacheTtl: number } }) => {
        called = true; assert.equal(request.url, "https://sample-business.jobfray.com/api/stripe/webhook?q=1"); assert.equal(request.method, "POST");
        assert.deepEqual(Buffer.from(await request.arrayBuffer()), raw); assert.equal(request.headers.get("stripe-signature"), "synthetic-preserve-verbatim");
        assert.equal(request.headers.get("x-jf-edge-secret"), edge); assert.equal(request.headers.get("x-jf-client-ip"), "203.0.113.7"); assert.equal(request.headers.get("x-jf-admin"), null); assert.equal(request.headers.get("forwarded"), null);
        assert.equal(request.headers.get("host"), "sample-business.jobfray.com"); assert.equal(request.headers.get("x-forwarded-host"), "sample-business.jobfray.com"); assert.equal(request.headers.get("x-forwarded-for"), "203.0.113.7");
        assert.equal(request.headers.get("authorization"), "Bearer synthetic-worker-auth"); assert.equal(request.headers.get("cookie"), "synthetic=session"); assert.equal(request.redirect, "manual"); assert.equal(options.cache, "no-store"); assert.equal(options.cf.cacheTtl, -1);
        return new Response("ok", { headers: { "Cache-Control": "public, max-age=3600", "Set-Cookie": "session=synthetic; Secure", "x-jf-edge-secret": "must-not-leak" } });
    });
    const request = cfRequest("https://sample-business.jobfray.com/api/stripe/webhook?q=1", { method: "POST", body: raw, headers: { "cf-connecting-ip": "203.0.113.7", "x-jf-edge-secret": "forged", "x-jf-client-ip": "192.0.2.1", "x-jf-admin": "forged", "forwarded": "for=192.0.2.1", "x-forwarded-host": "evil.test", "x-forwarded-for": "192.0.2.1", "stripe-signature": "synthetic-preserve-verbatim", "authorization": "Bearer synthetic-worker-auth", "cookie": "synthetic=session" } });
    const response = await worker.fetch(request, { ROUTING_MODE: "live", JOBFRAY_EDGE_SECRET: edge });
    assert(called); assert.equal(response.status, 200); assert.match(response.headers.get("cache-control"), /private, no-store/); assert.equal(response.headers.get("cdn-cache-control"), "no-store"); assert.equal(response.headers.get("x-jf-edge-secret"), null); assert.equal(response.headers.get("set-cookie"), "session=synthetic; Secure");
});
test("worker fails closed on missing Cloudflare metadata, malformed IP, bad host or origin failure", async () => {
    const worker = createWorker(() => { throw Error("private upstream details"); });
    assert.equal((await worker.fetch(new Request("https://jobfray.com", { headers: { "cf-connecting-ip": "203.0.113.1" } }), { ROUTING_MODE: "live", JOBFRAY_EDGE_SECRET: edge })).status, 403);
    assert.equal((await worker.fetch(cfRequest("https://jobfray.com", { headers: { "cf-connecting-ip": "203.0.113.1,192.0.2.1" } }), { ROUTING_MODE: "live", JOBFRAY_EDGE_SECRET: edge })).status, 403);
    for (const host of ["notjobfray.com", "a.b.jobfray.com", "mail.jobfray.com"]) assert.equal((await worker.fetch(cfRequest("https://" + host), {})).status, 404);
    const response = await worker.fetch(cfRequest("https://jobfray.com", { headers: { "cf-connecting-ip": "2001:db8::1" } }), { ROUTING_MODE: "live", JOBFRAY_EDGE_SECRET: edge }); assert.equal(response.status, 502); assert(!((await response.text()).includes("private upstream")));
    for (const value of ["203.0.113.1", "2001:db8::1", "::ffff:203.0.113.1"]) assert(validClientIP(value));
    for (const value of ["999.1.1.1", "1.1.1.1,2.2.2.2", "fe80::1%eth0", "evil"]) assert(!validClientIP(value));
});
test("Next proxy does not consume raw webhook body", async () => {
    const raw = '{ "bytes": "é" }\r\n'; const request = new NextRequest("https://jobfray.com/api/stripe/webhook", { method: "POST", body: raw });
    proxy(request); assert.equal(request.bodyUsed, false); assert.equal(await request.text(), raw);
});
