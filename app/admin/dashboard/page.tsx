import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { isAdminAuthenticated } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

async function getStats() {
  const [
    liveJobs,
    flaggedPosts,
    suspendedWorkers,
    activeWorkers,
  ] = await Promise.all([
    prisma.post.count({
      where: {
        type: "JOB",
        status: "LIVE",
      },
    }),

    prisma.post.count({
      where: {
        status: "FLAGGED",
      },
    }),

    prisma.worker.count({
      where: {
        status: "SUSPENDED",
      },
    }),

    prisma.worker.count({
      where: {
        status: "ACTIVE",
      },
    }),
  ]);

  return {
    liveJobs,
    flaggedPosts,
    suspendedWorkers,
    activeWorkers,
  };
}

export default async function AdminDashboardPage(): Promise<React.ReactElement> {
  const authenticated =
    await isAdminAuthenticated();

  if (!authenticated) {
    redirect("/admin/login");
  }

  const stats = await getStats();

  const flaggedPosts =
    await prisma.post.findMany({
      where: {
        OR: [
          {
            status: "FLAGGED",
          },
          {
            reports: {
              some: {
                status: "OPEN",
              },
            },
          },
        ],
      },

      orderBy: {
        createdAt: "desc",
      },

      take: 25,

      select: {
        id: true,
        title: true,
        status: true,
        zip: true,
        createdAt: true,

        reports: {
          where: {
            status: "OPEN",
          },

          select: {
            id: true,
            reason: true,
          },
        },
      },
    });

  return (
    <main className="min-h-screen px-4 py-4 text-[#17231d]">
      <section className="mx-auto flex max-w-7xl flex-col gap-5">
        <header className="rounded-[2rem] border border-[#dbe7df] bg-white p-6 shadow-sm">
          <p className="text-sm font-black uppercase tracking-[0.18em] text-[#228454]">
            Moderation
          </p>

          <h1 className="mt-2 text-5xl font-black tracking-tight">
            JobFray Admin
          </h1>
        </header>

        <section className="grid gap-4 sm:grid-cols-4">
          {[
            ["Live Jobs", stats.liveJobs],
            ["Flagged Posts", stats.flaggedPosts],
            ["Suspended Workers", stats.suspendedWorkers],
            ["Active Workers", stats.activeWorkers],
          ].map(([label, value]) => (
            <div
              key={label}
              className="rounded-[2rem] border border-[#dbe7df] bg-white p-5 shadow-sm"
            >
              <p className="text-sm font-black uppercase tracking-[0.18em] text-[#5f6f67]">
                {label}
              </p>

              <p className="mt-3 text-5xl font-black text-[#183027]">
                {value}
              </p>
            </div>
          ))}
        </section>

        <section className="rounded-[2rem] border border-[#dbe7df] bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-black uppercase tracking-[0.18em] text-[#228454]">
                Moderation Queue
              </p>

              <h2 className="mt-1 text-3xl font-black text-[#183027]">
                Flagged Posts
              </h2>
            </div>
          </div>

          {flaggedPosts.length === 0 ? (
            <p className="mt-5 text-base font-semibold leading-7 text-[#5f6f67]">
              No flagged posts.
            </p>
          ) : (
            <div className="mt-5 grid gap-4">
              {flaggedPosts.map((post: (typeof flaggedPosts)[number]) => (
                <div
                  key={post.id}
                  className="rounded-3xl border border-[#dbe7df] bg-[#f7fbf8] p-5"
                >
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="text-sm font-black uppercase tracking-[0.18em] text-[#228454]">
                        {post.status}
                      </p>

                      <h3 className="mt-2 text-2xl font-black text-[#183027]">
                        {post.title}
                      </h3>

                      <p className="mt-2 text-sm font-bold text-[#5f6f67]">
                        ZIP {post.zip}
                      </p>

                      <div className="mt-4 flex flex-wrap gap-2">
                        {post.reports.map((report) => (
                          <div
                            key={report.id}
                            className="rounded-full bg-white px-3 py-2 text-xs font-black text-[#183027]"
                          >
                            {report.reason.replaceAll(
                              "_",
                              " ",
                            )}
                          </div>
                        ))}
                      </div>
                    </div>

                    <Link
                      href={`/jobs/${post.id}`}
                      className="rounded-full bg-[#183027] px-4 py-3 text-sm font-black text-white"
                    >
                      View Post
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </section>
    </main>
  );
}