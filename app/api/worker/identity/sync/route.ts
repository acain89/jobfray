import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { stripe } from "@/lib/stripe";
import { getWorkerSession } from "@/lib/worker-auth";

export const runtime = "nodejs";

export async function POST(): Promise<NextResponse> {
  try {
    const session = await getWorkerSession();

    if (!session) {
      return NextResponse.json(
        { ok: false, error: "Worker login required." },
        { status: 401 },
      );
    }

    const worker = await prisma.worker.findUnique({
      where: { id: session.workerId },
      select: {
        id: true,
        stripeIdentitySessionId: true,
        identityVerifiedAt: true,
      },
    });

    if (!worker) {
      return NextResponse.json(
        { ok: false, error: "Worker not found." },
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

    if (!worker.stripeIdentitySessionId) {
      return NextResponse.json(
        { ok: false, error: "No identity session found." },
        { status: 400 },
      );
    }

    const verificationSession =
      await stripe.identity.verificationSessions.retrieve(
        worker.stripeIdentitySessionId,
      );

    if (verificationSession.status === "verified") {
      await prisma.worker.update({
        where: { id: worker.id },
        data: {
          identityVerifiedAt: new Date(),
          status: "ACTIVE",
        },
      });

      return NextResponse.json({
        ok: true,
        verified: true,
        status: verificationSession.status,
      });
    }

    return NextResponse.json({
      ok: true,
      verified: false,
      status: verificationSession.status,
    });
  } catch (error) {
    console.error("POST /api/worker/identity/sync failed:", error);

    return NextResponse.json(
      { ok: false, error: "Unable to sync identity verification." },
      { status: 500 },
    );
  }
}