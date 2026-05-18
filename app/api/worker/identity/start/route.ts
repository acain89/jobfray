import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { stripe } from "@/lib/stripe";
import { getWorkerSession } from "@/lib/worker-auth";
import {
  enforceRateLimit,
  getRequestIp,
} from "@/lib/rate-limit";

export const runtime = "nodejs";

export async function POST(
  request: Request,
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

    const ip = getRequestIp(request);

    const rateLimit = enforceRateLimit({
      key: `worker-identity-start:${ip}:${session.workerId}`,
      limit: 5,
      windowMs: 15 * 60 * 1000,
    });

    if (!rateLimit.allowed) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Too many verification attempts. Try again later.",
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
          username: true,
          phone: true,
          identityVerifiedAt: true,
          stripeIdentitySessionId: true,
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
      return NextResponse.json(
        {
          ok: false,
          error:
            "Identity already verified.",
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
      await stripe.identity.verificationSessions.create(
        {
          type: "document",

          client_reference_id:
            worker.id,

          provided_details: {
            phone: worker.phone
              ? `+1${worker.phone}`
              : undefined,
          },

          options: {
            document: {
              require_matching_selfie: true,
            },
          },

          metadata: {
            workerId: worker.id,
            username: worker.username,
            purpose:
              "JOBFRAY_WORKER_IDENTITY",
          },
        },
      );

    await prisma.worker.update({
      where: {
        id: worker.id,
      },

      data: {
        stripeIdentitySessionId:
          verificationSession.id,
      },
    });

    if (
      !verificationSession.client_secret
    ) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Unable to start identity verification.",
        },
        { status: 500 },
      );
    }

    return NextResponse.json({
      ok: true,
      clientSecret:
        verificationSession.client_secret,
    });
  } catch (error) {
    console.error(
      "POST /api/worker/identity/start failed:",
      error,
    );

    return NextResponse.json(
      {
        ok: false,
        error:
          "Unable to start identity verification.",
      },
      { status: 500 },
    );
  }
}