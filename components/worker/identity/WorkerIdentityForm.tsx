"use client";

import { useState } from "react";

import { loadStripe } from "@stripe/stripe-js";

const stripePromise = loadStripe(
  process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? "",
);

type StartResponse =
  | {
      ok: true;
      clientSecret: string;
    }
  | {
      ok: false;
      error: string;
    };

type SyncResponse =
  | {
      ok: true;
      verified: boolean;
      status: string;
    }
  | {
      ok: false;
      error: string;
    };

type Props = {
  alreadyVerified: boolean;
};

function formatStatus(status: string): string {
  return status.replaceAll("_", " ").toLowerCase();
}

export default function WorkerIdentityForm({
  alreadyVerified,
}: Props): React.ReactElement {
  const [error, setError] = useState("");
  const [status, setStatus] = useState(
    alreadyVerified ? "Identity verified." : "",
  );
  const [isStarting, setIsStarting] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  async function syncIdentity(): Promise<void> {
    setError("");
    setIsRefreshing(true);

    try {
      const response = await fetch("/api/worker/identity/sync", {
        method: "POST",
      });

      const data = (await response.json()) as SyncResponse;

      if (!response.ok || !data.ok) {
        setError(data.ok ? "Unable to refresh status." : data.error);
        return;
      }

      if (data.verified) {
        setStatus("Identity verified successfully.");
        window.location.href = "/worker/dashboard";
        return;
      }

      setStatus(`Verification status: ${formatStatus(data.status)}`);
    } catch {
      setError("Unable to refresh verification status.");
    } finally {
      setIsRefreshing(false);
    }
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

      if (!response.ok || !data.ok) {
        setError(
          data.ok
            ? "Unable to start identity verification."
            : data.error,
        );
        return;
      }

      const result = await stripe.verifyIdentity(data.clientSecret);

      if (result.error) {
        setError(
          result.error.message ??
            "Identity verification was not completed.",
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

  const isBusy = isStarting || isRefreshing;

  return (
    <div className="rounded-[2.25rem] border border-[#dbe7df] bg-white p-6 shadow-[0_20px_60px_rgba(24,48,39,0.08)] sm:p-8">
      <p className="text-sm font-black uppercase tracking-[0.18em] text-[#228454]">
        Identity Verification
      </p>

      <h1 className="mt-2 text-4xl font-black tracking-tight text-[#17231d] sm:text-5xl">
        Verify your identity.
      </h1>

      <p className="mt-3 text-base font-semibold leading-7 text-[#5f6f67]">
        JobFray uses Stripe Identity to verify your government ID and
        selfie before unlocking verified worker access.
      </p>

      <div className="mt-5 rounded-[1.5rem] border border-[#dbe7df] bg-[#eef8f2] p-4">
        <p className="text-sm font-black text-[#183027]">
          Verification helps protect:
        </p>

        <div className="mt-3 flex flex-wrap gap-2">
          <span className="jf-soft-pill">Posters</span>
          <span className="jf-soft-pill">Workers</span>
          <span className="jf-soft-pill">Local jobs</span>
          <span className="jf-soft-pill">Trust</span>
        </div>
      </div>

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
        disabled={alreadyVerified || isBusy}
        className="mt-6 flex h-[58px] w-full items-center justify-center rounded-full bg-[#183027] px-5 text-base font-black text-white transition-all duration-200 hover:-translate-y-[1px] hover:bg-[#244638] disabled:cursor-not-allowed disabled:opacity-60"
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
          disabled={isBusy}
          className="mt-3 flex h-[54px] w-full items-center justify-center rounded-full border border-[#c9ddd1] bg-[#eef8f2] px-5 text-base font-black text-[#183027] transition-all duration-200 hover:-translate-y-[1px] hover:bg-[#e4f3ea] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isRefreshing ? "Checking..." : "Refresh Status"}
        </button>
      ) : null}
    </div>
  );
}