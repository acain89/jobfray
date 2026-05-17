"use client";

import { useState } from "react";

type Props = {
  postId: string;
  token: string;
  postStatus: string;
  hasAcceptedWorker: boolean;
};

type ApiResponse =
  | { ok: true }
  | { ok: false; error: string };

export default function ManagePostActions({
  postId,
  token,
  postStatus,
  hasAcceptedWorker,
}: Props) {
  const [rating, setRating] = useState("5");
  const [review, setReview] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function completeJob(): Promise<void> {
    setError("");
    setIsSubmitting(true);

    try {
      const response = await fetch("/api/post/manage/complete", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          postId,
          token,
          rating: Number(rating),
          review,
        }),
      });

      const data = (await response.json()) as ApiResponse;

      if (!data.ok) {
        setError(data.error);
        return;
      }

      window.location.reload();
    } catch {
      setError("Unable to complete job.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function closePost(): Promise<void> {
    setError("");
    setIsSubmitting(true);

    try {
      const response = await fetch("/api/post/manage/close", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          postId,
          token,
        }),
      });

      const data = (await response.json()) as ApiResponse;

      if (!data.ok) {
        setError(data.error);
        return;
      }

      window.location.reload();
    } catch {
      setError("Unable to close post.");
    } finally {
      setIsSubmitting(false);
    }
  }

  if (postStatus === "COMPLETED" || postStatus === "DELETED") {
    return null;
  }

  return (
    <section className="rounded-[2rem] border border-[#dbe7df] bg-white p-6 shadow-sm">
      <h2 className="text-3xl font-black text-[#183027]">
        Finish this post
      </h2>

      <p className="mt-2 text-base font-semibold leading-7 text-[#5f6f67]">
        Mark the job complete after the work is done, or close the post if you no longer need help.
      </p>

      {error ? (
        <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-3 text-sm font-bold text-red-700">
          {error}
        </div>
      ) : null}

      {hasAcceptedWorker ? (
        <div className="mt-5 rounded-3xl bg-[#f7fbf8] p-5">
          <label className="block text-sm font-black uppercase tracking-[0.18em] text-[#228454]">
            Worker rating
          </label>

          <select
            value={rating}
            onChange={(event) => setRating(event.target.value)}
            className="mt-3 w-full rounded-2xl border border-[#dbe7df] bg-white px-4 py-4 text-base font-black outline-none focus:border-[#4f9f75]"
          >
            <option value="5">5 stars — Great</option>
            <option value="4">4 stars — Good</option>
            <option value="3">3 stars — Okay</option>
            <option value="2">2 stars — Poor</option>
            <option value="1">1 star — Bad</option>
          </select>

          <textarea
            value={review}
            onChange={(event) => setReview(event.target.value.slice(0, 500))}
            rows={4}
            placeholder="Optional short review..."
            className="mt-3 w-full resize-none rounded-2xl border border-[#dbe7df] bg-white px-4 py-4 text-base font-semibold leading-7 outline-none focus:border-[#4f9f75]"
          />

          <button
            type="button"
            onClick={completeJob}
            disabled={isSubmitting}
            className="mt-4 w-full rounded-full bg-[#183027] px-5 py-4 text-base font-black text-white disabled:opacity-60"
          >
            {isSubmitting ? "Completing..." : "Mark Job Complete"}
          </button>
        </div>
      ) : null}

      <button
        type="button"
        onClick={closePost}
        disabled={isSubmitting}
        className="mt-4 w-full rounded-full border border-[#c9ddd1] bg-[#eef8f2] px-5 py-4 text-base font-black text-[#183027] disabled:opacity-60"
      >
        {isSubmitting ? "Closing..." : "Close Post"}
      </button>
    </section>
  );
}