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
        username: true,
        phone: true,
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
      return NextResponse.json(
        { ok: false, error: "Identity already verified." },
        { status: 400 },
      );
    }

    const verificationSession =
      await stripe.identity.verificationSessions.create({
        type: "document",
        client_reference_id: worker.id,
        provided_details: {
          phone: worker.phone ? `+${worker.phone}` : undefined,
        },
        options: {
          document: {
            require_matching_selfie: true,
          },
        },
        metadata: {
          workerId: worker.id,
          username: worker.username,
          purpose: "JOBFRAY_WORKER_IDENTITY",
        },
      });

    await prisma.worker.update({
      where: { id: worker.id },
      data: {
        stripeIdentitySessionId: verificationSession.id,
      },
    });

    if (!verificationSession.client_secret) {
      return NextResponse.json(
        { ok: false, error: "Unable to start identity verification." },
        { status: 500 },
      );
    }

    return NextResponse.json({
      ok: true,
      clientSecret: verificationSession.client_secret,
    });
  } catch (error) {
    console.error("POST /api/worker/identity/start failed:", error);

    return NextResponse.json(
      { ok: false, error: "Unable to start identity verification." },
      { status: 500 },
    );
  }
}