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
        firstName: true,
        phone: true,
        stripeCustomerId: true,
      },
    });

    if (!worker) {
      return NextResponse.json(
        { ok: false, error: "Worker not found." },
        { status: 404 },
      );
    }

    let stripeCustomerId = worker.stripeCustomerId;

    if (!stripeCustomerId) {
      const customer = await stripe.customers.create({
        name: worker.firstName,
        phone: worker.phone ? `+${worker.phone}` : undefined,
        metadata: {
          workerId: worker.id,
          username: worker.username,
        },
      });

      stripeCustomerId = customer.id;

      await prisma.worker.update({
        where: { id: worker.id },
        data: { stripeCustomerId },
      });
    }

    const setupIntent = await stripe.setupIntents.create({
      customer: stripeCustomerId,
      payment_method_types: ["card"],
      usage: "off_session",
      metadata: {
        workerId: worker.id,
        purpose: "JOBFRAY_WORKER_CARD_ON_FILE",
      },
    });

    return NextResponse.json({
      ok: true,
      clientSecret: setupIntent.client_secret,
    });
  } catch (error) {
    console.error("POST /api/worker/billing/setup-intent failed:", error);

    return NextResponse.json(
      { ok: false, error: "Unable to start card setup." },
      { status: 500 },
    );
  }
}