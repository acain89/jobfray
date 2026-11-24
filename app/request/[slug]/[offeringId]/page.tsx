import { notFound } from "next/navigation";
import { runtime, applicationEnabled } from "@/lib/core/runtime";
import { publishedSite } from "@/lib/core/business";
import { rollingWindow } from "@/lib/core/time";
import { RequestForm } from "@/components/core/RequestForm";
export const dynamic="force-dynamic";
export const metadata={title:"Request an offering",robots:{index:false,follow:false}};
export default async function RequestPage({params,searchParams}:{params:Promise<{slug:string;offeringId:string}>;searchParams:Promise<{mode?:string}>}) {
  if(!applicationEnabled())notFound();const app=await runtime(),p=await params,site=await publishedSite(app.repo,p.slug),mode=(await searchParams).mode??"";
  if(!site||!site.offerings.some(o=>o.id===p.offeringId))notFound();const window=rollingWindow(new Date(),site.timeZone);
  return <RequestForm site={site} offeringId={p.offeringId} initialMode={mode} sandbox={app.sandbox} today={window.today} lastDate={window.lastDate}/>;
}
