"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

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

export default function WorkerLoginForm({
  nextPath,
}: Props): React.ReactElement {
  const [username, setUsername] =
    useState("");

  const [password, setPassword] =
    useState("");

  const [error, setError] = useState("");

  const [isSubmitting, setIsSubmitting] =
    useState(false);

  const normalizedUsername = useMemo(() => {
    return username
      .trim()
      .replace(/[^a-z0-9_]/g, "")
      .toLowerCase();
  }, [username]);

  const canSubmit = useMemo(() => {
    return (
      normalizedUsername.length >= 3 &&
      password.length >= 6
    );
  }, [normalizedUsername, password]);

  async function handleSubmit(
    event: React.FormEvent<HTMLFormElement>,
  ): Promise<void> {
    event.preventDefault();

    if (isSubmitting) {
      return;
    }

    if (!canSubmit) {
      setError(
        "Please enter your username and password.",
      );

      return;
    }

    setError("");
    setIsSubmitting(true);

    try {
      const response = await fetch(
        "/api/worker/login",
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json",
          },

          body: JSON.stringify({
            username:
              normalizedUsername,
            password,
          }),
        },
      );

      const data =
        (await response.json()) as ApiResponse;

      if (!response.ok || !data.ok) {
        setError(
          data.ok
            ? "Unable to log in."
            : data.error,
        );

        return;
      }

      window.location.href =
        nextPath || "/worker/dashboard";
    } catch {
      setError("Unable to log in.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-[2rem] border border-[#dbe7df] bg-white p-5 shadow-[0_20px_60px_rgba(24,48,39,0.08)] sm:p-7"
    >
      <div className="mb-6">
        <h2 className="text-2xl font-black text-[#183027]">
          Worker Login
        </h2>

        <p className="mt-2 text-sm font-medium text-[#5f6f67]">
          Access local jobs, offers, and
          your worker dashboard.
        </p>
      </div>

      {error ? (
        <div className="mb-5 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700">
          {error}
        </div>
      ) : null}

      <div className="space-y-4">
        <div>
          <label className="mb-2 block text-sm font-black text-[#183027]">
            Username
          </label>

          <input
            value={username}
            onChange={(event) => {
              setUsername(
                event.target.value,
              );
            }}
            placeholder="Enter username"
            autoCapitalize="none"
            autoCorrect="off"
            autoComplete="username"
            spellCheck={false}
            className="jf-search-input"
          />

          <p className="mt-2 text-xs font-semibold text-[#5f6f67]">
            Usernames are lowercase.
          </p>
        </div>

        <div>
          <label className="mb-2 block text-sm font-black text-[#183027]">
            Password
          </label>

          <input
            value={password}
            onChange={(event) => {
              setPassword(
                event.target.value,
              );
            }}
            type="password"
            placeholder="Enter password"
            autoComplete="current-password"
            className="jf-search-input"
          />
        </div>
      </div>

      <div className="mt-6 rounded-[1.5rem] border border-[#dbe7df] bg-[#eef8f2] p-4">
        <p className="text-sm font-black text-[#183027]">
          Worker account access includes:
        </p>

        <div className="mt-3 flex flex-wrap gap-2">
          <span className="jf-soft-pill">
            Browse jobs
          </span>

          <span className="jf-soft-pill">
            Contact posters
          </span>

          <span className="jf-soft-pill">
            Submit offers
          </span>

          <span className="jf-soft-pill">
            Worker dashboard
          </span>

          <span className="jf-soft-pill">
            Verified profile
          </span>
        </div>
      </div>

      <button
        type="submit"
        disabled={!canSubmit || isSubmitting}
        className="mt-6 flex h-[58px] w-full items-center justify-center rounded-full bg-[#183027] px-5 text-base font-black text-white transition-all duration-200 hover:-translate-y-[1px] hover:bg-[#244638] disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isSubmitting
          ? "Logging in..."
          : "Log In"}
      </button>

      <div className="mt-5 flex items-center justify-center gap-2 text-center text-sm font-semibold text-[#5f6f67]">
        <span>New to JobFray?</span>

        <Link
          href={`/worker/signup?next=${encodeURIComponent(
            nextPath,
          )}`}
          className="font-black text-[#183027] underline underline-offset-4"
        >
          Create worker account
        </Link>
      </div>
    </form>
  );
}