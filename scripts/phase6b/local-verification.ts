// Integration harness: fixed disposable loopback cluster only. Production TLS is mocked here,
// never through an environment variable or a bypass in the production implementation.
import {execFileSync} from 'node:child_process';
import {resolve} from 'node:path';
import {writeFileSync,readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import baseline from './baseline.json';
import {initialization,migrationsFromDisk,identity,scram,aclChecks,preflight} from './initialize';
const bin='C:/Program Files/PostgreSQL/17/bin/',data=resolve('artifacts/phase6b-baseline/data');
const env:NodeJS.ProcessEnv={...Object.fromEntries(Object.entries(process.env).filter(([k])=>['PATH','SYSTEMROOT','WINDIR','TEMP','TMP','COMSPEC'].includes(k.toUpperCase()))),NODE_ENV:'test'};
const ctl=(args:string[])=>execFileSync(bin+'pg_ctl.exe',['-D',data,...args],{env,stdio:'ignore'});
const sql=(text:string,user='phase6b_fixture',db='postgres',password='0'.repeat(64))=>execFileSync(bin+'psql.exe',['-X','-w','-qAt','-h','127.0.0.1','-p','55489','-U',user,'-d',db,'-v','ON_ERROR_STOP=1'],{env:{...env,...(user==='jobfray_app'?{PGPASSWORD:password}:{})},input:text,encoding:'utf8',stdio:['pipe','pipe','pipe'],maxBuffer:16*1024*1024});
const tlsMock=(text:string)=>text.replaceAll("(SELECT ssl AND version IN ('TLSv1.2','TLSv1.3') AND bits>=128 FROM pg_stat_ssl WHERE pid=pg_backend_pid())",'TRUE').replace('\\set VERBOSITY sqlstate','\\set VERBOSITY default');
let started=false;
try {
 const hba=resolve(data,'pg_hba.conf'),rule='host jobfray jobfray_app 127.0.0.1/32 scram-sha-256\n';
 if(!readFileSync(hba,'utf8').startsWith(rule))writeFileSync(hba,rule+readFileSync(hba,'utf8'));
 ctl(['-l',resolve('artifacts/phase6b-baseline/server.log'),'-o','-h 127.0.0.1 -p 55489 -c max_connections=20','-w','start']);started=true;
 assert.equal(sql('SELECT current_user,inet_server_addr(),inet_server_port();').trim(),'phase6b_fixture|127.0.0.1|55489');
 sql('DROP DATABASE IF EXISTS jobfray;');sql('DROP ROLE IF EXISTS jobfray_app; DROP ROLE IF EXISTS jobfray_owner; CREATE ROLE jobfray_owner LOGIN CREATEROLE; GRANT phase6b_fixture TO jobfray_owner WITH INHERIT FALSE, SET TRUE;');sql('CREATE DATABASE jobfray OWNER jobfray_owner;');
 const migrations=migrationsFromDisk(baseline),password='0'.repeat(64),verifier=scram(password);
 // Vanilla PostgreSQL requires superuser for earthdistance; managed Render extension
 // permission is not reproduced locally. Mock only this extension-install capability.
 const managedExtensionMock=(text:string)=>text.replaceAll('CREATE EXTENSION IF NOT EXISTS earthdistance WITH SCHEMA public;','SET LOCAL ROLE phase6b_fixture; CREATE EXTENSION IF NOT EXISTS earthdistance WITH SCHEMA public; RESET ROLE;');
 const init=managedExtensionMock(tlsMock(initialization(migrations,baseline,verifier)));
 // Inject a failure immediately before role creation; every migration must roll back.
 assert.throws(()=>sql(init.replace('DO $role$',"DO $injected$ BEGIN RAISE EXCEPTION 'injected interruption'; END $injected$; DO $role$"),'jobfray_owner','jobfray'));
 assert.equal(sql("SELECT to_regclass('public._prisma_migrations') IS NULL AND to_regclass('public.\"JfAccount\"') IS NULL;",'jobfray_owner','jobfray').trim(),'t');
 sql(init,'jobfray_owner','jobfray');
 assert.equal(sql('SELECT count(*) FROM public._prisma_migrations;','jobfray_owner','jobfray').trim(),'7');
 sql(init,'jobfray_owner','jobfray');
 sql(tlsMock(`DO $x$ BEGIN ${identity('jobfray_app')} END $x$;`)+aclChecks(baseline),'jobfray_app','jobfray');
 assert.throws(()=>sql('SELECT 1;','jobfray_app','jobfray','wrong-fixture-password'));
 assert.throws(()=>sql(`BEGIN; INSERT INTO public."Category"(id,name,slug,"updatedAt") VALUES ('fixture','fixture','fixture',now()); ${tlsMock(preflight(migrations,baseline))}`,'jobfray_owner','jobfray'));
 const drift=execFileSync(process.execPath,['node_modules/prisma/build/index.js','migrate','diff','--from-url','postgresql://phase6b_fixture@127.0.0.1:55489/postgres','--to-schema-datamodel','prisma/schema.prisma','--script'],{env,encoding:'utf8',stdio:['pipe','pipe','pipe']});
 assert.ok(drift.includes('This is an empty migration.'),drift);
 // A changed function body is rejected, even though it does not affect Prisma schema drift.
 sql("CREATE OR REPLACE FUNCTION jf_new_request_token() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NEW; END $$;",'jobfray_owner','jobfray');
 assert.throws(()=>sql(tlsMock(preflight(migrations,baseline)),'jobfray_owner','jobfray'));
 for(let prefix=1;prefix<=6;prefix++){
  sql('DROP DATABASE jobfray;');sql('DROP ROLE jobfray_app;');sql('CREATE DATABASE jobfray OWNER jobfray_owner;');
  const createLedger=init.slice(init.indexOf('CREATE TABLE IF NOT EXISTS'),init.indexOf('DO $migration$'));
  sql('BEGIN; SET LOCAL search_path TO public;'+createLedger+migrations.slice(0,prefix).map((m,i)=>managedExtensionMock(m.sql)+`\nINSERT INTO public._prisma_migrations(id,checksum,migration_name,finished_at,applied_steps_count) VALUES ('${i}','${m.checksum}','${m.name}',now(),1);`).join('\n')+'COMMIT;','jobfray_owner','jobfray');
  sql(init,'jobfray_owner','jobfray');
  assert.equal(sql('SELECT count(*) FROM public._prisma_migrations;','jobfray_owner','jobfray').trim(),'7');
 }
 sql("UPDATE public._prisma_migrations SET checksum='unexpected' WHERE migration_name=(SELECT min(migration_name) FROM public._prisma_migrations);",'jobfray_owner','jobfray');
 assert.throws(()=>sql(tlsMock(preflight(migrations,baseline)),'jobfray_owner','jobfray'));
 // Keep the baseline builder's postgres database unchanged and prove its exact catalog.
 const current=JSON.parse(sql('SET search_path TO public;'+readFileSync('scripts/phase6b/catalog.sql','utf8'))) as unknown;
 assert.deepEqual(current,baseline.snapshots[7]);
 writeFileSync('artifacts/phase6b-local-verification.json',JSON.stringify({remoteConnections:0,localPostgres17:true,migrations:7,atomicRollback:true,allSixPartialBoundariesResumed:true,rerun:true,restrictedRoleAcl:true,scramLogin:true,wrongPasswordRejected:true,unexpectedDataRejected:true,prismaDrift:drift.trim(),tamperedFunctionRejected:true,badLedgerRejected:true,tls:'mocked in local harness only',managedEarthdistancePermission:'mocked in local harness only'},null,2));
 console.log('Local SQL verification passed: seven migrations, atomic rollback, all six partial boundaries, rerun, ACLs, Prisma drift, and guard/ledger tampering rejection. TLS and managed extension capability mocked only in harness.');
} catch(error) {
 if(error && typeof error==='object' && 'stderr' in error){console.error(String(error.stderr));if('stdout' in error)console.error(String(error.stdout));}
 throw error;
} finally {if(started)ctl(['-m','fast','-w','stop']);}
