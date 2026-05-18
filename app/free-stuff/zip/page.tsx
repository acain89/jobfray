import Link from "next/link";

export default function FreeStuffZipIndexPage(): React.ReactElement {
  return (
    <main className="min-h-screen px-4 py-10 text-[#17231d]">
      <section className="mx-auto max-w-3xl rounded-[2rem] border border-[#dbe7df] bg-white p-8 shadow-sm">
        <p className="text-sm font-black uppercase tracking-[0.18em] text-[#228454]">
          JobFray
        </p>

        <h1 className="mt-2 text-4xl font-black tracking-tight">
          Browse Free Stuff by ZIP Code
        </h1>

        <p className="mt-4 text-base font-semibold leading-7 text-[#5f6f67]">
          Browse curb alerts, furniture, free items, appliances,
          moving leftovers, and local giveaways by ZIP code.
        </p>

        <div className="mt-8">
          <Link
            href="/free-stuff"
            className="rounded-full bg-[#183027] px-5 py-4 text-base font-black text-white"
          >
            Browse Free Stuff
          </Link>
        </div>
      </section>
    </main>
  );
}