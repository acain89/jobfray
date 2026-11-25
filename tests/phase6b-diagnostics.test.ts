import { test } from 'node:test';
import assert from 'node:assert/strict';
import { diagnose, sanitize, failure, type Probes } from '../scripts/phase6b/diagnostics';
import { targetFrom, childFailure, type Driver } from '../scripts/phase6b/initialize';
const raw='postgresql://jobfray_owner:p%40ss%2Fword@dpg-dc2u9qmtlv9c738ork2g-a.oregon-postgres.render.com/jobfray';
const target=targetFrom(raw);
function fixture(fail='') {
 const seen:string[]=[];
 const check=(stage:string)=>{seen.push(stage);if(stage===fail)throw Object.assign(new Error('synthetic failure '+raw+' '+target.password),{code:'E_TEST'});};
 const probes:Probes={async dns(){check('dns');return [];},async network(_host,tls){check(tls?'tls':'tcp');}};
 const driver:Driver={log(){},secret(){throw new Error('Must not transfer credentials');},sql(sql,_target,stage){assert.ok(sql.includes('BEGIN READ ONLY;'));assert.ok(sql.endsWith('ROLLBACK;'));check(stage);return ['database identity and version','required extension availability'].includes(stage)?'t':'1';}};
 return {seen,probes,driver};
}
test('read-only diagnostics run each stage without credential transfer or mutation',async()=>{
 const f=fixture();await diagnose(target,f.driver,f.probes);
 assert.deepEqual(f.seen,['dns','tcp','tls','PostgreSQL authentication','database identity and version','catalog access','required extension availability']);
});
for(const stage of ['dns','tcp','tls','PostgreSQL authentication','database identity and version','catalog access','required extension availability'])test(`diagnostics stop at ${stage} and redact credentials`,async()=>{
 const f=fixture(stage);await assert.rejects(diagnose(target,f.driver,f.probes),e=>{
  assert.ok(e instanceof Error);assert.ok(e.message.includes('E_TEST'));assert.ok(e.message.includes('synthetic failure'));
  for(const secret of [raw,target.password,target.url.password])assert.ok(!e.message.includes(secret));return true;
 });assert.equal(f.seen.at(-1),stage);
});
test('identity and missing extension failures have actionable codes',async()=>{
 for(const stage of ['database identity and version','required extension availability']){
  const f=fixture();const sql=f.driver.sql;f.driver.sql=(input,target,name)=>name===stage?'f':sql(input,target,name);
  await assert.rejects(diagnose(target,f.driver,f.probes),new RegExp(stage==='database identity and version'?'IDENTITY_MISMATCH':'EXTENSION_UNAVAILABLE'));
 }
});
test('child errors preserve OS codes, SQLSTATE, exit status and signal safely',()=>{
 for(const [result,code] of [
  [{error:Object.assign(new Error('spawn psql ENOENT'),{code:'ENOENT'}),status:null},'ENOENT'],
  [{status:2,stderr:'psql: error: FATAL:  28P01: password authentication failed '+raw},'28P01'],
  [{status:1,stderr:'ERROR:  42501: permission denied'},'42501'],
  [{status:2,stderr:'certificate verify failed'},'EXIT_2'],
  [{status:null,signal:'SIGTERM'},'SIGNAL_SIGTERM'],
 ] as const){const e=childFailure('authentication',result,[raw,target.password]);assert.ok(e.message.includes(code));assert.ok(e.message.includes('authentication'));assert.ok(!e.message.includes(raw));}
 assert.ok(sanitize('password=abc postgresql://user:secret@host/db').includes('[REDACTED]'));
 assert.ok(failure('TLS',{code:'CERT_HAS_EXPIRED',message:'certificate expired'}).message.includes('CERT_HAS_EXPIRED'));
});
