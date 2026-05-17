"use client";

import { useState } from "react";

type CreateResponse =
  | {
      ok: true;
      postId: string;
      phone: string;
      managementToken: string;
      devVerificationCode: string;
    }
  | {
      ok: false;
      error: string;
    };

type VerifyResponse =
  | {
      ok: true;
      postId: string;
    }
  | {
      ok: false;
      error: string;
    };

export default function FreeStuffPostForm() {
  const [step, setStep] = useState<"details" | "verify">("details");
  const [zip, setZip] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [exactAddress, setExactAddress] = useState("");
  const [phone, setPhone] = useState("");
  const [photoNames, setPhotoNames] = useState<string[]>([]);
  const [postId, setPostId] = useState("");
  const [createdPhone, setCreatedPhone] = useState("");
  const [managementToken, setManagementToken] = useState("");
  const [devCode, setDevCode] = useState("");
  const [verificationCode, setVerificationCode] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  function handlePhotoSelection(files: FileList | null): void {
    if (!files) return;

    setPhotoNames(
      Array.from(files)
        .slice(0, 3)
        .map((file) => file.name),
    );
  }

  async function createListing(): Promise<void> {
    setError("");
    setIsSubmitting(true);

    try {
      const response = await fetch("/api/free-stuff/create", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          zip,
          title,
          description,
          exactAddress,
          phone,
          photoUrls: [],
        }),
      });

      const data = (await response.json()) as CreateResponse;

      if (!data.ok) {
        setError(data.error);
        return;
      }

      setPostId(data.postId);
      setCreatedPhone(data.phone);
      setManagementToken(data.managementToken);
      setDevCode(data.devVerificationCode);
      setStep("verify");
    } catch {
      setError("Unable to create listing.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function verifyListing(): Promise<void> {
    setError("");
    setIsSubmitting(true);

    try {
      const response = await fetch("/api/post/verify", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          postId,
          phone: createdPhone,
          code: verificationCode,
        }),
      });

      const data = (await response.json()) as VerifyResponse;

      if (!data.ok) {
        setError(data.error);
        return;
      }

      const params = new URLSearchParams({
        postId: data.postId,
        token: managementToken,
      });

      window.location.href = `/post/success?${params.toString()}`;
    } catch {
      setError("Unable to verify listing.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="rounded-[2.25rem] border border-[#dbe7df] bg-white p-6 shadow-sm sm:p-8">
      <p className="text-sm font-black uppercase tracking-[0.18em] text-[#228454]">
        Free Stuff
      </p>

      <h1 className="mt-2 text-4xl font-black tracking-tight sm:text-5xl">
        Post something free.
      </h1>

      <p className="mt-3 text-base font-semibold leading-7 text-[#5f6f67]">
        Free to post. Your phone and exact address stay private until someone connects.
      </p>

      {error ? (
        <div className="mt-5 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700">
          {error}
        </div>
      ) : null}

      {step === "details" ? (
        <div className="mt-6 space-y-4">
          <input
            value={zip}
            onChange={(event) => setZip(event.target.value.replace(/\D/g, "").slice(0, 5))}
            inputMode="numeric"
            placeholder="ZIP code"
            className="w-full rounded-2xl border border-[#dbe7df] bg-[#f7fbf8] px-4 py-4 text-base font-bold outline-none focus:border-[#4f9f75]"
          />

          <input
            value={title}
            onChange={(event) => setTitle(event.target.value.slice(0, 80))}
            placeholder="Example: Free couch"
            className="w-full rounded-2xl border border-[#dbe7df] bg-[#f7fbf8] px-4 py-4 text-base font-bold outline-none focus:border-[#4f9f75]"
          />

          <textarea
            value={description}
            onChange={(event) => setDescription(event.target.value.slice(0, 1000))}
            rows={5}
            placeholder="Describe the item and pickup details..."
            className="w-full resize-none rounded-2xl border border-[#dbe7df] bg-[#f7fbf8] px-4 py-4 text-base font-semibold leading-7 outline-none focus:border-[#4f9f75]"
          />

          <input
            value={exactAddress}
            onChange={(event) => setExactAddress(event.target.value.slice(0, 200))}
            placeholder="Pickup address"
            className="w-full rounded-2xl border border-[#dbe7df] bg-[#f7fbf8] px-4 py-4 text-base font-bold outline-none focus:border-[#4f9f75]"
          />

          <input
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            inputMode="tel"
            placeholder="Phone number"
            className="w-full rounded-2xl border border-[#dbe7df] bg-[#f7fbf8] px-4 py-4 text-base font-bold outline-none focus:border-[#4f9f75]"
          />

          <label className="block cursor-pointer rounded-3xl border border-dashed border-[#c9ddd1] bg-[#f7fbf8] p-6 text-center">
            <span className="block text-lg font-black text-[#183027]">
              Choose up to 3 photos
            </span>

            <span className="mt-2 block text-sm font-semibold text-[#5f6f67]">
              Upload storage comes next. For now this confirms the flow.
            </span>

            <input
              type="file"
              accept="image/*"
              multiple
              onChange={(event) => handlePhotoSelection(event.target.files)}
              className="hidden"
            />
          </label>

          {photoNames.length > 0 ? (
            <div className="rounded-2xl bg-[#eef8f2] p-4">
              {photoNames.map((name) => (
                <p key={name} className="text-sm font-bold text-[#183027]">
                  {name}
                </p>
              ))}
            </div>
          ) : null}

          <button
            type="button"
            onClick={createListing}
            disabled={isSubmitting}
            className="w-full rounded-full bg-[#183027] px-5 py-4 text-base font-black text-white disabled:opacity-60"
          >
            {isSubmitting ? "Creating..." : "Create Free Listing"}
          </button>
        </div>
      ) : null}

      {step === "verify" ? (
        <div className="mt-6 space-y-4">
          <div className="rounded-2xl border border-[#dbe7df] bg-[#eef8f2] p-4 text-sm font-bold text-[#183027]">
            Dev code: {devCode}
          </div>

          <input
            value={verificationCode}
            onChange={(event) =>
              setVerificationCode(event.target.value.replace(/\D/g, "").slice(0, 6))
            }
            inputMode="numeric"
            placeholder="6-digit code"
            className="w-full rounded-2xl border border-[#dbe7df] bg-[#f7fbf8] px-4 py-4 text-xl font-black tracking-[0.3em] outline-none focus:border-[#4f9f75]"
          />

          <button
            type="button"
            onClick={verifyListing}
            disabled={isSubmitting}
            className="w-full rounded-full bg-[#183027] px-5 py-4 text-base font-black text-white disabled:opacity-60"
          >
            {isSubmitting ? "Verifying..." : "Verify & Go Live"}
          </button>
        </div>
      ) : null}
    </section>
  );
}