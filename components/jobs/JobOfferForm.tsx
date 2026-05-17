"use client";

import { useState } from "react";

type ApiResponse =
  | {
      ok: true;
      interestId: string;
    }
  | {
      ok: false;
      error: string;
    };

type Props = {
  postId: string;
  listedPayAmountCents: number | null;
};

function centsToDollars(cents: number | null): string {
  if (!cents || cents <= 0) return "";
  return String(Math.round(cents / 100));
}

function dollarsToCents(value: string): number | null {
  const amount = Number.parseFloat(value.replace(/[^0-9.]/g, ""));
  if (!Number.isFinite(amount) || amount <= 0) return null;
  return Math.round(amount * 100);
}

export default function JobOfferForm({ postId, listedPayAmountCents }: Props) {
  const [offerAmount, setOfferAmount] = useState(centsToDollars(listedPayAmountCents));
  const [message, setMessage] = useState("");
  const [success, setSuccess] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function submitOffer(): Promise<void> {
    setError("");
    setSuccess("");
    setIsSubmitting(true);

    try {
      const response = await fetch(`/api/jobs/${postId}/interest`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          offeredAmountCents: dollarsToCents(offerAmount),
          message,
        }),
      });

      const data = (await response.json()) as ApiResponse;

      if (!data.ok) {
        setError(data.error);
        return;
      }

      setSuccess("Offer sent. The poster can now review it from their manage link.");
    } catch {
      setError("Unable to send offer.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="rounded-[2.25rem] border border-[#dbe7df] bg-white p-6 shadow-sm sm:p-8">
      <p className="text-sm font-black uppercase tracking-[0.18em] text-[#228454]">
        I Can Do This
      </p>

      <h1 className="mt-2 text-4xl font-black tracking-tight sm:text-5xl">
        Send your offer.
      </h1>

      <p className="mt-3 text-base font-semibold leading-7 text-[#5f6f67]">
        Keep it short. The poster will see your offer amount, message, and worker profile.
      </p>

      {error ? (
        <div className="mt-5 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700">
          {error}
        </div>
      ) : null}

      {success ? (
        <div className="mt-5 rounded-2xl border border-[#c9ddd1] bg-[#eef8f2] p-4 text-sm font-bold text-[#183027]">
          {success}
        </div>
      ) : null}

      <div className="mt-6 space-y-4">
        <input
          value={offerAmount}
          onChange={(event) => setOfferAmount(event.target.value)}
          inputMode="decimal"
          placeholder="Offer amount"
          className="w-full rounded-2xl border border-[#dbe7df] bg-[#f7fbf8] px-4 py-4 text-base font-bold outline-none focus:border-[#4f9f75]"
        />

        <textarea
          value={message}
          onChange={(event) => setMessage(event.target.value.slice(0, 240))}
          rows={5}
          placeholder="Optional short message..."
          className="w-full resize-none rounded-2xl border border-[#dbe7df] bg-[#f7fbf8] px-4 py-4 text-base font-semibold leading-7 outline-none focus:border-[#4f9f75]"
        />
      </div>

      <button
        type="button"
        onClick={submitOffer}
        disabled={isSubmitting || Boolean(success)}
        className="mt-6 w-full rounded-full bg-[#183027] px-5 py-4 text-base font-black text-white disabled:opacity-60"
      >
        {isSubmitting ? "Sending..." : "Send Offer"}
      </button>
    </div>
  );
}