import Link from "next/link";
import WorkerSignupForm from "@/components/worker/WorkerSignupForm";

type WorkerSignupPageProps = {
  searchParams: Promise<{
    next?: string;
  }>;
};

function safeNextPath(value: string | undefined): string {
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return "/worker/dashboard";
  }

  return value;
}

export default async function WorkerSignupPage({ searchParams }: WorkerSignupPageProps) {
  const params = await searchParams;
  const nextPath = safeNextPath(params.next);

  return (
    <main className="min-h-screen px-4 py-4 text-[#17231d] sm:px-6 lg:px-8">
      <section className="mx-auto flex max-w-2xl flex-col gap-5">
        <header className="flex items-center justify-between rounded-[2rem] border border-[#dbe7df] bg-white/90 px-4 py-3 shadow-sm backdrop-blur">
          <Link href="/" className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#afe1c6] text-lg font-black text-[#183027] shadow-sm">
              JF
            </div>

            <div>
              <p className="text-lg font-black tracking-tight">JobFray</p>
              <p className="-mt-1 text-xs font-semibold text-[#5f6f67]">
                Worker signup
              </p>
            </div>
          </Link>

          <Link
            href="/worker/login"
            className="rounded-full border border-[#c9ddd1] bg-[#eef8f2] px-4 py-2 text-sm font-bold text-[#183027]"
          >
            Login
          </Link>
        </header>

        <WorkerSignupForm nextPath={nextPath} />
      </section>
    </main>
  );
}