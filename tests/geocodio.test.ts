import test from "node:test";
import assert from "node:assert/strict";
import { GeocodioAdapter } from "../lib/integrations/geocodio";
import { providerConfiguration } from "../lib/integrations/configuration";
import { distanceMiles } from "../lib/core/providers";
import { networkTransport, type Transport } from "../lib/integrations/http";
import { fixture, input, now } from "./provider-fixtures";
import { BookingService } from "../lib/core/booking";
import { directory } from "../lib/core/business";

const address = "100 Synthetic Lane, Austin, TX 78701";
const point = { latitude: 30.271, longitude: -97.743 };
function result(kind: "zip" | "address" = "zip") {
    return { address_components: { country: "US", postal_code: "78701", number: "100", street: "Synthetic", city: "Austin", state_province: "TX" },
        location: { lat: point.latitude, lng: point.longitude }, accuracy: 1,
        accuracy_type: kind === "zip" ? "place" : "rooftop", source: "Synthetic fixtures only" };
}
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });
const adapterFor = (value: unknown) => new GeocodioAdapter("synthetic-server-key", async () => json(value));

test("US ZIP uses structured input, explicit country, ambiguity detection and header-only credentials", async () => {
    let calls = 0;
    const adapter = new GeocodioAdapter("synthetic-server-key", async (raw, init) => {
        calls++;
        const url = new URL(raw);
        assert.equal(url.origin + url.pathname, "https://api.geocod.io/v2.1/geocode");
        assert.equal(url.searchParams.get("postal_code"), "78701");
        assert.equal(url.searchParams.get("country"), "USA");
        assert.equal(url.searchParams.get("limit"), "2");
        assert.equal(url.searchParams.get("api_key"), null);
        assert.equal(url.searchParams.get("fields"), null);
        assert.equal((init.headers as Record<string, string>).Authorization, "Bearer synthetic-server-key");
        assert.equal(init.redirect, "error");
        return json({ results: [result()] });
    });
    const first = await adapter.zip("78701");
    assert.deepEqual(first, point);
    first.latitude = 0;
    assert.deepEqual(await adapter.zip("78701"), point);
    assert.equal(calls, 1);
});

test("ZIP cache expires after 24 hours and evicts at 256 entries", async () => {
    let time = 1000, calls = 0;
    const adapter = new GeocodioAdapter("synthetic", async raw => {
        calls++; const data = result(); data.address_components.postal_code = new URL(raw).searchParams.get("postal_code")!;
        return json({ results: [data] });
    }, () => time);
    await adapter.zip("78701"); time += 86400000; await adapter.zip("78701");
    assert.equal(calls, 2);
    for (let i = 0; i < 256; i++) await adapter.zip(String(10000 + i));
    await adapter.zip("78701"); assert.equal(calls, 259);
});

test("private addresses are sent alone, never cached, and only the existing point shape is returned", async () => {
    let calls = 0;
    const adapter = new GeocodioAdapter("synthetic", async (raw) => {
        calls++; const url = new URL(raw);
        assert.equal(url.searchParams.get("q"), address);
        assert.equal(url.searchParams.get("country"), "USA");
        assert.deepEqual([...url.searchParams.keys()].sort(), ["country", "limit", "q"]);
        return json({ results: [result("address")] });
    });
    assert.deepEqual(await adapter.address(address), point);
    assert.deepEqual(await adapter.address(address), point);
    assert.equal(calls, 2);
});

test("invalid inputs are rejected without transport", async () => {
    let calls = 0;
    const adapter = new GeocodioAdapter("synthetic", async () => { calls++; return json({}); });
    for (const zip of ["7870", "78701-1234", " 78701", "ABCDE", "78701\n"])
        await assert.rejects(adapter.zip(zip));
    for (const input of ["short", "https://evil.test/private", "x".repeat(251), address + "\n"])
        await assert.rejects(adapter.address(input));
    assert.equal(calls, 0);
    for (const key of ["", "PLACEHOLDER", "key\nvalue"]) assert.throws(() => new GeocodioAdapter(key));
});

test("empty and multiple results fail closed, including multiple high-quality candidates", async () => {
    for (const value of [{ results: [] }, { results: [result(), result()] }, { results: null }, {}])
        await assert.rejects(adapterFor(value).zip("78701"), /ambiguous/);
});

test("foreign, malformed, non-finite, reversed/out-of-range and mismatching ZIP results are rejected", async () => {
    const variants = [
        { ...result(), address_components: { ...result().address_components, country: "CA" } },
        { ...result(), address_components: { ...result().address_components, postal_code: "10001" } },
        { ...result(), location: { lat: 91, lng: 0 } }, { ...result(), location: { lat: 0, lng: -181 } },
        { ...result(), location: { lat: -97.743, lng: 30.271 } },
        { ...result(), location: { lat: "30.271", lng: -97.743 } },
        { ...result(), location: { lat: null, lng: -97.743 } },
        { ...result(), accuracy: 1.1 }, { ...result(), accuracy: 0.89 },
        { ...result(), accuracy_type: "county" }, { ...result(), address_components: null },
    ];
    for (const data of variants) await assert.rejects(adapterFor({ results: [data] }).zip("78701"));
});

test("street centroids and nearest matches cannot authorize a service address", async () => {
    for (const type of ["place", "county", "state", "street_center", "nearest_rooftop_match", "intersection"]) {
        const data = result("address"); data.accuracy_type = type;
        await assert.rejects(adapterFor({ results: [data] }).address(address), /Exact address/);
    }
    const missingNumber = result("address"); missingNumber.address_components.number = "";
    await assert.rejects(adapterFor({ results: [missingNumber] }).address(address), /Exact address/);
    const weak = result("address"); weak.accuracy = 0.89;
    await assert.rejects(adapterFor({ results: [weak] }).address(address), /verified/);
    const exactPoint = result("address"); exactPoint.accuracy_type = "point";
    assert.deepEqual(await adapterFor({ results: [exactPoint] }).address(address), point);
    for (const change of [{ accuracy: 0.89 }, { address_components: { ...exactPoint.address_components, number: "" } },
        { address_components: { ...exactPoint.address_components, country: "CA" } }])
        await assert.rejects(adapterFor({ results: [{ ...exactPoint, ...change }] }).address(address));
    await assert.rejects(adapterFor({ results: [exactPoint, exactPoint] }).address(address), /ambiguous/);
    const interpolated = result("address"); interpolated.accuracy_type = "range_interpolation"; interpolated.accuracy = 0.9;
    assert.deepEqual(await adapterFor({ results: [interpolated] }).address(address), point);
});

test("failures do not leak credentials, input addresses or provider response bodies", async () => {
    for (const status of [401, 403, 429, 500]) {
        const adapter = new GeocodioAdapter("synthetic-private-key", async () => json({ error: address + " synthetic-private-key" }, status));
        await assert.rejects(adapter.address(address), error => error instanceof Error &&
            !error.message.includes(address) && !error.message.includes("synthetic-private-key"));
    }
    const bad: Transport = async () => { throw new Error(address + " synthetic-private-key"); };
    await assert.rejects(new GeocodioAdapter("synthetic-private-key", bad).address(address), /Provider transport failed/);
    await assert.rejects(new GeocodioAdapter("synthetic", async () => new Response("not JSON")).zip("78701"), /Invalid provider response/);
    // Exercise the default transport gate without enabling or contacting a provider.
    const old = process.env.JOBFRAY_PROVIDER_OPERATIONS_ENABLED;
    try {
        process.env.JOBFRAY_PROVIDER_OPERATIONS_ENABLED = "0";
        await assert.rejects(networkTransport("https://api.geocod.io/v2.1/geocode", {}), /disabled/);
    } finally {
        if (old === undefined) delete process.env.JOBFRAY_PROVIDER_OPERATIONS_ENABLED;
        else process.env.JOBFRAY_PROVIDER_OPERATIONS_ENABLED = old;
    }
});

test("Geocodio output keeps latitude/longitude ordering and the existing mile-radius function", async () => {
    const origin = await adapterFor({ results: [result()] }).zip("78701");
    assert.equal(distanceMiles(origin, point), 0);
    const near = { latitude: origin.latitude + 0.01, longitude: origin.longitude };
    const far = { latitude: origin.latitude + 1, longitude: origin.longitude };
    assert.ok(distanceMiles(origin, near) < 1);
    assert.ok(distanceMiles(origin, far) > 60);
});

test("real adapter contract preserves private directory ranking and exact mobile service-radius enforcement", async () => {
    const f = await fixture(); let far = false;
    const adapter = new GeocodioAdapter("synthetic", async raw => {
        const isZip = new URL(raw).searchParams.has("postal_code");
        const data = result(isZip ? "zip" : "address");
        if (!isZip && far) data.location.lat += 1;
        return json({ results: [data] });
    });
    const service = new BookingService(f.repo, adapter, f.payments, "synthetic-confirmation-signing-key-123456789");
    const mobile = { ...input(f), fulfillment: "MOBILE" as const, contact: { ...input(f).contact, address } };
    assert.ok(await service.checkout(mobile, f.capability, "geocodio-near", now, "synthetic-browser-capability-binding"));
    far = true;
    await assert.rejects(service.checkout(mobile, f.capability, "geocodio-far", now, "synthetic-browser-capability-binding"), /radius/);
    assert.equal((await f.repo.transaction([], tx => tx.find("requests", {}))).length, 1);
    const list = await directory(f.repo, { text: "One multi-mode", zip: "78701", mode: "SERVICE", fulfillment: "MOBILE" }, adapter);
    assert.equal(list.length, 1);
    assert.equal(list[0]!.distance, 0);
    const serialized = JSON.stringify(list);
    for (const privateValue of [f.business.address, f.business.phone, f.business.email, "latitude", "longitude", "source"])
        assert.ok(!serialized.includes(privateValue));
    const stored = await f.repo.transaction([], tx => tx.get("businesses", f.business.id));
    assert.equal(stored!.latitude, point.latitude); assert.equal(stored!.longitude, point.longitude);
});

test("production configuration requires Geocodio and cannot fall back to legacy Mapbox credentials", () => {
    const env = { JOBFRAY_PUBLIC_ORIGIN: "https://jobfray.test", JOBFRAY_BASE_HOST: "jobfray.test", JOBFRAY_WORKER_KEY: "w".repeat(32),
        JOBFRAY_ADMIN_EMAILS: "admin@example.test", JOBFRAY_PROVIDER_ENV: "staging", STRIPE_SECRET_KEY: "sk_test_synthetic",
        STRIPE_WEBHOOK_SECRETS: "whsec_synthetic", STRIPE_ACCOUNT_ID: "acct_synthetic", STRIPE_INTEGRATION_IDENTIFIER: "synthetic",
        GEOCODIO_API_KEY: "synthetic", JOBFRAY_EDGE_SECRET: "e".repeat(32), RESEND_API_KEY: "synthetic",
        JOBFRAY_EMAIL_FROM: "JF <verify@example.test>", CLOUDINARY_CLOUD_NAME: "synthetic", CLOUDINARY_API_KEY: "synthetic", CLOUDINARY_API_SECRET: "synthetic" };
    assert.equal(providerConfiguration(env).geocodio, "synthetic");
    assert.ok(!("mapbox" in providerConfiguration(env)));
    assert.throws(() => providerConfiguration({ ...env, GEOCODIO_API_KEY: "", MAPBOX_ACCESS_TOKEN: "legacy", MAPBOX_PERMANENT_GEOCODING: "1" }), /GEOCODIO_API_KEY/);
    for (const key of ["PLACEHOLDER", "secret\nvalue"]) assert.throws(() => providerConfiguration({ ...env, GEOCODIO_API_KEY: key }), /GEOCODIO_API_KEY/);
});
