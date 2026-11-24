import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import net from "node:net";
import { resolve } from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
const external=process.env.JOBFRAY_SMOKE_ORIGIN;
let server;
let origin=external;
if(!origin){const probe=net.createServer();await new Promise(r=>probe.listen(0,"127.0.0.1",r));const port=probe.address().port;await new Promise(r=>probe.close(r));origin=`http://127.0.0.1:${port}`;
  const env=Object.fromEntries(Object.entries(process.env).filter(([k])=>["PATH","SYSTEMROOT","WINDIR","COMSPEC","PATHEXT","TEMP","TMP","USERPROFILE","APPDATA","LOCALAPPDATA"].includes(k.toUpperCase())));
  server=spawn(process.execPath,["--import","./scripts/verification-network-guard.mjs","node_modules/next/dist/bin/next","start","--hostname","127.0.0.1","--port",String(port)],{env:{...env,JOBFRAY_SANDBOX:"1",JOBFRAY_LOCAL_TEST:"1",JOBFRAY_PUBLIC_ORIGIN:origin,NEXT_TELEMETRY_DISABLED:"1"},stdio:["ignore","ignore","pipe"]});
}
const jar=new Map();let csrf="";
async function call(path,options={}){const r=await fetch(origin+path,{...options,headers:{Cookie:[...jar].map(([k,v])=>k+"="+v).join(";"),...options.headers}});for(const value of r.headers.getSetCookie()){const pair=value.split(";")[0],i=pair.indexOf("=");jar.set(pair.slice(0,i),pair.slice(i+1));}return r;}
async function get(op){const r=await call("/api/core?op="+op);assert.equal(r.status,200,"GET "+op);return r.json();}
async function post(op,data,expect=200){const r=await call("/api/core",{method:"POST",headers:{Origin:origin,"Content-Type":"application/json","x-csrf-token":csrf},body:JSON.stringify({op,data})});const v=await r.json();assert.equal(r.status,expect,op+" failed: "+(v.error??""));if(v.csrf)csrf=v.csrf;return v;}
try{
  for(let i=0;i<100;i++){try{if((await fetch(origin+"/api/health")).ok)break;}catch{}if(server?.exitCode!==null&&server?.exitCode!==undefined)throw new Error("Sandbox server exited");await new Promise(r=>setTimeout(r,200));}
  csrf=(await get("session")).csrf;assert.equal((await call("/sandbox/inbox")).status,200);
  const malicious=await call("/api/core",{method:"POST",headers:{Origin:"https://cross-origin.invalid","Content-Type":"application/json","x-csrf-token":csrf},body:JSON.stringify({op:"register",data:{}})});assert.equal(malicious.status,403);
  const id=randomUUID().slice(0,8),email=`smoke-${id}@example.test`,password="Synthetic smoke password 2026!";
  await post("register",{email,password});let inbox=await get("sandbox-inbox");const verification=inbox.items.find(v=>v.destination===email&&v.kind==="VERIFY_EMAIL").body;
  await post("verify-email",{token:verification});await post("login",{email,password});
  const profile={name:"Willow & Field",slug:"willow-field-"+id,category:"Local rentals and services",description:"Thoughtful local help, useful rentals and welcoming spaces.",email,phone:"+15125550123",address:"100 Test Lane, Austin, TX 78701",addressPublic:false,city:"Austin",zip:"78701",latitude:0,longitude:0,timeZone:"America/Chicago",modes:["RENTAL","SERVICE","QUOTE","RESERVATION"],directory:true};
  const business=await post("save-profile",profile),hours={weekly:Object.fromEntries(Array.from({length:7},(_,i)=>[String(i),[{start:0,end:1440}]])),exceptions:{},blocked:[]};
  const resource=await post("save-resource",{businessId:business.id,resource:{name:"Shared local capacity",capacity:20,hours}});
  const common={fulfillments:["MOBILE","STOREFRONT"],radiusMiles:10};
  const configurations=[{...common,mode:"SERVICE",price:{kind:"STARTING",cents:7501},durationMinutes:60,bufferBefore:0,bufferAfter:0,noticeMinutes:0},{...common,mode:"RENTAL",price:{kind:"HOURLY",cents:1500},minimumUnits:1,turnaroundMinutes:0,noticeMinutes:0},{...common,mode:"QUOTE",price:{kind:"VARIABLE"}},{...common,mode:"RESERVATION",price:{kind:"PER_PERSON",cents:2000},capacityUnit:"PERSON",interval:"SLOT",slotMinutes:60,minimumParty:1,maximumParty:8,noticeMinutes:0,arrivalInstructions:"Your arrival details are included in this protected confirmation."}];
  const item=await post("save-offering",{businessId:business.id,offering:{name:"A better local connection",description:"Book practical help, rent what you need, request a quote or reserve space.",photos:[],active:true,resourceId:resource.id,configurations}});
  await post("autosave",{businessId:business.id,revision:business.revision,design:true,content:{headline:"Good things happen locally.",description:"A welcoming home for thoughtful service, useful rentals and time well spent. Choose the way you would like to connect.",gallery:[],testimonials:[],theme:{page:0,components:1,trim:0,button:"SOFT",letters:0}}});
  await post("publish",{businessId:business.id});
  const publicHtml=await (await call("/sites/"+business.slug)).text();assert.ok(publicHtml.includes("Good things happen locally."));assert.ok(!publicHtml.includes(profile.address));assert.ok(!publicHtml.includes(profile.phone));
  const find=await (await call("/find?zip=78701&mode=SERVICE")).text();assert.ok(find.includes(profile.slug));assert.ok(!find.includes(profile.address));
  const qr=await call("/api/qr");assert.equal(qr.status,200);assert.ok((await qr.text()).includes("<svg"));
  const phone="+15125550124",challenge=await post("contact-start",{phone});inbox=await get("sandbox-inbox");const code=inbox.items.find(v=>v.kind==="CUSTOMER_CODE"&&v.body.startsWith(challenge.challengeId+":")).body.split(":")[1];
  const proof=(await post("contact-verify",{challengeId:challenge.challengeId,code})).proof;
  const png=await sharp({create:{width:32,height:32,channels:3,background:"#77a08b"}}).png().toBuffer();
  const upload=await call("/api/media",{method:"POST",headers:{Origin:origin,"Content-Type":"application/json","x-csrf-token":csrf},body:JSON.stringify({businessId:business.id,kind:"QUOTE",bytes:png.toString("base64"),contentType:"image/png",proof,phone})});assert.equal(upload.status,200);const photo=(await upload.json()).id;
  const dateParts=Object.fromEntries(new Intl.DateTimeFormat("en-CA",{timeZone:"America/Chicago",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(new Date()).map(p=>[p.type,p.value]));const date=new Date(Date.parse(`${dateParts.year}-${dateParts.month}-${dateParts.day}T12:00Z`)+86400000).toISOString().slice(0,10);
  const receipts=[];let lastToken="";
  for(const mode of profile.modes){const selection={businessId:business.id,offeringId:item.id,mode,fulfillment:"STOREFRONT",quantity:mode==="RENTAL"?2:1,partySize:mode==="RESERVATION"?3:1,startLocal:mode==="QUOTE"?"":date+"T10:00",endLocal:mode==="QUOTE"?"":date+(mode==="RENTAL"?"T12:00":"T11:00"),ambiguity:"REJECT",contact:{name:"Synthetic customer",phone,address:"",notes:mode==="QUOTE"?"A short synthetic job description":""},photos:mode==="QUOTE"?[photo]:[]};
    const checkout=await post("checkout",{selection,proof,idempotencyKey:"smoke-"+id+mode}),again=await post("checkout",{selection,proof,idempotencyKey:"smoke-"+id+mode});assert.equal(checkout.requestId,again.requestId);
    assert.equal(checkout.snapshot.platformFeeCents,mode==="SERVICE"?400:300);await post("mock-pay",{requestId:checkout.requestId});
    lastToken=checkout.confirmationToken;const receipt=await get("confirmation");assert.ok(receipt.request);assert.equal(receipt.request.businessPhone,profile.phone);receipts.push(receipt);
    if(mode!=="QUOTE"){const calendar=await call("/api/calendar");assert.equal(calendar.status,200);assert.ok((await calendar.text()).includes("BEGIN:VCALENDAR"));}
  }
  const w=await get("workspace");assert.equal(w.requests.length,4);await post("sandbox-reconcile",{});const finalInbox=await get("sandbox-inbox");assert.ok(finalInbox.items.some(v=>v.kind==="CUSTOMER_CONFIRMATION"));
  await mkdir(resolve("artifacts"),{recursive:true});
  await writeFile(resolve("artifacts","phase3-browser-fixture.json"),JSON.stringify({email,password,slug:business.slug,businessId:business.id,offeringId:item.id,confirmationLink:"/confirmation#access="+lastToken},null,2));
  console.log("PASS: real HTTP registration, verification, login, CSRF rejection, onboarding, catalog, publication, directory privacy, QR, upload and all four idempotent mock payment/confirmation/calendar workflows. No live provider or database.");
}finally{if(server&&server.exitCode===null){const done=new Promise(r=>server.once("exit",r));server.kill();await done;}}
