import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getWorkerSession } from "@/lib/worker-auth";
import WorkerIdentityForm from "@/components/worker/identity/WorkerIdentityForm";

export const dynamic = "force-dynamic";

export default async function WorkerIdentityPage(): Promise<React.ReactElement> {
  const session = await getWorkerSession();

  if (!session) {
    redirect("/worker/login?next=/worker/identity");
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
    <main className="min-h-screen px-4 py-4 text-[#17231d] sm:px-6 lg:px-8">
      <section className="mx-auto flex max-w-3xl flex-col gap-5">
        <header className="flex items-center justify-between rounded-[2rem] border border-[#dbe7df] bg-white/90 px-4 py-3 shadow-sm backdrop-blur">
          <Link href="/" className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#afe1c6] text-lg font-black text-[#183027] shadow-sm">
              JF
            </div>

            <div>
              <p className="text-lg font-black tracking-tight">JobFray</p>
              <p className="-mt-1 text-xs font-semibold text-[#5f6f67]">
                Worker identity
              </p>
            </div>
          </Link>

          <Link
            href="/worker/dashboard"
            className="rounded-full border border-[#c9ddd1] bg-[#eef8f2] px-4 py-2 text-sm font-bold text-[#183027]"
          >
            Dashboard
          </Link>
        </header>

        <WorkerIdentityForm
          alreadyVerified={Boolean(worker.identityVerifiedAt)}
        />

        <section className="rounded-[2rem] border border-[#dbe7df] bg-white p-5 shadow-sm">
          <h2 className="text-2xl font-black text-[#183027]">
            Verification checklist
          </h2>

          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl bg-[#eef8f2] p-4">
              <p className="text-xs font-black uppercase text-[#5f6f67]">
                Phone
              </p>
              <p className="mt-1 text-base font-black text-[#183027]">
                {worker.phoneVerifiedAt ? "Complete" : "Pending"}
              </p>
            </div>

            <div className="rounded-2xl bg-[#eef8f2] p-4">
              <p className="text-xs font-black uppercase text-[#5f6f67]">
                Billing
              </p>
              <p className="mt-1 text-base font-black text-[#183027]">
                {worker.cardVerifiedAt ? "Complete" : "Pending"}
              </p>
            </div>

            <div className="rounded-2xl bg-[#eef8f2] p-4">
              <p className="text-xs font-black uppercase text-[#5f6f67]">
                Identity
              </p>
              <p className="mt-1 text-base font-black text-[#183027]">
                {worker.identityVerifiedAt ? "Complete" : "Pending"}
              </p>
            </div>
          </div>
        </section>
      </section>
    </main>
  );
}