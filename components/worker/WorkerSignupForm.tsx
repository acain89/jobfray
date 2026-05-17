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

export default function WorkerSignupForm({ nextPath }: Props) {
  const [firstName, setFirstName] = useState("");
  const [lastInitial, setLastInitial] = useState("");
  const [username, setUsername] = useState("");
  const [phone, setPhone] = useState("");
  const [homeZip, setHomeZip] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError("");
    setIsSubmitting(true);

    try {
      const response = await fetch("/api/worker/signup", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          firstName,
          lastInitial,
          username,
          phone,
          homeZip,
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
      setError("Unable to create worker account.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-[2.25rem] border border-[#dbe7df] bg-white p-6 shadow-sm sm:p-8">
      <p className="text-sm font-black uppercase tracking-[0.18em] text-[#228454]">
        Worker Signup
      </p>

      <h1 className="mt-2 text-4xl font-black tracking-tight sm:text-5xl">
        Create your worker account.
      </h1>

      <p className="mt-3 text-base font-semibold leading-7 text-[#5f6f67]">
        Worker access is paid after setup. This creates your account and prepares phone, ID, and subscription steps.
      </p>

      {error ? (
        <div className="mt-5 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700">
          {error}
        </div>
      ) : null}

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <input
          value={firstName}
          onChange={(event) => setFirstName(event.target.value)}
          placeholder="First name"
          className="w-full rounded-2xl border border-[#dbe7df] bg-[#f7fbf8] px-4 py-4 text-base font-bold outline-none focus:border-[#4f9f75]"
        />

        <input
          value={lastInitial}
          onChange={(event) =>
            setLastInitial(event.target.value.replace(/[^a-zA-Z]/g, "").slice(0, 1).toUpperCase())
          }
          placeholder="Last initial"
          className="w-full rounded-2xl border border-[#dbe7df] bg-[#f7fbf8] px-4 py-4 text-base font-bold outline-none focus:border-[#4f9f75]"
        />

        <input
          value={username}
          onChange={(event) => setUsername(event.target.value.toLowerCase())}
          placeholder="Username"
          className="w-full rounded-2xl border border-[#dbe7df] bg-[#f7fbf8] px-4 py-4 text-base font-bold outline-none focus:border-[#4f9f75]"
        />

        <input
          value={phone}
          onChange={(event) => setPhone(event.target.value)}
          inputMode="tel"
          placeholder="Phone number"
          className="w-full rounded-2xl border border-[#dbe7df] bg-[#f7fbf8] px-4 py-4 text-base font-bold outline-none focus:border-[#4f9f75]"
        />

        <input
          value={homeZip}
          onChange={(event) => setHomeZip(event.target.value.replace(/\D/g, "").slice(0, 5))}
          inputMode="numeric"
          placeholder="Home ZIP code"
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
        {isSubmitting ? "Creating account..." : "Create Account"}
      </button>

      <p className="mt-5 text-center text-sm font-semibold text-[#5f6f67]">
        Already have an account?{" "}
        <Link
          href={`/worker/login?next=${encodeURIComponent(nextPath)}`}
          className="font-black text-[#183027] underline underline-offset-4"
        >
          Log in
        </Link>
      </p>
    </form>
  );
}