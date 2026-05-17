"use client";

import Link from "next/link";
import { useState } from "react";

type ApiResponse =
  | {
      ok: true;
      workerId: string;
    }
  | {
      ok: false;
      error: string;
    };

type Props = {
  nextPath: string;
};

export default function WorkerLoginForm({ nextPath }: Props) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError("");
    setIsSubmitting(true);

    try {
      const response = await fetch("/api/worker/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          username,
          password,
        }),
      });

      const data = (await response.json()) as ApiResponse;

      if (!data.ok) {
        setError(data.error);
        return;
      }

      window.location.href = nextPath || "/worker/dashboard";
    } catch {
      setError("Unable to log in.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-[2.25rem] border border-[#dbe7df] bg-white p-6 shadow-sm sm:p-8">
      <p className="text-sm font-black uppercase tracking-[0.18em] text-[#228454]">
        Worker Login
      </p>

      <h1 className="mt-2 text-4xl font-black tracking-tight sm:text-5xl">
        Find local work.
      </h1>

      <p className="mt-3 text-base font-semibold leading-7 text-[#5f6f67]">
        Log in to contact posters, make counteroffers, and manage your worker account.
      </p>

      {error ? (
        <div className="mt-5 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700">
          {error}
        </div>
      ) : null}

      <div className="mt-6 space-y-4">
        <input
          value={username}
          onChange={(event) => setUsername(event.target.value)}
          placeholder="Username"
          className="w-full rounded-2xl border border-[#dbe7df] bg-[#f7fbf8] px-4 py-4 text-base font-bold outline-none focus:border-[#4f9f75]"
        />

        <input
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          type="password"
          placeholder="Password"
          className="w-full rounded-2xl border border-[#dbe7df] bg-[#f7fbf8] px-4 py-4 text-base font-bold outline-none focus:border-[#4f9f75]"
        />
      </div>

      <button
        type="submit"
        disabled={isSubmitting}
        className="mt-6 w-full rounded-full bg-[#183027] px-5 py-4 text-base font-black text-white disabled:opacity-60"
      >
        {isSubmitting ? "Logging in..." : "Log In"}
      </button>

      <p className="mt-5 text-center text-sm font-semibold text-[#5f6f67]">
        New to JobFray?{" "}
        <Link
          href={`/worker/signup?next=${encodeURIComponent(nextPath)}`}
          className="font-black text-[#183027] underline underline-offset-4"
        >
          Create worker account
        </Link>
      </p>
    </form>
  );
}