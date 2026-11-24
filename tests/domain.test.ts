import test from "node:test";
import assert from "node:assert/strict";
import { requireTenantScope } from "../lib/domain/access";
import { parseDirectoryQuery } from "../lib/domain/policy";
import { parseBusinessModes, parseFulfillments, parseModeConfig, validateOffering } from "../lib/domain/validation";
import { assertCapacity } from "../lib/domain/capacity";
import { validateAvailabilityRule, validateSchedulingPolicy } from "../lib/domain/scheduling";
import { calculatePlatformFee, createCheckoutSnapshot, PRICING_POLICY_VERSION } from "../lib/server/fees";
import { prepareCheckout } from "../lib/server/checkout";
import type { CheckoutStore, StoredCheckout } from "../lib/server/checkout";
import { mapOfferingModeRow } from "../lib/server/catalog-mapping";
import type { Allocation, BusinessId, BusinessMode, Offering, OfferingId, OwnerId, Resource, ResourceId } from "../lib/domain/types";
const business = "synthetic-business-a" as BusinessId;
const other = "synthetic-business-b" as BusinessId;
const owner = "synthetic-owner" as OwnerId;
const offeringId = "synthetic-offering" as OfferingId;
const resourceId = "shared-resource" as ResourceId;
const scope = { businessId: business, ownerId: owner };
const now = new Date("2026-11-23T12:00:00Z");
const modes = ["RENTAL", "SERVICE", "QUOTE", "RESERVATION"] as const;
function config(mode: BusinessMode, price: unknown = { kind: "KNOWN", unitAmountCents: 1000, basis: "QUANTITY" }) {
  return parseModeConfig({ mode, fulfillments: ["MOBILE", "STOREFRONT"], price,
    ...(mode === "SERVICE" ? { timing: null } : mode === "RENTAL" ? { durationUnit: "DAY" } : mode === "RESERVATION" ? { capacityUnit: null } : {}) });
}
function offering(mode: BusinessMode = "SERVICE", price?: unknown): Offering {
  return { id: offeringId, businessId: business, name: "Synthetic offering", categoryId: "category", active: true,
    configurations: [config(mode, price)] };
}
const selection = { mode: "SERVICE", fulfillment: "MOBILE", quantity: 1 };
for (const [subtotal, expected] of [[0,200],[1,200],[2999,200],[3000,200],[3001,300],[7499,300],[7500,300],
  [7501,400],[15098,400],[15099,400],[15100,500],[15101,500],[Number.MAX_SAFE_INTEGER,500]] as const) {
  test(`fee boundary ${subtotal} cents = ${expected}`, () => {
    for (const mode of ["RENTAL", "SERVICE", "RESERVATION"] as const) assert.equal(calculatePlatformFee(mode, subtotal), expected);
    assert.equal(calculatePlatformFee("QUOTE", subtotal), 300);
  });
}
test("every cent through the final tier transition follows the locked schedule", () => {
  for (let cents = 0; cents <= 15101; cents++) assert.equal(calculatePlatformFee("SERVICE", cents),
    cents <= 3000 ? 200 : cents <= 7500 ? 300 : cents <= 15099 ? 400 : 500);
});
test("unknown is explicit; invalid monetary inputs are rejected even for quotes", () => {
  for (const mode of modes) {
    assert.equal(calculatePlatformFee(mode, null), 300);
    for (const value of [-1, -0, 0.1, NaN, Infinity, -Infinity, Number.MAX_SAFE_INTEGER + 1, undefined, "3000", 3000n, {}, false]) {
      assert.throws(() => calculatePlatformFee(mode, value as number));
      assert.throws(() => config(mode, { kind: "KNOWN", unitAmountCents: value, basis: "QUANTITY" }));
    }
  }
  assert.throws(() => calculatePlatformFee("INVALID" as BusinessMode, 0));
});
test("all 15 nonempty business mode combinations share one offering", () => {
  for (let mask = 1; mask < 16; mask++) {
    const enabled = modes.filter((_, i) => mask & (1 << i));
    const value = { ...offering(), configurations: enabled.map(mode => config(mode)) };
    assert.doesNotThrow(() => validateOffering(value, parseBusinessModes(enabled)));
    assert.throws(() => validateOffering(value, []));
  }
  assert.deepEqual(parseBusinessModes([]), []);
  assert.throws(() => parseBusinessModes(["SERVICE", "SERVICE"]));
  assert.throws(() => validateOffering({ ...offering(), configurations: [config("SERVICE"), config("SERVICE")] }, modes));
  assert.throws(() => validateOffering({ ...offering(), configurations: [] }, modes));
});
test("mobile, storefront and both are supported without duplicate listings", () => {
  for (const values of [["MOBILE"], ["STOREFRONT"], ["MOBILE", "STOREFRONT"]]) assert.deepEqual(parseFulfillments(values), values);
  for (const values of [[], ["BOTH"], ["REMOTE"], ["MOBILE", "MOBILE"], null]) assert.throws(() => parseFulfillments(values));
});
test("mode configuration rejects accidental policies and malformed money", () => {
  for (const value of [
    { ...config("QUOTE"), timing: null },
    { ...config("SERVICE"), timing: { durationMinutes: 0, bufferBeforeMinutes: 0, bufferAfterMinutes: 0 } },
    { ...config("SERVICE"), timing: { durationMinutes: 10, bufferBeforeMinutes: -1, bufferAfterMinutes: 0 } },
    { ...config("RENTAL"), durationUnit: "WEEK" },
    { ...config("RESERVATION"), capacityUnit: "SEAT_GUESS" },
    { ...config("QUOTE"), price: { kind: "UNKNOWN", unitAmountCents: 0 } },
    { ...config("SERVICE"), price: { kind: "KNOWN", basis: "QUANTITY_DURATION", unitAmountCents: 100 } },
  ]) assert.throws(() => parseModeConfig(value));
});
test("snapshot includes quantity, rental duration, fixed and unknown prices", () => {
  const rental = offering("RENTAL", { kind: "KNOWN", unitAmountCents: 2500, basis: "QUANTITY_DURATION" });
  const snapshot = createCheckoutSnapshot(scope, modes, rental, "request", { mode: "RENTAL", fulfillment: "STOREFRONT", quantity: 2, durationUnits: 3 }, now);
  assert.equal(snapshot.underlyingSubtotalCents, 15000);
  assert.equal(snapshot.platformFeeCents, 400);
  assert.equal(snapshot.durationUnits, 3);
  assert.equal(snapshot.durationUnit, "DAY");
  assert.equal(snapshot.pricingPolicyVersion, PRICING_POLICY_VERSION);
  assert.equal(snapshot.processingCostPayer, "JOBFRAY");
  assert.ok(Object.isFrozen(snapshot));
  const fixed = createCheckoutSnapshot(scope, modes, offering("SERVICE", { kind: "KNOWN", basis: "FIXED", unitAmountCents: 0 }), "request", selection, now);
  assert.equal(fixed.platformFeeCents, 200);
  const unknown = createCheckoutSnapshot(scope, modes, offering("RESERVATION", { kind: "UNKNOWN" }), "request", { ...selection, mode: "RESERVATION" }, now);
  assert.equal(unknown.underlyingSubtotalCents, null);
  assert.equal(unknown.platformFeeCents, 300);
  const quote = createCheckoutSnapshot(scope, modes, offering("QUOTE"), "request", { ...selection, mode: "QUOTE", quantity: 100 }, now);
  assert.equal(quote.underlyingSubtotalCents, 100000);
  assert.equal(quote.platformFeeCents, 300);
});
test("checkout rejects overrides, unsafe totals and invalid selections", () => {
  for (const values of [
    { ...selection, platformFeeCents: 1 }, { ...selection, underlyingSubtotalCents: 0 },
    { ...selection, quantity: 0 }, { ...selection, quantity: 1.5 }, { ...selection, quantity: Number.MAX_SAFE_INTEGER },
    { ...selection, durationUnits: 2 }, { ...selection, mode: "QUOTE" }, { ...selection, fulfillment: "BOTH" },
  ]) assert.throws(() => createCheckoutSnapshot(scope, modes, offering(), "request", values, now));
  assert.throws(() => createCheckoutSnapshot(scope, modes, { ...offering(), businessId: other }, "request", selection, now));
  assert.throws(() => createCheckoutSnapshot(scope, [], offering(), "request", selection, now));
  assert.throws(() => createCheckoutSnapshot(scope, modes, { ...offering(), active: false }, "request", selection, now));
  assert.throws(() => createCheckoutSnapshot(scope, modes, offering("RENTAL", { kind: "KNOWN", basis: "QUANTITY_DURATION", unitAmountCents: 100 }), "request", { ...selection, mode: "RENTAL" }, now));
  assert.throws(() => createCheckoutSnapshot(scope, modes, offering("SERVICE", { kind: "KNOWN", basis: "FIXED", unitAmountCents: 100 }), "request", { ...selection, quantity: 2 }, now));
});
test("idempotent replay returns historical snapshot without reading changed pricing", async () => {
  let saved: StoredCheckout | null = null;
  let reads = 0;
  const store: CheckoutStore = { async withRequestLock(_scope, _id, fn) { return fn({
    async existing() { return saved; },
    async catalog() { reads++; return { offering: offering(), enabledModes: modes }; },
    async insert(value) { saved = value; },
  }); } };
  const first = await prepareCheckout(store, scope, "request", "key", selection, now);
  assert.equal(await prepareCheckout(store, scope, "request", "key", selection, now), first);
  assert.equal(reads, 1);
  assert.equal(first.platformFeeCents, 200);
  await assert.rejects(prepareCheckout(store, scope, "request", "key", { ...selection, quantity: 2 }, now), /conflict/);
  await assert.rejects(prepareCheckout(store, scope, "request", "different-key", selection, now), /conflict/);
  await assert.rejects(prepareCheckout(store, { ...scope, businessId: other }, "request", "key", selection, now), /scope/);
});
test("tenant scope requires unexpired server session and active matching membership", () => {
  const session = { ownerId: owner, expiresAt: new Date("2026-11-23T13:00:00Z") };
  const membership = { businessId: business, ownerId: owner, active: true };
  assert.deepEqual(requireTenantScope(session, membership, business, now), scope);
  assert.ok(Object.isFrozen(requireTenantScope(session, membership, business, now)));
  for (const invalid of [null, { ...session, expiresAt: now }, { ...session, expiresAt: new Date("invalid") }]) assert.throws(() => requireTenantScope(invalid, membership, business, now));
  assert.throws(() => requireTenantScope(session, membership, other, now));
  assert.throws(() => requireTenantScope(session, { ...membership, ownerId: "other-owner" as OwnerId }, business, now));
  assert.throws(() => requireTenantScope(session, { ...membership, active: false }, business, now));
  assert.throws(() => requireTenantScope(session, null, business, now));
});
const resource: Resource = { id: resourceId, businessId: business, name: "Shared capacity", capacity: 2, timeZone: "America/Chicago" };
function allocation(id: string, start = "13:00", end = "14:00", units = 1): Allocation {
  return { id, businessId: business, requestId: "request-" + id, resourceId, startsAt: `2026-11-23T${start}:00Z`,
    endsAt: `2026-11-23T${end}:00Z`, units, status: "CONFIRMED", holdExpiresAt: null };
}
test("shared resource capacity counts requests across offerings", () => {
  assert.doesNotThrow(() => assertCapacity(scope, resource, [allocation("a")], allocation("b"), now));
  assert.throws(() => assertCapacity(scope, resource, [allocation("a", "13:00", "14:00", 2)], allocation("b"), now), /capacity/);
  assert.throws(() => assertCapacity(scope, resource, [], { ...allocation("b"), businessId: other }, now), /scope/);
  assert.throws(() => assertCapacity(scope, { ...resource, businessId: other }, [], allocation("b"), now), /Tenant/);
  assert.throws(() => assertCapacity(scope, resource, [], { ...allocation("b"), resourceId: "other-resource" as ResourceId }, now), /scope/);
});
test("adjacent intervals and nonconcurrent overlaps do not consume extra capacity", () => {
  assert.doesNotThrow(() => assertCapacity(scope, resource,
    [allocation("a", "13:00", "14:00"), allocation("b", "14:00", "15:00")], allocation("c", "13:00", "15:00"), now));
});
test("expired holds release capacity; live holds block; malformed allocations fail", () => {
  const held = { ...allocation("a", "13:00", "14:00", 2), status: "HELD" as const, holdExpiresAt: now.toISOString() };
  assert.doesNotThrow(() => assertCapacity(scope, resource, [held], allocation("b"), now));
  assert.throws(() => assertCapacity(scope, resource, [{ ...held, holdExpiresAt: "2026-11-23T12:10:00Z" }], allocation("b"), now), /capacity/);
  for (const bad of [{ ...held, holdExpiresAt: null }, { ...allocation("a"), units: 0 },
    { ...allocation("a"), endsAt: allocation("a").startsAt }, { ...allocation("a"), startsAt: "2026-02-30T13:00:00Z" }]) {
    assert.throws(() => assertCapacity(scope, resource, [], bad, now));
  }
  assert.throws(() => assertCapacity(scope, resource, [], held, now), /expired/);
});
test("scheduling configuration has no implicit horizon or quote calendar", () => {
  const policy = { businessId: business, offeringId, mode: "SERVICE" as const, horizonDays: 30, minimumLeadMinutes: 0, holdMinutes: 5, version: "approved-test-policy" };
  assert.doesNotThrow(() => validateSchedulingPolicy(policy));
  assert.throws(() => validateSchedulingPolicy({ ...policy, mode: "QUOTE" as "SERVICE" }));
  assert.throws(() => validateSchedulingPolicy({ ...policy, holdMinutes: 0 }));
  assert.doesNotThrow(() => validateAvailabilityRule({ businessId: business, resourceId, weekday: 0, startMinute: 0, endMinute: 1440 }));
  assert.throws(() => validateAvailabilityRule({ businessId: business, resourceId, weekday: 7 as 0, startMinute: 0, endMinute: 1440 }));
});
test("Prisma column projection preserves typed config and safely maps BigInt cents", () => {
  const row = { mode: "RENTAL", fulfillments: ["MOBILE", "STOREFRONT"], priceKind: "KNOWN", priceBasis: "QUANTITY_DURATION",
    unitAmountCents: 2000n, durationMinutes: null, bufferBeforeMinutes: null, bufferAfterMinutes: null, durationUnit: "DAY", capacityUnit: null };
  assert.deepEqual(mapOfferingModeRow(row), config("RENTAL", { kind: "KNOWN", unitAmountCents: 2000, basis: "QUANTITY_DURATION" }));
  for (const changes of [{ unitAmountCents: 9007199254740993n }, { priceKind: "UNKNOWN" }, { capacityUnit: "PERSON" }, { durationMinutes: 30 }]) assert.throws(() => mapOfferingModeRow({ ...row, ...changes }));
});
test("directory distinguishes business mode from fulfillment and escapes at rendering", () => {
  assert.deepEqual(parseDirectoryQuery({ location: " Austin\u0000 ", category: "equipment", mode: "RENTAL", fulfillment: "MOBILE" }),
    { location: "Austin", category: "equipment", mode: "RENTAL", fulfillment: "MOBILE" });
  assert.deepEqual(parseDirectoryQuery({ mode: ["RENTAL", "SERVICE"], fulfillment: "BOTH" }), { location: "", category: "", mode: "", fulfillment: "" });
  assert.equal(parseDirectoryQuery({ category: "x".repeat(1000) }).category.length, 120);
});

test("quote requests cannot accidentally reserve time; scheduled modes validate their own facts", async () => {
  const { parseCustomerRequest } = await import("../lib/domain/requests");
  const quote = { id: "request", businessId: business, offeringId, mode: "QUOTE", fulfillment: "MOBILE", quantity: 1, status: "SUBMITTED", customerMessage: "Details" };
  assert.equal(parseCustomerRequest(quote).mode, "QUOTE");
  assert.throws(() => parseCustomerRequest({ ...quote, startsAt: "2026-11-23T13:00:00Z" }));
  for (const mode of ["RENTAL", "SERVICE", "RESERVATION"]) {
    const request = { id: "request", businessId: business, offeringId, mode, fulfillment: "STOREFRONT", quantity: 1,
      status: "HELD", startsAt: "2026-11-23T13:00:00Z", endsAt: "2026-11-23T14:00:00Z", timeZone: "America/Chicago", holdExpiresAt: "2026-11-23T12:10:00Z" };
    assert.equal(parseCustomerRequest(request).mode, mode);
    assert.throws(() => parseCustomerRequest({ ...request, holdExpiresAt: null }));
    assert.throws(() => parseCustomerRequest({ ...request, timeZone: "Invalid/Timezone" }));
    assert.throws(() => parseCustomerRequest({ ...request, endsAt: request.startsAt }));
  }
});

test("quantity and duration storage bounds cannot be bypassed with a zero price", () => {
  const free = offering("RENTAL", { kind: "KNOWN", basis: "QUANTITY_DURATION", unitAmountCents: 0 });
  for (const quantities of [{ quantity: 2147483648, durationUnits: 1 }, { quantity: 1, durationUnits: 2147483648 }]) {
    assert.throws(() => createCheckoutSnapshot(scope, modes, free, "request", { mode: "RENTAL", fulfillment: "MOBILE", ...quantities }, now), /storage range/);
  }
});

test("disabling one business mode preserves other modes on the same offering", () => {
  const shared = { ...offering(), configurations: [config("SERVICE"), config("QUOTE")] };
  assert.doesNotThrow(() => validateOffering(shared, ["SERVICE"]));
  assert.equal(createCheckoutSnapshot(scope, ["SERVICE"], shared, "request", selection, now).mode, "SERVICE");
  assert.throws(() => createCheckoutSnapshot(scope, ["SERVICE"], shared, "request", { ...selection, mode: "QUOTE" }, now), /disabled/);
});
