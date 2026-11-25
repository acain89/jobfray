import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import { CloudinaryAdapter } from "../lib/integrations/cloudinary";
const { resendAdminResult, acceptedSchedulerMode } = createRequire(import.meta.url)("../scripts/deployment/control.cjs");

test("Resend sending-only administrative rejection is expected and never claims a successful send", () => {
    const result = resendAdminResult(401, { name: "restricted_api_key", message: "This API key is restricted to only send emails" });
    assert.equal(result.permissionCheck, "sending_only_scope_confirmed");
    assert.equal(result.administrativeAccessRequired, false);
    assert.equal(result.credentialRejected, false);
    assert.equal(result.sendingVerified, false);
});

test("Cloudinary upload, private download and deletion use exact SHA-256 API signatures", async () => {
    const secret = "synthetic-cloudinary-secret", key = "123456789", timestamp = 1700000000;
    const sign = (params: Record<string, string>) => createHash("sha256").update(Object.keys(params).sort().map(k => k + "=" + params[k]).join("&") + secret).digest("hex");
    let deleted = false;
    const adapter = new CloudinaryAdapter("synthetic", key, secret, async (url, init) => {
        if (url.endsWith("/upload")) {
            const body = init.body as FormData;
            const params = { overwrite: "false", public_id: "jobfray/business/image", timestamp: String(timestamp), type: "authenticated" };
            assert.equal(init.method, "POST"); assert.equal(body.get("signature"), sign(params)); assert.equal(body.get("api_key"), key);
            assert.equal(body.get("type"), "authenticated");
            return Response.json({ public_id: params.public_id, type: "authenticated", version: 1, format: "webp" });
        }
        assert.ok(url.endsWith("/image/destroy"));
        const body = new URLSearchParams(String(init.body));
        assert.equal(body.get("signature"), sign({ invalidate: "true", public_id: "jobfray/business/image", timestamp: String(timestamp), type: "authenticated" }));
        deleted = true; return Response.json({ result: "ok" });
    }, () => timestamp * 1000);
    const asset = await adapter.put("business", "image", Buffer.from("synthetic-image"));
    const download = new URL(adapter.url(asset));
    assert.equal(download.pathname, "/v1_1/synthetic/image/download");
    assert.equal(download.searchParams.get("signature"), sign({ expires_at: String(timestamp + 60), format: "webp", public_id: asset.publicId, timestamp: String(timestamp), type: "authenticated" }));
    await adapter.remove(asset); assert.equal(deleted, true);
});

test("Cloudinary never accepts a public upload response as a protected asset", async () => {
    const adapter = new CloudinaryAdapter("synthetic", "123", "synthetic-secret", async () => Response.json({ public_id: "jobfray/business/image", type: "upload", version: 1, format: "webp" }));
    await assert.rejects(adapter.put("business", "image", Buffer.from("synthetic")), /ownership mismatch/);
});

test("Resend invalid credentials remain failures and administrative success does not prove sending", () => {
    assert.equal(resendAdminResult(401, { name: "validation_error", message: "API key is invalid" }).credentialRejected, true);
    assert.equal(resendAdminResult(401, { name: "restricted_api_key", message: "unexpected restriction" }).credentialRejected, true);
    assert.equal(resendAdminResult(200, { data: [] }).sendingVerified, false);
    assert.equal(resendAdminResult(503, {}).permissionCheck, "administrative_read_failed");
});

test("deployment publisher defaults to read-only and cannot publish an unaccepted or financial scheduler mode", () => {
    assert.equal(acceptedSchedulerMode({ env: new Map() }), "read_only");
    assert.throws(() => acceptedSchedulerMode({ schedulerMode: "full", env: new Map() }), /NOT_AUTHORIZED/);
    assert.throws(() => acceptedSchedulerMode({ schedulerMode: "nonfinancial", env: new Map() }), /NOT_ACCEPTED/);
    const values = { JOBFRAY_WORKER_MODE: "nonfinancial", JOBFRAY_PRODUCTION_PROVIDERS: "1", JOBFRAY_PROVIDER_OPERATIONS_ENABLED: "1", JOBFRAY_RELEASE_PROVIDERS_VERIFIED: "1" };
    assert.equal(acceptedSchedulerMode({ schedulerMode: "nonfinancial", env: new Map(Object.entries(values)) }), "nonfinancial");
    for (const key of Object.keys(values)) assert.throws(() => acceptedSchedulerMode({ schedulerMode: "nonfinancial", env: new Map(Object.entries({ ...values, [key]: "0" })) }), /NOT_ACCEPTED/);
});
