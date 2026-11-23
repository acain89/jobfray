import Link from "next/link";
import { PageIntro } from "@/components/SiteShell";
import { pageMetadata } from "@/lib/site";
export const metadata = pageMetadata(
  "For service businesses",
  "The plan for free business websites, service listings and an owner workspace on JobFray.",
  "/for-businesses",
);
export default function BusinessPage() {
  return (
    <>
      <PageIntro
        eyebrow="For service businesses"
        title="A clear home for what you do."
      >
        <p>
          The new JobFray will bring your website, service listings and incoming
          requests into one owner workspace.
        </p>
      </PageIntro>
      <section
        className="grid two section"
        aria-label="Business platform plans"
      >
        <article className="card">
          <h2>Your website, free</h2>
          <p>
            Describe your services and share a business website on a free
            JobFray subdomain. Optional custom domains are part of the plan.
          </p>
        </article>
        <article className="card">
          <h2>Availability that fits your work</h2>
          <p>
            Scheduling is planned around the next 14 days, with service
            durations, buffers, exceptions and capacity for concurrent
            appointments.
          </p>
        </article>
        <article className="card">
          <h2>Requests in one place</h2>
          <p>
            The owner dashboard will bring together website editing, jobs, quote
            requests, appointments, notifications and sharing.
          </p>
        </article>
        <article className="card">
          <h2>Payment for your work stays direct</h2>
          <p>
            Businesses will not receive payments through JobFray. Customers pay
            you directly for the actual service. A business-owner Stripe Connect
            account is not part of this model.
          </p>
        </article>
      </section>
      <aside className="notice">
        <h2>Registration is not open yet</h2>
        <p>
          These are the plans for the new service, not features available to use
          today.
        </p>
        <Link href="/how-it-works">Understand the customer request fees ?</Link>
      </aside>
    </>
  );
}
