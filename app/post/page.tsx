import Link from "next/link";

import { prisma } from "@/lib/prisma";
import PostWizard from "@/components/post/PostWizard";

export const dynamic = "force-dynamic";

export default async function PostPage(): Promise<React.ReactElement> {
  const categories = await prisma.category.findMany({
    where: {
      isActive: true,
    },
    orderBy: [
      {
        sortOrder: "asc",
      },
      {
        name: "asc",
      },
    ],
    select: {
      id: true,
      name: true,
      slug: true,
      description: true,
    },
  });

  return (
    <main className="min-h-screen bg-[#f6faf7] px-4 py-4 text-[#17231d] sm:px-6 lg:px-8">
      <section className="mx-auto flex w-full max-w-3xl flex-col gap-5">
        <header className="jf-shell-header">
          <Link href="/" className="jf-brand-link">
            <div className="jf-brand-mark">JF</div>

            <div>
              <p className="text-lg font-black tracking-tight">
                JobFray
              </p>

              <p className="-mt-1 text-xs font-semibold text-[#5f6f67]">
                Post a job
              </p>
            </div>
          </Link>

          <div className="jf-header-actions">
            <Link href="/" className="jf-header-button">
              Home
            </Link>

            <Link href="/jobs" className="jf-header-button">
              Browse Jobs
            </Link>

            <Link href="/free-stuff" className="jf-header-button-dark">
              Free Stuff
            </Link>
          </div>
        </header>

        <PostWizard categories={categories} />
      </section>
    </main>
  );
}