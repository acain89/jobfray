"use client";

import { useState } from "react";

type ApiResponse =
  | {
      ok: true;
    }
  | {
      ok: false;
      error: string;
    };

export default function AdminLoginForm(): React.ReactElement {
  const [password, setPassword] =
    useState("");

  const [error, setError] = useState("");

  const [isSubmitting, setIsSubmitting] =
    useState(false);

  async function handleSubmit(
    event: React.FormEvent<HTMLFormElement>,
  ): Promise<void> {
    event.preventDefault();

    setError("");
    setIsSubmitting(true);

    try {
      const response = await fetch(
        "/api/admin/login",
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            password,
          }),
        },
      );

      const data =
        (await response.json()) as ApiResponse;

      if (!data.ok) {
        setError(data.error);
        return;
      }

      window.location.href =
        "/admin/dashboard";
    } catch {
      setError("Unable to login.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-[2rem] border border-[#dbe7df] bg-white p-6 shadow-sm"
    >
      <p className="text-sm font-black uppercase tracking-[0.18em] text-[#228454]">
        Admin Access
      </p>

      <h1 className="mt-2 text-4xl font-black tracking-tight">
        JobFray Admin
      </h1>

      <p className="mt-3 text-base font-semibold leading-7 text-[#5f6f67]">
        Restricted moderation access.
      </p>

      {error ? (
        <div className="mt-5 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700">
          {error}
        </div>
      ) : null}

      <input
        type="password"
        value={password}
        onChange={(event) =>
          setPassword(event.target.value)
        }
        placeholder="Admin password"
        className="mt-5 w-full rounded-2xl border border-[#dbe7df] bg-[#f7fbf8] px-4 py-4 text-base font-bold outline-none focus:border-[#4f9f75]"
      />

      <button
        type="submit"
        disabled={isSubmitting}
        className="mt-5 w-full rounded-full bg-[#183027] px-5 py-4 text-base font-black text-white disabled:opacity-60"
      >
        {isSubmitting
          ? "Signing in..."
          : "Enter Admin Dashboard"}
      </button>
    </form>
  );
}