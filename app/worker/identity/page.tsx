import Link from "next/link";
import { redirect } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { getWorkerSession } from "@/lib/worker-auth";

import WorkerIdentityForm from "@/components/worker/identity/WorkerIdentityForm";

export const dynamic = "force-dynamic";

export default async function WorkerIdentityPage(): Promise<React.ReactElement> {
  const session = await getWorkerSession();

  if (!session) {
    redirect(
      "/worker/login?next=/worker/identity",
    );
  }

  const worker = await prisma.worker.findUnique({
    where: {
      id: session.workerId,
    },

    select: {
      identityVerifiedAt: true,
      phoneVerifiedAt: true,
      cardVerifiedAt: true,
    },
  });

  if (!worker) {
    redirect("/worker/login");
  }

  return (
    <main className="min-h-screen bg-[#f6faf7] px-4 py-4 text-[#17231d] sm:px-6 lg:px-8">
      <section className="mx-auto flex w-full max-w-3xl flex-col gap-5">
        <header className="jf-shell-header">
          <Link
            href="/"
            className="jf-brand-link"
          >
            <div className="jf-brand-mark">
              JF
            </div>

            <div>
              <p className="text-lg font-black tracking-tight">
                JobFray
              </p>

              <p className="-mt-1 text-xs font-semibold text-[#5f6f67]">
                Worker identity
              </p>
            </div>
          </Link>

          <div className="jf-header-actions">
            <Link
              href="/worker/dashboard"
              className="jf-header-button"
            >
              Dashboard
            </Link>

            <Link
              href="/jobs"
              className="jf-header-button-dark"
            >
              Browse Jobs
            </Link>
          </div>
        </header>

        <WorkerIdentityForm
          alreadyVerified={Boolean(
            worker.identityVerifiedAt,
          )}
        />

        <section className="rounded-[2rem] border border-[#dbe7df] bg-white p-5 shadow-[0_20px_60px_rgba(24,48,39,0.08)] sm:p-7">
          <div className="mb-5">
            <div className="jf-hero-badge">
              Verification Checklist
            </div>

            <h2 className="mt-4 text-3xl font-black tracking-tight text-[#17231d]">
              Account verification progress.
            </h2>

            <p className="mt-3 max-w-2xl text-base font-semibold leading-7 text-[#5f6f67]">
              Completing verification steps
              improves trust, unlocks worker
              access, and helps protect local
              posters and workers.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-[1.5rem] border border-[#dbe7df] bg-[#eef8f2] p-5">
              <p className="text-xs font-black uppercase tracking-[0.16em] text-[#5f6f67]">
                Phone
              </p>

              <p className="mt-2 text-lg font-black text-[#183027]">
                {worker.phoneVerifiedAt
                  ? "Complete"
                  : "Pending"}
              </p>

              <p className="mt-2 text-sm font-semibold text-[#5f6f67]">
                SMS verification required.
              </p>
            </div>

            <div className="rounded-[1.5rem] border border-[#dbe7df] bg-[#eef8f2] p-5">
              <p className="text-xs font-black uppercase tracking-[0.16em] text-[#5f6f67]">
                Billing
              </p>

              <p className="mt-2 text-lg font-black text-[#183027]">
                {worker.cardVerifiedAt
                  ? "Complete"
                  : "Pending"}
              </p>

              <p className="mt-2 text-sm font-semibold text-[#5f6f67]">
                Payment method verification.
              </p>
            </div>

            <div className="rounded-[1.5rem] border border-[#dbe7df] bg-[#eef8f2] p-5">
              <p className="text-xs font-black uppercase tracking-[0.16em] text-[#5f6f67]">
                Identity
              </p>

              <p className="mt-2 text-lg font-black text-[#183027]">
                {worker.identityVerifiedAt
                  ? "Complete"
                  : "Pending"}
              </p>

              <p className="mt-2 text-sm font-semibold text-[#5f6f67]">
                Government ID and selfie.
              </p>
            </div>
          </div>
        </section>
      </section>
    </main>
  );
}