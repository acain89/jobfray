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

export default function ManageInterestButtons({ postId, token, interestId }: Props) {
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function updateInterest(action: "ACCEPT" | "REJECT"): Promise<void> {
    setError("");
    setIsSubmitting(true);

    try {
      const response = await fetch("/api/post/manage/interest", {
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
      });

      const data = (await response.json()) as ApiResponse;

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
    <div className="mt-4">
      {error ? (
        <div className="mb-3 rounded-2xl border border-red-200 bg-red-50 p-3 text-sm font-bold text-red-700">
          {error}
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => updateInterest("ACCEPT")}
          disabled={isSubmitting}
          className="rounded-full bg-[#183027] px-5 py-4 text-base font-black text-white disabled:opacity-60"
        >
          Accept Worker
        </button>

        <button
          type="button"
          onClick={() => updateInterest("REJECT")}
          disabled={isSubmitting}
          className="rounded-full border border-[#c9ddd1] bg-white px-5 py-4 text-base font-black text-[#183027] disabled:opacity-60"
        >
          Reject
        </button>
      </div>
    </div>
  );
}