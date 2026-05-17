import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminSession } from "@/lib/admin-auth";

export const runtime = "nodejs";

const loginSchema = z.object({
  password: z.string().min(1),
});

export async function POST(
  request: NextRequest,
): Promise<NextResponse> {
  try {
    const body: unknown = await request.json();

    const parsed = loginSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          ok: false,
          error: "Invalid request.",
        },
        { status: 400 },
      );
    }

    const adminPassword =
      process.env.ADMIN_PASSWORD;

    if (!adminPassword) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Admin system not configured.",
        },
        { status: 500 },
      );
    }

    if (
      parsed.data.password !== adminPassword
    ) {
      return NextResponse.json(
        {
          ok: false,
          error: "Invalid password.",
        },
        { status: 401 },
      );
    }

    await createAdminSession();

    return NextResponse.json({
      ok: true,
    });
  } catch (error) {
    console.error(
      "POST /api/admin/login failed:",
      error,
    );

    return NextResponse.json(
      {
        ok: false,
        error: "Unable to login.",
      },
      { status: 500 },
    );
  }
}