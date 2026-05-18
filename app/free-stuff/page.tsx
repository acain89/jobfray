import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getNearbyZips } from "@/lib/zip-radius";

export const dynamic = "force-dynamic";

type FreeStuffPageProps = {
 searchParams: Promise<{
  zip?: string;
  radius?: string;
}>;
};

export default async function FreeStuffPage({ searchParams }: FreeStuffPageProps) {
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

  const items =
    zip.length === 5
      ? await prisma.post.findMany({
          where: {
            type: "FREE_STUFF",
            status: "LIVE",
            zip: {
            in: nearbyZips,
            },
          },
          orderBy: {
            createdAt: "desc",
          },
          take: 20,
          select: {
            id: true,
            title: true,
            description: true,
            zip: true,
            createdAt: true,
            photos: {
              orderBy: { sortOrder: "asc" },
              take: 1,
              select: {
                url: true,
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
              <p className="text-lg font-black tracking-tight">JobFray</p>
              <p className="-mt-1 text-xs font-semibold text-[#5f6f67]">
                Free local stuff
              </p>
            </div>
          </Link>

          <Link
            href="/free-stuff/post"
            className="rounded-full bg-[#183027] px-4 py-2 text-sm font-bold text-white"
          >
            Post Free Stuff
          </Link>
        </header>

        <section className="rounded-[2.25rem] border border-[#dbe7df] bg-white p-6 shadow-sm sm:p-8">
          <p className="text-sm font-black uppercase tracking-[0.18em] text-[#228454]">
            Free Stuff
          </p>

          <h1 className="mt-2 text-4xl font-black tracking-tight sm:text-5xl">
            Find free stuff near you.
          </h1>

          <p className="mt-3 max-w-2xl text-base font-semibold leading-7 text-[#5f6f67]">
            Browse and post free local items. No login required.
          </p>

          <form
  className="mt-6 grid gap-3 sm:grid-cols-[1fr_180px_auto]"
  action="/free-stuff"
>
            <input
              name="zip"
              defaultValue={zip}
              inputMode="numeric"
              maxLength={5}
              placeholder="Enter ZIP code"
              className="w-full rounded-2xl border border-[#dbe7df] bg-[#f7fbf8] px-4 py-4 text-base font-black outline-none focus:border-[#4f9f75]"
            />
  
         <select
  name="radius"
  defaultValue={radius}
  className="w-full rounded-2xl border border-[#dbe7df] bg-[#f7fbf8] px-4 py-4 text-base font-black outline-none focus:border-[#4f9f75]"
>
  <option value="5">5 miles</option>
  <option value="10">10 miles</option>
  <option value="20">20 miles</option>
</select>

            <button
              type="submit"
              className="rounded-full bg-[#183027] px-6 py-4 text-base font-black text-white"
            >
              Search
            </button>
          </form>
        </section>

        {zip.length !== 5 ? (
          <section className="rounded-[2rem] border border-[#dbe7df] bg-white p-6 text-center shadow-sm">
            <h2 className="text-2xl font-black">Enter a ZIP code to browse free stuff.</h2>
            <p className="mt-2 text-base font-semibold text-[#5f6f67]">
              Local free listings will appear here.
            </p>
          </section>
        ) : null}

        {zip.length === 5 && items.length === 0 ? (
          <section className="rounded-[2rem] border border-[#dbe7df] bg-white p-6 text-center shadow-sm">
            <h2 className="text-2xl font-black">No free stuff in {zip} yet.</h2>
            <p className="mt-2 text-base font-semibold text-[#5f6f67]">
              Post something free or check nearby ZIPs.
            </p>
          </section>
        ) : null}

        {items.length > 0 ? (
          <section className="grid gap-4 sm:grid-cols-2">
            {items.map((item) => (
              <Link
                key={item.id}
                href={`/free-stuff/${item.id}`}
                className="overflow-hidden rounded-[2rem] border border-[#dbe7df] bg-white shadow-sm transition hover:bg-[#f7fbf8]"
              >
                <div className="aspect-video bg-[#eef8f2]">
                  {item.photos[0]?.url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={item.photos[0].url}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-5xl">
                      🎁
                    </div>
                  )}
                </div>

                <div className="p-5">
                  <p className="text-sm font-black uppercase tracking-[0.18em] text-[#228454]">
                    Free
                  </p>

                  <h2 className="mt-1 text-2xl font-black text-[#183027]">
                    {item.title}
                  </h2>

                  <p className="mt-2 line-clamp-2 text-base font-semibold leading-7 text-[#5f6f67]">
                    {item.description}
                  </p>

                  <span className="mt-4 inline-flex rounded-full bg-[#eef8f2] px-3 py-2 text-xs font-black text-[#183027]">
                    ZIP {item.zip}
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