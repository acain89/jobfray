import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getWorkerSession } from "@/lib/worker-auth";
import BillingChecklist from "@/components/worker/billing/BillingChecklist";
import BillingStatusCard from "@/components/worker/billing/BillingStatusCard";
import WorkerBillingForm from "@/components/worker/billing/WorkerBillingForm";

export const dynamic = "force-dynamic";

export default async function WorkerBillingPage(): Promise<React.ReactElement> {
  const session = await getWorkerSession();

  if (!session) {
    redirect("/worker/login?next=/worker/billing");
  }

  const worker = await prisma.worker.findUnique({
    where: {
      id: session.workerId,
    },
    select: {
      id: true,
      firstName: true,
      stripeCustomerId: true,
      stripePaymentMethodId: true,
      cardBrand: true,
      cardLast4: true,
      cardVerifiedAt: true,
      billingSuspendedAt: true,
      billingFailureReason: true,
      phoneVerifiedAt: true,
      identityVerifiedAt: true,
    },
  });

  if (!worker) {
    redirect("/worker/login");
  }

  const hasCard =
    Boolean(worker.stripePaymentMethodId) &&
    Boolean(worker.cardVerifiedAt);

  return (
    <main className="min-h-screen px-4 py-4 text-[#17231d] sm:px-6 lg:px-8">
      <section className="mx-auto flex max-w-3xl flex-col gap-5">
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
                Worker billing
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

        <section className="rounded-[2.25rem] border border-[#dbe7df] bg-white p-6 shadow-sm sm:p-8">
          <p className="text-sm font-black uppercase tracking-[0.18em] text-[#228454]">
            Worker Billing
          </p>

          <h1 className="mt-2 text-4xl font-black tracking-tight sm:text-5xl">
            Add your payment method.
          </h1>

          <p className="mt-3 text-base font-semibold leading-7 text-[#5f6f67]">
            Your card is charged only after you are accepted for a job match.
          </p>

          <div className="mt-6">
            <BillingStatusCard
              hasCard={hasCard}
              cardBrand={worker.cardBrand}
              cardLast4={worker.cardLast4}
              billingSuspended={Boolean(worker.billingSuspendedAt)}
              billingFailureReason={worker.billingFailureReason}
            />
          </div>

          {!hasCard ? (
            <div className="mt-6">
              <WorkerBillingForm />
            </div>
          ) : null}
        </section>

        <BillingChecklist
          phoneVerified={Boolean(worker.phoneVerifiedAt)}
          billingVerified={hasCard}
          identityVerified={Boolean(worker.identityVerifiedAt)}
        />
      </section>
    </main>
  );
}