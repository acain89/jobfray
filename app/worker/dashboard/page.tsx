import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getWorkerSession } from "@/lib/worker-auth";
import WorkerLogoutButton from "@/components/worker/WorkerLogoutButton";

export const dynamic = "force-dynamic";

function statusLabel(status: string): string {
  return status
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export default async function WorkerDashboardPage() {
  const session = await getWorkerSession();

  if (!session) {
    redirect("/worker/login");
  }

  const worker = await prisma.worker.findUnique({
    where: {
      id: session.workerId,
    },
    select: {
      id: true,
      username: true,
      firstName: true,
      lastInitial: true,
      homeZip: true,
      status: true,
      subscriptionActive: true,
      phoneVerifiedAt: true,
      identityVerifiedAt: true,
      ratingAverage: true,
      ratingCount: true,
      completedJobCount: true,
      serviceAreas: {
        select: {
          zip: true,
          radiusMiles: true,
        },
        orderBy: {
          createdAt: "asc",
        },
      },
    },
  });

  if (!worker) {
    redirect("/worker/login");
  }

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
                Worker dashboard
              </p>
            </div>
          </Link>

          <WorkerLogoutButton />
        </header>

        <section className="rounded-[2.25rem] border border-[#dbe7df] bg-white p-6 shadow-sm sm:p-8">
          <p className="text-sm font-black uppercase tracking-[0.18em] text-[#228454]">
            Worker Account
          </p>

          <h1 className="mt-2 text-4xl font-black tracking-tight sm:text-5xl">
            Welcome, {worker.firstName}.
          </h1>

          <p className="mt-3 text-base font-semibold leading-7 text-[#5f6f67]">
            Your account is created. Complete phone verification, membership, and ID verification before contacting posters.
          </p>

          <div className="mt-6 grid gap-3 sm:grid-cols-4">
            <div className="rounded-2xl bg-[#eef8f2] p-4">
              <p className="text-xs font-black uppercase text-[#5f6f67]">
                Status
              </p>
              <p className="mt-1 text-lg font-black text-[#183027]">
                {statusLabel(worker.status)}
              </p>
            </div>

            <div className="rounded-2xl bg-[#eef8f2] p-4">
              <p className="text-xs font-black uppercase text-[#5f6f67]">
                ZIP
              </p>
              <p className="mt-1 text-lg font-black text-[#183027]">
                {worker.homeZip}
              </p>
            </div>

            <div className="rounded-2xl bg-[#eef8f2] p-4">
              <p className="text-xs font-black uppercase text-[#5f6f67]">
                Rating
              </p>
              <p className="mt-1 text-lg font-black text-[#183027]">
                {Number(worker.ratingAverage).toFixed(2)} ({worker.ratingCount})
              </p>
            </div>

            <div className="rounded-2xl bg-[#eef8f2] p-4">
              <p className="text-xs font-black uppercase text-[#5f6f67]">
                Jobs Done
              </p>
              <p className="mt-1 text-lg font-black text-[#183027]">
                {worker.completedJobCount}
              </p>
            </div>
          </div>
        </section>

        <section className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-[2rem] border border-[#dbe7df] bg-white p-5 shadow-sm">
            <h2 className="text-xl font-black text-[#183027]">
              1. Phone verification
            </h2>

            <p className="mt-2 text-sm font-semibold leading-6 text-[#5f6f67]">
              {worker.phoneVerifiedAt
                ? "Phone verified."
                : "Next build: verify phone by SMS before contacting posters."}
            </p>
          </div>

          <div className="rounded-[2rem] border border-[#dbe7df] bg-white p-5 shadow-sm">
            <h2 className="text-xl font-black text-[#183027]">
              2. Membership
            </h2>

            <p className="mt-2 text-sm font-semibold leading-6 text-[#5f6f67]">
              {worker.subscriptionActive
                ? "Membership active."
                : "$7.99/month membership checkout comes next."}
            </p>
          </div>

          <div className="rounded-[2rem] border border-[#dbe7df] bg-white p-5 shadow-sm">
            <h2 className="text-xl font-black text-[#183027]">
              3. ID verification
            </h2>

            <p className="mt-2 text-sm font-semibold leading-6 text-[#5f6f67]">
              {worker.identityVerifiedAt
                ? "Identity verified."
                : "Stripe Identity integration comes after membership."}
            </p>
          </div>
        </section>

        <section className="rounded-[2rem] border border-[#dbe7df] bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-2xl font-black text-[#183027]">
                Service area
              </h2>

              <p className="mt-1 text-sm font-semibold leading-6 text-[#5f6f67]">
                Current browse area:{" "}
                {worker.serviceAreas[0]
                  ? `${worker.serviceAreas[0].zip} within ${worker.serviceAreas[0].radiusMiles} miles`
                  : worker.homeZip}
              </p>
            </div>

            <Link
              href={`/jobs?zip=${encodeURIComponent(worker.homeZip)}&radius=10`}
              className="rounded-full bg-[#183027] px-5 py-4 text-center text-base font-black text-white"
            >
              Browse Jobs
            </Link>
          </div>
        </section>
      </section>
    </main>
  );
}