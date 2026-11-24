/* eslint-disable @next/next/no-img-element -- Private media requires same-origin session cookies and bypasses image optimization. */
import type { CSSProperties } from "react";
import Link from "next/link";
import type { WebsiteContent, ModeConfig } from "@/lib/core/model";
export const PAGE_COLORS = ["#faf9f6", "#f2f6f4", "#f2f5fa", "#fff8ef", "#f7f3f8", "#fdf5f4", "#eff7f7", "#f6f5ed", "#f4f4f4", "#ffffff"];
export const COMPONENT_COLORS = ["#ffffff", "#e8f0ea", "#e8edf6", "#f5e9d9", "#eee6f2", "#f5e4e2", "#e0efef", "#eeeddc", "#e9e9e9", "#f7f8fa"];
export const TRIM_COLORS = ["#204e40", "#243f63", "#5c354d", "#663f23", "#334d4d", "#4a4167", "#563d32", "#303e35", "#39414b", "#1f2428"];
const FONTS = ["Arial, sans-serif", "Georgia, serif", "Verdana, sans-serif", "Trebuchet MS, sans-serif", "Palatino Linotype, Georgia, serif"];
export interface SiteData {
    id: string;
    slug: string;
    name: string;
    category: string;
    city: string;
    timeZone: string;
    address: string | null;
    content: WebsiteContent;
    offerings: {
        id: string;
        name: string;
        description: string;
        photos: string[];
        configurations: ModeConfig[];
    }[];
}
export function SiteView({ site, preview = false, platformOrigin = "" }: {
    site: SiteData;
    preview?: boolean;
    platformOrigin?: string;
}) {
    const t = site.content.theme, style = { "--site-page": PAGE_COLORS[t.page], "--site-component": COMPONENT_COLORS[t.components], "--site-trim": TRIM_COLORS[t.trim], "--site-font": FONTS[t.letters], "--site-radius": t.button === "ROUND" ? "2rem" : t.button === "SQUARE" ? "0" : "0.6rem" } as CSSProperties;
    return <article className="business-site" style={style} aria-label={preview ? "Live website preview" : site.name}>
    <header className="business-mast"><strong>{site.name}</strong><span>{site.city}</span></header>
    <section className="business-hero"><p className="eyebrow">{site.category} / {site.city}</p><h1>{site.content.headline || "Your business headline"}</h1><p className="lede">{site.content.description || "Describe what makes your business the right choice."}</p><a className="site-button" href={preview ? undefined : "#offerings"}>Explore offerings</a></section>
    <section id={preview ? undefined : "offerings"} className="business-section"><h2>What we offer</h2><div className="grid two">
      {site.offerings.map(o => <article className="business-card" key={o.id}>
        {o.photos[0] && <img className="offering-image" src={"/media/" + o.photos[0]} alt={o.name} width={640} height={400}/>}
        <div className="pills">{o.configurations.map(c => <span key={c.mode}>{c.mode}</span>)}</div><h3>{o.name}</h3><p>{o.description}</p>
        {o.configurations.map(c => <div key={c.mode} className="offering-action"><span>{c.price.kind === "VARIABLE" ? "Price by request" : c.price.kind === "STARTING" ? `Starting at $${(c.price.cents / 100).toFixed(2)}` : `$${(c.price.cents / 100).toFixed(2)}${c.price.kind === "HOURLY" ? " / hour" : c.price.kind === "DAILY" ? " / day" : c.price.kind === "PER_PERSON" ? " / person" : c.price.kind === "PER_NIGHT" ? " / night" : ""}`}</span>
          {!preview && <Link className="site-button" href={`${platformOrigin}/request/${site.slug}/${o.id}?mode=${c.mode}`}>{c.mode === "QUOTE" ? "Request a quote" : c.mode === "RENTAL" ? "Choose rental dates" : c.mode === "RESERVATION" ? "Make a reservation" : "Book a service"}</Link>}
        </div>)}
      </article>)}
    </div></section>
    {site.content.gallery.length > 0 && <section className="business-section"><h2>A closer look</h2><div className="photo-grid">{site.content.gallery.map((id, i) => <img src={"/media/" + id} alt={`${site.name} gallery photo ${i + 1}`} width={600} height={400} key={id}/>)}</div></section>}
    {site.content.testimonials.length > 0 && <section className="business-section"><h2>From our customers</h2>{site.content.testimonials.map((v, i) => <blockquote key={i}><p>{v.text}</p><cite>{v.name}</cite></blockquote>)}</section>}
    <footer className="business-section"><h2>Find us</h2><p>{site.address ?? site.city} / {site.timeZone}</p><p>Business contact information is provided after successful request confirmation. Customers pay the business directly for underlying offerings.</p></footer>
  </article>;
}
