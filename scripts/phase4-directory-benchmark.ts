import {PrismaClient} from "@prisma/client";
import {PrismaRepository} from "../lib/core/prisma-repository";
import {directory} from "../lib/core/business";
import {MockGeocoder} from "../lib/core/providers";
import {url,runSql} from "./phase4-postgres-support";
import {readFileSync} from "node:fs";
async function main(){
 const schema=process.argv[2];if(process.env.JOBFRAY_DISPOSABLE_PG!=="7711613122963596620"||!schema||!/^test_[a-f0-9]{32}$/.test(schema))throw new Error("Disposable target required");
 if(!runSql("SELECT system_identifier FROM pg_control_system();").includes("7711613122963596620"))throw new Error("Wrong cluster");
 runSql(`SET search_path TO "${schema}";`+readFileSync("scripts/phase4-directory-load.sql","utf8"));
 const client=new PrismaClient({datasources:{db:{url:url+"?schema="+schema+"&connection_limit=4"}}});
 try {
  const repo=new PrismaRepository(client),latency:number[]=[];
  for(let i=0;i<3;i++) {const start=performance.now(),rows=await directory(repo,{text:"",mode:"SERVICE",fulfillment:"MOBILE",zip:"78701"},new MockGeocoder());if(rows.length!==100 || rows.some(r=>"address" in r || "latitude" in r))throw new Error("Incorrect bounded public projection");latency.push(performance.now()-start);}
  console.log(JSON.stringify({measurement:"directory with 1001 published synthetic businesses",returned:100,elapsedMs:latency,averageMs:latency.reduce((a,b)=>a+b,0)/latency.length,errors:0}));
 }finally{await client.$disconnect();}
}
void main().catch(()=>{console.error("Disposable directory benchmark failed");process.exitCode=1;});
