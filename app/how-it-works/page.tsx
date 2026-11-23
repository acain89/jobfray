import Link from "next/link";
import { PageIntro } from "@/components/SiteShell";
import { pageMetadata } from "@/lib/site";
import { PLATFORM_FEES } from "@/lib/domain/policy";
export const metadata = pageMetadata(
  "How JobFray will work",
  "Understand JobFray's planned quote and appointment fees and direct payment for service work.",
  "/how-it-works",
);
export default function HowItWorksPage() {
  return (
    <>
      <PageIntro
        eyebrow="How it works"
        title="Find the service. Make the connection."
      >
        <p>
          The new JobFray separates the request from the work. Here is the model
          we are building.
        </p>
      </PageIntro>
      <ol className="steps section">
        <li>
          <h2>Find a service business</h2>
          <p>
            Search by location, category and service mode: at your location, at
            the business, or remotely.
          </p>
        </li>
        <li>
          <h2>Ask for a quote or book an appointment</h2>
          <p>
            A quote request will cost ${PLATFORM_FEES.QUOTE_REQUEST / 100}. A
            confirmed appointment will cost $
            {PLATFORM_FEES.CONFIRMED_APPOINTMENT / 100}. These are JobFray fees
            paid by the customer.
          </p>
        </li>
        <li>
          <h2>Pay the provider directly for the work</h2>
          <p>
            The request fee does not pay for the service itself. You and the
            business arrange payment for the actual work directly.
          </p>
        </li>
      </ol>
      <aside className="notice">
        <h2>Requests and payments are not open yet</h2>
        <p>
          Checkout, booking confirmation, cancellation and refund rules must be
          completed before paid requests become available.
        </p>
        <Link href="/directory">Visit the directory ?</Link>
      </aside>
    </>
  );
}
