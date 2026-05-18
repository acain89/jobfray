import "server-only";

import twilio from "twilio";

const accountSid =
  process.env.TWILIO_ACCOUNT_SID?.trim() ?? "";

const authToken =
  process.env.TWILIO_AUTH_TOKEN?.trim() ?? "";

const rawPhoneNumber =
  process.env.TWILIO_PHONE_NUMBER?.trim() ?? "";

export const twilioPhoneNumber =
  rawPhoneNumber.startsWith("+")
    ? rawPhoneNumber
    : rawPhoneNumber
      ? `+${rawPhoneNumber}`
      : "";

export const twilioClient =
  accountSid &&
  authToken
    ? twilio(
        accountSid,
        authToken,
      )
    : null;

export function isTwilioReady(): boolean {
  return Boolean(
    twilioClient &&
      twilioPhoneNumber,
  );
}

export function normalizeUsPhoneNumber(
  value: string,
): string {
  const digits =
    value.replace(/\D/g, "");

  if (
    digits.length === 11 &&
    digits.startsWith("1")
  ) {
    return `+${digits}`;
  }

  if (digits.length === 10) {
    return `+1${digits}`;
  }

  return value;
}