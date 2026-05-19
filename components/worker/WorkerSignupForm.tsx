"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { formatZipPlace, getZipPlace, isValidZip } from "@/lib/zip-radius";

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

export default function WorkerSignupForm({
  nextPath,
}: Props): React.ReactElement {
  const [firstName, setFirstName] = useState("");
  const [lastInitial, setLastInitial] = useState("");
  const [username, setUsername] = useState("");
  const [phone, setPhone] = useState("");
  const [homeZip, setHomeZip] = useState("");
  const [password, setPassword] = useState("");

  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const cleanedPhone = useMemo(() => {
    return phone.replace(/\D/g, "").slice(0, 10);
  }, [phone]);

  const formattedPhone = useMemo(() => {
    const digits = cleanedPhone;

    if (digits.length <= 3) {
      return digits;
    }

    if (digits.length <= 6) {
      return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
    }

    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }, [cleanedPhone]);

  const normalizedUsername = useMemo(() => {
    return username.trim().replace(/[^a-z0-9_]/g, "").toLowerCase();
  }, [username]);

  const zipPlace = useMemo(() => {
    return getZipPlace(homeZip);
  }, [homeZip]);

  const canSubmit =
    firstName.trim().length >= 2 &&
    lastInitial.trim().length === 1 &&
    normalizedUsername.length >= 3 &&
    cleanedPhone.length === 10 &&
    isValidZip(homeZip) &&
    password.length >= 6;

  async function handleSubmit(
    event: React.FormEvent<HTMLFormElement>,
  ): Promise<void> {
    event.preventDefault();

    if (isSubmitting) {
      return;
    }

    if (!canSubmit) {
      if (homeZip.length === 5 && !isValidZip(homeZip)) {
        setError("Enter a supported ZIP code.");
        return;
      }

      setError("Please complete all required fields.");
      return;
    }

    setError("");
    setSuccessMessage("");
    setIsSubmitting(true);

    try {
      const response = await fetch("/api/worker/signup", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          firstName: firstName.trim(),
          lastInitial: lastInitial.trim(),
          username: normalizedUsername,
          phone: cleanedPhone,
          homeZip,
          password,
        }),
      });

      const data = (await response.json()) as ApiResponse;

      if (!response.ok || !data.ok) {
        setError(data.ok ? "Unable to create worker account." : data.error);
        return;
      }

      setSuccessMessage("Account created successfully.");
      window.location.href = nextPath || "/worker/dashboard";
    } catch {
      setError("Unable to create worker account.");
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
          Worker details
        </h2>

        <p className="mt-2 text-sm font-semibold leading-6 text-[#5f6f67]">
          Workers must create an account and complete photo ID verification
          before contacting posters.
        </p>
      </div>

      {error ? (
        <div className="mb-5 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700">
          {error}
        </div>
      ) : null}

      {successMessage ? (
        <div className="mb-5 rounded-2xl border border-green-200 bg-green-50 p-4 text-sm font-bold text-green-700">
          {successMessage}
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-2 block text-sm font-black text-[#183027]">
            First Name
          </label>

          <input
            value={firstName}
            onChange={(event) => setFirstName(event.target.value)}
            placeholder="John"
            autoComplete="given-name"
            className="jf-search-input"
          />
        </div>

        <div>
          <label className="mb-2 block text-sm font-black text-[#183027]">
            Last Initial
          </label>

          <input
            value={lastInitial}
            onChange={(event) => {
              setLastInitial(
                event.target.value
                  .replace(/[^a-zA-Z]/g, "")
                  .slice(0, 1)
                  .toUpperCase(),
              );
            }}
            placeholder="D"
            maxLength={1}
            className="jf-search-input"
          />
        </div>

        <div>
          <label className="mb-2 block text-sm font-black text-[#183027]">
            Username
          </label>

          <input
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            placeholder="handymanmike"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            className="jf-search-input"
          />

          <p className="mt-2 text-xs font-semibold text-[#5f6f67]">
            Lowercase letters, numbers, and underscores only.
          </p>
        </div>

        <div>
          <label className="mb-2 block text-sm font-black text-[#183027]">
            Phone Number
          </label>

          <input
            value={formattedPhone}
            onChange={(event) => setPhone(event.target.value)}
            inputMode="tel"
            placeholder="(555) 555-5555"
            autoComplete="tel"
            className="jf-search-input"
          />

          <p className="mt-2 text-xs font-semibold text-[#5f6f67]">
            A verification code will be sent by text message.
          </p>
        </div>

        <div>
          <label className="mb-2 block text-sm font-black text-[#183027]">
            Home ZIP Code
          </label>

          <input
            value={homeZip}
            onChange={(event) => {
              setHomeZip(event.target.value.replace(/\D/g, "").slice(0, 5));
            }}
            inputMode="numeric"
            placeholder="77575"
            className="jf-search-input"
          />

          {homeZip.length === 5 && !zipPlace ? (
            <p className="mt-2 text-xs font-bold text-red-700">
              This ZIP code is not currently supported.
            </p>
          ) : null}

          {zipPlace ? (
            <p className="mt-2 text-xs font-black text-[#183027]">
              Home area: {formatZipPlace(homeZip)}
            </p>
          ) : null}
        </div>

        <div>
          <label className="mb-2 block text-sm font-black text-[#183027]">
            Password
          </label>

          <input
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            type="password"
            placeholder="Minimum 6 characters"
            autoComplete="new-password"
            className="jf-search-input"
          />

          <p className="mt-2 text-xs font-semibold text-[#5f6f67]">
            Use at least 6 characters.
          </p>
        </div>
      </div>

      <div className="mt-6 rounded-[1.5rem] border border-[#dbe7df] bg-[#eef8f2] p-4">
        <p className="text-sm font-black text-[#183027]">
          After signup, finish verification to unlock poster contact options.
        </p>

        <p className="mt-2 text-sm font-semibold leading-6 text-[#5f6f67]">
          JobFray uses account, phone, billing, and photo ID checks to keep
          worker access controlled.
        </p>
      </div>

      <button
        type="submit"
        disabled={!canSubmit || isSubmitting}
        className="mt-6 flex h-[58px] w-full items-center justify-center rounded-full bg-[#183027] px-5 text-base font-black text-white transition-all duration-200 hover:-translate-y-[1px] hover:bg-[#244638] disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isSubmitting ? "Creating account..." : "Create Worker Account"}
      </button>

      <div className="mt-5 flex items-center justify-center gap-2 text-center text-sm font-semibold text-[#5f6f67]">
        <span>Already have an account?</span>

        <Link
          href={`/worker/login?next=${encodeURIComponent(nextPath)}`}
          className="font-black text-[#183027] underline underline-offset-4"
        >
          Log in
        </Link>
      </div>
    </form>
  );
}