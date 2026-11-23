import Link from "next/link";
export default function NotFound() {
  return (
    <section className="page-intro">
      <p className="eyebrow">Page not found</p>
      <h1>This page is not available.</h1>
      <p>Head back to JobFray to explore the new platform.</p>
      <Link className="button" href="/">
        Back to JobFray
      </Link>
    </section>
  );
}
