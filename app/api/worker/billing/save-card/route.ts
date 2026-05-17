import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { stripe } from "@/lib/stripe";
import { getWorkerSession } from "@/lib/worker-auth";

export const runtime = "nodejs";

const saveCardSchema = z.object({
  setupIntentId: z.string().trim().min(1),
});

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const session = await getWorkerSession();

    if (!session) {
      return NextResponse.json(
        { ok: false, error: "Worker login required." },
        { status: 401 },
      );
    }

    const body: unknown = await request.json();
    const parsed = saveCardSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, error: "Invalid card setup." },
        { status: 400 },
      );
    }

    const setupIntent = await stripe.setupIntents.retrieve(parsed.data.setupIntentId);

    if (
      setupIntent.status !== "succeeded" ||
      typeof setupIntent.payment_method !== "string"
    ) {
      return NextResponse.json(
        { ok: false, error: "Card setup was not completed." },
        { status: 400 },
      );
    }

    const paymentMethod = await stripe.paymentMethods.retrieve(
      setupIntent.payment_method,
    );

    if (paymentMethod.type !== "card" || !paymentMethod.card) {
      return NextResponse.json(
        { ok: false, error: "Only cards are supported." },
        { status: 400 },
      );
    }

    await prisma.worker.update({
      where: { id: session.workerId },
      data: {
        stripePaymentMethodId: paymentMethod.id,
        cardBrand: paymentMethod.card.brand,
        cardLast4: paymentMethod.card.last4,
        cardVerifiedAt: new Date(),
        billingSuspendedAt: null,
        billingFailureReason: null,
      },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("POST /api/worker/billing/save-card failed:", error);

    return NextResponse.json(
      { ok: false, error: "Unable to save card." },
      { status: 500 },
    );
  }
}