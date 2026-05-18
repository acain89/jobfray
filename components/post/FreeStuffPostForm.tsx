"use client";

import { useState } from "react";

type CreateResponse =
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

export default function FreeStuffPostForm(): React.ReactElement {
  const [step, setStep] = useState<"details" | "done">("details");
  const [zip, setZip] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [phone, setPhone] = useState("");
  const [photoNames, setPhotoNames] = useState<string[]>([]);
  const [photoUrls, setPhotoUrls] = useState<string[]>([]);
  const [postId, setPostId] = useState("");
  const [error, setError] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handlePhotoSelection(files: FileList | null): Promise<void> {
    setError("");

    if (!files) {
      return;
    }

    const selectedFiles = Array.from(files).slice(0, 3);

    if (selectedFiles.length === 0) {
      setPhotoNames([]);
      setPhotoUrls([]);
      return;
    }

    setIsUploading(true);
    setPhotoNames(selectedFiles.map((file) => file.name));

    const formData = new FormData();

    selectedFiles.forEach((file) => {
      formData.append("files", file);
    });

    try {
      const response = await fetch("/api/uploads/images", {
        method: "POST",
        body: formData,
      });

      const data = (await response.json()) as
        | {
            ok: true;
            urls: string[];
          }
        | {
            ok: false;
            error: string;
          };

      if (!data.ok) {
        setError(data.error);
        setPhotoUrls([]);
        return;
      }

      setPhotoUrls(data.urls);
    } catch {
      setError("Unable to upload images.");
      setPhotoUrls([]);
    } finally {
      setIsUploading(false);
    }
  }

  async function createListing(): Promise<void> {
    setError("");

    if (photoUrls.length === 0) {
      setError("At least 1 photo is required.");
      return;
    }

    if (isUploading) {
      setError("Wait for photos to finish uploading.");
      return;
    }

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
          phone,
          photoUrls,
        }),
      });

      const data = (await response.json()) as CreateResponse;

      if (!data.ok) {
        setError(data.error);
        return;
      }

      setPostId(data.postId);
      setStep("done");
    } catch {
      setError("Unable to create listing.");
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
        Free to post. Listings automatically expire after 72 hours.
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
            onChange={(event) =>
              setZip(event.target.value.replace(/\D/g, "").slice(0, 5))
            }
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
            onChange={(event) =>
              setDescription(event.target.value.slice(0, 1000))
            }
            rows={5}
            placeholder='Example: Free stuff on the curb on Pine St. First come, first served.'
            className="w-full resize-none rounded-2xl border border-[#dbe7df] bg-[#f7fbf8] px-4 py-4 text-base font-semibold leading-7 outline-none focus:border-[#4f9f75]"
          />

          <input
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            inputMode="tel"
            placeholder="Phone number for delete link"
            className="w-full rounded-2xl border border-[#dbe7df] bg-[#f7fbf8] px-4 py-4 text-base font-bold outline-none focus:border-[#4f9f75]"
          />

          <label className="block cursor-pointer rounded-3xl border border-dashed border-[#c9ddd1] bg-[#f7fbf8] p-6 text-center">
            <span className="block text-lg font-black text-[#183027]">
              Choose 1–3 photos
            </span>

            <span className="mt-2 block text-sm font-semibold text-[#5f6f67]">
              At least 1 photo is required.
            </span>

            <input
              type="file"
              accept="image/*"
              multiple
              onChange={(event) => void handlePhotoSelection(event.target.files)}
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

              <p className="mt-2 text-xs font-black uppercase tracking-[0.18em] text-[#5f6f67]">
                {isUploading ? "Uploading..." : "Uploaded"}
              </p>
            </div>
          ) : null}

          <button
            type="button"
            onClick={() => void createListing()}
            disabled={isSubmitting || isUploading}
            className="w-full rounded-full bg-[#183027] px-5 py-4 text-base font-black text-white disabled:opacity-60"
          >
            {isSubmitting ? "Creating..." : "Create Free Listing"}
          </button>
        </div>
      ) : null}

      {step === "done" ? (
        <div className="mt-6 rounded-3xl border border-[#cde7d8] bg-[#eef8f2] p-6">
          <p className="text-sm font-black uppercase tracking-[0.18em] text-[#228454]">
            Listing Live
          </p>

          <h2 className="mt-2 text-3xl font-black text-[#183027]">
            Your free listing is now live.
          </h2>

          <p className="mt-3 text-base font-semibold leading-7 text-[#5f6f67]">
            Your listing will automatically expire after 72 hours. A delete link
            has been sent to the phone number you entered.
          </p>

          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <a
              href={`/free-stuff/${postId}`}
              className="rounded-full bg-[#183027] px-5 py-4 text-center text-base font-black text-white"
            >
              View Listing
            </a>

            <a
              href="/free-stuff"
              className="rounded-full border border-[#dbe7df] bg-white px-5 py-4 text-center text-base font-black text-[#183027]"
            >
              Browse Free Stuff
            </a>
          </div>
        </div>
      ) : null}
    </section>
  );
}