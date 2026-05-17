import bcrypt from "bcryptjs";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createWorkerSessionToken, WORKER_SESSION_COOKIE } from "@/lib/worker-auth";
import { workerSignupSchema } from "@/lib/worker-validation";

export const runtime = "nodejs";

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body: unknown = await request.json();
    const parsed = workerSignupSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          ok: false,
          error: parsed.error.issues[0]?.message ?? "Invalid signup details.",
        },
        { status: 400 },
      );
    }

    const input = parsed.data;

    const existingWorker = await prisma.worker.findFirst({
      where: {
        OR: [
          {
            username: input.username,
          },
          {
            phone: input.phone,
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
            existingWorker.username === input.username
              ? "That username is already taken."
              : "That phone number is already attached to a worker account.",
        },
        { status: 409 },
      );
    }

    const passwordHash = await bcrypt.hash(input.password, 10);

    const worker = await prisma.worker.create({
      data: {
        username: input.username,
        passwordHash,
        firstName: input.firstName,
        lastInitial: input.lastInitial || null,
        phone: input.phone,
        homeZip: input.homeZip,
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
        zip: input.homeZip,
        radiusMiles: 10,
      },
    });

    const token = createWorkerSessionToken({
      workerId: worker.id,
      username: worker.username,
    });

    const response = NextResponse.json({
      ok: true,
      workerId: worker.id,
    });

    response.cookies.set(WORKER_SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });

    return response;
  } catch (error) {
    console.error("POST /api/worker/signup failed:", error);

    return NextResponse.json(
      {
        ok: false,
        error: "Unable to create worker account.",
      },
      { status: 500 },
    );
  }
}