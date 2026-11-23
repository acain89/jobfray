import test from "node:test";
import assert from "node:assert/strict";
import { requireTenantScope } from "../lib/domain/access";
import {
  BOOKING_WINDOW_DAYS,
  parseDirectoryQuery,
  platformFee,
  validateServiceSchedule,
} from "../lib/domain/policy";
import type {
  BusinessId,
  FeePurpose,
  OwnerId,
  PlatformFeeOrder,
} from "../lib/domain/types";
const business = "synthetic-business-a" as BusinessId;
const otherBusiness = "synthetic-business-b" as BusinessId;
const owner = "synthetic-owner" as OwnerId;
const now = new Date("2026-11-23T12:00:00Z");
const session = { ownerId: owner, expiresAt: new Date("2026-11-23T13:00:00Z") };
const membership = { businessId: business, ownerId: owner, active: true };

test("JobFray-only fees are exact integer cents, independent of client amounts", () => {
  assert.equal(platformFee("QUOTE_REQUEST"), 300);
  assert.equal(platformFee("CONFIRMED_APPOINTMENT"), 500);
  assert.throws(() => platformFee("TRANSFER_TO_BUSINESS" as FeePurpose));
  assert.throws(() => platformFee("toString" as FeePurpose));
  const quote: PlatformFeeOrder = {
    id: "order",
    businessId: business,
    requestId: "quote",
    purpose: "QUOTE_REQUEST",
    amountCents: 300,
    currency: "USD",
    recipient: "JOBFRAY",
    state: "CREATED",
    idempotencyKey: "synthetic-key",
  };
  assert.equal(quote.recipient, "JOBFRAY");
  // @ts-expect-error A quote request cannot carry the appointment fee.
  const invalid: PlatformFeeOrder = { ...quote, amountCents: 500 };
  void invalid; // Type-only negative fixture; never submitted.
});
test("verified owner and active membership yield an immutable tenant scope", () => {
  const scope = requireTenantScope(session, membership, business, now);
  assert.deepEqual(scope, { businessId: business, ownerId: owner });
  assert.ok(Object.isFrozen(scope));
});
for (const [label, value] of [
  ["no session", null],
  ["expired", { ...session, expiresAt: now }],
  ["invalid expiry", { ...session, expiresAt: new Date("invalid") }],
] as const) {
  test("access fails closed: " + label, () =>
    assert.throws(
      () => requireTenantScope(value, membership, business, now),
      /denied/,
    ),
  );
}
test("a forged business ID or another owner's membership cannot cross tenants", () => {
  assert.throws(
    () => requireTenantScope(session, membership, otherBusiness, now),
    /denied/,
  );
  assert.throws(
    () =>
      requireTenantScope(
        session,
        { ...membership, ownerId: "other-owner" as OwnerId },
        business,
        now,
      ),
    /denied/,
  );
  assert.throws(
    () =>
      requireTenantScope(
        session,
        { ...membership, active: false },
        business,
        now,
      ),
    /denied/,
  );
  assert.throws(
    () => requireTenantScope(session, null, business, now),
    /denied/,
  );
  assert.throws(
    () =>
      requireTenantScope(session, membership, business, new Date("invalid")),
    /denied/,
  );
});
test("the scheduling contract retains the 14-day window and valid service timing", () => {
  assert.equal(BOOKING_WINDOW_DAYS, 14);
  const schedule = {
    durationMinutes: 60,
    bufferBeforeMinutes: 10,
    bufferAfterMinutes: 15,
    concurrentCapacity: 2,
  };
  assert.doesNotThrow(() => validateServiceSchedule(schedule));
  for (const change of [
    { durationMinutes: 0 },
    { durationMinutes: 1.5 },
    { bufferBeforeMinutes: -1 },
    { bufferAfterMinutes: Number.NaN },
    { concurrentCapacity: 0 },
    { concurrentCapacity: Infinity },
    { bufferAfterMinutes: Number.MAX_SAFE_INTEGER },
  ]) {
    assert.throws(() => validateServiceSchedule({ ...schedule, ...change }));
  }
});
test("directory filters are bounded, normalized, and do not accept repeated or unknown modes", () => {
  assert.deepEqual(
    parseDirectoryQuery({
      location: "  Austin\u0000  ",
      category: "cleaning",
      mode: "REMOTE",
    }),
    { location: "Austin", category: "cleaning", mode: "REMOTE" },
  );
  assert.deepEqual(
    parseDirectoryQuery({ location: ["a", "b"], mode: "unknown" }),
    { location: "", category: "", mode: "" },
  );
  assert.equal(
    parseDirectoryQuery({ category: "x".repeat(1000) }).category.length,
    120,
  );
});
