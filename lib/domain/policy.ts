import type { DirectoryQuery, FeePurpose, Service, ServiceMode } from "./types";
export const BOOKING_WINDOW_DAYS = 14;
export const PLATFORM_FEES = {
  QUOTE_REQUEST: 300,
  CONFIRMED_APPOINTMENT: 500,
} as const;
export const SERVICE_MODES = ["AT_CUSTOMER", "AT_BUSINESS", "REMOTE"] as const;
export function platformFee(purpose: FeePurpose): 300 | 500 {
  // Runtime guard: a future API must never accept an arbitrary purpose or amount.
  if (purpose !== "QUOTE_REQUEST" && purpose !== "CONFIRMED_APPOINTMENT") {
    throw new Error("Unsupported fee purpose");
  }
  return PLATFORM_FEES[purpose];
}
export function validateServiceSchedule(
  service: Pick<
    Service,
    | "durationMinutes"
    | "bufferBeforeMinutes"
    | "bufferAfterMinutes"
    | "concurrentCapacity"
  >,
): void {
  const {
    durationMinutes: duration,
    bufferBeforeMinutes: before,
    bufferAfterMinutes: after,
    concurrentCapacity: capacity,
  } = service;
  if (
    ![duration, before, after, capacity].every(Number.isSafeInteger) ||
    duration <= 0 ||
    before < 0 ||
    after < 0 ||
    capacity <= 0 ||
    !Number.isSafeInteger(duration + before + after)
  ) {
    throw new Error("Invalid service schedule");
  }
}
export function parseDirectoryQuery(
  input: Readonly<Record<string, string | string[] | undefined>>,
): DirectoryQuery {
  const text = (value: string | string[] | undefined): string =>
    typeof value === "string"
      ? value
          .normalize("NFC")
          .replace(/[\u0000-\u001f\u007f]/g, "")
          .trim()
          .slice(0, 120)
      : "";
  const mode = text(input.mode);
  return {
    location: text(input.location),
    category: text(input.category),
    mode: SERVICE_MODES.includes(mode as ServiceMode)
      ? (mode as ServiceMode)
      : "",
  };
}
