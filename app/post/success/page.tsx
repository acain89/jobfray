import Link from "next/link";

type SuccessPageProps = {
  searchParams: Promise<{
    postId?: string;
    token?: string;
  }>;
};

export default async function PostSuccessPage({ searchParams }: SuccessPageProps) {
  const params = await searchParams;
  const postId = params.postId ?? "";
  const token = params.token ?? "";

  const manageHref =
    postId && token
      ? `/post/manage?postId=${encodeURIComponent(postId)}&token=${encodeURIComponent(token)}`
      : "/";

  return (
    <main className="min-h-screen px-4 py-4 text-[#17231d] sm:px-6 lg:px-8">
      <section className="mx-auto flex max-w-2xl flex-col gap-5">
        <div className="rounded-[2.25rem] border border-[#dbe7df] bg-white p-7 text-center shadow-sm">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl bg-[#afe1c6] text-3xl">
            ✓
          </div>

          <h1 className="mt-5 text-4xl font-black tracking-tight">
            Your job is live.
          </h1>

          <p className="mt-3 text-base font-semibold leading-7 text-[#5f6f67]">
            Workers in your area can now find it. Save your manage link so you can edit or close the post later.
          </p>

          <div className="mt-6 rounded-3xl bg-[#f7fbf8] p-4 text-left">
            <p className="text-xs font-black uppercase tracking-[0.18em] text-[#228454]">
              Manage link
            </p>

            <p className="mt-2 break-all text-sm font-bold text-[#183027]">
              {manageHref}
            </p>
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            <Link
              href={manageHref}
              className="rounded-full bg-[#183027] px-5 py-4 text-base font-black text-white"
            >
              Manage Post
            </Link>

            <Link
              href="/"
              className="rounded-full border border-[#c9ddd1] bg-[#eef8f2] px-5 py-4 text-base font-black text-[#183027]"
            >
              Back Home
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}