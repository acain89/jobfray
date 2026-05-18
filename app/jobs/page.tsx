import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getNearbyZips } from "@/lib/zip-radius";

export const dynamic = "force-dynamic";

type JobsPageProps = {
  searchParams: Promise<{
    zip?: string;
    radius?: string;
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

export default async function JobsPage({
  searchParams,
}: JobsPageProps): Promise<React.ReactElement> {
  const params = await searchParams;

  const zip =
    params.zip
      ?.replace(/\D/g, "")
      .slice(0, 5) ?? "";

  const radius = ["5", "10", "20"].includes(
    params.radius ?? "",
  )
    ? params.radius ?? "10"
    : "10";

  const nearbyZips =
    zip.length === 5
      ? getNearbyZips(
          zip,
          Number(radius),
        )
      : [];

  const jobs =
    zip.length === 5
      ? await prisma.post.findMany({
          where: {
            type: "JOB",
            status: "LIVE",
            zip: {
              in: nearbyZips,
            },
          },

          orderBy: {
            createdAt: "desc",
          },

          take: 50,

          select: {
            id: true,
            title: true,
            description: true,
            payAmountCents: true,
            needBy: true,
            zip: true,
            createdAt: true,

            category: {
              select: {
                name: true,
              },
            },
          },
        })
      : [];

  return (
    <main className="min-h-screen px-4 py-4 text-[#17231d] sm:px-6 lg:px-8">
      <section className="mx-auto flex max-w-5xl flex-col gap-5">
        <header className="flex items-center justify-between rounded-[2rem] border border-[#dbe7df] bg-white/90 px-4 py-3 shadow-sm backdrop-blur">
          <Link href="/" className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#afe1c6] text-lg font-black text-[#183027] shadow-sm">
              JF
            </div>

            <div>
              <p className="text-lg font-black tracking-tight">
                JobFray
              </p>

              <p className="-mt-1 text-xs font-semibold text-[#5f6f67]">
                Find local work
              </p>
            </div>
          </Link>

          <div className="flex items-center gap-2">
            <Link
              href="/"
              className="rounded-full border border-[#c9ddd1] bg-white px-4 py-2 text-sm font-bold text-[#183027] transition hover:bg-[#f7fbf8]"
            >
              Home
            </Link>

            <Link
              href="/worker/login"
              className="rounded-full border border-[#c9ddd1] bg-[#eef8f2] px-4 py-2 text-sm font-bold text-[#183027] transition hover:bg-[#dff1e6]"
            >
              Worker Login
            </Link>
          </div>
        </header>

        <section className="rounded-[2.25rem] border border-[#dbe7df] bg-white p-6 shadow-sm sm:p-8">
          <div className="inline-flex rounded-full bg-[#eef8f2] px-4 py-2 text-sm font-black text-[#228454]">
            Browse nearby jobs by ZIP code
          </div>

          <h1 className="mt-4 text-4xl font-black tracking-tight sm:text-5xl">
            Find work near your ZIP code.
          </h1>

          <p className="mt-3 max-w-2xl text-base font-semibold leading-7 text-[#5f6f67]">
            Browse local jobs, side work, labor gigs, and quick help requests.
            Worker login is required before contacting posters.
          </p>

          <form
            className="mt-6 grid gap-3 sm:grid-cols-[1fr_180px_auto]"
            action="/jobs"
          >
            <input
              name="zip"
              defaultValue={zip}
              inputMode="numeric"
              maxLength={5}
              placeholder="Enter ZIP code"
              className="w-full rounded-2xl border border-[#dbe7df] bg-[#f7fbf8] px-4 py-4 text-base font-black outline-none transition focus:border-[#4f9f75]"
            />

            <select
              name="radius"
              defaultValue={radius}
              className="w-full rounded-2xl border border-[#dbe7df] bg-[#f7fbf8] px-4 py-4 text-base font-black outline-none transition focus:border-[#4f9f75]"
            >
              <option value="5">5 miles</option>
              <option value="10">10 miles</option>
              <option value="20">20 miles</option>
            </select>

            <button
              type="submit"
              className="rounded-full bg-[#183027] px-6 py-4 text-base font-black text-white transition hover:bg-[#244638]"
            >
              Search
            </button>
          </form>

          <div className="mt-4 flex flex-wrap gap-2">
            <span className="rounded-full bg-[#eef8f2] px-3 py-2 text-xs font-black text-[#183027]">
              ZIP radius search
            </span>

            <span className="rounded-full bg-[#eef8f2] px-3 py-2 text-xs font-black text-[#183027]">
              Public listings only
            </span>

            <span className="rounded-full bg-[#eef8f2] px-3 py-2 text-xs font-black text-[#183027]">
              No poster fees
            </span>
          </div>
        </section>

        {zip.length !== 5 ? (
          <section className="rounded-[2rem] border border-[#dbe7df] bg-white p-6 text-center shadow-sm">
            <h2 className="text-2xl font-black">
              Enter a ZIP code to browse jobs.
            </h2>

            <p className="mt-2 text-base font-semibold text-[#5f6f67]">
              Nearby listings will appear here once a valid ZIP code is entered.
            </p>
          </section>
        ) : null}

        {zip.length === 5 && jobs.length === 0 ? (
          <section className="rounded-[2rem] border border-[#dbe7df] bg-white p-6 text-center shadow-sm">
            <h2 className="text-2xl font-black">
              No live jobs in {zip} yet.
            </h2>

            <p className="mt-2 text-base font-semibold text-[#5f6f67]">
              Try expanding your radius or check nearby ZIP codes.
            </p>
          </section>
        ) : null}

        {jobs.length > 0 ? (
          <section className="grid gap-4">
            {jobs.map((job) => (
              <Link
                key={job.id}
                href={`/jobs/${job.id}`}
                className="rounded-[2rem] border border-[#dbe7df] bg-white p-5 shadow-sm transition hover:bg-[#f7fbf8]"
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <p className="text-sm font-black uppercase tracking-[0.18em] text-[#228454]">
                      {job.category?.name ?? "Local Job"}
                    </p>

                    <h2 className="mt-1 text-2xl font-black text-[#183027]">
                      {job.title}
                    </h2>

                    <p className="mt-2 line-clamp-2 text-base font-semibold leading-7 text-[#5f6f67]">
                      {job.description}
                    </p>
                  </div>

                  <div className="shrink-0 rounded-2xl bg-[#eef8f2] px-5 py-4 text-left sm:text-right">
                    <p className="text-2xl font-black text-[#183027]">
                      {formatMoney(job.payAmountCents)}
                    </p>

                    <p className="mt-1 text-sm font-bold text-[#5f6f67]">
                      {formatNeedBy(job.needBy)}
                    </p>
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  <span className="rounded-full bg-[#eef8f2] px-3 py-2 text-xs font-black text-[#183027]">
                    ZIP {job.zip}
                  </span>

                  <span className="rounded-full bg-[#eef8f2] px-3 py-2 text-xs font-black text-[#183027]">
                    Public details only
                  </span>
                </div>
              </Link>
            ))}
          </section>
        ) : null}
      </section>
    </main>
  );
}