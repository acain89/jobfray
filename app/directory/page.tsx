import { PageIntro } from "@/components/SiteShell";
import { pageMetadata } from "@/lib/site";
import { parseDirectoryQuery } from "@/lib/domain/policy";
export const metadata = pageMetadata(
  "Service directory",
  "Find the new JobFray service directory, organized around location, category and service mode.",
  "/directory",
);
export default async function DirectoryPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = parseDirectoryQuery(await searchParams);
  return (
    <>
      <PageIntro
        eyebrow="Service directory"
        title="Find the right kind of help."
      >
        <p>
          A directory built around where you are, what you need and how the
          service happens.
        </p>
      </PageIntro>
      <form
        className="filter-form"
        action="/directory"
        method="get"
        role="search"
        aria-label="Find service businesses"
      >
        <div className="field">
          <label htmlFor="location">City or ZIP code</label>
          <input
            id="location"
            name="location"
            maxLength={120}
            defaultValue={query.location}
            autoComplete="off"
          />
        </div>
        <div className="field">
          <label htmlFor="category">Service category</label>
          <input
            id="category"
            name="category"
            maxLength={120}
            defaultValue={query.category}
            autoComplete="off"
          />
        </div>
        <div className="field">
          <label htmlFor="mode">Service mode</label>
          <select id="mode" name="mode" defaultValue={query.mode}>
            <option value="">Any mode</option>
            <option value="AT_CUSTOMER">At your location</option>
            <option value="AT_BUSINESS">At the business</option>
            <option value="REMOTE">Remote</option>
          </select>
        </div>
        <button className="button" type="submit">
          Search directory
        </button>
      </form>
      <section className="empty-state" aria-labelledby="directory-status">
        <h2 id="directory-status">The directory is getting ready.</h2>
        <p>Business listings will appear here when the directory opens.</p>
        {(query.location || query.category || query.mode) && (
          <p className="search-summary">
            Your filters:{" "}
            {[
              query.location,
              query.category,
              query.mode === "AT_CUSTOMER"
                ? "At your location"
                : query.mode === "AT_BUSINESS"
                  ? "At the business"
                  : query.mode === "REMOTE"
                    ? "Remote"
                    : "",
            ]
              .filter(Boolean)
              .join(" ? ")}
          </p>
        )}
      </section>
    </>
  );
}
