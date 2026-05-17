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
}: Props): React.ReactElement | null {
  const [rating, setRating] = useState("5");
  const [review, setReview] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function completeJob(): Promise<void> {
    setError("");
    setIsSubmitting(true);

    try {
      const response = await fetch(
        "/api/post/manage/complete",
        {
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
      setError("Unable to complete job.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function closePost(): Promise<void> {
    const confirmed = window.confirm(
      "Close this post? Workers will no longer be able to contact you.",
    );

    if (!confirmed) {
      return;
    }

    setError("");
    setIsSubmitting(true);

    try {
      const response = await fetch(
        "/api/post/manage/close",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            postId,
            token,
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
      setError("Unable to close post.");
    } finally {
      setIsSubmitting(false);
    }
  }

  if (
    postStatus === "COMPLETED" ||
    postStatus === "DELETED"
  ) {
    return null;
  }

  return (
    <section className="rounded-[2rem] border border-[#dbe7df] bg-white p-6 shadow-sm">
      <div className="flex flex-col gap-2">
        <p className="text-sm font-black uppercase tracking-[0.18em] text-[#228454]">
          Post Actions
        </p>

        <h2 className="text-3xl font-black text-[#183027]">
          Manage this post
        </h2>

        <p className="text-base font-semibold leading-7 text-[#5f6f67]">
          Complete the job after work is finished or close the post if you no longer need help.
        </p>
      </div>

      {error ? (
        <div className="mt-5 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700">
          {error}
        </div>
      ) : null}

      {hasAcceptedWorker ? (
        <div className="mt-6 rounded-3xl border border-[#dbe7df] bg-[#f7fbf8] p-5">
          <div className="flex flex-col gap-2">
            <p className="text-sm font-black uppercase tracking-[0.18em] text-[#228454]">
              Completion
            </p>

            <h3 className="text-2xl font-black text-[#183027]">
              Rate your worker
            </h3>
          </div>

          <select
            value={rating}
            onChange={(event) =>
              setRating(event.target.value)
            }
            className="mt-4 w-full rounded-2xl border border-[#dbe7df] bg-white px-4 py-4 text-base font-black outline-none focus:border-[#4f9f75]"
          >
            <option value="5">
              5 Stars — Excellent
            </option>

            <option value="4">
              4 Stars — Good
            </option>

            <option value="3">
              3 Stars — Average
            </option>

            <option value="2">
              2 Stars — Poor
            </option>

            <option value="1">
              1 Star — Bad
            </option>
          </select>

          <textarea
            value={review}
            onChange={(event) =>
              setReview(
                event.target.value.slice(0, 500),
              )
            }
            rows={4}
            placeholder="Optional review..."
            className="mt-4 w-full resize-none rounded-2xl border border-[#dbe7df] bg-white px-4 py-4 text-base font-semibold leading-7 outline-none focus:border-[#4f9f75]"
          />

          <button
            type="button"
            onClick={() => void completeJob()}
            disabled={isSubmitting}
            className="mt-4 w-full rounded-full bg-[#183027] px-5 py-4 text-base font-black text-white transition hover:opacity-90 disabled:opacity-60"
          >
            {isSubmitting
              ? "Completing..."
              : "Mark Job Complete"}
          </button>
        </div>
      ) : null}

      <button
        type="button"
        onClick={() => void closePost()}
        disabled={isSubmitting}
        className="mt-5 w-full rounded-full border border-[#dbe7df] bg-[#f7fbf8] px-5 py-4 text-base font-black text-[#183027] transition hover:bg-[#eef8f2] disabled:opacity-60"
      >
        {isSubmitting
          ? "Closing..."
          : "Close Post"}
      </button>
    </section>
  );
}