import Link from "next/link";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type Counts = {
  activeJobCount: number;
  freeStuffCount: number;
  verifiedWorkerCount: number;
};

async function getCounts(): Promise<Counts> {
  const [activeJobCount, freeStuffCount, verifiedWorkerCount] =
    await Promise.all([
      prisma.post.count({
        where: {
          type: "JOB",
          status: "LIVE",
        },
      }),

      prisma.post.count({
        where: {
          type: "FREE_STUFF",
          status: "LIVE",
        },
      }),

      prisma.worker.count({
        where: {
          status: "ACTIVE",
          subscriptionActive: true,
        },
      }),
    ]);

  return {
    activeJobCount,
    freeStuffCount,
    verifiedWorkerCount,
  };
}

function formatCount(value: number): string {
  return new Intl.NumberFormat("en-US").format(value);
}

export default async function HomePage(): Promise<React.ReactElement> {
  const {
    activeJobCount,
    freeStuffCount,
    verifiedWorkerCount,
  } = await getCounts();

  return (
    <main className="min-h-screen px-4 py-4 text-[#17231d] sm:px-6 lg:px-8">
      <section className="mx-auto flex max-w-6xl flex-col gap-5">
        <header className="flex items-center justify-between rounded-[2rem] border border-[#dbe7df] bg-white/90 px-4 py-3 shadow-sm backdrop-blur">
          <Link href="/" className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#afe1c6] text-lg font-black text-[#183027] shadow-sm">
              JF
            </div>

            <div>
              <p className="text-lg font-black tracking-tight">JobFray</p>

              <p className="-mt-1 text-xs font-semibold text-[#5f6f67]">
                ZIP-based local help
              </p>
            </div>
          </Link>

          <Link
            href="/worker/login"
            className="rounded-full border border-[#c9ddd1] bg-[#eef8f2] px-4 py-2 text-sm font-bold text-[#183027]"
          >
            Worker Login
          </Link>
        </header>

        <section className="rounded-[2.25rem] border border-[#dbe7df] bg-white p-6 shadow-sm sm:p-8 lg:p-10">
          <div className="mb-5 inline-flex rounded-full bg-[#eef8f2] px-4 py-2 text-sm font-black text-[#228454]">
            Post fast. Browse local. Keep it simple.
          </div>

          <h1 className="max-w-4xl text-5xl font-black leading-[0.95] tracking-tight text-[#17231d] sm:text-6xl lg:text-7xl">
            Local jobs.
            <br />
            Local help.
            <br />
            Free stuff.
          </h1>

          <div className="mt-8 grid gap-4 sm:grid-cols-3">
            <div>
              <Link
                href="/post"
                className="block rounded-[1.75rem] bg-[#afe1c6] p-6 text-center shadow-sm transition hover:bg-[#9bd9b9]"
              >
                <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-3xl bg-white/70 text-3xl">
                  ✎
                </div>

                <span className="block text-2xl font-black text-[#183027]">
                  Post a Job
                </span>

                <span className="mt-3 block text-base font-bold leading-6 text-[#35584a]">
                  100% free to post.
                </span>
              </Link>

              <p className="mt-4 text-center text-base font-semibold leading-7 text-[#17231d]">
                Need something done around the house?
              </p>
            </div>

            <div>
              <Link
                href="/worker/login"
                className="block rounded-[1.75rem] bg-[#183027] p-6 text-center text-white shadow-sm transition hover:bg-[#244638]"
              >
                <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-3xl bg-white/10 text-4xl text-[#afe1c6]">
                  ⌕
                </div>

                <span className="block text-2xl font-black">
                  Find a Job
                </span>

                <span className="mt-3 block text-base font-bold leading-6 text-[#d5ebdd]">
                  Login required.
                </span>
              </Link>

              <p className="mt-4 text-center text-base font-semibold leading-7 text-[#17231d]">
                Create your account and find local work.
              </p>
            </div>

            <div>
              <Link
                href="/free-stuff"
                className="block rounded-[1.75rem] border border-[#dbe7df] bg-white p-6 text-center shadow-sm transition hover:bg-[#eef8f2]"
              >
                <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-3xl bg-[#eef8f2] text-3xl">
                  🎁
                </div>

                <span className="block text-2xl font-black text-[#183027]">
                  Free Stuff
                </span>

                <span className="mt-3 block text-base font-bold leading-6 text-[#5f6f67]">
                  Free to browse and post.
                </span>
              </Link>

              <p className="mt-4 text-center text-base font-semibold leading-7 text-[#17231d]">
                Find stuff others are giving away.
              </p>
            </div>
          </div>
        </section>

        <section className="rounded-[2rem] border border-[#dbe7df] bg-white p-5 shadow-sm">
          <div>
            <p className="text-sm font-black uppercase tracking-[0.18em] text-[#228454]">
              Live activity
            </p>

            <h2 className="mt-1 text-3xl font-black">
              Active listings on JobFray
            </h2>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <div className="rounded-[1.5rem] bg-[#eef8f2] p-5 text-center">
              <p className="text-5xl font-black text-[#183027]">
                {formatCount(activeJobCount)}
              </p>

              <p className="mt-2 text-sm font-bold text-[#5f6f67]">
                Active job posts
              </p>
            </div>

            <div className="rounded-[1.5rem] bg-[#eef8f2] p-5 text-center">
              <p className="text-5xl font-black text-[#183027]">
                {formatCount(freeStuffCount)}
              </p>

              <p className="mt-2 text-sm font-bold text-[#5f6f67]">
                Active free stuff listings
              </p>
            </div>

            <div className="rounded-[1.5rem] bg-[#eef8f2] p-5 text-center">
              <p className="text-5xl font-black text-[#183027]">
                {formatCount(verifiedWorkerCount)}
              </p>

              <p className="mt-2 text-sm font-bold text-[#5f6f67]">
                Verified workers
              </p>
            </div>
          </div>
        </section>

        <section className="grid gap-3 rounded-[2rem] border border-[#dbe7df] bg-white p-5 shadow-sm sm:grid-cols-3">
          {[
            [
              "100% Free to Post",
              "No poster fees. No charges, ever.",
            ],

            [
              "Free Stuff is Free",
              "Post it, browse it, claim it. Always free.",
            ],

            [
              "Paid for Workers",
              "Only job seekers need a membership.",
            ],
          ].map(([title, text]) => (
            <div
              key={title}
              className="rounded-[1.5rem] bg-[#f7fbf8] p-4"
            >
              <p className="font-black text-[#183027]">
                {title}
              </p>

              <p className="mt-1 text-sm font-semibold leading-6 text-[#5f6f67]">
                {text}
              </p>
            </div>
          ))}
        </section>

        <footer className="pb-4 text-center text-xs font-semibold text-[#5f6f67]">
          <Link href="/terms" className="underline underline-offset-4">
            Terms
          </Link>

          <span className="px-2">•</span>

          <Link href="/privacy" className="underline underline-offset-4">
            Privacy
          </Link>
        </footer>
      </section>
    </main>
  );
}