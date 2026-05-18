"use client";

import { useMemo, useState } from "react";

type Category = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
};

type Props = {
  categories: Category[];
};

type NeedBy =
  | "ASAP"
  | "TODAY"
  | "TOMORROW"
  | "THIS_WEEK"
  | "FLEXIBLE";

type UploadResponse =
  | {
      ok: true;
      urls: string[];
    }
  | {
      ok: false;
      error: string;
    };

type CreatePostResponse =
  | {
      ok: true;
      postId: string;
      phone: string;
      managementToken: string;
    }
  | {
      ok: false;
      error: string;
    };

type VerifyPostResponse =
  | {
      ok: true;
      postId: string;
    }
  | {
      ok: false;
      error: string;
    };

const needByOptions: {
  value: NeedBy;
  label: string;
}[] = [
  { value: "ASAP", label: "ASAP" },
  { value: "TODAY", label: "Today" },
  { value: "TOMORROW", label: "Tomorrow" },
  { value: "THIS_WEEK", label: "This week" },
  { value: "FLEXIBLE", label: "Flexible" },
];

function dollarsToCents(value: string): number {
  const normalized = value.replace(/[^0-9.]/g, "");
  const amount = Number.parseFloat(normalized);

  if (!Number.isFinite(amount)) {
    return 0;
  }

  return Math.round(amount * 100);
}

function formatPhone(phone: string): string {
  return phone.replace(/\D/g, "").slice(0, 10);
}

function formatPayInput(value: string): string {
  const cleaned = value.replace(/[^0-9.]/g, "");
  const parts = cleaned.split(".");

  if (parts.length <= 1) {
    return cleaned.slice(0, 6);
  }

  return `${parts[0].slice(0, 6)}.${parts
    .slice(1)
    .join("")
    .slice(0, 2)}`;
}

export default function PostWizard({
  categories,
}: Props): React.ReactElement {
  const [step, setStep] = useState(0);
  const [zip, setZip] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [needBy, setNeedBy] = useState<NeedBy>("FLEXIBLE");
  const [payAmount, setPayAmount] = useState("");
  const [exactAddress, setExactAddress] = useState("");
  const [phone, setPhone] = useState("");
  const [photoNames, setPhotoNames] = useState<string[]>([]);
  const [photoUrls, setPhotoUrls] = useState<string[]>([]);
  const [verificationCode, setVerificationCode] = useState("");
  const [createdPostId, setCreatedPostId] = useState("");
  const [createdPhone, setCreatedPhone] = useState("");
  const [managementToken, setManagementToken] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  const selectedCategory = useMemo(() => {
    return categories.find((category) => category.id === categoryId);
  }, [categories, categoryId]);

  const cleanedPhone = useMemo(() => {
    return formatPhone(phone);
  }, [phone]);

  const canContinue = useMemo(() => {
    if (step === 0) {
      return /^\d{5}$/.test(zip);
    }

    if (step === 1) {
      return categoryId.length > 0;
    }

    if (step === 2) {
      return (
        title.trim().length >= 6 &&
        description.trim().length >= 20
      );
    }

    if (step === 3) {
      return (
        needBy.length > 0 &&
        dollarsToCents(payAmount) >= 100
      );
    }

    if (step === 4) {
      return (
        exactAddress.trim().length >= 5 &&
        cleanedPhone.length === 10
      );
    }

    if (step === 5) {
      return !isUploading;
    }

    return true;
  }, [
    categoryId,
    cleanedPhone,
    description,
    exactAddress,
    isUploading,
    needBy,
    payAmount,
    phone,
    step,
    title,
    zip,
  ]);

  function nextStep(): void {
    setError("");

    if (!canContinue) {
      setError("Finish this step before continuing.");
      return;
    }

    setStep((current) => Math.min(current + 1, 6));
  }

  function previousStep(): void {
    setError("");
    setStep((current) => Math.max(current - 1, 0));
  }

  async function handlePhotoSelection(
    files: FileList | null,
  ): Promise<void> {
    setError("");

    if (!files || files.length === 0) {
      return;
    }

    const selectedFiles = Array.from(files).slice(0, 3);

    setPhotoNames(selectedFiles.map((file) => file.name));
    setPhotoUrls([]);
    setIsUploading(true);

    const formData = new FormData();

    selectedFiles.forEach((file) => {
      formData.append("files", file);
    });

    try {
      const response = await fetch("/api/uploads/images", {
        method: "POST",
        body: formData,
      });

      const data = (await response.json()) as UploadResponse;

      if (!response.ok || !data.ok) {
        setError(data.ok ? "Unable to upload images." : data.error);
        setPhotoNames([]);
        return;
      }

      setPhotoUrls(data.urls);
    } catch {
      setError("Unable to upload images.");
      setPhotoNames([]);
    } finally {
      setIsUploading(false);
    }
  }

  async function createPost(): Promise<void> {
    if (isSubmitting || isUploading) {
      return;
    }

    setError("");
    setIsSubmitting(true);

    try {
      const response = await fetch("/api/post/create", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          zip,
          categoryId,
          title: title.trim(),
          description: description.trim(),
          exactAddress: exactAddress.trim(),
          phone: cleanedPhone,
          needBy,
          payAmountCents: dollarsToCents(payAmount),
          photoUrls,
        }),
      });

      const data = (await response.json()) as CreatePostResponse;

      if (!response.ok || !data.ok) {
        setError(data.ok ? "Unable to create post." : data.error);
        return;
      }

      setCreatedPostId(data.postId);
      setCreatedPhone(data.phone);
      setManagementToken(data.managementToken);
      setStep(6);
    } catch {
      setError("Unable to create post.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function verifyPost(): Promise<void> {
    if (isSubmitting) {
      return;
    }

    setError("");
    setIsSubmitting(true);

    try {
      const response = await fetch("/api/post/verify", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          postId: createdPostId,
          phone: createdPhone,
          code: verificationCode,
        }),
      });

      const data = (await response.json()) as VerifyPostResponse;

      if (!response.ok || !data.ok) {
        setError(data.ok ? "Unable to verify post." : data.error);
        return;
      }

      const params = new URLSearchParams({
        postId: data.postId,
        token: managementToken,
      });

      window.location.href = `/post/success?${params.toString()}`;
    } catch {
      setError("Unable to verify post.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="rounded-[2.25rem] border border-[#dbe7df] bg-white p-5 shadow-[0_20px_60px_rgba(24,48,39,0.08)] sm:p-7">
      <div className="mb-6">
        <p className="text-sm font-black uppercase tracking-[0.18em] text-[#228454]">
          Post a Job
        </p>

        <h1 className="mt-1 text-4xl font-black tracking-tight text-[#17231d] sm:text-5xl">
          Tell locals what you need done.
        </h1>

        <p className="mt-3 text-base font-semibold leading-7 text-[#5f6f67]">
          Free to post. Your phone and exact address stay private until
          you choose a worker.
        </p>
      </div>

      <div className="mb-6 h-3 overflow-hidden rounded-full bg-[#eef8f2]">
        <div
          className="h-full rounded-full bg-[#afe1c6] transition-all"
          style={{
            width: `${((step + 1) / 7) * 100}%`,
          }}
        />
      </div>

      {error ? (
        <div className="mb-5 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700">
          {error}
        </div>
      ) : null}

      {step === 0 ? (
        <div className="space-y-4">
          <h2 className="text-2xl font-black">
            Where is the job?
          </h2>

          <input
            value={zip}
            onChange={(event) =>
              setZip(
                event.target.value.replace(/\D/g, "").slice(0, 5),
              )
            }
            inputMode="numeric"
            placeholder="ZIP code"
            className="jf-search-input text-xl font-black"
          />

          <p className="text-sm font-semibold leading-6 text-[#5f6f67]">
            Workers browse by ZIP and radius. Your exact address is not
            public.
          </p>
        </div>
      ) : null}

      {step === 1 ? (
        <div className="space-y-4">
          <h2 className="text-2xl font-black">
            Choose a category
          </h2>

          <div className="grid gap-3 sm:grid-cols-2">
            {categories.map((category) => (
              <button
                key={category.id}
                type="button"
                onClick={() => setCategoryId(category.id)}
                className={`rounded-2xl border p-4 text-left transition ${
                  categoryId === category.id
                    ? "border-[#4f9f75] bg-[#afe1c6]"
                    : "border-[#dbe7df] bg-[#f7fbf8] hover:bg-[#eef8f2]"
                }`}
              >
                <span className="block text-lg font-black text-[#183027]">
                  {category.name}
                </span>

                {category.description ? (
                  <span className="mt-1 block text-sm font-semibold leading-6 text-[#5f6f67]">
                    {category.description}
                  </span>
                ) : null}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {step === 2 ? (
        <div className="space-y-4">
          <h2 className="text-2xl font-black">
            Describe the job
          </h2>

          <input
            value={title}
            onChange={(event) =>
              setTitle(event.target.value.slice(0, 80))
            }
            placeholder="Example: Need lawn mowed"
            className="jf-search-input text-base font-bold"
          />

          <textarea
            value={description}
            onChange={(event) =>
              setDescription(event.target.value.slice(0, 1000))
            }
            placeholder="Add the details workers need to know..."
            rows={6}
            className="w-full resize-none rounded-2xl border border-[#dbe7df] bg-[#f7fbf8] px-4 py-4 text-base font-semibold leading-7 outline-none focus:border-[#4f9f75]"
          />

          <p className="text-sm font-semibold leading-6 text-[#5f6f67]">
            Clear details help workers price the job accurately.
          </p>
        </div>
      ) : null}

      {step === 3 ? (
        <div className="space-y-4">
          <h2 className="text-2xl font-black">
            Timing and pay
          </h2>

          <div className="grid gap-3 sm:grid-cols-2">
            {needByOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setNeedBy(option.value)}
                className={`rounded-2xl border p-4 text-left text-base font-black transition ${
                  needBy === option.value
                    ? "border-[#4f9f75] bg-[#afe1c6] text-[#183027]"
                    : "border-[#dbe7df] bg-[#f7fbf8] text-[#183027] hover:bg-[#eef8f2]"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-black text-[#183027]">
              How much do you want to pay for this job?
            </label>

            <input
              value={payAmount}
              onChange={(event) =>
                setPayAmount(formatPayInput(event.target.value))
              }
              inputMode="decimal"
              placeholder="Example: 75"
              className="jf-search-input text-lg font-black"
            />

            <p className="text-sm font-semibold leading-6 text-[#5f6f67]">
              Workers can accept your amount or submit a different offer.
            </p>
          </div>
        </div>
      ) : null}

      {step === 4 ? (
        <div className="space-y-4">
          <h2 className="text-2xl font-black">
            Private contact details
          </h2>

          <input
            value={exactAddress}
            onChange={(event) =>
              setExactAddress(event.target.value.slice(0, 200))
            }
            placeholder="Exact address"
            autoComplete="street-address"
            className="jf-search-input text-base font-bold"
          />

          <input
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            inputMode="tel"
            placeholder="Phone number"
            autoComplete="tel"
            className="jf-search-input text-base font-bold"
          />

          <p className="text-sm font-semibold leading-6 text-[#5f6f67]">
            JobFray uses your phone to verify the post. Workers do not
            see your phone or exact address unless you connect with them.
          </p>
        </div>
      ) : null}

      {step === 5 ? (
        <div className="space-y-4">
          <h2 className="text-2xl font-black">
            Add photos
          </h2>

          <label className="block cursor-pointer rounded-3xl border border-dashed border-[#c9ddd1] bg-[#f7fbf8] p-6 text-center transition hover:bg-[#eef8f2]">
            <span className="block text-lg font-black text-[#183027]">
              Choose or take up to 3 photos
            </span>

            <span className="mt-2 block text-sm font-semibold text-[#5f6f67]">
              Photos help workers understand the job before making an
              offer.
            </span>

            <input
              type="file"
              accept="image/*"
              multiple
              onChange={(event) =>
                void handlePhotoSelection(event.target.files)
              }
              className="hidden"
            />
          </label>

          <label className="block cursor-pointer rounded-3xl border border-[#c9ddd1] bg-[#eef8f2] p-5 text-center transition hover:bg-[#e4f3ea]">
            <span className="block text-base font-black text-[#183027]">
              Open Camera
            </span>

            <span className="mt-1 block text-sm font-semibold text-[#5f6f67]">
              Use this on mobile to take a photo now.
            </span>

            <input
              type="file"
              accept="image/*"
              capture="environment"
              onChange={(event) =>
                void handlePhotoSelection(event.target.files)
              }
              className="hidden"
            />
          </label>

          {isUploading ? (
            <div className="rounded-2xl border border-[#c9ddd1] bg-[#eef8f2] p-4 text-sm font-bold text-[#183027]">
              Uploading images...
            </div>
          ) : null}

          {photoNames.length > 0 ? (
            <div className="rounded-2xl bg-[#eef8f2] p-4">
              {photoNames.map((name) => (
                <p
                  key={name}
                  className="text-sm font-bold text-[#183027]"
                >
                  {name}
                </p>
              ))}
            </div>
          ) : null}

          <p className="text-sm font-semibold leading-6 text-[#5f6f67]">
            Photos are optional, but strongly recommended.
          </p>
        </div>
      ) : null}

      {step === 6 && !createdPostId ? (
        <div className="space-y-5">
          <h2 className="text-2xl font-black">
            Review your post
          </h2>

          <div className="rounded-3xl bg-[#f7fbf8] p-5">
            <p className="text-sm font-black uppercase tracking-[0.18em] text-[#228454]">
              {selectedCategory?.name ?? "Category"}
            </p>

            <h3 className="mt-2 text-2xl font-black">
              {title}
            </h3>

            <p className="mt-2 text-base font-semibold leading-7 text-[#5f6f67]">
              {description}
            </p>

            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl bg-white p-4">
                <p className="text-xs font-black uppercase text-[#5f6f67]">
                  ZIP
                </p>
                <p className="font-black">{zip}</p>
              </div>

              <div className="rounded-2xl bg-white p-4">
                <p className="text-xs font-black uppercase text-[#5f6f67]">
                  Pay
                </p>
                <p className="font-black">
                  ${payAmount}
                </p>
              </div>

              <div className="rounded-2xl bg-white p-4">
                <p className="text-xs font-black uppercase text-[#5f6f67]">
                  Photos
                </p>
                <p className="font-black">
                  {photoUrls.length}
                </p>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {step === 6 && createdPostId ? (
        <div className="space-y-4">
          <h2 className="text-2xl font-black">
            Verify your phone
          </h2>

          <p className="text-base font-semibold leading-7 text-[#5f6f67]">
            Enter the 6-digit code sent to your phone.
          </p>

          <input
            value={verificationCode}
            onChange={(event) =>
              setVerificationCode(
                event.target.value.replace(/\D/g, "").slice(0, 6),
              )
            }
            inputMode="numeric"
            placeholder="6-digit code"
            className="w-full rounded-2xl border border-[#dbe7df] bg-[#f7fbf8] px-4 py-4 text-xl font-black tracking-[0.3em] outline-none focus:border-[#4f9f75]"
          />
        </div>
      ) : null}

      <div className="mt-8 flex gap-3">
        {step > 0 && !createdPostId ? (
          <button
            type="button"
            onClick={previousStep}
            className="flex-1 rounded-full border border-[#c9ddd1] bg-white px-5 py-4 text-base font-black text-[#183027] transition hover:bg-[#eef8f2]"
          >
            Back
          </button>
        ) : null}

        {step < 6 ? (
          <button
            type="button"
            onClick={nextStep}
            disabled={!canContinue}
            className="flex-1 rounded-full bg-[#183027] px-5 py-4 text-base font-black text-white transition hover:bg-[#244638] disabled:cursor-not-allowed disabled:opacity-60"
          >
            Continue
          </button>
        ) : null}

        {step === 6 && !createdPostId ? (
          <button
            type="button"
            onClick={() => void createPost()}
            disabled={isSubmitting || isUploading}
            className="flex-1 rounded-full bg-[#183027] px-5 py-4 text-base font-black text-white transition hover:bg-[#244638] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSubmitting ? "Posting..." : "Post Job"}
          </button>
        ) : null}

        {step === 6 && createdPostId ? (
          <button
            type="button"
            onClick={() => void verifyPost()}
            disabled={
              isSubmitting || verificationCode.length !== 6
            }
            className="flex-1 rounded-full bg-[#183027] px-5 py-4 text-base font-black text-white transition hover:bg-[#244638] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSubmitting ? "Verifying..." : "Verify & Go Live"}
          </button>
        ) : null}
      </div>
    </section>
  );
}