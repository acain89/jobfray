import bcrypt from "bcryptjs";
import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import {
  createWorkerSessionToken,
  WORKER_SESSION_COOKIE,
} from "@/lib/worker-auth";
import { workerLoginSchema } from "@/lib/worker-validation";
import {
  enforceRateLimit,
  getRequestIp,
} from "@/lib/rate-limit";

export const runtime = "nodejs";

function normalizeUsername(username: string): string {
  return username.trim().toLowerCase();
}

export async function POST(
  request: NextRequest,
): Promise<NextResponse> {
  try {
    const body: unknown = await request.json();

    const parsed = workerLoginSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          ok: false,
          error:
            parsed.error.issues[0]?.message ??
            "Invalid login details.",
        },
        { status: 400 },
      );
    }

    const input = parsed.data;
    const username = normalizeUsername(input.username);
    const ip = getRequestIp(request);

    const rateLimit = enforceRateLimit({
      key: `worker-login:${ip}:${username}`,
      limit: 10,
      windowMs: 15 * 60 * 1000,
    });

    if (!rateLimit.allowed) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Too many login attempts. Try again later.",
        },
        { status: 429 },
      );
    }

    const worker = await prisma.worker.findUnique({
      where: {
        username,
      },
      select: {
        id: true,
        username: true,
        passwordHash: true,
        status: true,
      },
    });

    if (!worker || worker.status === "DELETED") {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Invalid username or password.",
        },
        { status: 401 },
      );
    }

    const passwordMatches = await bcrypt.compare(
      input.password,
      worker.passwordHash,
    );

    if (!passwordMatches) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Invalid username or password.",
        },
        { status: 401 },
      );
    }

    const token = createWorkerSessionToken({
      workerId: worker.id,
      username: worker.username,
    });

    const response = NextResponse.json({
      ok: true,
      workerId: worker.id,
    });

    response.cookies.set(
      WORKER_SESSION_COOKIE,
      token,
      {
        httpOnly: true,
        sameSite: "lax",
        secure:
          process.env.NODE_ENV === "production",
        path: "/",
        maxAge: 60 * 60 * 24 * 30,
      },
    );

    return response;
  } catch (error) {
    console.error(
      "POST /api/worker/login failed:",
      error,
    );

    return NextResponse.json(
      {
        ok: false,
        error: "Unable to log in.",
      },
      { status: 500 },
    );
  }
}