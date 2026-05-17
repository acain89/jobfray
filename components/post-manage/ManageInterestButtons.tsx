"use client";

import { useState } from "react";

type Props = {
  postId: string;
  token: string;
  interestId: string;
};

type ApiResponse =
  | {
      ok: true;
    }
  | {
      ok: false;
      error: string;
    };

export default function ManageInterestButtons({
  postId,
  token,
  interestId,
}: Props): React.ReactElement {
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function updateInterest(
    action: "ACCEPT" | "REJECT",
  ): Promise<void> {
    setError("");
    setIsSubmitting(true);

    try {
      const response = await fetch(
        "/api/post/manage/interest",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            postId,
            token,
            interestId,
            action,
          }),
        },
      );

      const data =
        (await response.json()) as ApiResponse;

      if (!data.ok) {
        setError(data.error);
        return;
      }

      window.location.reload();
    } catch {
      setError("Unable to update offer.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="mt-5">
      {error ? (
        <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700">
          {error}
        </div>
      ) : null}

      <div className="rounded-3xl border border-[#dbe7df] bg-white p-4">
        <p className="text-sm font-bold leading-6 text-[#5f6f67]">
          Accepting this worker immediately closes the job and unlocks both phone numbers.
        </p>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => void updateInterest("ACCEPT")}
            disabled={isSubmitting}
            className="rounded-full bg-[#183027] px-5 py-4 text-base font-black text-white transition hover:opacity-90 disabled:opacity-60"
          >
            {isSubmitting
              ? "Processing..."
              : "Accept Worker"}
          </button>

          <button
            type="button"
            onClick={() => void updateInterest("REJECT")}
            disabled={isSubmitting}
            className="rounded-full border border-[#dbe7df] bg-[#f7fbf8] px-5 py-4 text-base font-black text-[#183027] transition hover:bg-[#eef8f2] disabled:opacity-60"
          >
            Reject Offer
          </button>
        </div>
      </div>
    </div>
  );
}