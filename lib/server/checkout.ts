import { createHash } from "node:crypto";
import type { TenantScope } from "../domain/access";
import type { BusinessMode, CheckoutSnapshot, Offering } from "../domain/types";
import { businessMode, count, fulfillment, keys, record, text } from "../domain/validation";
import { createCheckoutSnapshot } from "./fees";
export interface StoredCheckout {
  readonly idempotencyKey: string;
  readonly payloadHash: string;
  readonly snapshot: CheckoutSnapshot;
}
export interface CheckoutTransaction {
  existing(): Promise<StoredCheckout | null>;
  catalog(): Promise<{ readonly offering: Offering; readonly enabledModes: readonly BusinessMode[] }>;
  insert(value: StoredCheckout): Promise<void>;
}
export interface CheckoutStore {
  /** Authorize request ownership; lock by (businessId, requestId); use one transaction.
   * Catalog must be the request's tenant-owned offering. Unique request snapshot and scoped
   * idempotency key must be enforced in storage. No callback retry after a committed result.
   */
  withRequestLock<T>(scope: TenantScope, requestId: string,
    operation: (tx: CheckoutTransaction) => Promise<T>): Promise<T>;
}
/** Application boundary only; no adapter or public endpoint exists in this phase. */
export async function prepareCheckout(store: CheckoutStore, scope: TenantScope, requestId: string,
  idempotencyKey: string, selections: unknown, now: Date): Promise<CheckoutSnapshot> {
  text(requestId); text(idempotencyKey);
  const value = record(selections);
  keys(value, ["mode", "fulfillment", "quantity", "durationUnits"]);
  const normalized = { mode: businessMode(value.mode), fulfillment: fulfillment(value.fulfillment),
    quantity: count(value.quantity), ...(value.durationUnits === undefined ? {} : { durationUnits: count(value.durationUnits) }) };
  const payloadHash = createHash("sha256").update(JSON.stringify({ businessId: scope.businessId, requestId, ...normalized })).digest("hex");
  return store.withRequestLock(scope, requestId, async tx => {
    const existing = await tx.existing();
    if (existing) {
      if (existing.snapshot.businessId !== scope.businessId || existing.snapshot.requestId !== requestId) throw new Error("Stored checkout scope mismatch");
      if (existing.idempotencyKey !== idempotencyKey || existing.payloadHash !== payloadHash) throw new Error("Idempotency conflict");
      // Deliberately do not read current catalog or recalculate historical price/fee.
      return Object.freeze(existing.snapshot);
    }
    const catalog = await tx.catalog();
    const snapshot = createCheckoutSnapshot(scope, catalog.enabledModes, catalog.offering, requestId, normalized, now);
    await tx.insert({ idempotencyKey, payloadHash, snapshot });
    return snapshot;
  });
}
