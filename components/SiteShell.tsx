import Link from "next/link";
import type { ReactNode } from "react";
export function SiteHeader() {
  return (
    <header className="site-header">
      <div className="container header-inner">
        <Link className="wordmark" href="/" aria-label="JobFray home">
          JobFray<span aria-hidden="true">.</span>
        </Link>
        <nav aria-label="Main navigation">
          <Link href="/directory">Directory</Link>
          <Link href="/for-businesses">For businesses</Link>
          <Link href="/how-it-works">How it works</Link>
        </nav>
      </div>
    </header>
  );
}
export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="container footer-inner">
        <p>JobFray ? Local services, direct connections.</p>
        <Link href="/how-it-works">About fees and payments</Link>
      </div>
    </footer>
  );
}
export function PageIntro({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="page-intro">
      <p className="eyebrow">{eyebrow}</p>
      <h1>{title}</h1>
      <div className="lede">{children}</div>
    </div>
  );
}
