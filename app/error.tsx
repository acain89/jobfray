"use client";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <section className="page-intro">
      <h1>Something went wrong.</h1>
      <p role="alert">We could not load this page. Please try again.</p>
      <button className="button" onClick={reset}>
        Try again
      </button>
    </section>
  );
}
