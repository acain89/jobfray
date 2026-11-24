import type { BusinessMode, Fulfillment, Offering, OfferingModeConfig, OfferingPrice } from "./types";
export class InputError extends Error {}
export const BUSINESS_MODES = ["RENTAL", "SERVICE", "QUOTE", "RESERVATION"] as const;
export const FULFILLMENTS = ["MOBILE", "STOREFRONT"] as const;
export function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new InputError("Expected object");
  return value as Record<string, unknown>;
}
export function keys(value: Record<string, unknown>, allowed: readonly string[]): void {
  if (Object.keys(value).some(key => !allowed.includes(key))) throw new InputError("Unexpected field");
}
export function integer(value: unknown, minimum = 0): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < minimum || Object.is(value, -0)) {
    throw new InputError("Expected safe nonnegative integer");
  }
  return value;
}
/** Quantities and timing/capacity fields map to Prisma/PostgreSQL Int, unlike BigInt money. */
export function count(value: unknown, minimum = 1): number {
  const parsed = integer(value, minimum);
  if (parsed > 2147483647) throw new InputError("Count exceeds storage range");
  return parsed;
}
export function text(value: unknown): string {
  if (typeof value !== "string" || !value.trim() || value.length > 200) throw new InputError("Invalid text");
  return value;
}
export function businessMode(value: unknown): BusinessMode {
  if (!BUSINESS_MODES.some(mode => mode === value)) throw new InputError("Invalid business mode");
  return value as BusinessMode;
}
export function fulfillment(value: unknown): Fulfillment {
  if (!FULFILLMENTS.some(mode => mode === value)) throw new InputError("Invalid fulfillment");
  return value as Fulfillment;
}
function uniqueList<T>(value: unknown, parse: (item: unknown) => T, allowEmpty = false): readonly T[] {
  if (!Array.isArray(value) || (!allowEmpty && value.length === 0)) throw new InputError("Expected nonempty list");
  const result = value.map(parse);
  if (new Set(result).size !== result.length) throw new InputError("Duplicate option");
  return Object.freeze(result);
}
/** An empty enabled-mode list is allowed while a business is configuring its catalog. */
export const parseBusinessModes = (value: unknown): readonly BusinessMode[] => uniqueList(value, businessMode, true);
export const parseFulfillments = (value: unknown): readonly Fulfillment[] => uniqueList(value, fulfillment);
export function parsePrice(input: unknown): OfferingPrice {
  const value = record(input);
  if (value.kind === "UNKNOWN") {
    keys(value, ["kind"]);
    return Object.freeze({ kind: "UNKNOWN" });
  }
  keys(value, ["kind", "unitAmountCents", "basis"]);
  if (value.kind !== "KNOWN" || typeof value.basis !== "string" || !["FIXED", "QUANTITY", "QUANTITY_DURATION"].includes(value.basis)) {
    throw new InputError("Invalid pricing definition");
  }
  return Object.freeze({ kind: "KNOWN", unitAmountCents: integer(value.unitAmountCents),
    basis: value.basis as "FIXED" | "QUANTITY" | "QUANTITY_DURATION" });
}
export function parseModeConfig(input: unknown): OfferingModeConfig {
  const value = record(input);
  const mode = businessMode(value.mode);
  const common = { mode, fulfillments: parseFulfillments(value.fulfillments), price: parsePrice(value.price) };
  if (common.price.kind === "KNOWN" && common.price.basis === "QUANTITY_DURATION" && mode !== "RENTAL") {
    throw new InputError("Duration pricing is rental-only");
  }
  switch (mode) {
    case "QUOTE":
      keys(value, ["mode", "fulfillments", "price"]);
      return Object.freeze({ ...common, mode });
    case "RENTAL":
      keys(value, ["mode", "fulfillments", "price", "durationUnit"]);
      if (value.durationUnit !== null && value.durationUnit !== "HOUR" && value.durationUnit !== "DAY") throw new InputError("Invalid rental duration unit");
      if (common.price.kind === "KNOWN" && common.price.basis === "QUANTITY_DURATION" && value.durationUnit === null) throw new InputError("Duration price needs a unit");
      return Object.freeze({ ...common, mode, durationUnit: value.durationUnit });
    case "RESERVATION":
      keys(value, ["mode", "fulfillments", "price", "capacityUnit"]);
      if (value.capacityUnit !== null && value.capacityUnit !== "PARTY" && value.capacityUnit !== "PERSON") throw new InputError("Invalid reservation capacity unit");
      return Object.freeze({ ...common, mode, capacityUnit: value.capacityUnit });
    case "SERVICE": {
      keys(value, ["mode", "fulfillments", "price", "timing"]);
      if (value.timing === null) return Object.freeze({ ...common, mode, timing: null });
      const timing = record(value.timing);
      keys(timing, ["durationMinutes", "bufferBeforeMinutes", "bufferAfterMinutes"]);
      const parsed = Object.freeze({ durationMinutes: count(timing.durationMinutes),
        bufferBeforeMinutes: count(timing.bufferBeforeMinutes, 0), bufferAfterMinutes: count(timing.bufferAfterMinutes, 0) });
      integer(parsed.durationMinutes + parsed.bufferBeforeMinutes + parsed.bufferAfterMinutes, 1);
      return Object.freeze({ ...common, mode, timing: parsed });
    }
  }
}
export function validateOffering(offering: Offering, enabled: readonly BusinessMode[]): void {
  text(offering.id); text(offering.businessId); text(offering.name); text(offering.categoryId);
  if (typeof offering.active !== "boolean") throw new InputError("Invalid active flag");
  const modes = parseBusinessModes(enabled);
  if (!Array.isArray(offering.configurations) || !offering.configurations.length) throw new InputError("Offering needs a mode");
  const configs = offering.configurations.map(parseModeConfig);
  if (new Set(configs.map(c => c.mode)).size !== configs.length) throw new InputError("Duplicate offering mode");
  // Retain disabled configurations for history; gate the selected mode on new requests.
  if (offering.active && !configs.some(c => modes.includes(c.mode))) throw new InputError("Offering has no enabled business mode");
}
