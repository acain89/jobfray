import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { stripe } from "@/lib/stripe";
import { getWorkerSession } from "@/lib/worker-auth";
import {
  enforceRateLimit,
  getRequestIp,
} from "@/lib/rate-limit";

export const runtime = "nodejs";

export async function POST(): Promise<NextResponse> {
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

    const ip = getRequestIp();

    const rateLimit = enforceRateLimit({
      key: `worker-identity-sync:${ip}:${session.workerId}`,
      limit: 20,
      windowMs: 15 * 60 * 1000,
    });

    if (!rateLimit.allowed) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Too many verification checks. Try again later.",
        },
        { status: 429 },
      );
    }

    const worker =
      await prisma.worker.findUnique({
        where: {
          id: session.workerId,
        },

        select: {
          id: true,
          stripeIdentitySessionId: true,
          identityVerifiedAt: true,
          status: true,
        },
      });

    if (!worker) {
      return NextResponse.json(
        {
          ok: false,
          error: "Worker not found.",
        },
        { status: 404 },
      );
    }

    if (worker.identityVerifiedAt) {
      return NextResponse.json({
        ok: true,
        verified: true,
        status: "verified",
      });
    }

    if (
      !worker.stripeIdentitySessionId
    ) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "No identity session found.",
        },
        { status: 400 },
      );
    }

    if (!process.env.STRIPE_SECRET_KEY) {
      console.error(
        "Missing STRIPE_SECRET_KEY.",
      );

      return NextResponse.json(
        {
          ok: false,
          error:
            "Identity verification is temporarily unavailable.",
        },
        { status: 500 },
      );
    }

    const verificationSession =
      await stripe.identity.verificationSessions.retrieve(
        worker.stripeIdentitySessionId,
      );

    if (
      verificationSession.status ===
      "verified"
    ) {
      await prisma.worker.update({
        where: {
          id: worker.id,
        },

        data: {
          identityVerifiedAt:
            new Date(),

          status: "ACTIVE",
        },
      });

      return NextResponse.json({
        ok: true,
        verified: true,
        status:
          verificationSession.status,
      });
    }

    return NextResponse.json({
      ok: true,
      verified: false,
      status:
        verificationSession.status,
    });
  } catch (error) {
    console.error(
      "POST /api/worker/identity/sync failed:",
      error,
    );

    return NextResponse.json(
      {
        ok: false,
        error:
          "Unable to sync identity verification.",
      },
      { status: 500 },
    );
  }
}