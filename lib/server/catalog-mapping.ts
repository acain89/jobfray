import type { OfferingModeConfig } from "../domain/types";
import { keys, parseModeConfig, record } from "../domain/validation";
/** Explicit projection from Prisma's nullable typed columns into the domain union.
 * BigInt storage preserves cents; reject values outside JavaScript's safe integer range.
 * Do not silently turn a malformed known price into UNKNOWN.
 */
export function mapOfferingModeRow(input: unknown): OfferingModeConfig {
  const row = record(input);
  keys(row, ["mode", "fulfillments", "priceKind", "priceBasis", "unitAmountCents", "durationMinutes", "bufferBeforeMinutes", "bufferAfterMinutes", "durationUnit", "capacityUnit"]);
  if (row.priceKind !== "KNOWN" && row.priceKind !== "UNKNOWN") throw new Error("Invalid stored price kind");
  if (row.priceKind === "UNKNOWN" && (row.priceBasis !== null || row.unitAmountCents !== null)) throw new Error("Unknown price has monetary fields");
  if (row.priceKind === "KNOWN" && typeof row.unitAmountCents !== "bigint") throw new Error("Expected stored BigInt cents");
  const price = row.priceKind === "UNKNOWN" ? { kind: "UNKNOWN" } : {
    kind: "KNOWN", basis: row.priceBasis, unitAmountCents: Number(row.unitAmountCents),
  };
  const base = { mode: row.mode, fulfillments: row.fulfillments, price };
  if (row.mode !== "RENTAL" && row.durationUnit !== null) throw new Error("Rental-only field");
  if (row.mode !== "RESERVATION" && row.capacityUnit !== null) throw new Error("Reservation-only field");
  if (row.mode !== "SERVICE" && [row.durationMinutes, row.bufferBeforeMinutes, row.bufferAfterMinutes].some(v => v !== null)) throw new Error("Service-only field");
  switch (row.mode) {
    case "QUOTE": return parseModeConfig(base);
    case "RENTAL": return parseModeConfig({ ...base, durationUnit: row.durationUnit });
    case "RESERVATION": return parseModeConfig({ ...base, capacityUnit: row.capacityUnit });
    case "SERVICE": return parseModeConfig({ ...base, timing:
      [row.durationMinutes, row.bufferBeforeMinutes, row.bufferAfterMinutes].every(v => v === null) ? null : {
        durationMinutes: row.durationMinutes, bufferBeforeMinutes: row.bufferBeforeMinutes, bufferAfterMinutes: row.bufferAfterMinutes,
      } });
    default: throw new Error("Invalid stored mode");
  }
}
