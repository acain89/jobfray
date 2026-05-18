import bcrypt from "bcryptjs";
import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import {
  createWorkerSessionToken,
  WORKER_SESSION_COOKIE,
} from "@/lib/worker-auth";
import { workerSignupSchema } from "@/lib/worker-validation";
import {
  enforceRateLimit,
  getRequestIp,
} from "@/lib/rate-limit";

export const runtime = "nodejs";

function normalizeUsername(username: string): string {
  return username.trim().toLowerCase();
}

function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");

  if (digits.length === 11 && digits.startsWith("1")) {
    return digits.slice(1);
  }

  return digits;
}

function normalizeZip(zip: string): string {
  return zip.trim();
}

export async function POST(
  request: NextRequest,
): Promise<NextResponse> {
  try {
    const body: unknown = await request.json();

    const parsed = workerSignupSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          ok: false,
          error:
            parsed.error.issues[0]?.message ??
            "Invalid signup details.",
        },
        { status: 400 },
      );
    }

    const input = parsed.data;

    const normalizedUsername = normalizeUsername(
      input.username,
    );

    const normalizedPhone = normalizePhone(
      input.phone,
    );

    const normalizedZip = normalizeZip(
      input.homeZip,
    );

    const ip = getRequestIp(request);

    const rateLimit = enforceRateLimit({
      key: `worker-signup:${ip}`,
      limit: 5,
      windowMs: 60 * 60 * 1000,
    });

    if (!rateLimit.allowed) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Too many signup attempts. Try again later.",
        },
        { status: 429 },
      );
    }

    if (normalizedPhone.length !== 10) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Please enter a valid 10-digit phone number.",
        },
        { status: 400 },
      );
    }

    const existingWorker =
      await prisma.worker.findFirst({
        where: {
          OR: [
            {
              username: normalizedUsername,
            },
            {
              phone: normalizedPhone,
            },
          ],
        },
        select: {
          id: true,
          username: true,
          phone: true,
        },
      });

    if (existingWorker) {
      return NextResponse.json(
        {
          ok: false,
          error:
            existingWorker.username ===
            normalizedUsername
              ? "That username is already taken."
              : "That phone number is already attached to a worker account.",
        },
        { status: 409 },
      );
    }

    const passwordHash = await bcrypt.hash(
      input.password,
      10,
    );

    const worker = await prisma.worker.create({
      data: {
        username: normalizedUsername,
        passwordHash,
        firstName: input.firstName.trim(),
        lastInitial:
          input.lastInitial?.trim() || null,
        phone: normalizedPhone,
        homeZip: normalizedZip,
        status: "PENDING_PHONE",
        subscriptionActive: false,
      },
      select: {
        id: true,
        username: true,
      },
    });

    await prisma.workerServiceArea.create({
      data: {
        workerId: worker.id,
        zip: normalizedZip,
        radiusMiles: 10,
      },
    });

    const token =
      createWorkerSessionToken({
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
      "POST /api/worker/signup failed:",
      error,
    );

    return NextResponse.json(
      {
        ok: false,
        error:
          "Unable to create worker account.",
      },
      { status: 500 },
    );
  }
}