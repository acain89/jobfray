import type { BusinessId, CustomerRequest, OfferingId } from "./types";
import { businessMode, count, fulfillment, keys, record, text } from "./validation";
import { instant, interval } from "./capacity";
import { validateTimeZone } from "./scheduling";
/** Database/API projection validator. Authentication and catalog eligibility are separate checks. */
export function parseCustomerRequest(input: unknown): CustomerRequest {
  const value = record(input);
  const mode = businessMode(value.mode);
  const common = { id: text(value.id), businessId: text(value.businessId) as BusinessId,
    offeringId: text(value.offeringId) as OfferingId, fulfillment: fulfillment(value.fulfillment), quantity: count(value.quantity) };
  const baseKeys = ["id", "businessId", "offeringId", "mode", "fulfillment", "quantity", "status"];
  if (mode === "QUOTE") {
    keys(value, [...baseKeys, "customerMessage"]);
    if (value.status !== "SUBMITTED" && value.status !== "CLOSED") throw new Error("Invalid quote state");
    if (typeof value.customerMessage !== "string" || value.customerMessage.length > 10000) throw new Error("Invalid customer message");
    return Object.freeze({ ...common, mode, status: value.status, customerMessage: value.customerMessage });
  }
  keys(value, [...baseKeys, "startsAt", "endsAt", "timeZone", "holdExpiresAt"]);
  if (value.status !== "HELD" && value.status !== "CONFIRMED" && value.status !== "CANCELLED" && value.status !== "EXPIRED") throw new Error("Invalid scheduled state");
  const startsAt = text(value.startsAt), endsAt = text(value.endsAt), timeZone = text(value.timeZone);
  interval(startsAt, endsAt); validateTimeZone(timeZone);
  const holdExpiresAt = value.holdExpiresAt === null ? null : text(value.holdExpiresAt);
  if (value.status === "HELD") {
    if (holdExpiresAt === null) throw new Error("Held request needs expiry");
    instant(holdExpiresAt);
  } else if (holdExpiresAt !== null) throw new Error("Nonheld request cannot have active expiry");
  return Object.freeze({ ...common, mode, status: value.status, startsAt, endsAt, timeZone, holdExpiresAt });
}
