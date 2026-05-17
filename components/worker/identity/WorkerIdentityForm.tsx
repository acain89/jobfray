"use client";

import { useState } from "react";
import { loadStripe } from "@stripe/stripe-js";

const stripePromise = loadStripe(
  process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? "",
);

type StartResponse =
  | { ok: true; clientSecret: string }
  | { ok: false; error: string };

type SyncResponse =
  | { ok: true; verified: boolean; status: string }
  | { ok: false; error: string };

type Props = {
  alreadyVerified: boolean;
};

export default function WorkerIdentityForm({
  alreadyVerified,
}: Props): React.ReactElement {
  const [error, setError] = useState("");
  const [status, setStatus] = useState(
    alreadyVerified ? "Identity verified." : "",
  );
  const [isStarting, setIsStarting] = useState(false);

  async function syncIdentity(): Promise<void> {
    setError("");

    const response = await fetch("/api/worker/identity/sync", {
      method: "POST",
    });

    const data = (await response.json()) as SyncResponse;

    if (!data.ok) {
      setError(data.error);
      return;
    }

    if (data.verified) {
      window.location.href = "/worker/dashboard";
      return;
    }

    setStatus(`Verification status: ${data.status.replaceAll("_", " ")}`);
  }

  async function startIdentity(): Promise<void> {
    setError("");
    setStatus("");
    setIsStarting(true);

    try {
      const stripe = await stripePromise;

      if (!stripe) {
        setError("Stripe could not load.");
        return;
      }

      const response = await fetch("/api/worker/identity/start", {
        method: "POST",
      });

      const data = (await response.json()) as StartResponse;

      if (!data.ok) {
        setError(data.error);
        return;
      }

      const result = await stripe.verifyIdentity(data.clientSecret);

      if (result.error) {
        setError(
          result.error.message ?? "Identity verification was not completed.",
        );
        return;
      }

      await syncIdentity();
    } catch {
      setError("Unable to complete identity verification.");
    } finally {
      setIsStarting(false);
    }
  }

  return (
    <div className="rounded-[2.25rem] border border-[#dbe7df] bg-white p-6 shadow-sm sm:p-8">
      <p className="text-sm font-black uppercase tracking-[0.18em] text-[#228454]">
        Identity Verification
      </p>

      <h1 className="mt-2 text-4xl font-black tracking-tight sm:text-5xl">
        Verify your identity.
      </h1>

      <p className="mt-3 text-base font-semibold leading-7 text-[#5f6f67]">
        JobFray uses Stripe Identity to verify your government ID and selfie.
      </p>

      {error ? (
        <div className="mt-5 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700">
          {error}
        </div>
      ) : null}

      {status ? (
        <div className="mt-5 rounded-2xl border border-[#c9ddd1] bg-[#eef8f2] p-4 text-sm font-bold text-[#183027]">
          {status}
        </div>
      ) : null}

      <button
        type="button"
        onClick={() => void startIdentity()}
        disabled={alreadyVerified || isStarting}
        className="mt-6 w-full rounded-full bg-[#183027] px-5 py-4 text-base font-black text-white disabled:opacity-60"
      >
        {alreadyVerified
          ? "Identity Verified"
          : isStarting
            ? "Starting..."
            : "Start Identity Verification"}
      </button>

      {!alreadyVerified ? (
        <button
          type="button"
          onClick={() => void syncIdentity()}
          className="mt-3 w-full rounded-full border border-[#c9ddd1] bg-[#eef8f2] px-5 py-4 text-base font-black text-[#183027]"
        >
          Refresh Status
        </button>
      ) : null}
    </div>
  );
}