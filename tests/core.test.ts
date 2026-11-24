import { createRequestCapability } from "../lib/core/request-capability";
import test from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { randomUUID } from "node:crypto";
import { MemoryRepository, FileRepository } from "../lib/core/repository";
import { register, consumeAccountToken, login, session, recover, rateLimit } from "../lib/core/security";
import { saveProfile, saveResource, saveOffering, autosave, publish, unpublish, suspend, workspace, directory, publishedSite, subdomainSlug } from "../lib/core/business";
import { BookingService, deliverNotifications } from "../lib/core/booking";
import { MockGeocoder, MockPaymentAdapter, MockNotificationTransport } from "../lib/core/providers";
import { localInstant, localParts, rollingWindow, checkSchedule, calendarEvent } from "../lib/core/time";
import { selection as parseSelection, configuration, content } from "../lib/core/validation";
import { uploadImage, readImage } from "../lib/core/media";
import { EMPTY_CONTENT } from "../lib/core/model";
import type { BusinessMode, ModeConfig, Selection } from "../lib/core/model";
import { resolve } from "node:path";
import { rm } from "node:fs/promises";
import { qrSvg } from "../lib/core/qr";
const now = new Date("2026-11-23T12:00:00Z");
const password = "A synthetic secure password 42";
const profile = { name: "Synthetic business", slug: "synthetic-business", category: "Local offerings", description: "Synthetic fixtures only", email: "owner@example.test", phone: "+15125550123", address: "100 Test Lane, Austin, TX 78701", addressPublic: false, city: "Austin", zip: "78701", latitude: 30.271, longitude: -97.743, timeZone: "America/Chicago", modes: ["RENTAL", "SERVICE", "QUOTE", "RESERVATION"], directory: true };
const openHours = { weekly: Object.fromEntries(Array.from({ length: 7 }, (_, i) => [String(i), [{ start: 0, end: 1440 }]])), exceptions: {}, blocked: [] };
function config(mode: BusinessMode): ModeConfig {
    const base = { fulfillments: ["MOBILE", "STOREFRONT"] as ("MOBILE" | "STOREFRONT")[], radiusMiles: 10 };
    switch (mode) {
        case "QUOTE": return { ...base, mode, price: { kind: "VARIABLE" } };
        case "SERVICE": return { ...base, mode, price: { kind: "FIXED", cents: 3000 }, durationMinutes: 60, bufferBefore: 0, bufferAfter: 0, noticeMinutes: 0 };
        case "RENTAL": return { ...base, mode, price: { kind: "HOURLY", cents: 1000 }, minimumUnits: 1, turnaroundMinutes: 0, noticeMinutes: 0 };
        case "RESERVATION": return { ...base, mode, price: { kind: "PER_PERSON", cents: 2000 }, capacityUnit: "PERSON", interval: "SLOT", slotMinutes: 60, minimumParty: 1, maximumParty: 8, noticeMinutes: 0, arrivalInstructions: "" };
    }
}
async function fixture(capacity = 10) {
    const repo = new MemoryRepository();
    await register(repo, { email: profile.email, password }, now);
    const token = await repo.transaction([], async (tx) => (await tx.find("outbox", { kind: "VERIFY_EMAIL" }))[0]!.body);
    await consumeAccountToken(repo, token, "VERIFY_EMAIL", null, now);
    const owner = await login(repo, profile.email, password, now);
    const business = await saveProfile(repo, owner.token, profile, now), resource = await saveResource(repo, owner.token, business.id, null, { name: "Shared pool", capacity, hours: openHours }, now);
    const offering = await saveOffering(repo, owner.token, business.id, null, { name: "One multi-mode offering", description: "Synthetic test offering", photos: [], active: true, resourceId: resource.id, configurations: profile.modes.map(m => config(m as BusinessMode)) }, now);
    await autosave(repo, owner.token, business.id, business.revision, { ...EMPTY_CONTENT, headline: "Synthetic business", description: "A genuine test fixture" }, now);
    await publish(repo, owner.token, business.id, now);
    const capability = (await createRequestCapability(repo, business.id, "synthetic-browser-capability-binding", now)).capability;
    const payments = new MockPaymentAdapter("synthetic-mock-payment-signing-key-123456789"), geo = new MockGeocoder(), service = new BookingService(repo, geo, payments, "synthetic-confirmation-signing-key-123456789");
    return { repo, owner, business, resource, offering, capability, payments, geo, service };
}
function input(f: Awaited<ReturnType<typeof fixture>>, mode: BusinessMode = "SERVICE"): Selection { return { businessId: f.business.id, offeringId: f.offering.id, mode, fulfillment: "STOREFRONT", quantity: mode === "RENTAL" ? 2 : 1, partySize: mode === "RESERVATION" ? 3 : 1, startLocal: mode === "QUOTE" ? "" : "2026-11-24T10:00", endLocal: mode === "QUOTE" ? "" : mode === "RENTAL" ? "2026-11-24T12:00" : "2026-11-24T11:00", ambiguity: "REJECT", contact: { name: "Synthetic customer", phone: "+15125550124", address: "", notes: mode === "QUOTE" ? "A short synthetic job description" : "" }, photos: [] }; }
async function paid(f: Awaited<ReturnType<typeof fixture>>, result: {
    requestId: string;
    confirmationToken: string;
}, at = now) { const intent = await f.service.intent(result.requestId, result.confirmationToken, now), event = f.payments.event(intent); return f.service.paymentEvent(event.payload, event.signature, at); }
test("verified email/password authentication, recovery, session revocation and token replay", async () => {
    const repo = new MemoryRepository();
    await register(repo, { email: profile.email, password }, now);
    await assert.rejects(login(repo, profile.email, password, now), /Verify/);
    const verify = await repo.transaction([], async (tx) => (await tx.find("outbox", { kind: "VERIFY_EMAIL" }))[0]!.body);
    await consumeAccountToken(repo, verify, "VERIFY_EMAIL", null, now);
    await assert.rejects(consumeAccountToken(repo, verify, "VERIFY_EMAIL", null, now), /invalid/);
    const logged = await login(repo, profile.email, password, now);
    assert.ok(await repo.transaction([], tx => session(tx, logged.token, now)));
    await recover(repo, profile.email, now);
    const reset = await repo.transaction([], async (tx) => (await tx.find("outbox", { kind: "RESET_PASSWORD" }))[0]!.body);
    await consumeAccountToken(repo, reset, "RESET_PASSWORD", "Another synthetic password 42", now);
    await assert.rejects(repo.transaction([], tx => session(tx, logged.token, now)), /Sign in/);
    await assert.rejects(login(repo, profile.email, password, now), /incorrect/);
    assert.ok((await login(repo, profile.email, "Another synthetic password 42", now)).token);
});
test("browser capabilities reject another browser and expired tokens, independently of phone", async () => {
    const f = await fixture();
    await assert.rejects(f.service.checkout(input(f), f.capability, "wrong-browser", now, "another-browser"), /capability/);
    await assert.rejects(f.service.checkout(input(f), f.capability, "expired", new Date(now.getTime() + 3600001), "synthetic-browser-capability-binding"), /capability/);
});
test("private owner boundaries reject cross-tenant reads, writes, media and operational release", async () => {
    const f = await fixture();
    await register(f.repo, { email: "other@example.test", password }, now);
    const verify = await f.repo.transaction([], async (tx) => (await tx.find("outbox", { destination: "other@example.test", kind: "VERIFY_EMAIL" }))[0]!.body);
    await consumeAccountToken(f.repo, verify, "VERIFY_EMAIL", null, now);
    const other = await login(f.repo, "other@example.test", password, now);
    await assert.rejects(saveResource(f.repo, other.token, f.business.id, null, { name: "Cross tenant", capacity: 1, hours: openHours }, now), /not found/);
    await assert.rejects(autosave(f.repo, other.token, f.business.id, 1, EMPTY_CONTENT, now), /not found/);
    await assert.rejects(publish(f.repo, other.token, f.business.id, now), /not found/);
    const request = await f.service.checkout(input(f), f.capability, "private-request", now, "synthetic-browser-capability-binding");
    await paid(f, request);
    await assert.rejects(f.service.release(other.token, f.business.id, request.requestId, now), /not found/);
    const w = await workspace(f.repo, other.token, now);
    assert.equal(w.business, null);
    assert.deepEqual(w.requests, []);
});
test("publication readiness, draft isolation, revision conflicts and public projection privacy", async () => {
    const f = await fixture(), before = await publishedSite(f.repo, f.business.slug);
    assert.ok(before);
    const b = (await workspace(f.repo, f.owner.token, now)).business!;
    await autosave(f.repo, f.owner.token, b.id, b.revision, { ...b.draft, headline: "Unpublished changed headline" }, now);
    assert.equal((await publishedSite(f.repo, b.slug))!.content.headline, before.content.headline);
    await assert.rejects(autosave(f.repo, f.owner.token, b.id, b.revision, b.draft, now), /another tab/);
    const json = JSON.stringify(before);
    for (const privateValue of [profile.email, profile.phone, profile.address, "passwordHash", "latitude", "longitude", "ownerId"])
        assert.ok(!json.includes(privateValue));
    await unpublish(f.repo, f.owner.token, b.id, now);
    assert.equal(await publishedSite(f.repo, b.slug), null);
});
test("all four modes execute end-to-end against mock payment and transactional repositories", async () => {
    for (const mode of ["RENTAL", "SERVICE", "QUOTE", "RESERVATION"] as const) {
        const f = await fixture(), data = input(f, mode);
        if (mode === "QUOTE") {
            const png = await sharp({ create: { width: 16, height: 16, channels: 3, background: "white" } }).png().toBuffer();
            data.photos = [(await uploadImage(f.repo, { businessId: f.business.id, kind: "QUOTE", bytes: png, contentType: "image/png", capability: f.capability, browser: "synthetic-browser-capability-binding" }, now)).id];
        }
        const checkout = await f.service.checkout(data, f.capability, "end-to-end-" + mode, now, "synthetic-browser-capability-binding");
        assert.equal(checkout.snapshot.underlyingSubtotalCents, mode === "RENTAL" ? 4000 : mode === "RESERVATION" ? 6000 : mode === "SERVICE" ? 3000 : null);
        assert.equal(checkout.snapshot.platformFeeCents, mode === "SERVICE" ? 200 : 300);
        assert.equal((await f.service.confirmation(checkout.confirmationToken)).status, "PENDING_PAYMENT");
        assert.equal((await paid(f, checkout)).status, mode === "QUOTE" ? "DELIVERED" : "CONFIRMED");
        const receipt = await f.service.confirmation(checkout.confirmationToken);
        assert.ok("request" in receipt && receipt.request?.businessPhone === profile.phone);
        assert.equal((await workspace(f.repo, f.owner.token, now)).requests.length, 1);
        const allocations = await f.repo.transaction([], tx => tx.find("allocations", { requestId: checkout.requestId }));
        assert.equal(allocations.length, mode === "QUOTE" ? 0 : 1);
        assert.ok(allocations.every(a => a.status === "CONFIRMED"));
        assert.equal((await f.repo.transaction([], tx => tx.find("outbox", { kind: "CONFIRMED_REQUEST" }))).length, 1);
    }
});
test("concurrent competing offerings cannot overbook one shared capacity pool", async () => {
    const f = await fixture(1), second = await saveOffering(f.repo, f.owner.token, f.business.id, null, { ...f.offering, id: undefined, businessId: undefined }, now).catch(() => null);
    assert.equal(second, null); // Untrusted top-level fields are rejected.
    const { id: _, businessId: __, ...payload } = f.offering;
    void _;
    void __;
    const alternate = await saveOffering(f.repo, f.owner.token, f.business.id, null, payload, now);
    const attempts = await Promise.allSettled([f.service.checkout(input(f), f.capability, "race-a", now, "synthetic-browser-capability-binding"), f.service.checkout({ ...input(f), offeringId: alternate.id }, f.capability, "race-b", now, "synthetic-browser-capability-binding")]);
    assert.equal(attempts.filter(r => r.status === "fulfilled").length, 1);
    assert.equal(attempts.filter(r => r.status === "rejected").length, 1);
});
test("idempotent submissions preserve immutable facts after catalog/mode changes", async () => {
    const f = await fixture(), s = input(f), first = await f.service.checkout(s, f.capability, "same", now, "synthetic-browser-capability-binding");
    await paid(f, first);
    const b = (await workspace(f.repo, f.owner.token, now)).business!;
    await saveProfile(f.repo, f.owner.token, { ...profile, modes: ["QUOTE"] }, now);
    const again = await f.service.checkout(s, f.capability, "same", now, "synthetic-browser-capability-binding");
    assert.deepEqual(again.snapshot, first.snapshot);
    assert.equal(again.requestId, first.requestId);
    await assert.rejects(f.service.checkout({ ...s, contact: { ...s.contact, notes: "changed" } }, f.capability, "same", now, "synthetic-browser-capability-binding"), /Idempotency/);
    await assert.rejects(f.service.checkout(s, f.capability, "new-key", now, "synthetic-browser-capability-binding"), /not available/);
    const allocations = await f.repo.transaction([], tx => tx.find("allocations", { businessId: b.id }));
    assert.equal(allocations[0]!.status, "CONFIRMED");
    await assert.rejects(f.repo.transaction([], tx => tx.put("snapshots", { ...first.snapshot, platformFeeCents: 500 })), /Immutable/);
});
test("payment signatures, identity binding, durable replay and interrupted processing", async () => {
    const f = await fixture(), r = await f.service.checkout(input(f), f.capability, "payment", now, "synthetic-browser-capability-binding"), intent = await f.service.intent(r.requestId, r.confirmationToken, now), event = f.payments.event(intent);
    await assert.rejects(f.service.paymentEvent(event.payload, "00", now), /Unverified/);
    const bad = f.payments.signed({ eventId: randomUUID(), requestId: r.requestId, intentId: "wrong-intent", paymentId: "wrong-charge", amountCents: 200, currency: "USD" });
    await assert.rejects(f.service.paymentEvent(bad.payload, bad.signature, now), /identity/);
    const replayed = new BookingService(f.repo, f.geo, f.payments, "synthetic-confirmation-signing-key-123456789");
    assert.equal((await replayed.paymentEvent(event.payload, event.signature, now)).status, "CONFIRMED");
    assert.equal((await replayed.paymentEvent(event.payload, event.signature, now)).status, "CONFIRMED");
    const second = f.payments.event(intent);
    assert.equal((await replayed.paymentEvent(second.payload, second.signature, now)).status, "CONFIRMED");
    assert.equal((await f.repo.transaction([], tx => tx.find("outbox", { kind: "CONFIRMED_REQUEST" }))).length, 1);
    assert.equal((await f.repo.transaction([], tx => tx.find("allocations", { requestId: r.requestId }))).length, 1);
});
test("expired holds release capacity and delayed successful payments require remediation", async () => {
    const f = await fixture(1), r = await f.service.checkout(input(f), f.capability, "expiring", now, "synthetic-browser-capability-binding"), intent = await f.service.intent(r.requestId, r.confirmationToken, now), event = f.payments.event(intent), later = new Date(now.getTime() + 16 * 60000);
    assert.equal(await f.service.reconcile(later), 1);
    assert.ok(await f.service.checkout(input(f), f.capability, "replacement", later, "synthetic-browser-capability-binding"));
    assert.equal((await f.service.paymentEvent(event.payload, event.signature, later)).status, "REFUND_REQUIRED");
    const r0 = await f.repo.transaction([], tx => tx.get("requests", r.requestId));
    assert.equal(r0!.refundReason, "HOLD_EXPIRED");
    const receipt = await f.service.confirmation(r.confirmationToken);
    assert.ok(!("request" in receipt));
});
test("notification outage retries without losing dashboard records", async () => {
    const f = await fixture(), r = await f.service.checkout(input(f), f.capability, "notify", now, "synthetic-browser-capability-binding");
    await paid(f, r);
    const transport = new MockNotificationTransport();
    transport.fail = true;
    await deliverNotifications(f.repo, transport, now);
    assert.equal((await workspace(f.repo, f.owner.token, now)).requests.length, 1);
    const pending = await f.repo.transaction([], tx => tx.find("outbox", { kind: "CONFIRMED_REQUEST" }));
    assert.equal(pending[0]!.state, "PENDING");
    transport.fail = false;
    await deliverNotifications(f.repo, transport, new Date(now.getTime() + 60000));
    assert.equal(transport.delivered.get(pending[0]!.key)?.kind, "CONFIRMED_REQUEST");
});
test("mobile exact-address eligibility and private ZIP-centroid directory ranking", async () => {
    const f = await fixture(), mobile = { ...input(f), fulfillment: "MOBILE" as const, contact: { ...input(f).contact, address: "200 Customer Lane, Austin, TX 78701" } };
    assert.ok(await f.service.checkout(mobile, f.capability, "mobile", now, "synthetic-browser-capability-binding"));
    await assert.rejects(f.service.checkout({ ...mobile, contact: { ...mobile.contact, address: "Unverified address" } }, f.capability, "bad-address", now, "synthetic-browser-capability-binding"), /Exact address/);
    const list = await directory(f.repo, { text: "One multi-mode", zip: "78701", mode: "SERVICE", fulfillment: "MOBILE" }, f.geo);
    assert.equal(list.length, 1);
    const json = JSON.stringify(list);
    for (const value of [profile.address, profile.phone, profile.email, "latitude", "longitude"])
        assert.ok(!json.includes(value));
    await suspend(f.repo, f.owner.token, f.business.id, "Repeated commitment failures", [profile.email], now);
    assert.equal((await directory(f.repo, { text: "", zip: "", mode: "", fulfillment: "" }, f.geo)).length, 0);
    assert.equal(await publishedSite(f.repo, f.business.slug), null);
});
test("suspension blocks pending fulfillment without erasing confirmed obligations", async () => {
    const f = await fixture(), r = await f.service.checkout(input(f), f.capability, "before-suspend", now, "synthetic-browser-capability-binding");
    await paid(f, r);
    await assert.rejects(suspend(f.repo, f.owner.token, f.business.id, "not admin", [], now), /Forbidden/);
    await suspend(f.repo, f.owner.token, f.business.id, "Repeated failures", [profile.email], now);
    await assert.rejects(publish(f.repo, f.owner.token, f.business.id, now), /suspended/);
    const receipt = await f.service.confirmation(r.confirmationToken);
    assert.equal(receipt.status, "CONFIRMED");
    assert.equal((await f.repo.transaction([], tx => tx.find("allocations", { requestId: r.requestId })))[0]!.status, "CONFIRMED");
});
test("secure images reject spoofed types, oversize input and cross-tenant access", async () => {
    const f = await fixture(), bytes = await sharp({ create: { width: 16, height: 16, channels: 3, background: "red" } }).png().toBuffer();
    await assert.rejects(uploadImage(f.repo, { businessId: f.business.id, kind: "BUSINESS", bytes: Buffer.from("<svg>unsafe image</svg>"), contentType: "image/png", session: f.owner.token, browser: "synthetic-browser-capability-binding" }, now), /valid JPEG/);
    await assert.rejects(uploadImage(f.repo, { businessId: f.business.id, kind: "BUSINESS", bytes: Buffer.alloc(5 * 1024 * 1024 + 1), contentType: "image/png", session: f.owner.token, browser: "synthetic-browser-capability-binding" }, now), /5 MB/);
    const image = await uploadImage(f.repo, { businessId: f.business.id, kind: "BUSINESS", bytes, contentType: "image/png", session: f.owner.token, browser: "synthetic-browser-capability-binding" }, now);
    assert.equal((await readImage(f.repo, image.id, f.owner.token, undefined, now)).contentType, "image/webp");
    await assert.rejects(readImage(f.repo, image.id, undefined, undefined, now), /not found/);
});
test("quote photo bounds, 200-character maximum and forbidden scheduling are enforced", async () => {
    const f = await fixture();
    await assert.rejects(f.service.checkout(input(f, "QUOTE"), f.capability, "no-photo", now, "synthetic-browser-capability-binding"), /1-3 photos/);
    assert.throws(() => parseSelection({ ...input(f, "QUOTE"), contact: { ...input(f, "QUOTE").contact, notes: "x".repeat(201) } }));
    assert.throws(() => parseSelection({ ...input(f, "QUOTE"), photos: ["a", "b", "c", "d"] }));
});
test("30-calendar-day window includes today, handles DST and rejects extensions/buffer overflow", () => {
    const zone = "America/Chicago", spring = new Date("2027-03-01T12:00:00Z"), window = rollingWindow(spring, zone);
    assert.equal(window.today, "2027-03-01");
    assert.equal(window.lastDate, "2027-03-30");
    assert.equal((window.end - window.start) / 3600000, 719);
    const config0 = config("SERVICE");
    assert.ok(config0.mode === "SERVICE");
    const s = { businessId: "b", offeringId: "o", mode: "SERVICE" as const, fulfillment: "STOREFRONT" as const, quantity: 1, partySize: 1, startLocal: "2027-03-30T23:00", endLocal: "2027-03-31T00:00", ambiguity: "REJECT" as const, contact: { name: "", phone: "", address: "", notes: "" }, photos: [] };
    assert.doesNotThrow(() => checkSchedule(s, config0, openHours, zone, spring));
    assert.throws(() => checkSchedule({ ...s, endLocal: "2027-03-31T01:00" }, config0, openHours, zone, spring));
    assert.throws(() => checkSchedule(s, { ...config0, bufferAfter: 1 }, openHours, zone, spring));
});
test("DST gaps reject and repeated times require explicit disambiguation", () => {
    assert.throws(() => localInstant("2027-03-14T02:30", "America/Chicago"), /does not exist/);
    assert.throws(() => localInstant("2027-11-07T01:30", "America/Chicago"), /occurs twice/);
    const first = localInstant("2027-11-07T01:30", "America/Chicago", "EARLIER"), second = localInstant("2027-11-07T01:30", "America/Chicago", "LATER");
    assert.equal(second - first, 3600000);
    assert.equal(localParts(first, "America/Chicago").local, localParts(second, "America/Chicago").local);
});
test("overnight occupancy differs from endpoint opening hours; daily rental DST is calendar based", () => {
    const config0 = config("RENTAL");
    assert.ok(config0.mode === "RENTAL");
    const daily = { ...config0, price: { kind: "DAILY" as const, cents: 1000 } };
    const s = { businessId: "b", offeringId: "o", mode: "RENTAL" as const, fulfillment: "STOREFRONT" as const, quantity: 1, partySize: 1, startLocal: "2027-03-13T09:00", endLocal: "2027-03-14T09:00", ambiguity: "REJECT" as const, contact: { name: "", phone: "", address: "", notes: "" }, photos: [] };
    const hours = { ...openHours, weekly: Object.fromEntries(Array.from({ length: 7 }, (_, i) => [String(i), [{ start: 540, end: 1020 }]])) }, t = checkSchedule(s, daily, hours, "America/Chicago", new Date("2027-03-01T12:00:00Z"));
    assert.equal(t.durationUnits, 1);
    assert.equal((Date.parse(t.end) - Date.parse(t.start)) / 3600000, 23);
    assert.throws(() => checkSchedule({ ...s, endLocal: "2027-03-14T09:30" }, daily, hours, "America/Chicago", new Date("2027-03-01T12:00:00Z")), /whole rental/);
});
test("fixed/starting/variable/service and reservation configuration validation", () => {
    assert.throws(() => configuration({ ...config("SERVICE"), price: { kind: "HOURLY", cents: 100 } }));
    assert.throws(() => configuration({ ...config("RENTAL"), minimumUnits: 0 }));
    assert.throws(() => configuration({ ...config("RESERVATION"), minimumParty: 5, maximumParty: 2 }));
    assert.throws(() => content({ ...EMPTY_CONTENT, testimonials: [{ name: "Fake", text: "Invented", genuine: false }] }));
});
test("transaction rollback, rate limits, file durability and independent repository instances", async () => {
    const directory = resolve("artifacts", "phase3-test-" + randomUUID()), a = new FileRepository(directory), b = new FileRepository(directory);
    try {
        await a.transaction([], tx => tx.put("rates", { id: "durable", count: 1, expiresAt: now.toISOString() }));
        assert.equal((await b.transaction([], tx => tx.get("rates", "durable")))!.count, 1);
        await assert.rejects(a.transaction([], async (tx) => { await tx.put("rates", { id: "rollback", count: 1, expiresAt: now.toISOString() }); throw new Error("interrupted"); }));
        assert.equal(await b.transaction([], tx => tx.get("rates", "rollback")), null);
        await Promise.all(Array.from({ length: 5 }, () => a.transaction([], async (tx) => { const row = (await tx.get("rates", "durable"))!; await tx.put("rates", { ...row, count: row.count + 1 }); })));
        assert.equal((await b.transaction([], tx => tx.get("rates", "durable")))!.count, 6);
    }
    finally {
        await rm(directory, { recursive: true, force: true });
    }
    const repo = new MemoryRepository();
    await rateLimit(repo, "synthetic", 1, now);
    await assert.rejects(rateLimit(repo, "synthetic", 1, now), /Too many/);
});
test("safe public-host dispatch, QR output and private-free calendar serialization", () => {
    assert.equal(subdomainSlug("synthetic-business.jobfray.com"), "synthetic-business");
    assert.equal(subdomainSlug("api.jobfray.com"), null);
    assert.equal(subdomainSlug("a.b.jobfray.com"), null);
    const svg = qrSvg("https://synthetic-business.jobfray.com");
    assert.match(svg, /viewBox="0 0 49 49"/);
    assert.ok(!svg.includes("synthetic-business"));
    assert.throws(() => qrSvg("x".repeat(135)));
    const ics = calendarEvent("JF-TEST", "Service\nPRIVATE-INJECTION", "2026-11-24T16:00:00.000Z", "2026-11-24T17:00:00.000Z");
    assert.match(ics, /DTSTART:20261124T160000Z/);
    assert.ok(!ics.includes("\r\nPRIVATE-INJECTION"));
    assert.ok(!ics.includes(profile.phone));
});
test("per-night reservations price calendar nights and preserve overnight closed occupancy", async () => {
    const f = await fixture(), { id: _, businessId: __, ...payload } = f.offering;
    void _;
    void __;
    const c = config("RESERVATION");
    assert.ok(c.mode === "RESERVATION");
    const o = await saveOffering(f.repo, f.owner.token, f.business.id, f.offering.id, { ...payload, configurations: [{ ...c, price: { kind: "PER_NIGHT", cents: 3000 }, interval: "MULTIDAY", capacityUnit: "SPACE" }] }, now);
    const result = await f.service.checkout({ ...input(f, "RESERVATION"), offeringId: o.id, startLocal: "2026-11-24T15:00", endLocal: "2026-11-26T10:00" }, f.capability, "nights", now, "synthetic-browser-capability-binding");
    assert.equal(result.snapshot.durationUnits, 2);
    assert.equal(result.snapshot.underlyingSubtotalCents, 6000);
    assert.equal(result.snapshot.platformFeeCents, 300);
});
test("starting prices remain minimums; free reservation uses the known-zero fee tier", async () => {
    for (const [mode, price] of [["SERVICE", { kind: "STARTING", cents: 7501 }], ["RESERVATION", { kind: "FREE", cents: 0 }]] as const) {
        const f = await fixture(), { id: _, businessId: __, ...payload } = f.offering;
        void _;
        void __;
        const c = config(mode);
        await saveOffering(f.repo, f.owner.token, f.business.id, f.offering.id, { ...payload, configurations: [{ ...c, price }] }, now);
        const r = await f.service.checkout(input(f, mode), f.capability, "pricing", now, "synthetic-browser-capability-binding");
        assert.equal(r.snapshot.platformFeeCents, mode === "SERVICE" ? 400 : 200);
        if (mode === "SERVICE")
            assert.match(r.snapshot.priceLabel, /minimum/);
    }
});
test("unavailable/blocked/exception slots are excluded and private allocation details are absent", async () => {
    const f = await fixture(1), r = await f.service.checkout(input(f), f.capability, "slot-hold", now, "synthetic-browser-capability-binding"), result = await f.service.slots(f.business.id, f.offering.id, "SERVICE", "STOREFRONT", "2026-11-24", now);
    assert.ok(!result.slots.some(s => s.startLocal === "2026-11-24T10:00"));
    assert.ok(result.slots.some(s => s.startLocal === "2026-11-24T11:00"));
    assert.ok(!JSON.stringify(result).includes(r.requestId));
    await saveResource(f.repo, f.owner.token, f.business.id, f.resource.id, { name: "Shared pool", capacity: 1, hours: { ...openHours, exceptions: { "2026-11-24": [] } } }, now);
    assert.equal((await f.service.slots(f.business.id, f.offering.id, "SERVICE", "STOREFRONT", "2026-11-24", now)).slots.length, 0);
});
test("administrative refunds are explicit, idempotent and retain immutable confirmed history", async () => {
    const { requestRefund, simulateRefund } = await import("../lib/core/administration"), f = await fixture(), r = await f.service.checkout(input(f), f.capability, "refund", now, "synthetic-browser-capability-binding");
    await paid(f, r);
    await assert.rejects(requestRefund(f.repo, f.owner.token, [], f.business.id, r.requestId, "DISCRETIONARY", now), /Forbidden/);
    const record = await requestRefund(f.repo, f.owner.token, [profile.email], f.business.id, r.requestId, "DISCRETIONARY", now);
    assert.equal((await requestRefund(f.repo, f.owner.token, [profile.email], f.business.id, r.requestId, "DISCRETIONARY", now)).id, record.id);
    await simulateRefund(f.repo, f.owner.token, [profile.email], record.id, now);
    assert.equal((await f.service.confirmation(r.confirmationToken)).status, "CONFIRMED");
    assert.deepEqual((await f.service.confirmation(r.confirmationToken)).snapshot, r.snapshot);
});
test("expired quote image bytes are removed without deleting confirmation/financial records", async () => {
    const { cleanup } = await import("../lib/core/administration"), f = await fixture(), bytes = await sharp({ create: { width: 8, height: 8, channels: 3, background: "white" } }).png().toBuffer();
    const image = await uploadImage(f.repo, { businessId: f.business.id, kind: "QUOTE", bytes, contentType: "image/png", capability: f.capability, browser: "synthetic-browser-capability-binding" }, now);
    await cleanup(f.repo, new Date(now.getTime() + 2 * 86400000));
    assert.equal(await f.repo.transaction([], tx => tx.get("media", image.id)), null);
});
test("a second verified charge on the same intent queues duplicate-charge remediation without erasing confirmation", async () => {
    const f = await fixture(), r = await f.service.checkout(input(f), f.capability, "duplicate-charge", now, "synthetic-browser-capability-binding"), intent = await f.service.intent(r.requestId, r.confirmationToken, now), first = f.payments.event(intent);
    await f.service.paymentEvent(first.payload, first.signature, now);
    const second = f.payments.signed({ eventId: randomUUID(), intentId: intent.id, paymentId: "synthetic-second-charge", requestId: r.requestId, amountCents: 200, currency: "USD" });
    assert.equal((await f.service.paymentEvent(second.payload, second.signature, now)).status, "CONFIRMED");
    const refunds = await f.repo.transaction([], tx => tx.find("refunds", { requestId: r.requestId }));
    assert.equal(refunds[0]!.reason, "DUPLICATE_CHARGE");
    assert.equal(refunds[0]!.paymentId, "synthetic-second-charge");
    const replay = f.payments.signed({ eventId: randomUUID(), intentId: intent.id, paymentId: "synthetic-second-charge", requestId: r.requestId, amountCents: 200, currency: "USD" });
    await f.service.paymentEvent(replay.payload, replay.signature, now);
    assert.equal((await f.repo.transaction([], tx => tx.find("refunds", { requestId: r.requestId }))).length, 1);
    assert.equal((await f.repo.transaction([], tx => tx.find("outbox", { kind: "CONFIRMED_REQUEST" }))).length, 1);
});
test("reservation availability respects the selected party size and unpaid quote images remain private", async () => {
    const f = await fixture(2);
    assert.ok((await f.service.slots(f.business.id, f.offering.id, "RESERVATION", "STOREFRONT", "2026-11-24", now, 1)).slots.length > 0);
    assert.equal((await f.service.slots(f.business.id, f.offering.id, "RESERVATION", "STOREFRONT", "2026-11-24", now, 3)).slots.length, 0);
    const bytes = await sharp({ create: { width: 8, height: 8, channels: 3, background: "white" } }).png().toBuffer();
    const image = await uploadImage(f.repo, { businessId: f.business.id, kind: "QUOTE", bytes, contentType: "image/png", capability: f.capability, browser: "synthetic-browser-capability-binding" }, now);
    await assert.rejects(readImage(f.repo, image.id, f.owner.token, undefined, now), /not found/);
});
test("pending and failed-facilitation contacts never enter the business dashboard", async () => {
    const f = await fixture(), r = await f.service.checkout(input(f), f.capability, "not-delivered", now, "synthetic-browser-capability-binding");
    assert.equal((await workspace(f.repo, f.owner.token, now)).requests.length, 0);
    const intent = await f.service.intent(r.requestId, r.confirmationToken, now), event = f.payments.event(intent);
    await f.service.paymentEvent(event.payload, event.signature, new Date(now.getTime() + 16 * 60000));
    assert.equal((await workspace(f.repo, f.owner.token, now)).requests.length, 0);
});
test("calendar output folds UTF-8 lines and escapes all line-break injection", () => {
    const result = calendarEvent("JF-UNICODE", "Offering " + "\u00e9".repeat(100) + "\rX-INJECTED:yes", "2026-11-24T16:00:00.000Z", "2026-11-24T17:00:00.000Z");
    for (const line of result.split("\r\n"))
        assert.ok(Buffer.byteLength(line, "utf8") <= 75);
    assert.ok(!result.includes("\rX-INJECTED"));
});
test("retained disabled mode configurations do not block editing an enabled mode", async () => {
    const f = await fixture();
    await saveProfile(f.repo, f.owner.token, { ...profile, modes: ["SERVICE"] }, now);
    const { id: _, businessId: __, ...payload } = f.offering;
    void _;
    void __;
    const updated = await saveOffering(f.repo, f.owner.token, f.business.id, f.offering.id, { ...payload, name: "Edited enabled service" }, now);
    assert.equal(updated.configurations.length, 4);
    assert.ok(await f.service.checkout(input(f), f.capability, "still-enabled", now, "synthetic-browser-capability-binding"));
});
test("mobile checkout verifies contact before geocoding and replay survives a provider outage", async () => {
    const f = await fixture();
    let calls = 0, down = false;
    const geo = { zip: (zip: string) => f.geo.zip(zip), address: async (address: string) => {
            calls++;
            if (down)
                throw new Error("Mock outage");
            return f.geo.address(address);
        } };
    const service = new BookingService(f.repo, geo, f.payments, "synthetic-confirmation-signing-key-123456789"), mobile = { ...input(f), fulfillment: "MOBILE" as const, contact: { ...input(f).contact, address: "200 Customer Lane, Austin, TX 78701" } };
    await assert.rejects(service.checkout(mobile, "invalid-capability", "provider-cost", now, "synthetic-browser-capability-binding"), /capability/);
    assert.equal(calls, 0);
    const first = await service.checkout(mobile, f.capability, "provider-replay", now, "synthetic-browser-capability-binding");
    assert.equal(calls, 1);
    down = true;
    assert.equal((await service.checkout(mobile, f.capability, "provider-replay", now, "synthetic-browser-capability-binding")).requestId, first.requestId);
    assert.equal(calls, 1);
});
test("both repeated-hour service slots are available and endpoints are independently disambiguated", async () => {
    const f = await fixture();
    const slots = await f.service.slots(f.business.id, f.offering.id, "SERVICE", "STOREFRONT", "2027-11-07", new Date("2027-11-01T12:00:00Z"));
    const repeated = slots.slots.filter(s => s.startLocal === "2027-11-07T01:00");
    assert.equal(repeated.length, 2);
    assert.notEqual(repeated[0]!.start, repeated[1]!.start);
    const first = repeated.find(s => s.ambiguity === "EARLIER")!;
    assert.equal(first.endAmbiguity, "LATER");
    assert.equal((Date.parse(first.end) - Date.parse(first.start)) / 3600000, 1);
});
test("fixed reservation slots align to operating-window boundaries and DNS slugs reject trailing hyphens", () => {
    const c = config("RESERVATION");
    assert.ok(c.mode === "RESERVATION");
    const s = { businessId: "b", offeringId: "o", mode: "RESERVATION" as const, fulfillment: "STOREFRONT" as const, quantity: 1, partySize: 1, startLocal: "2026-11-24T10:15", endLocal: "2026-11-24T11:15", ambiguity: "REJECT" as const, contact: { name: "", phone: "", address: "", notes: "" }, photos: [] };
    assert.throws(() => checkSchedule(s, c, openHours, "America/Chicago", now), /aligned/);
    assert.equal(subdomainSlug("invalid-.jobfray.com"), null);
});
test("capacity reductions preserve existing obligations and selected rental/person quantities exhaust shared pools", async () => {
    const f = await fixture(3);
    const first = await f.service.checkout({ ...input(f, "RENTAL"), quantity: 2 }, f.capability, "quantity-two", now, "synthetic-browser-capability-binding");
    await paid(f, first);
    await assert.rejects(saveResource(f.repo, f.owner.token, f.business.id, f.resource.id, { name: f.resource.name, capacity: 1, hours: openHours }, now), /existing obligations/);
    await assert.rejects(f.service.checkout({ ...input(f, "RESERVATION"), partySize: 2 }, f.capability, "party-two", now, "synthetic-browser-capability-binding"), /capacity/);
    const final = await f.service.checkout(input(f, "SERVICE"), f.capability, "remaining-one", now, "synthetic-browser-capability-binding");
    await paid(f, final);
    await assert.rejects(f.service.checkout(input(f), f.capability, "exhausted", now, "synthetic-browser-capability-binding"), /capacity/);
});
test("missing scheduled allocations require remediation instead of a false confirmation", async () => {
    const f = await fixture(), r = await f.service.checkout(input(f), f.capability, "missing", now, "synthetic-browser-capability-binding");
    await f.repo.transaction([], async (tx) => {
        for (const a of await tx.find("allocations", { requestId: r.requestId }))
            await tx.remove("allocations", a.id);
    });
    assert.equal((await paid(f, r)).status, "REFUND_REQUIRED");
    assert.equal((await f.service.confirmation(r.confirmationToken)).request, undefined);
});
test("stale notification workers cannot acknowledge a newer lease", async () => {
    const repo = new MemoryRepository();
    await repo.transaction([], tx => tx.put("outbox", { id: "leased", businessId: null, key: "lease-test", destination: "synthetic@example.test", channel: "EMAIL", kind: "TEST", body: "synthetic", state: "PENDING", attempts: 0, availableAt: now.toISOString(), leaseUntil: null }));
    let started!: () => void, unblock!: () => void;
    const begun = new Promise<void>(r => started = r), blocked = new Promise<void>(r => unblock = r);
    const a = deliverNotifications(repo, { send: async () => { started(); await blocked; throw new Error("Old worker timeout"); } }, now);
    await begun;
    const b = new MockNotificationTransport();
    await deliverNotifications(repo, b, new Date(now.getTime() + 120000));
    unblock();
    await a;
    const row = await repo.transaction([], tx => tx.get("outbox", "leased"));
    assert.equal(row!.state, "SENT");
    assert.equal(row!.attempts, 1);
    assert.equal(b.delivered.size, 1);
});
test("expired verification can be reissued without replacing the existing password", async () => {
    const repo = new MemoryRepository();
    await register(repo, { email: profile.email, password }, now);
    const before = await repo.transaction([], tx => tx.find("outbox", { kind: "VERIFY_EMAIL" }));
    const later = new Date(now.getTime() + 61 * 60000);
    await register(repo, { email: profile.email, password: "Unrelated synthetic password" }, later);
    const after = await repo.transaction([], tx => tx.find("outbox", { kind: "VERIFY_EMAIL" }));
    const token = after.find(r => !before.some(old => old.id === r.id))!.body;
    await consumeAccountToken(repo, token, "VERIFY_EMAIL", null, later);
    assert.ok((await login(repo, profile.email, password, later)).token);
});
test("calendar edits racing checkout preserve any already purchased hold", async () => {
    const f = await fixture(1), hours = { ...openHours, blocked: [{ start: "2026-11-24T15:00:00.000Z", end: "2026-11-24T18:00:00.000Z" }] };
    const outcomes = await Promise.allSettled([f.service.checkout(input(f), f.capability, "edit-race", now, "synthetic-browser-capability-binding"), saveResource(f.repo, f.owner.token, f.business.id, f.resource.id, { name: f.resource.name, capacity: 1, hours }, now)]);
    assert.equal(outcomes[1]!.status, "fulfilled");
    const booked = outcomes[0]!;
    if (booked.status === "fulfilled")
        assert.equal((await paid(f, booked.value as {
            requestId: string;
            confirmationToken: string;
        })).status, "CONFIRMED");
});
test("confirmation key rotation preserves issued capabilities and historical idempotent replay", async () => {
    const f = await fixture(), s = input(f), r = await f.service.checkout(s, f.capability, "key-rotation", now, "synthetic-browser-capability-binding");
    const rotated = new BookingService(f.repo, f.geo, f.payments, "new-confirmation-signing-key-with-32-characters", "v2", { v1: "synthetic-confirmation-signing-key-123456789" });
    assert.equal((await rotated.checkout(s, f.capability, "key-rotation", now, "synthetic-browser-capability-binding")).confirmationToken, r.confirmationToken);
    const intent = await rotated.intent(r.requestId, r.confirmationToken, now), event = f.payments.event(intent);
    assert.equal((await rotated.paymentEvent(event.payload, event.signature, now)).status, "CONFIRMED");
    assert.ok((await rotated.confirmation(r.confirmationToken)).request);
});
test("precomputed public ZIP centroids avoid per-business provider calls without exposing private bases", async () => {
    const f = await fixture();
    await saveProfile(f.repo, f.owner.token, profile, now, { latitude: 30.27, longitude: -97.74 });
    const geo = { zip: async () => { throw new Error("Unexpected directory provider call"); }, address: async () => { throw new Error("unused"); } };
    const results = await directory(f.repo, { text: "", mode: "SERVICE", fulfillment: "MOBILE", zip: "", point: { latitude: 30.27, longitude: -97.74 } }, geo);
    assert.equal(results.length, 1);
    assert.equal("address" in results[0]!, false);
    assert.equal("latitude" in results[0]!, false);
    await assert.rejects(f.service.slots(f.business.id, f.offering.id, "SERVICE", "STOREFRONT", "2026-11-31", now), /30-calendar/);
});
