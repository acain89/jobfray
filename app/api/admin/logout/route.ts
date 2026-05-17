import { NextResponse } from "next/server";
import { clearAdminSession } from "@/lib/admin-auth";

export const runtime = "nodejs";

export async function POST(): Promise<NextResponse> {
  await clearAdminSession();

  return NextResponse.json({
    ok: true,
  });
}