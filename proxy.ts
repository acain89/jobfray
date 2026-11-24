import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
// Public hostname dispatch only. Authentication is enforced in application boundaries.
export function proxy(request:NextRequest){const base=process.env.JOBFRAY_BASE_HOST??"jobfray.com",host=(request.headers.get("host")??"").toLowerCase().split(":")[0]??"";
  if(!host.endsWith("."+base))return NextResponse.next();const slug=host.slice(0,-base.length-1);
  if(!/^[a-z][a-z0-9-]{1,38}[a-z0-9]$/.test(slug)||["www","app","api","admin","auth","find","mail","support"].includes(slug))return NextResponse.next();
  if(request.nextUrl.pathname==="/"){const url=request.nextUrl.clone();url.pathname="/sites/"+slug;return NextResponse.rewrite(url);}
  const canonical=new URL(request.nextUrl.pathname+request.nextUrl.search,process.env.JOBFRAY_PUBLIC_ORIGIN??"https://jobfray.com");return NextResponse.redirect(canonical);
}
export const config={matcher:["/((?!_next|api|media).*)"]};
