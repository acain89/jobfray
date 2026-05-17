import { NextResponse } from "next/server";
import { WORKER_SESSION_COOKIE } from "@/lib/worker-auth";

export const runtime = "nodejs";

export async function POST(): Promise<NextResponse> {
  const response = NextResponse.json({
    ok: true,
  });

  response.cookies.set(WORKER_SESSION_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });

  return response;
}