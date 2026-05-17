"use client";

import { useState } from "react";

export default function WorkerLogoutButton() {
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleLogout(): Promise<void> {
    setIsSubmitting(true);

    try {
      await fetch("/api/worker/logout", {
        method: "POST",
      });

      window.location.href = "/";
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleLogout}
      disabled={isSubmitting}
      className="rounded-full border border-[#c9ddd1] bg-[#eef8f2] px-4 py-2 text-sm font-bold text-[#183027] disabled:opacity-60"
    >
      {isSubmitting ? "Logging out..." : "Log Out"}
    </button>
  );
}