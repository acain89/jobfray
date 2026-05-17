import "server-only";

import { cookies } from "next/headers";
import { createHash, timingSafeEqual } from "crypto";

const ADMIN_COOKIE = "jobfray_admin";

function sha256(value: string): string {
  return createHash("sha256")
    .update(value)
    .digest("hex");
}

export async function createAdminSession(): Promise<void> {
  const secret = process.env.ADMIN_SECRET;

  if (!secret) {
    throw new Error("ADMIN_SECRET missing.");
  }

  const cookieStore = await cookies();

  cookieStore.set({
    name: ADMIN_COOKIE,
    value: sha256(secret),
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 12,
  });
}

export async function clearAdminSession(): Promise<void> {
  const cookieStore = await cookies();

  cookieStore.delete(ADMIN_COOKIE);
}

export async function isAdminAuthenticated(): Promise<boolean> {
  const secret = process.env.ADMIN_SECRET;

  if (!secret) {
    return false;
  }

  const cookieStore = await cookies();

  const cookie =
    cookieStore.get(ADMIN_COOKIE)?.value;

  if (!cookie) {
    return false;
  }

  const expected = sha256(secret);

  return timingSafeEqual(
    Buffer.from(cookie),
    Buffer.from(expected),
  );
}