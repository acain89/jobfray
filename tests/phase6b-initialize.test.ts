import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash,createHmac,pbkdf2Sync} from 'node:crypto';
import {readFileSync,mkdtempSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import baseline from '../scripts/phase6b/baseline.json';
import {run,targetFrom,migrationsFromDisk,initialization,preflight,permissions,scram,type Driver,type Target} from '../scripts/phase6b/initialize';

const url='postgresql://jobfray_owner:mock-owner-secret@dpg-dc2u9qmtlv9c738ork2g-a.oregon-postgres.render.com/jobfray?sslmode=require';
const migrations=migrationsFromDisk(baseline);
function fixture() {
 const calls:{sql:string;target:Target;stage:string}[]=[],logs:string[]=[];
 let saved:string|undefined,secretCalls=0,failAt=0,existing=false;
 const driver:Driver={
  sql(sql,target,stage){calls.push({sql,target,stage});if(calls.length===failAt)throw new Error('Mock verification failed');return stage==='identity, TLS and catalog preflight'?(existing?'t':'f'):'';},
  secret(candidate,roleExists){secretCalls++;if(roleExists&&!saved)throw new Error('Missing stored credential');saved??=candidate;return saved;},
  log(message){logs.push(message);}
 };
 return {driver,calls,logs,get saved(){return saved;},get secretCalls(){return secretCalls;},set failAt(n:number){failAt=n;},set existing(v:boolean){existing=v;}};
}
test('accepts only pinned Render identity; never returns owner password in diagnostics',()=>{
 const target=targetFrom(url);assert.equal(target.password,'mock-owner-secret');assert.equal(target.url.hostname,'dpg-dc2u9qmtlv9c738ork2g-a.oregon-postgres.render.com');
 for(const bad of [undefined,'',url+' ',url.replace('jobfray_owner','postgres'),url.replace('/jobfray?','/other?'),url.replace('.oregon-','.ohio-'),url.replace('.com/', '.com:6432/'),url.replace('postgresql:','https:'),url+'&host=evil',url+'&options=-csearch_path=evil',url+'&sslmode=disable',url+'&sslrootcert=other',url+'&schema=other',url+'#fragment',url.replace('mock-owner-secret','')]){
  assert.throws(()=>targetFrom(bad),error=>error instanceof Error&&!error.message.includes('mock-owner-secret'));
 }
});
test('all seven exact file checksums are pinned; altered fixtures stop',()=>{
 assert.equal(migrations.length,7);assert.equal(baseline.snapshots.length,8);
 const changed=structuredClone(baseline);changed.migrations[0]!.checksum='bad';assert.throws(()=>migrationsFromDisk(changed));
});
test('preflight fails closed for NULL, unexpected objects/data, ledger failures and insufficient capacity',()=>{
 const sql=preflight(migrations,baseline);
 for(const text of ['IS NOT TRUE','r.rolled_back_at IS NULL','r.finished_at IS NOT NULL','r.applied_steps_count=1','Catalog does not match','Unexpected application data','ACCESS EXCLUSIVE','pg_event_trigger','pg_foreign_server','Insufficient observed free','Existing application role'])assert.ok(sql.includes(text),text);
});
test('full initialization orders TLS and schema checks before migration, then verifies before commit',()=>{
 const sql=initialization(migrations,baseline,'mock-verifier');
 assert.ok(sql.indexOf('pg_stat_ssl')<sql.indexOf('CREATE TABLE IF NOT EXISTS'));
 assert.ok(sql.indexOf('pg_advisory_xact_lock')<sql.indexOf('pg_stat_ssl'));
 assert.equal((sql.match(/DO \$migration\$/g)??[]).length,7);
 assert.ok(sql.lastIndexOf('Effective application table privilege mismatch')<sql.lastIndexOf('COMMIT;'));
 assert.ok(!sql.includes('ALTER ROLE'));assert.ok(!sql.includes('GRANT ALL'));assert.ok(sql.includes("IF NOT EXISTS(SELECT FROM pg_roles"));
});
test('role privileges match runtime operations and preserve immutable history',()=>{
 for(const name of ['JfCheckoutSnapshot','JfPaymentEvent','JfAudit'])assert.deepEqual(permissions(name),['SELECT','INSERT']);
 for(const name of ['JfRequest','JfRefund','JfBusiness','JfOffering','JfResource','JfAllocation','JfOperation','JfPushDevice','JfAccount','JfOutbox'])assert.deepEqual(permissions(name),['SELECT','INSERT','UPDATE']);
 for(const name of ['JfSession','JfToken','JfMedia','JfRateBucket','JfDirectoryBusiness'])assert.deepEqual(permissions(name),['SELECT','INSERT','UPDATE','DELETE']);
 for(const name of ['Worker','Post','_prisma_migrations'])assert.deepEqual(permissions(name),[]);
});
test('mocked success stores secret before transaction; tests app login last; logs no credentials',()=>{
 const f=fixture();run(f.driver,url,baseline,migrations);
 assert.equal(f.secretCalls,1);assert.equal(f.calls.length,3);assert.equal(f.calls[2]!.target.url.username,'jobfray_app');
 assert.ok(f.saved);assert.ok(!f.logs.join('\n').includes(new URL(f.saved).password));assert.ok(!f.logs.join('\n').includes('mock-owner-secret'));
 assert.ok(!f.calls[1]!.sql.includes(new URL(f.saved).password));assert.ok(f.calls[1]!.sql.includes('SCRAM-SHA-256$'));
});
for(const stage of [1,2,3])test(`mocked failure at stage ${stage} stops dependent work`,()=>{
 const f=fixture();f.failAt=stage;assert.throws(()=>run(f.driver,url,baseline,migrations));assert.equal(f.calls.length,stage);assert.equal(f.secretCalls,stage===1?0:1);assert.ok(!f.logs.some(s=>s.includes('Seven migrations')));
});
test('existing role without protected secret stops before mutation; never rotates passwords',()=>{
 const f=fixture();f.existing=true;assert.throws(()=>run(f.driver,url,baseline,migrations));assert.equal(f.calls.length,1);
});
test('rerun reuses protected app credential across interrupted completion',()=>{
 const f=fixture();f.failAt=2;assert.throws(()=>run(f.driver,url,baseline,migrations));const saved=f.saved;
 f.failAt=0;run(f.driver,url,baseline,migrations);assert.equal(f.saved,saved);
});
test('malformed stored credential stops before database mutations',()=>{
 const f=fixture();f.driver.secret=()=>url;assert.throws(()=>run(f.driver,url,baseline,migrations));assert.equal(f.calls.length,1);
});
test('SCRAM verifier independently matches password-derived stored/server keys',()=>{
 const password='0123456789abcdef'.repeat(4),value=scram(password),parts=value.split('$');
 const [iterations,salt]=parts[1]!.split(':'),[stored,server]=parts[2]!.split(':');
 assert.equal(iterations,'4096');const key=pbkdf2Sync(password,Buffer.from(salt!,'base64'),4096,32,'sha256');
 assert.equal(stored,createHash('sha256').update(createHmac('sha256',key).update('Client Key').digest()).digest('base64'));
 assert.equal(server,createHmac('sha256',key).update('Server Key').digest('base64'));assert.ok(!value.includes(password));
});
test('production transport pins verify-full/explicit trust and uses private stdin/env; no dotenv or provider integration',()=>{
 const source=readFileSync('scripts/phase6b/initialize.ts','utf8');
 assert.ok(source.includes('...libpqTLS()'));assert.ok(!source.includes("PGSSLROOTCERT:'system'"));assert.ok(source.includes("['-X','-w','-qAt'"));assert.ok(!source.includes('dotenv'));assert.ok(!source.includes('migrate reset'));assert.ok(!source.includes('db push'));
 const helper=readFileSync('scripts/phase6b/protect-secret.ps1','utf8');assert.ok(helper.includes('IsOutputRedirected'));assert.ok(helper.includes('CreateNew'));assert.ok(helper.includes('if ($request.roleExists)'));
});
test('direct CLI fails on missing process credential without connecting or exposing environment',()=>{
 const result=spawnSync(process.execPath,['--import','tsx','scripts/phase6b/initialize.ts'],{encoding:'utf8',env:{PATH:process.env.PATH,SYSTEMROOT:process.env.SYSTEMROOT,USERPROFILE:process.env.USERPROFILE,TEMP:process.env.TEMP,NODE_ENV:'test'}});
 assert.equal(result.status,1);assert.ok(result.stderr.includes('JF_MIGRATION_DATABASE_URL is missing'));assert.ok(!result.stdout.includes('passed'));
});
test('DPAPI helper persists and recovers only the synthetic test secret; missing existing-role credential fails',{skip:process.platform!=='win32'},()=>{
 mkdirSync('artifacts',{recursive:true});
 const temporary=mkdtempSync(resolve('artifacts/phase6b-secret-test-'));
 const env:NodeJS.ProcessEnv={PATH:process.env.PATH,SYSTEMROOT:process.env.SYSTEMROOT,USERPROFILE:process.env.USERPROFILE,TEMP:process.env.TEMP,LOCALAPPDATA:temporary,NODE_ENV:'test'};
 const invoke=(candidate:string,roleExists:boolean)=>spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',resolve('scripts/phase6b/protect-secret.ps1')],{env,input:JSON.stringify({candidate,roleExists}),encoding:'utf8',windowsHide:true});
 const missing=invoke('synthetic-only-not-a-real-credential',true);assert.equal(missing.status,1);assert.ok(!missing.stdout.includes('synthetic-only'));
 const first=invoke('synthetic-only-not-a-real-credential',false);assert.equal(first.status,0);assert.equal(first.stdout,'synthetic-only-not-a-real-credential');
 const second=invoke('different-synthetic-value',true);assert.equal(second.status,0);assert.equal(second.stdout,first.stdout);
 const encrypted=readFileSync(resolve(temporary,'JobFray/phase6b-app-url.enc'),'utf8');assert.ok(!encrypted.includes('synthetic-only'));assert.ok(encrypted.length>100);
});
