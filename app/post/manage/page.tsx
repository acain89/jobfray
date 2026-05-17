import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { hashToken } from "@/lib/post-token";
import ManageInterestButtons from "@/components/post-manage/ManageInterestButtons";

export const dynamic = "force-dynamic";

type ManagePostPageProps = {
  searchParams: Promise<{
    postId?: string;
    token?: string;
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

function statusLabel(status: string): string {
  return status
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export default async function ManagePostPage({ searchParams }: ManagePostPageProps) {
  const params = await searchParams;
  const postId = params.postId ?? "";
  const token = params.token ?? "";

  if (!postId || !token) {
    notFound();
  }

  const post = await prisma.post.findFirst({
    where: {
      id: postId,
      managementTokenHash: hashToken(token),
    },
    select: {
      id: true,
      title: true,
      description: true,
      status: true,
      payAmountCents: true,
      zip: true,
      exactAddress: true,
      posterContact: {
        select: {
          phone: true,
        },
      },
      workerInterests: {
        orderBy: {
          createdAt: "desc",
        },
        select: {
          id: true,
          status: true,
          offeredAmountCents: true,
          message: true,
          createdAt: true,
          worker: {
            select: {
              firstName: true,
              lastInitial: true,
              username: true,
              phone: true,
              ratingAverage: true,
              ratingCount: true,
              completedJobCount: true,
            },
          },
        },
      },
    },
  });

  if (!post) {
    notFound();
  }

  const acceptedInterest = post.workerInterests.find(
    (interest) => interest.status === "ACCEPTED",
  );

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
                Manage post
              </p>
            </div>
          </Link>

          <Link
            href="/"
            className="rounded-full border border-[#c9ddd1] bg-[#eef8f2] px-4 py-2 text-sm font-bold text-[#183027]"
          >
            Home
          </Link>
        </header>

        <section className="rounded-[2.25rem] border border-[#dbe7df] bg-white p-6 shadow-sm sm:p-8">
          <p className="text-sm font-black uppercase tracking-[0.18em] text-[#228454]">
            {statusLabel(post.status)}
          </p>

          <h1 className="mt-2 text-4xl font-black tracking-tight sm:text-5xl">
            {post.title}
          </h1>

          <p className="mt-3 text-base font-semibold leading-7 text-[#5f6f67]">
            ZIP {post.zip} • {formatMoney(post.payAmountCents)}
          </p>

          <div className="mt-5 rounded-3xl bg-[#f7fbf8] p-5">
            <h2 className="text-xl font-black text-[#183027]">
              Private poster details
            </h2>

            <p className="mt-2 text-sm font-semibold leading-6 text-[#5f6f67]">
              Address: {post.exactAddress}
            </p>

            <p className="mt-1 text-sm font-semibold leading-6 text-[#5f6f67]">
              Phone: {post.posterContact.phone}
            </p>
          </div>
        </section>

        {acceptedInterest ? (
          <section className="rounded-[2rem] border border-[#c9ddd1] bg-[#eef8f2] p-6 shadow-sm">
            <p className="text-sm font-black uppercase tracking-[0.18em] text-[#228454]">
              Matched Worker
            </p>

            <h2 className="mt-2 text-3xl font-black text-[#183027]">
              {acceptedInterest.worker.firstName}
              {acceptedInterest.worker.lastInitial
                ? ` ${acceptedInterest.worker.lastInitial}.`
                : ""}
            </h2>

            <p className="mt-2 text-base font-bold text-[#183027]">
              Phone: {acceptedInterest.worker.phone}
            </p>

            <p className="mt-1 text-base font-semibold text-[#5f6f67]">
              Accepted offer: {formatMoney(acceptedInterest.offeredAmountCents)}
            </p>
          </section>
        ) : null}

        <section className="rounded-[2rem] border border-[#dbe7df] bg-white p-6 shadow-sm">
          <h2 className="text-3xl font-black text-[#183027]">
            Worker offers
          </h2>

          {post.workerInterests.length === 0 ? (
            <p className="mt-3 text-base font-semibold leading-7 text-[#5f6f67]">
              No workers have offered yet.
            </p>
          ) : (
            <div className="mt-5 grid gap-4">
              {post.workerInterests.map((interest) => (
                <div
                  key={interest.id}
                  className="rounded-3xl border border-[#dbe7df] bg-[#f7fbf8] p-5"
                >
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="text-sm font-black uppercase tracking-[0.18em] text-[#228454]">
                        {statusLabel(interest.status)}
                      </p>

                      <h3 className="mt-1 text-2xl font-black text-[#183027]">
                        {interest.worker.firstName}
                        {interest.worker.lastInitial
                          ? ` ${interest.worker.lastInitial}.`
                          : ""}
                      </h3>

                      <p className="mt-1 text-sm font-bold text-[#5f6f67]">
                        @{interest.worker.username} •{" "}
                        {Number(interest.worker.ratingAverage).toFixed(2)} rating •{" "}
                        {interest.worker.completedJobCount} jobs done
                      </p>

                      {interest.message ? (
                        <p className="mt-3 text-base font-semibold leading-7 text-[#5f6f67]">
                          {interest.message}
                        </p>
                      ) : null}
                    </div>

                    <div className="shrink-0 rounded-2xl bg-white p-4 sm:text-right">
                      <p className="text-xs font-black uppercase text-[#5f6f67]">
                        Offer
                      </p>

                      <p className="mt-1 text-2xl font-black text-[#183027]">
                        {formatMoney(interest.offeredAmountCents)}
                      </p>
                    </div>
                  </div>

                  {post.status === "LIVE" && interest.status === "PENDING" ? (
                    <ManageInterestButtons
                      postId={post.id}
                      token={token}
                      interestId={interest.id}
                    />
                  ) : null}

                  {interest.status === "ACCEPTED" ? (
                    <div className="mt-4 rounded-2xl bg-white p-4 text-sm font-bold text-[#183027]">
                      Worker contact unlocked: {interest.worker.phone}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </section>
      </section>
    </main>
  );
}