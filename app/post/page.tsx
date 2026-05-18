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
    <main className="min-h-screen px-4 py-4 text-[#17231d] sm:px-6 lg:px-8">
      <section className="mx-auto flex max-w-3xl flex-col gap-5">
        <header className="flex items-center justify-between rounded-[2rem] border border-[#dbe7df] bg-white/90 px-4 py-3 shadow-sm backdrop