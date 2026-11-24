import type { Allocation, Resource } from "./types";
import type { TenantScope } from "./access";
import { count, integer, text } from "./validation";
export function instant(value: unknown): number {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value)) throw new Error("Invalid UTC instant");
  const time = Date.parse(value);
  if (!Number.isFinite(time) || new Date(time).toISOString().replace(".000Z", "Z") !== value.replace(".000Z", "Z")) throw new Error("Invalid UTC instant");
  return time;
}
export function interval(startsAt: string, endsAt: string): readonly [number, number] {
  const start = instant(startsAt), end = instant(endsAt);
  if (start >= end) throw new Error("Invalid interval");
  return [start, end];
}
/** Pure capacity check across ALL offerings sharing a resource, on half-open intervals.
 * Must run inside the future allocation transaction after locking the shared resource.
 * A passing check outside that transaction cannot authorize a booking.
 */
export function assertCapacity(scope: TenantScope, resource: Resource, existing: readonly Allocation[],
  candidate: Allocation, now: Date): void {
  if (scope.businessId !== resource.businessId) throw new Error("Tenant mismatch");
  count(resource.capacity);
  if (!Number.isFinite(now.getTime())) throw new Error("Invalid time");
  const events: [number, number][] = [];
  const ids = new Set<string>();
  for (const allocation of [...existing, candidate]) {
    if (allocation.businessId !== scope.businessId || allocation.resourceId !== resource.id) throw new Error("Allocation scope mismatch");
    text(allocation.id); text(allocation.requestId);
    if (ids.has(allocation.id)) throw new Error("Duplicate allocation");
    ids.add(allocation.id);
    count(allocation.units);
    const [start, end] = interval(allocation.startsAt, allocation.endsAt);
    if (!["HELD", "CONFIRMED", "RELEASED"].includes(allocation.status)) throw new Error("Invalid allocation status");
    if (allocation.status === "HELD") {
      if (allocation.holdExpiresAt === null) throw new Error("Hold expiry required");
      const expiry = instant(allocation.holdExpiresAt);
      if (expiry <= now.getTime()) {
        if (allocation === candidate) throw new Error("Candidate hold expired");
        continue;
      }
    } else if (allocation.holdExpiresAt !== null) throw new Error("Only held allocations have an expiry");
    if (allocation.status === "RELEASED") {
      if (allocation === candidate) throw new Error("Candidate must consume capacity");
      continue;
    }
    events.push([start, allocation.units], [end, -allocation.units]);
  }
  // Ends before starts at equal instants: adjacent allocations do not overlap.
  events.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  let occupied = 0;
  for (const [, delta] of events) {
    occupied += delta;
    integer(occupied);
    if (occupied > resource.capacity) throw new Error("Resource capacity exceeded");
  }
}
