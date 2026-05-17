import Link from "next/link";
import { prisma } from "@/lib/prisma";
import PostWizard from "@/components/post/PostWizard";

export const dynamic = "force-dynamic";

export default async function PostPage() {
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
                Post local help
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

        <PostWizard categories={categories} />
      </section>
    </main>
  );
}