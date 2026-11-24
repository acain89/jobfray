import { notFound } from "next/navigation";
import { runtime, applicationEnabled } from "@/lib/core/runtime";
import { publishedSite } from "@/lib/core/business";
import { SiteView } from "@/components/core/SiteView";
import { siteOrigin } from "@/lib/site";
export const dynamic="force-dynamic";
async function site(slug:string){if(!applicationEnabled())return null;return publishedSite((await runtime()).repo,slug);}
export async function generateMetadata({params}:{params:Promise<{slug:string}>}){const value=await site((await params).slug);return value?{title:value.name,description:value.content.description.slice(0,160),alternates:{canonical:siteOrigin+"/sites/"+value.slug},openGraph:{title:value.name,description:value.content.description.slice(0,160)}}:{title:"Business not available"};}
export default async function BusinessSitePage({params}:{params:Promise<{slug:string}>}) {
  const value=await site((await params).slug);if(!value)notFound();
  const structured={"@context":"https://schema.org","@type":"LocalBusiness",name:value.name,description:value.content.description,url:siteOrigin+"/sites/"+value.slug,areaServed:value.city,...(value.address?{address:value.address}:{})};
  return <><script type="application/ld+json" dangerouslySetInnerHTML={{__html:JSON.stringify(structured).replace(/</g,"\u003c")}}/><SiteView site={value} platformOrigin={siteOrigin}/></>;
}
