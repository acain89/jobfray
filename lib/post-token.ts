import crypto from "crypto";

export function generateSecureToken(byteLength = 32): string {
  return crypto.randomBytes(byteLength).toString("base64url");
}

export function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function generateVerificationCode(): string {
  return String(crypto.randomInt(100000, 1000000));
}