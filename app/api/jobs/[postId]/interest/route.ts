import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getWorkerSession } from "@/lib/worker-auth";
import { getWorkerVerificationState } from "@/lib/worker-verification";
import {
  enforceRateLimit,
  getRequestIp,
} from "@/lib/rate-limit";

export const runtime = "nodejs";

const interestSchema = z.object({
  offeredAmountCents: z.number().int().min(100).max(500000).nullable(),
  message: z.string().trim().max(240).optional().default(""),
});

type RouteContext = {
  params: Promise<{
    postId: string;
  }>;
};

export async function POST(
  request: NextRequest,
  context: RouteContext,
): Promise<NextResponse> {
  try {
    const session = await getWorkerSession();

    if (!session) {
      return NextResponse.json(
        {
          ok: false,
          error: "Worker login required.",
        },
        { status: 401 },
      );
    }

    const { postId } = await context.params;
    const body: unknown = await request.json();
    const parsed = interestSchema.safeParse(body);

    const ip = getRequestIp(request);

const rateLimit =
  enforceRateLimit({
    key: `job-interest:${ip}:${session.workerId}`,
    limit: 20,
    windowMs: 60 * 60 * 1000,
  });

if (!rateLimit.allowed) {
  return NextResponse.json(
    {
      ok: false,
      error:
        "Too many offers submitted. Slow down.",
    },
    { status: 429 },
  );
}

    if (!parsed.success) {
      return NextResponse.json(
        {
          ok: false,
          error: parsed.error.issues[0]?.message ?? "Invalid offer.",
        },
        { status: 400 },
      );
    }

    const post = await prisma.post.findFirst({
      where: {
        id: postId,
        type: "JOB",
        status: "LIVE",
      },
      select: {
        id: true,
      },
    });

    if (!post) {
      return NextResponse.json(
        {
          ok: false,
          error: "This job is no longer available.",
        },
        { status: 404 },
      );
    }

    const worker = await prisma.worker.findUnique({
      where: {
        id: session.workerId,
      },
      select: {
        id: true,
        status: true,
        phoneVerifiedAt: true,
        cardVerifiedAt: true,
        identityVerifiedAt: true,
        billingSuspendedAt: true,
      },
    });

    if (!worker) {
      return NextResponse.json(
        {
          ok: false,
          error: "Worker account not available.",
        },
        { status: 403 },
      );
    }

    const verification = getWorkerVerificationState(worker);

    if (!verification.allowed) {
      return NextResponse.json(
        {
          ok: false,
          error: verification.reason ?? "Verification required.",
        },
        { status: 403 },
      );
    }

    const interest = await prisma.workerInterest.upsert({
      where: {
        postId_workerId: {
          postId: post.id,
          workerId: worker.id,
        },
      },
      update: {
        status: "PENDING",
        offeredAmountCents: parsed.data.offeredAmountCents,
        message: parsed.data.message,
        rejectedAt: null,
        acceptedAt: null,
      },
      create: {
        postId: post.id,
        workerId: worker.id,
        offeredAmountCents: parsed.data.offeredAmountCents,
        message: parsed.data.message,
      },
      select: {
        id: true,
      },
    });

    return NextResponse.json({
      ok: true,
      interestId: interest.id,
    });
  } catch (error) {
    console.error("POST /api/jobs/[postId]/interest failed:", error);

    return NextResponse.json(
      {
        ok: false,
        error: "Unable to send offer.",
      },
      { status: 500 },
    );
  }
}