import Link from "next/link";
import { PageIntro } from "@/components/SiteShell";
import { pageMetadata } from "@/lib/site";
export const metadata = pageMetadata("How JobFray will work", "Free business websites and customer-paid platform fees from $2 to $5.", "/how-it-works");
export default function HowItWorksPage() {
  return <>
    <PageIntro eyebrow="How it works" title="Find a business. Make the connection.">
      <p>Rentals, services, quotes and reservations share one business platform. Businesses can offer any combination, with mobile, storefront or both where applicable.</p>
    </PageIntro>
    <section className="section" aria-labelledby="fees-heading">
      <h2 id="fees-heading">Customer-paid JobFray platform fees</h2>
      <p>The fee is based on the underlying offering subtotal, including selected quantity and rental duration where applicable.</p>
      <div className="table-scroll"><table>
        <caption>Platform fee for one request</caption>
        <thead><tr><th scope="col">Underlying subtotal</th><th scope="col">JobFray fee</th></tr></thead>
        <tbody>
          <tr><th scope="row">$0.00 to $30.00</th><td>$2</td></tr>
          <tr><th scope="row">$30.01 to $75.00</th><td>$3</td></tr>
          <tr><th scope="row">$75.01 to $150.99</th><td>$4</td></tr>
          <tr><th scope="row">$151.00 and above</th><td>$5</td></tr>
          <tr><th scope="row">Quote request or genuinely unknown offering price</th><td>$3</td></tr>
        </tbody>
      </table></div>
      <p>Quote requests cost $3 regardless of an indicative offering price. A known zero price uses the $2 tier.</p>
      <p>Customers pay businesses directly for the underlying service, rental or reservation. JobFray collects only its own platform fee and pays its own Stripe processing costs.</p>
      <p>The accepted subtotal, fee and pricing-policy version are saved at checkout. Later pricing changes do not recalculate historical transactions.</p>
    </section>
    <aside className="notice"><h2>Requests and payments are not open yet</h2>
      <p>Confirmation, rental duration, reservation capacity, cancellation and refund policies still need to be completed before these flows become available.</p>
      <Link href="/find">Visit the directory</Link>
    </aside>
  </>;
}
