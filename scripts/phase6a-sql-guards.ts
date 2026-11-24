import assert from "node:assert/strict";
import {fixture,input,now} from "../tests/provider-fixtures";
import {DisposableRepository,runSql,clients} from "./phase6a-postgres-support";
import {writeFileSync} from "node:fs";
async function main(){const repo=new DisposableRepository();try{
 const f=await fixture(10,repo),r=await f.service.checkout(input(f),f.capability,"sql-phone",now,"synthetic-browser-capability-binding"),prefix='SET search_path TO "'+repo.schema+'";\n';
 let phoneRejected=false;try{runSql(prefix+`INSERT INTO "JfCheckoutSnapshot" SELECT (jsonb_populate_record(NULL::"JfCheckoutSnapshot",to_jsonb(s)||jsonb_build_object('id','wrong-phone','document',document||jsonb_build_object('id','wrong-phone','customerPhone','+15125550199')))).* FROM "JfCheckoutSnapshot" s WHERE id='${r.snapshot.id}';`);}catch(error){phoneRejected=String((error as {stderr:unknown}).stderr).includes("Snapshot phone must match request");}assert.ok(phoneRejected);
 let browserMutationRejected=false;try{runSql(prefix+`UPDATE "JfRequest" SET document=document||jsonb_build_object('browserHash','different') WHERE id='${r.requestId}';`);}catch(error){browserMutationRejected=String((error as {stderr:unknown}).stderr).includes("Immutable JobFray request facts");}assert.ok(browserMutationRejected);
 writeFileSync("artifacts/phase6a-sql-guards.json",JSON.stringify({phoneRejected,browserMutationRejected,schema:repo.schema},null,2));console.log(JSON.stringify({phoneRejected,browserMutationRejected}));
}finally{await Promise.all(clients.map(c=>c.$disconnect()));}}
void main().catch(error=>{console.error(error);process.exitCode=1;});
