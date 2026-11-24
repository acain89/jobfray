import test from "node:test";
import assert from "node:assert/strict";
import {Prisma} from "@prisma/client";
import {MemoryRepository} from "../lib/core/repository";
import {isRetryableTransactionError} from "../lib/core/prisma-repository";
import {localSandboxAllowed,validateConfiguration} from "../lib/core/configuration";
test("production mock configuration fails closed except explicit loopback test deployment",()=>{
 const production={NODE_ENV:"production",JOBFRAY_SANDBOX:"1"};
 assert.equal(localSandboxAllowed(production),false);assert.throws(()=>validateConfiguration(production));
 assert.equal(localSandboxAllowed({...production,JOBFRAY_LOCAL_TEST:"1",JOBFRAY_PUBLIC_ORIGIN:"https://public.example"}),false);
 assert.equal(localSandboxAllowed({...production,JOBFRAY_LOCAL_TEST:"1",JOBFRAY_PUBLIC_ORIGIN:"http://127.0.0.1:3210"}),true);
 assert.throws(()=>validateConfiguration({JOBFRAY_DATABASE_ENABLED:"1"}));
 assert.throws(()=>validateConfiguration({JOBFRAY_DATABASE_ENABLED:"1",JOBFRAY_RELEASE_DB_VERIFIED:"1"}));
});
test("raw PostgreSQL serialization and deadlock SQLSTATEs retry; constraint errors do not",()=>{
 const error=(code:string,state?:string)=>new Prisma.PrismaClientKnownRequestError("synthetic",{code,clientVersion:"5.22",...(state?{meta:{code:state}}:{})});
 assert.equal(isRetryableTransactionError(error("P2034")),true);
 for(const state of ["40001","40P01"])assert.equal(isRetryableTransactionError(error("P2010",state)),true);
 assert.equal(isRetryableTransactionError(error("P2010","23514")),false);
 assert.equal(isRetryableTransactionError(new Error("secret")),false);
});
test("bounded query keysets and range/set predicates preserve tenant isolation",async()=>{
 const repo=new MemoryRepository();
 await repo.transaction([],async tx=>{for(let i=0;i<5;i++)await tx.put("rates",{id:String(i),count:i,expiresAt:"2027-01-0"+(i+1)+"T00:00:00.000Z"});});
 const first=await repo.transaction([],tx=>tx.find("rates",{},{limit:2}));assert.deepEqual(first.map(r=>r.id),["0","1"]);
 const next=await repo.transaction([],tx=>tx.find("rates",{},{limit:2,afterId:"1"}));assert.deepEqual(next.map(r=>r.id),["2","3"]);
 const subset=await repo.transaction([],tx=>tx.find("rates",{},{oneOf:{field:"id",values:["1","3"]},ranges:[{field:"expiresAt",operator:"gt",value:"2027-01-03T00:00:00.000Z"}]}));assert.deepEqual(subset.map(r=>r.id),["3"]);
 await assert.rejects(repo.transaction([],tx=>tx.find("rates",{},{limit:0})),/limit/);
});

test("subdomain redirects cannot reinterpret a double-slash path as another origin",async()=>{
 const {NextRequest}=await import("next/server"),{proxy}=await import("../proxy");
 const response=proxy(new NextRequest("https://synthetic-tenant.jobfray.com//evil.invalid/path",{headers:{host:"synthetic-tenant.jobfray.com"}}));
 assert.equal(new URL(response.headers.get("location")!).origin,"https://jobfray.com");
});

test("background worker authentication fails closed and rejects cookie-only access",async()=>{
 const {authorizeWorker}=await import("../lib/core/worker-auth");const key="synthetic-worker-key-with-32-characters";
 assert.throws(()=>authorizeWorker(new Request("https://jobfray.com/api/worker"),""),/not configured/);
 assert.throws(()=>authorizeWorker(new Request("https://jobfray.com/api/worker",{headers:{cookie:"jf_session=admin"}}),key),/Forbidden/);
 assert.doesNotThrow(()=>authorizeWorker(new Request("https://jobfray.com/api/worker",{headers:{authorization:"Bearer "+key}}),key));
});

test("production-build mocks require a loopback CLI listener independently of Host headers",async()=>{
 const {assertLocalTestBinding}=await import("../lib/core/configuration");const env={NODE_ENV:"production",JOBFRAY_SANDBOX:"1"};
 assert.throws(()=>assertLocalTestBinding(env,["node","next","start"]),/loopback/);
 assert.throws(()=>assertLocalTestBinding(env,["node","next","start","--hostname","0.0.0.0"]),/loopback/);
 assert.doesNotThrow(()=>assertLocalTestBinding(env,["node","next","start","--hostname","127.0.0.1"]));
});
