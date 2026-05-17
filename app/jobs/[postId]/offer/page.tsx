import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getWorkerSession } from "@/lib/worker-auth";
import JobOfferForm from "@/components/jobs/JobOfferForm";
import { getWorkerVerificationState } from "@/lib/worker-verification";

export const dynamic = "force-dynamic";

type OfferPageProps = {
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

export default async function JobOfferPage({ params }: OfferPageProps) {
  const session = await getWorkerSession();
  const { postId } = await params;

  if (!session) {
    redirect(`/worker/login?next=${encodeURIComponent(`/jobs/${postId}/offer`)}`);
  }

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
      zip: true,
      category: {
        select: {
          name: true,
        },
      },
    },
  });

  if (!job) {
    notFound();
  }

const worker = await prisma.worker.findUnique({
  where: {
    id: session.workerId,
  },
  select: {
    status: true,
    phoneVerifiedAt: true,
    cardVerifiedAt: true,
    identityVerifiedAt: true,
    billingSuspendedAt: true,
  },
});

if (!worker) {
  redirect("/worker/login");
}

const verification = getWorkerVerificationState(worker);

if (!verification.allowed) {
  redirect("/worker/dashboard");
}

  return (
    <main className="min-h-screen px-4 py-4 text-[#17231d] sm:px-6 lg:px-8">
      <section className="mx-auto flex max-w-3xl flex-col gap-5">
        <header className="flex items-center justify-between rounded-[2rem] border border-[#dbe7df] bg-white/90 px-4 py-3 shadow-sm backdrop-blur">
          <Link href={`/jobs/${job.id}`} className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#afe1c6] text-lg font-black text-[#183027] shadow-sm">
              JF
            </div>

            <div>
              <p className="text-lg font-black tracking-tight">JobFray</p>
              <p className="-mt-1 text-xs font-semibold text-[#5f6f67]">
                Send offer
              </p>
            </div>
          </Link>

          <Link
            href={`/jobs/${job.id}`}
            className="rounded-full border border-[#c9ddd1] bg-[#eef8f2] px-4 py-2 text-sm font-bold text-[#183027]"
          >
            Back
          </Link>
        </header>

        <section className="rounded-[2rem] border border-[#dbe7df] bg-white p-5 shadow-sm">
          <p className="text-sm font-black uppercase tracking-[0.18em] text-[#228454]">
            {job.category?.name ?? "Local Job"}
          </p>

          <h2 className="mt-2 text-2xl font-black text-[#183027]">
            {job.title}
          </h2>

          <p className="mt-2 text-base font-semibold leading-7 text-[#5f6f67]">
            ZIP {job.zip} • {formatMoney(job.payAmountCents)}
          </p>
        </section>

        <JobOfferForm postId={job.id} listedPayAmountCents={job.payAmountCents} />
      </section>
    </main>
  );
}