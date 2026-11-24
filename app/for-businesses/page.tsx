import Link from "next/link";
import { PageIntro } from "@/components/SiteShell";
import { pageMetadata } from "@/lib/site";
export const metadata = pageMetadata("For businesses", "Free websites for rental, service, quote and reservation businesses.", "/for-businesses");
export default function BusinessPage() {
  return <>
    <PageIntro eyebrow="For businesses" title="One business. More ways to offer.">
      <p>Enable Rental, Service, Quote and Reservation independently. A single offering can support multiple applicable modes without duplicate listings.</p>
    </PageIntro>
    <section className="grid two section" aria-label="Business platform plans">
      <article className="card"><h2>Your website, free</h2><p>Website creation and operation are free. No subscriptions, business commissions or Stripe Connect accounts. Free subdomains and optional custom domains are planned.</p></article>
      <article className="card"><h2>Mobile, storefront or both</h2><p>Choose applicable fulfillment options for each offering and mode. Customers choose from the options you support.</p></article>
      <article className="card"><h2>Shared availability</h2><p>Offerings that use the same staff, equipment or space will share capacity. Quote requests do not reserve time unless a separate appointment is requested.</p></article>
      <article className="card"><h2>Payment stays direct</h2><p>Customers pay your business directly for the underlying work, rentals and reservations. JobFray collects only its own customer-paid $2 to $5 platform fees.</p></article>
    </section>
    <aside className="notice"><h2>Registration is not open yet</h2><p>These are the plans for the platform, not features available today.</p><Link href="/how-it-works">Understand customer platform fees</Link></aside>
  </>;
}
