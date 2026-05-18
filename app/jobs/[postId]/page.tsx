import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import JobMiniMap from "@/components/maps/JobMiniMap";

export const dynamic = "force-dynamic";


type JobDetailPageProps = {
  params: Promise<{
    postId: string;
  }>;
};

function formatMoney(cents: number | null): string {
  if (!cents || cents <= 0) return "Pay listed";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

function formatNeedBy(value: string | null): string {
  if (!value) return "Flexible";

  return value
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export default async function JobDetailPage({ params }: JobDetailPageProps) {
  const { postId } = await params;

  const job = await prisma.post.findFirst({
    where: {
      id: postId,
      type: "JOB",
      status: "LIVE",
    },
    select: {
      id: true,
      title: true,
      description: true,
      payAmountCents: true,
      needBy: true,
      zip: true,
      publicLatitude: true,
      publicLongitude: true,
      createdAt: true,
      category: {
        select: {
          name: true,
        },
      },
      photos: {
        orderBy: {
          sortOrder: "asc",
        },
        select: {
          id: true,
          url: true,
        },
      },
    },
  });

  if (!job) {
    notFound();
  }

  return (
    <main className="min-h-screen px-4 py-4 text-[#17231d] sm:px-6 lg:px-8">
      <section className="mx-auto flex max-w-4xl flex-col gap-5">
        <header className="flex items-center justify-between rounded-[2rem] border border-[#dbe7df] bg-white/90 px-4 py-3 shadow-sm backdrop-blur">
          <Link href="/jobs" className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#afe1c6] text-lg font-black text-[#183027] shadow-sm">
              JF
            </div>

            <div>
              <p className="text-lg font-black tracking-tight">JobFray</p>
              <p className="-mt-1 text-xs font-semibold text-[#5f6f67]">
                Job details
              </p>
            </div>
          </Link>

          <Link
            href="/jobs"
            className="rounded-full border border-[#c9ddd1] bg-[#eef8f2] px-4 py-2 text-sm font-bold text-[#183027]"
          >
            Back
          </Link>
        </header>

        <section className="rounded-[2.25rem] border border-[#dbe7df] bg-white p-6 shadow-sm sm:p-8">
          <p className="text-sm font-black uppercase tracking-[0.18em] text-[#228454]">
            {job.category?.name ?? "Local Job"}
          </p>

          <h1 className="mt-2 text-4xl font-black tracking-tight sm:text-5xl">
            {job.title}
          </h1>

          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl bg-[#eef8f2] p-4">
              <p className="text-xs font-black uppercase text-[#5f6f67]">
                Pay
              </p>
              <p className="mt-1 text-2xl font-black text-[#183027]">
                {formatMoney(job.payAmountCents)}
              </p>
            </div>

            <div className="rounded-2xl bg-[#eef8f2] p-4">
              <p className="text-xs font-black uppercase text-[#5f6f67]">
                Needed
              </p>
              <p className="mt-1 text-2xl font-black text-[#183027]">
                {formatNeedBy(job.needBy)}
              </p>
            </div>

            <div className="rounded-2xl bg-[#eef8f2] p-4">
              <p className="text-xs font-black uppercase text-[#5f6f67]">
                Area
              </p>
              <p className="mt-1 text-2xl font-black text-[#183027]">
                ZIP {job.zip}
              </p>
            </div>
          </div>

          {job.photos.length > 0 ? (
            <div className="mt-6 grid gap-3 sm:grid-cols-3">
              {job.photos.map((photo) => (
                <div
                  key={photo.id}
                  className="aspect-video overflow-hidden rounded-3xl bg-[#eef8f2]"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={photo.url}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                </div>
              ))}
            </div>
          ) : null}

        {job.publicLatitude &&
job.publicLongitude ? (
  <div className="mt-6">
    <div className="rounded-3xl border border-[#dbe7df] bg-[#f7fbf8] p-5">
      <h2 className="text-xl font-black text-[#183027]">
        Approximate job area
      </h2>

      <p className="mt-2 text-base font-semibold leading-7 text-[#5f6f67]">
        The exact address is hidden until
        a match is accepted. This map
        shows only the general area.
      </p>

      <JobMiniMap
  latitude={Number(job.publicLatitude)}
  longitude={Number(job.publicLongitude)}
          />
    </div>
  </div>
) : null}

          <div className="mt-6 rounded-3xl bg-[#f7fbf8] p-5">
            <h2 className="text-xl font-black text-[#183027]">
              Job details
            </h2>

            <p className="mt-3 whitespace-pre-wrap text-base font-semibold leading-8 text-[#5f6f67]">
              {job.description}
            </p>
          </div>

          <div className="mt-6 rounded-3xl border border-[#dbe7df] bg-white p-5">
            <h2 className="text-xl font-black text-[#183027]">
              Exact address is private
            </h2>

            <p className="mt-2 text-base font-semibold leading-7 text-[#5f6f67]">
              JobFray only shows the ZIP code publicly. Phone number and exact address are revealed after a connection is made.
            </p>
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            <Link
              href={`/jobs/${job.id}/offer`}
              className="rounded-full bg-[#183027] px-5 py-4 text-center text-base font-black text-white"
            >
              I Can Do This
            </Link>

            <Link
              href={`/jobs?zip=${encodeURIComponent(job.zip)}`}
              className="rounded-full border border-[#c9ddd1] bg-[#eef8f2] px-5 py-4 text-center text-base font-black text-[#183027]"
            >
              More Jobs Nearby
            </Link>
          </div>
        </section>
      </section>
    </main>
  );
}