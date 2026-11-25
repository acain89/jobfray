import { createRequestCapability } from "../lib/core/request-capability";
import { MemoryRepository, type Repository } from "../lib/core/repository";
import { register, consumeAccountToken, login } from "../lib/core/security";
import { saveProfile, saveResource, saveOffering, autosave, publish } from "../lib/core/business";
import { BookingService } from "../lib/core/booking";
import { MockGeocoder, MockPaymentAdapter } from "../lib/core/providers";
import { EMPTY_CONTENT, type BusinessMode, type ModeConfig, type Selection } from "../lib/core/model";
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
async function fixture(capacity = 10, repo: Repository = new MemoryRepository(), at: Date = now) {
    const now = at;
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
export { fixture, input, paid, now };
