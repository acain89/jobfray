// Node-only module: never import into a Client Component. No provider dependencies.
import { randomUUID } from "node:crypto";
import type { BusinessMode, CheckoutSnapshot, FeeCents, Offering } from "../domain/types";
import { businessMode, count, fulfillment, integer, keys, parseModeConfig, record, text, validateOffering } from "../domain/validation";
import type { TenantScope } from "../domain/access";
export const PRICING_POLICY_VERSION = "jobfray-platform-fees-v2-2026-11-23";
/** The sole fee calculator. Null is permitted only for a genuinely unknown stored price. */
export function calculatePlatformFee(mode: BusinessMode, underlyingSubtotalCents: number | null): FeeCents {
  businessMode(mode);
  if (underlyingSubtotalCents !== null) integer(underlyingSubtotalCents);
  if (mode === "QUOTE" || underlyingSubtotalCents === null) return 300;
  if (underlyingSubtotalCents <= 3000) return 200;
  if (underlyingSubtotalCents <= 7500) return 300;
  if (underlyingSubtotalCents <= 15099) return 400;
  return 500;
}
function multiply(...factors: number[]): number {
  return factors.reduce((total, factor) => integer(total * integer(factor)), 1);
}
/** Trusted repository data + untrusted selections. Never pass browser/business-supplied price data.
 * Future checkout adapter must load enabled modes and offering from tenant-scoped storage.
 * This constructs a snapshot only: it does not create checkout, reserve stock, or confirm a request.
 */
export function createCheckoutSnapshot(scope: TenantScope, enabledModes: readonly BusinessMode[], offering: Offering,
  requestId: string, selections: unknown, now: Date): CheckoutSnapshot {
  if (scope.businessId !== offering.businessId) throw new Error("Tenant mismatch");
  validateOffering(offering, enabledModes);
  if (!offering.active) throw new Error("Inactive offering");
  text(requestId);
  if (!Number.isFinite(now.getTime())) throw new Error("Invalid checkout time");
  const value = record(selections);
  keys(value, ["mode", "fulfillment", "quantity", "durationUnits"]);
  const mode = businessMode(value.mode);
  if (!enabledModes.includes(mode)) throw new Error("Business mode is disabled");
  const selectedFulfillment = fulfillment(value.fulfillment);
  const rawConfig = offering.configurations.find(c => c.mode === mode);
  if (!rawConfig) throw new Error("Unsupported offering mode");
  const config = parseModeConfig(rawConfig);
  if (!config.fulfillments.includes(selectedFulfillment)) throw new Error("Unsupported fulfillment");
  const quantity = count(value.quantity);
  const durationUnits = value.durationUnits === undefined ? null : count(value.durationUnits);
  if (mode !== "RENTAL" && durationUnits !== null) throw new Error("Duration is rental-only");
  const price = config.price;
  let subtotal: number | null = null;
  if (price.kind === "KNOWN") {
    switch (price.basis) {
      case "FIXED":
        if (quantity !== 1 || durationUnits !== null) throw new Error("Fixed pricing cannot omit quantity/duration charges");
        subtotal = price.unitAmountCents; break;
      case "QUANTITY":
        if (durationUnits !== null) throw new Error("Unexpected duration for quantity price");
        subtotal = multiply(price.unitAmountCents, quantity); break;
      case "QUANTITY_DURATION":
        if (durationUnits === null) throw new Error("Rental duration required");
        subtotal = multiply(price.unitAmountCents, quantity, durationUnits); break;
    }
  }
  return Object.freeze({ id: randomUUID(), businessId: offering.businessId, offeringId: offering.id, requestId,
    mode, fulfillment: selectedFulfillment, quantity, durationUnits,
    durationUnit: config.mode === "RENTAL" ? config.durationUnit : null, priceKind: price.kind,
    priceBasis: price.kind === "KNOWN" ? price.basis : null,
    unitAmountCents: price.kind === "KNOWN" ? price.unitAmountCents : null,
    underlyingSubtotalCents: subtotal, platformFeeCents: calculatePlatformFee(mode, subtotal),
    pricingPolicyVersion: PRICING_POLICY_VERSION, currency: "USD", recipient: "JOBFRAY",
    processingCostPayer: "JOBFRAY", createdAt: now.toISOString() });
}
