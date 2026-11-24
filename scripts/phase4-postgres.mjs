// Explicit disposable-cluster test runner. Never reads a database URL from the environment.
import {readFileSync,writeFileSync} from "node:fs";
import {spawnSync} from "node:child_process";
if(process.env.JOBFRAY_DISPOSABLE_PG!=="7711613122963596620")throw new Error("Disposable cluster acknowledgement required");
let source=readFileSync("tests/core.test.ts","utf8").replaceAll("new MemoryRepository()","new DisposableRepository()");
source='import { after,afterEach } from "node:test";\nimport { DisposableRepository,clients } from "../scripts/phase4-postgres-support";\n'+source+'\nafterEach(async()=>{await Promise.all(clients.splice(0).map(c=>c.$disconnect()));});\nafter(async()=>{await Promise.all(clients.map(c=>c.$disconnect()));});\n';
source += String.raw`
 test("PostgreSQL competing cross-mode checkouts and concurrent event replay", async()=>{
  const f=await fixture(3);
  const started=performance.now();const latency=[];
  const results=await Promise.allSettled(Array.from({length:20},async(_,i)=>{const at=performance.now();try{return await f.service.checkout({...input(f,i%3===0?"RENTAL":i%3===1?"SERVICE":"RESERVATION"),quantity:1,partySize:1,endLocal:"2026-11-24T11:00"},f.capability,"stress-"+i,now,"synthetic-browser-capability-binding");}finally{latency.push(performance.now()-at);}}));
  const success=results.filter(r=>r.status==="fulfilled");assert.ok(success.length>0&&success.length<=3);
  const allocations=await f.repo.transaction([],tx=>tx.find("allocations",{businessId:f.business.id}));assert.ok(allocations.reduce((sum,a)=>sum+a.units,0)<=3);
  const request=success[0].value;const intent=await f.service.intent(request.requestId,request.confirmationToken,now),event=f.payments.event(intent);
  await Promise.all(Array.from({length:8},()=>f.service.paymentEvent(event.payload,event.signature,now)));
  assert.equal((await f.repo.transaction([],tx=>tx.find("events",{requestId:request.requestId}))).length,1);
  latency.sort((a,b)=>a-b);console.log(JSON.stringify({measurement:"20 competing PostgreSQL checkouts, capacity3",durationMs:performance.now()-started,retries:f.repo.retries,successful:success.length,rejected:20-success.length,p50Ms:latency[10],p95Ms:latency[18],errors:results.filter(r=>r.status==="rejected").map(r=>String(r.reason.message).slice(0,120))}));
 });
 test("PostgreSQL relational isolation, checks, immutable triggers and rollback",async()=>{
  const f=await fixture();const r=await f.service.checkout(input(f),f.capability,"sql-guards",now,"synthetic-browser-capability-binding");await paid(f,r);
  const {runSql}=await import("../scripts/phase4-postgres-support");const schema=f.repo.schema;
  const sql=q=>runSql('SET search_path TO "'+schema+'";'+q);
  assert.throws(()=>sql('UPDATE "JfCheckoutSnapshot" SET "platformFeeCents"=500;'),/Immutable/);
  assert.throws(()=>sql('DELETE FROM "JfPaymentEvent";'),/Immutable/);
  assert.throws(()=>sql('UPDATE "JfResource" SET capacity=0;'),/constraint|mismatch/);
  assert.throws(()=>sql('UPDATE "JfResource" SET capacity=2;'),/mismatch/);
  assert.throws(()=>sql('UPDATE "JfAllocation" SET "businessId"=\'other-tenant\';'),/mismatch|foreign key|no rows|Immutable/);
  assert.throws(()=>sql('UPDATE "JfRequest" SET document=document-\'start\';'),/constraint|Immutable/);
  const before=await f.repo.transaction([],tx=>tx.find("rates",{}));
  await assert.rejects(f.repo.transaction([],async tx=>{await tx.put("rates",{id:"rollback",count:1,expiresAt:"2027-01-01T00:00:00.000Z"});throw new Error("interrupted");}));
  assert.deepEqual(await f.repo.transaction([],tx=>tx.find("rates",{})),before);
 });
`;
source += String.raw`
test("independent Node processes compete for final PostgreSQL capacity",async()=>{
 const f=await fixture(1);const {spawn}=await import("node:child_process");
 const outputs=await Promise.all(Array.from({length:4},(_,i)=>new Promise((resolve,reject)=>{
  const job=Buffer.from(JSON.stringify({selection:input(f),capability:f.capability,key:"process-"+i})).toString("base64url");
  const child=spawn(process.execPath,["--import","tsx","scripts/phase4-process-worker.ts",f.repo.schema,job],{env:process.env,stdio:["ignore","pipe","pipe"]});
  let output="",errors="";child.stdout.on("data",s=>output+=s);child.stderr.on("data",s=>errors+=s);child.on("exit",code=>code===0?resolve(output.trim()):reject(new Error(errors)));child.on("error",reject);
 })));
 assert.equal(outputs.filter(v=>v==="accepted").length,1);assert.equal(outputs.filter(v=>v==="rejected").length,3);
});
test("PostgreSQL deadlock and serialization victims retry without lost writes",async()=>{
 const repo=new DisposableRepository();await repo.transaction([],async tx=>{for(const id of ["a","b"])await tx.put("rates",{id,count:0,expiresAt:"2027-01-01T00:00:00.000Z"});});
 let arrived=0,calls=0;let release;const barrier=new Promise(r=>release=r);
 const work=(ids)=>repo.transaction([],async tx=>{
  calls++;const a=await tx.get("rates",ids[0]);await tx.put("rates",{...a,count:a.count+1});
  if(calls<=2){arrived++;if(arrived===2)release();await barrier;}
  const b=await tx.get("rates",ids[1]);await tx.put("rates",{...b,count:b.count+1});
 });
 await Promise.all([work(["a","b"]),work(["b","a"])]);
 assert.ok(calls>2);const rows=await repo.transaction([],tx=>tx.find("rates",{}));assert.deepEqual(rows.map(r=>r.count),[2,2]);console.log("Actual deadlock/serialization retry callback executions:",calls);
});
`;
source += String.raw`
test("24 independent PostgreSQL tenants process checkouts concurrently without a global lock",async()=>{
 const f=await fixture();const accountId=(await workspace(f.repo,f.owner.token,now)).account.id;
 const owner=await f.repo.transaction([],tx=>tx.get("accounts",accountId));
 const storedBusiness=await f.repo.transaction([],tx=>tx.get("businesses",f.business.id));
 const jobs=[];const caps=new Map();
 for(let i=0;i<24;i++){
  const account={...owner,id:randomUUID(),email:"load"+i+"@example.test"},business={...storedBusiness,id:randomUUID(),ownerId:account.id,slug:"load-tenant-"+i},resource={...f.resource,id:randomUUID(),businessId:business.id},offering={...f.offering,id:randomUUID(),businessId:business.id,resourceId:resource.id};
  await f.repo.transaction([],async tx=>{await tx.put("accounts",account);await tx.put("businesses",business);await tx.put("resources",resource);await tx.put("offerings",offering);});jobs.push({...input(f),businessId:business.id,offeringId:offering.id});caps.set(business.id,(await createRequestCapability(f.repo,business.id,"synthetic-browser-capability-binding",now)).capability);
 }
 const began=performance.now();const latency=[];
 await Promise.all(jobs.map(async(s,i)=>{const at=performance.now();await f.service.checkout(s,caps.get(s.businessId),"independent-"+i,now,"synthetic-browser-capability-binding");latency.push(performance.now()-at);}));
 const elapsed=performance.now()-began;latency.sort((a,b)=>a-b);console.log(JSON.stringify({measurement:"24 independent tenant checkouts",elapsedMs:elapsed,retries:f.repo.retries,requestsPerSecond:24/elapsed*1000,p50Ms:latency[12],p95Ms:latency[22],errors:0}));
});
`;
source += String.raw`
test("bounded workspace query over 100000 synthetic historical requests",async()=>{
 const f=await fixture();const r=await f.service.checkout(input(f),f.capability,"history-template",now,"synthetic-browser-capability-binding");await paid(f,r);
 const {runSql}=await import("../scripts/phase4-postgres-support");
 runSql('SET search_path TO "'+f.repo.schema+'"; INSERT INTO "JfRequest" (id,"businessId","offeringId",mode,status,"idempotencyKey","payloadHash",document) SELECT \'bulk-\'||lpad(i::text,6,\'0\'),"businessId","offeringId",mode,status,\'bulk-\'||i,"payloadHash",document||jsonb_build_object(\'id\',\'bulk-\'||lpad(i::text,6,\'0\'),\'idempotencyKey\',\'bulk-\'||i,\'confirmationHash\',md5(i::text),\'reference\',\'BULK-\'||i) FROM "JfRequest" CROSS JOIN generate_series(1,100000) i WHERE id=\''+r.requestId+'\'; ANALYZE "JfRequest";');
 const began=performance.now();const w=await workspace(f.repo,f.owner.token,now);const elapsed=performance.now()-began;
 assert.equal(w.requests.length,100);assert.ok(w.nextCursor);assert.ok(w.snapshots.length<=1);
 const page=await workspace(f.repo,f.owner.token,now,w.nextCursor);assert.equal(page.requests.length,100);assert.notEqual(page.requests[0].id,w.requests[0].id);
 console.log(JSON.stringify({measurement:"workspace with 100000 synthetic historical requests",elapsedMs:elapsed,returnedRequests:w.requests.length,returnedSnapshots:w.snapshots.length}));
});
`;
source += String.raw`
test("killed confirmation process rolls back its payment event and replay confirms exactly once",async()=>{
 const f=await fixture(1),r=await f.service.checkout(input(f),f.capability,"killed-confirmation",now,"synthetic-browser-capability-binding"),intent=await f.service.intent(r.requestId,r.confirmationToken,now),event=f.payments.event(intent);
 const {spawn}=await import("node:child_process");
 await new Promise((resolve,reject)=>{
  const child=spawn(process.execPath,["--import","tsx","scripts/phase4-interruption-worker.ts",f.repo.schema,Buffer.from(JSON.stringify(event)).toString("base64url")],{env:process.env,stdio:["ignore","pipe","pipe"]});
  let reached=false;const timeout=setTimeout(()=>{child.kill();reject(new Error("Interruption checkpoint not reached"));},20000);
  child.stdout.on("data",data=>{if(String(data).includes("event-written")){reached=true;child.kill();}});
  child.once("exit",()=>{clearTimeout(timeout);reached?resolve():reject(new Error("Worker exited before checkpoint"));});child.once("error",reject);
 });
 assert.equal((await f.repo.transaction([],tx=>tx.find("events",{requestId:r.requestId}))).length,0);
 assert.equal((await f.service.paymentEvent(event.payload,event.signature,now)).status,"CONFIRMED");
 await f.service.paymentEvent(event.payload,event.signature,now);
 const allocations=await f.repo.transaction([],tx=>tx.find("allocations",{requestId:r.requestId}));assert.equal(allocations.length,1);assert.equal(allocations[0].status,"CONFIRMED");
});
`;
writeFileSync("artifacts/phase4-core.pg.ts",source);
const result=spawnSync(process.execPath,["--import","tsx","--test","artifacts/phase4-core.pg.ts"],{stdio:"inherit",env:{...process.env,DATABASE_URL:"postgresql://unused@127.0.0.1:9/unused"}});
process.exitCode=result.status??1;
