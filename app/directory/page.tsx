import { PageIntro } from "@/components/SiteShell";
import { pageMetadata } from "@/lib/site";
import { parseDirectoryQuery } from "@/lib/domain/policy";
export const metadata = pageMetadata("Business directory", "Find rental, service, quote and reservation offerings by location and fulfillment.", "/directory");
export default async function DirectoryPage({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = parseDirectoryQuery(await searchParams);
  return <>
    <PageIntro eyebrow="Business directory" title="Find what you need.">
      <p>Discover businesses offering rentals, services, quotes and reservations.</p>
    </PageIntro>
    <form className="filter-form" action="/directory" method="get" role="search" aria-label="Find businesses">
      <div className="field"><label htmlFor="location">City or ZIP code</label>
        <input id="location" name="location" maxLength={120} defaultValue={query.location} /></div>
      <div className="field"><label htmlFor="category">Category</label>
        <input id="category" name="category" maxLength={120} defaultValue={query.category} /></div>
      <div className="field"><label htmlFor="mode">Business mode</label>
        <select id="mode" name="mode" defaultValue={query.mode}>
          <option value="">Any mode</option><option value="RENTAL">Rental</option>
          <option value="SERVICE">Service</option><option value="QUOTE">Quote</option>
          <option value="RESERVATION">Reservation</option>
        </select></div>
      <div className="field"><label htmlFor="fulfillment">Where it happens</label>
        <select id="fulfillment" name="fulfillment" defaultValue={query.fulfillment}>
          <option value="">Any location</option><option value="MOBILE">Mobile: at your location</option>
          <option value="STOREFRONT">Storefront: at the business</option>
        </select></div>
      <button className="button" type="submit">Search directory</button>
    </form>
    <section className="empty-state" aria-labelledby="directory-status">
      <h2 id="directory-status">The directory is getting ready.</h2>
      <p>Business listings will appear here when the directory opens.</p>
      {(query.location || query.category || query.mode || query.fulfillment) &&
        <p className="search-summary">Your filters: {[query.location, query.category, query.mode,
          query.fulfillment === "MOBILE" ? "Mobile" : query.fulfillment === "STOREFRONT" ? "Storefront" : ""].filter(Boolean).join(" / ")}</p>}
    </section>
  </>;
}
