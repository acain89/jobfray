import Link from "next/link";
import { directory } from "@/lib/core/business";
import { runtime, applicationEnabled } from "@/lib/core/runtime";
import { LocateButton } from "@/components/core/LocateButton";
import { pageMetadata } from "@/lib/site";
export const dynamic="force-dynamic";
export const metadata=pageMetadata("Find a business","Discover published rental, service, quote and reservation offerings nearby.","/find");
export default async function FindPage({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}) {
  const p=await searchParams,get=(key:string)=>typeof p[key]==="string"?(p[key] as string).slice(0,120):"",text=get("q"),zip=get("zip"),mode=get("mode"),fulfillment=get("fulfillment");
  let results:Awaited<ReturnType<typeof directory>>=[],error="";
  if(applicationEnabled())try{const app=await runtime(),lat=Number(get("lat")),lon=Number(get("lon"));const point=get("lat")&&get("lon")&&Number.isFinite(lat)&&Number.isFinite(lon)&&Math.abs(lat)<=90&&Math.abs(lon)<=180?{latitude:lat,longitude:lon}:undefined;
    results=await directory(app.repo,{text,mode,fulfillment,zip,...(point?{point}:{})},app.geocoder);
  }catch{error="Search is temporarily unavailable. Please retry later.";}
  return <><div className="page-intro"><p className="eyebrow">Local discovery / no paid ranking</p><h1>Find your next connection.</h1><p className="lede">Rentals, services, quotes and reservations from businesses near you.</p></div>
    <form className="filter-form" action="/find" method="get" role="search" aria-label="Find businesses"><label>Category or offering<input name="q" defaultValue={text} maxLength={120}/></label><label>ZIP code<input name="zip" defaultValue={zip} inputMode="numeric" pattern="[0-9]{5}" maxLength={5}/></label><label>Business mode<select name="mode" defaultValue={mode}><option value="">All modes</option>{["RENTAL","SERVICE","QUOTE","RESERVATION"].map(v=><option value={v} key={v}>{v}</option>)}</select></label><label>Fulfillment<select name="fulfillment" defaultValue={fulfillment}><option value="">Any location</option><option value="MOBILE">Mobile / delivery</option><option value="STOREFRONT">Storefront / pickup</option></select></label><button className="button">Search businesses</button><LocateButton/></form>
    <p className="muted">Location is optional. Precise location is requested only when you choose it. Private mobile-business base addresses are never listed. Service-address eligibility is verified before checkout.</p>
    {error&&<p role="alert">{error}</p>}{!results.length?<section className="empty-state"><h2>No matching published businesses yet.</h2><p>Try another category, mode or ZIP. Businesses appear automatically after publishing unless they opt out.</p><Link href="/register">Create your free business website</Link></section>:<section className="grid two section" aria-label="Search results">{results.map(b=><article className="card" key={b.slug}><p className="eyebrow">{b.category} / {b.city}{b.distance!==null?` / about ${b.distance} miles`:""}</p><h2><Link href={"/sites/"+b.slug}>{b.name}</Link></h2><ul>{b.offerings.map((o,i)=><li key={i}>{o.name} / {[...new Set(o.modes)].join(", ")}</li>)}</ul></article>)}</section>}
  </>;
}
