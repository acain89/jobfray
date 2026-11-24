import type { AvailabilityException, AvailabilityRule, SchedulingPolicy } from "./types";
import { businessMode, count, integer, text } from "./validation";
export function validateSchedulingPolicy(policy: SchedulingPolicy): void {
  if (businessMode(policy.mode) === "QUOTE") throw new Error("Quote requests are unscheduled");
  count(policy.horizonDays); count(policy.minimumLeadMinutes, 0); count(policy.holdMinutes);
  text(policy.version);
}
export function validateAvailabilityRule(rule: AvailabilityRule): void {
  if (integer(rule.weekday) > 6 || integer(rule.startMinute) >= integer(rule.endMinute, 1) || rule.endMinute > 1440) {
    throw new Error("Invalid local availability window");
  }
}

export function validateTimeZone(value: string): void {
  text(value);
  // Validate the IANA identifier without inferring the host's time zone.
  new Intl.DateTimeFormat("en-US", { timeZone: value }).format(0);
}
export function validateAvailabilityException(value: AvailabilityException): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value.date)) throw new Error("Invalid local date");
  const date = new Date(value.date + "T00:00:00Z");
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value.date) throw new Error("Invalid local date");
  if (!Array.isArray(value.windows)) throw new Error("Expected windows");
  for (const window of value.windows) {
    validateAvailabilityRule({ businessId: value.businessId, resourceId: value.resourceId, weekday: 0, ...window });
  }
}
