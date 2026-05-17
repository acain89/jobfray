import "server-only";
import Stripe from "stripe";

const stripeSecretKey = process.env.STRIPE_SECRET_KEY;

if (!stripeSecretKey) {
  throw new Error("STRIPE_SECRET_KEY is required.");
}

export const stripe = new Stripe(stripeSecretKey);

export function getMatchFeeCents(): number {
  const value = Number(process.env.JOBFRAY_MATCH_FEE_CENTS ?? "349");

  if (!Number.isInteger(value) || value < 100) {
    return 349;
  }

  return value;
}