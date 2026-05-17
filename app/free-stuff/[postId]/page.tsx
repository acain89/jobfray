import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type FreeStuffDetailPageProps = {
  params: Promise<{
    postId: string;
  }>;
};

export default async function FreeStuffDetailPage({
  params,
}: FreeStuffDetailPageProps) {
  const { postId } = await params;

  const item = await prisma.post.findFirst({
    where: {
      id: postId,
      type: "FREE_STUFF",
      status: "LIVE",
    },
    select: {
      id: true,
      title: true,
      description: true,
      zip: true,
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

  if (!item) {
    notFound();
  }

  return (
    <main className="min-h-screen px-4 py-4 text-[#17231d] sm:px-6 lg:px-8">
      <section className="mx-auto flex max-w-4xl flex-col gap-5">
        <header className="flex items-center justify-between rounded-[2rem] border border-[#dbe7df] bg-white/90 px-4 py-3 shadow-sm backdrop-blur">
          <Link href="/free-stuff" className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#afe1c6] text-lg font-black text-[#183027] shadow-sm">
              JF
            </div>

            <div>
              <p className="text-lg font-black tracking-tight">JobFray</p>
              <p className="-mt-1 text-xs font-semibold text-[#5f6f67]">
                Free stuff details
              </p>
            </div>
          </Link>

          <Link
            href={`/free-stuff?zip=${encodeURIComponent(item.zip)}`}
            className="rounded-full border border-[#c9ddd1] bg-[#eef8f2] px-4 py-2 text-sm font-bold text-[#183027]"
          >
            Back
          </Link>
        </header>

        <section className="rounded-[2.25rem] border border-[#dbe7df] bg-white p-6 shadow-sm sm:p-8">
          <p className="text-sm font-black uppercase tracking-[0.18em] text-[#228454]">
            Free
          </p>

          <h1 className="mt-2 text-4xl font-black tracking-tight sm:text-5xl">
            {item.title}
          </h1>

          <p className="mt-3 text-base font-semibold leading-7 text-[#5f6f67]">
            ZIP {item.zip}
          </p>

          {item.photos.length > 0 ? (
            <div className="mt-6 grid gap-3 sm:grid-cols-3">
              {item.photos.map((photo) => (
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
          ) : (
            <div className="mt-6 flex aspect-video items-center justify-center rounded-3xl bg-[#eef8f2] text-6xl">
              🎁
            </div>
          )}

          <div className="mt-6 rounded-3xl bg-[#f7fbf8] p-5">
            <h2 className="text-xl font-black text-[#183027]">
              Item details
            </h2>

            <p className="mt-3 whitespace-pre-wrap text-base font-semibold leading-8 text-[#5f6f67]">
              {item.description}
            </p>
          </div>

          <div className="mt-6 rounded-3xl border border-[#dbe7df] bg-white p-5">
            <h2 className="text-xl font-black text-[#183027]">
              Pickup address is private
            </h2>

            <p className="mt-2 text-base font-semibold leading-7 text-[#5f6f67]">
              JobFray only shows the ZIP code publicly. Exact pickup details stay hidden until a connection flow is added.
            </p>
          </div>

          <button
            type="button"
            className="mt-6 w-full rounded-full bg-[#183027] px-5 py-4 text-base font-black text-white"
          >
            Claim / Contact Coming Soon
          </button>
        </section>
      </section>
    </main>
  );
}