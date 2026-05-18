import Link from "next/link";

import WorkerSignupForm from "@/components/worker/WorkerSignupForm";

type WorkerSignupPageProps = {
  searchParams: Promise<{
    next?: string;
  }>;
};

function safeNextPath(
  value: string | undefined,
): string {
  if (
    !value ||
    !value.startsWith("/") ||
    value.startsWith("//")
  ) {
    return "/worker/dashboard";
  }

  return value;
}

export default async function WorkerSignupPage({
  searchParams,
}: WorkerSignupPageProps): Promise<React.ReactElement> {
  const params = await searchParams;

  const nextPath = safeNextPath(
    params.next,
  );

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
                Worker signup
              </p>
            </div>
          </Link>

          <div className="jf-header-actions">
            <Link
              href="/"
              className="jf-header-button"
            >
              Home
            </Link>

            <Link
              href="/jobs"
              className="jf-header-button"
            >
              Browse Jobs
            </Link>

            <Link
              href="/worker/login"
              className="jf-header-button-dark"
            >
              Login
            </Link>
          </div>
        </header>

        <section className="jf-section-card overflow-hidden border border-[#dbe7df] bg-white p-5 shadow-[0_25px_70px_rgba(24,48,39,0.08)] sm:p-7">
          <div className="mb-7">
            <div className="jf-hero-badge">
              Worker Signup
            </div>

            <h1 className="mt-4 text-4xl font-black tracking-tight text-[#17231d] sm:text-5xl">
              Find local work faster.
            </h1>

            <p className="mt-4 max-w-2xl text-base font-semibold leading-7 text-[#5f6f67]">
              Create your worker account to
              browse nearby jobs, contact
              posters, submit offers, and
              build your verified worker
              profile.
            </p>

            <div className="mt-5 flex flex-wrap gap-2">
              <span className="jf-soft-pill">
                Local jobs
              </span>

              <span className="jf-soft-pill">
                Fast signup
              </span>

              <span className="jf-soft-pill">
                Worker dashboard
              </span>

              <span className="jf-soft-pill">
                Verified workers
              </span>
            </div>
          </div>

          <WorkerSignupForm
            nextPath={nextPath}
          />
        </section>
      </section>
    </main>
  );
}