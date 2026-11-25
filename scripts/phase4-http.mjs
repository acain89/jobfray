import assert from "node:assert/strict";
import {spawn} from "node:child_process";
import net from "node:net";

const ingressTestSecret="synthetic-http-ingress-secret-".repeat(3);
const originalFetch=globalThis.fetch;
const fetch=(url,init={})=>{const headers=new Headers(init.headers);headers.set("x-jf-edge-secret",ingressTestSecret);headers.set("x-jf-client-ip","203.0.113.55");return originalFetch(url,{...init,headers});};
const clean=Object.fromEntries(Object.entries(process.env).filter(([k])=>["PATH","SYSTEMROOT","WINDIR","COMSPEC","PATHEXT","TEMP","TMP","USERPROFILE","APPDATA","LOCALAPPDATA"].includes(k.toUpperCase())));
const probe=net.createServer();await new Promise(r=>probe.listen(0,"127.0.0.1",r));const port=probe.address().port;await new Promise(r=>probe.close(r));const origin="http://127.0.0.1:"+port;
const server=spawn(process.execPath,["--import","./scripts/verification-network-guard.mjs","node_modules/next/dist/bin/next","start","--hostname","127.0.0.1","--port",String(port)],{env:{...clean,JOBFRAY_PUBLIC_ORIGIN:origin,JOBFRAY_EDGE_SECRET:ingressTestSecret,NEXT_TELEMETRY_DISABLED:"1"},stdio:"ignore"});
try{
 for(let i=0;i<80;i++){try{if((await fetch(origin+"/api/health")).ok)break;}catch{}await new Promise(r=>setTimeout(r,150));}
 assert.equal((await fetch(origin+"/api/ready")).status,503);
 assert.equal((await fetch(origin+"/sandbox/inbox")).status,404);
 assert.equal((await fetch(origin+"/api/worker",{method:"POST"})).status,503);
 const session=await fetch(origin+"/api/core?op=session"),s=await session.json();assert.equal(s.available,false);assert.equal(s.sandbox,false);assert.match(session.headers.get("set-cookie"),/__Host-jf_csrf=.*Secure/);
 for(const op of ["workspace","admin","sandbox-inbox","confirmation"])assert.equal((await fetch(origin+"/api/core?op="+op)).status,503);
 for(const path of ["/api/qr","/api/calendar","/media/guessable-id"])assert.equal((await fetch(origin+path)).status,503);
 const post=(body,headers={})=>fetch(origin+"/api/core",{method:"POST",headers:{Origin:origin,"Content-Type":"application/json",Cookie:"__Host-jf_csrf="+s.csrf,"x-csrf-token":s.csrf,...headers},body});
 assert.equal((await post(JSON.stringify({op:"mock-pay",data:{}}))).status,503);
 assert.equal((await post(JSON.stringify({op:"register",data:{}}),{Origin:"https://evil.invalid"})).status,403);
 assert.equal((await post(JSON.stringify({op:"register",data:{}}),{"x-csrf-token":"wrong"})).status,403);
 assert.equal((await post("{invalid")).status,400);
 assert.equal((await post(JSON.stringify({op:"register",data:"x".repeat(256000)}))).status,413);
 const redirected=await fetch(origin+"/safe?next=https://evil.invalid",{headers:{Host:"synthetic-tenant.jobfray.com"},redirect:"manual"});assert.ok([307,404].includes(redirected.status));if(redirected.headers.has("location"))assert.equal(new URL(redirected.headers.get("location")).origin,origin);
 console.log("PASS: disabled-production readiness, secure cookies, private/mock/media gates, CSRF, invalid/oversized JSON and canonical host redirect");
}finally{const closed=new Promise(r=>server.once("exit",r));server.kill();await closed;}
const invalid=spawn(process.execPath,["node_modules/next/dist/bin/next","start","--hostname","127.0.0.1","--port",String(port)],{env:{...clean,JOBFRAY_SANDBOX:"1",JOBFRAY_PUBLIC_ORIGIN:origin,NEXT_TELEMETRY_DISABLED:"1"},stdio:"ignore"});
const timer=setTimeout(()=>invalid.kill(),10000);const code=await new Promise(r=>invalid.once("exit",r));clearTimeout(timer);assert.notEqual(code,0);assert.notEqual(code,null);console.log("PASS: production startup rejects sandbox flag without explicit local-test acknowledgement");
