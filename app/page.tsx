import Link from "next/link";
import { PageIntro } from "@/components/SiteShell";
import { pageMetadata } from "@/lib/site";
export const metadata = pageMetadata("Your business, connected", "Free websites and discovery for rentals, services, quotes and reservations.", "/");
export default function HomePage() {
  return <>
    <section className="hero"><PageIntro eyebrow="A new chapter for JobFray" title="Your business. More possibilities.">
      <p>A free home for businesses offering rentals, services, quotes and reservations, with mobile and storefront options where applicable.</p>
    </PageIntro><div className="actions"><Link className="button" href="/for-businesses">Meet the business platform</Link><Link className="text-link" href="/directory">Explore the directory</Link></div></section>
    <section className="section" aria-labelledby="model-heading"><div className="section-heading"><h2 id="model-heading">One platform, four business modes</h2></div>
      <div className="grid two">
        <article className="card"><h3>Rental</h3><p>Offer items for a selected rental period.</p></article>
        <article className="card"><h3>Service</h3><p>Help customers book the services you provide.</p></article>
        <article className="card"><h3>Quote</h3><p>Hear what customers need before agreeing on the work.</p></article>
        <article className="card"><h3>Reservation</h3><p>Let customers request available space or capacity.</p></article>
      </div>
    </section>
    <aside className="notice"><h2>Built in stages</h2><p>JobFray is in development. Websites will be free to create and operate. Customer-paid platform fees range from $2 to $5; quote requests and genuinely unknown prices cost $3. Customers pay businesses directly for the underlying offering.</p><p>Registration, requests and payments are not open yet.</p><Link href="/how-it-works">See how the model works</Link></aside>
  </>;
}
