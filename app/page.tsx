import Link from "next/link";
import { PageIntro } from "@/components/SiteShell";
import { pageMetadata } from "@/lib/site";
export const metadata = pageMetadata(
  "Service businesses, connected",
  "Meet the new JobFray: free business websites, a service directory, and simple request fees.",
  "/",
);
export default function HomePage() {
  return (
    <>
      <section className="hero">
        <PageIntro
          eyebrow="A new chapter for JobFray"
          title="Good work starts with a connection."
        >
          <p>
            We are building a home for service businesses to share their work,
            get found and hear from new customers.
          </p>
        </PageIntro>
        <div className="actions">
          <Link className="button" href="/for-businesses">
            Meet the business platform <span aria-hidden="true">?</span>
          </Link>
          <Link className="text-link" href="/directory">
            Explore the directory ?
          </Link>
        </div>
      </section>
      <section className="section" aria-labelledby="model-heading">
        <div className="section-heading">
          <p className="eyebrow">A straightforward model</p>
          <h2 id="model-heading">
            Your business. Your customer relationships.
          </h2>
        </div>
        <div className="grid three">
          <article className="card">
            <span className="step">01</span>
            <h3>A website for your services</h3>
            <p>
              The new platform is designed around free professional business
              websites, with a place for your services and availability.
            </p>
          </article>
          <article className="card">
            <span className="step">02</span>
            <h3>A place to get found</h3>
            <p>
              Customers will be able to look for businesses by location, service
              category and how the service is delivered.
            </p>
          </article>
          <article className="card">
            <span className="step">03</span>
            <h3>A direct connection</h3>
            <p>
              JobFray request fees are separate from the work itself. Customers
              pay service providers directly for actual work.
            </p>
          </article>
        </div>
      </section>
      <aside className="notice">
        <h2>Built in stages</h2>
        <p>
          The new JobFray is in development. Business registration, quote
          payments and appointment booking are not open yet.
        </p>
        <Link href="/how-it-works">See how the new model works ?</Link>
      </aside>
    </>
  );
}
