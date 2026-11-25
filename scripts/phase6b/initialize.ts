import { createHash, randomBytes, randomUUID, pbkdf2Sync, createHmac } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { libpqTLS, prismaMigrationURL } from './tls';
import baselineData from './baseline.json';
import { diagnose, failure, sanitize } from './diagnostics';

export interface Migration { name: string; checksum: string; sql: string }
export interface Baseline { postgresMajor: number; schemaChecksum:string; migrations: {name:string; checksum:string}[]; snapshots: unknown[] }
export interface Target { url: URL; password: string }
export interface Driver { sql(input:string, target:Target, stage:string):string; secret(candidate:string,roleExists:boolean):string; log(message:string):void }
const host = 'dpg-dc2u9qmtlv9c738ork2g-a.oregon-postgres.render.com';
const marker = 'JobFray Phase6B restricted application role v1';
export const quote = (s:string):string => "'" + s.replaceAll("'", "''") + "'";
export function targetFrom(raw:string | undefined):Target {
  if (!raw || raw !== raw.trim()) throw new Error('JF_MIGRATION_DATABASE_URL is missing or has surrounding whitespace.');
  let url:URL;
  try { url=new URL(raw); } catch { throw new Error('Migration URL is invalid (value suppressed).'); }
  if (!['postgres:','postgresql:'].includes(url.protocol) || url.hostname!==host || (url.port && url.port!=='5432') || url.pathname!=='/jobfray' || url.username!=='jobfray_owner' || !url.password || url.hash)
    throw new Error('Migration target does not match the authorized Render host/database/owner/port.');
  const seen = new Set<string>();
  for (const [key,value] of url.searchParams) {
    if (seen.has(key) || !({sslmode:['require','verify-full'],schema:['public'],connection_limit:['1','2'],pool_timeout:['10'],connect_timeout:['10'],sslaccept:['strict']} as Record<string,string[]>)[key]?.includes(value))
      throw new Error('Unexpected migration URL connection override.');
    seen.add(key);
  }
  return {url,password:decodeURIComponent(url.password)};
}
export function migrationsFromDisk(base:Baseline):Migration[] {
  const names=readdirSync('prisma/migrations',{withFileTypes:true}).filter(d=>d.isDirectory()).map(d=>d.name).sort();
  if(names.length!==7 || base.snapshots.length!==8 || base.postgresMajor!==17) throw new Error('Expected seven pinned migrations and eight PostgreSQL 17 catalog fixtures.');
  if(createHash('sha256').update(readFileSync('prisma/schema.prisma')).digest('hex')!==base.schemaChecksum)throw new Error('Prisma schema differs from the schema verified against this catalog fixture.');
  return names.map((name,i)=>{
    const bytes=readFileSync(`prisma/migrations/${name}/migration.sql`),checksum=createHash('sha256').update(bytes).digest('hex');
    if(base.migrations[i]?.name!==name || base.migrations[i]?.checksum!==checksum) throw new Error('Migration differs from reviewed catalog fixture.');
    return {name,checksum,sql:bytes.toString('utf8')};
  });
}
export function scram(password:string):string {
  const salt=randomBytes(16),key=pbkdf2Sync(password,salt,4096,32,'sha256');
  const client=createHmac('sha256',key).update('Client Key').digest();
  return `SCRAM-SHA-256$4096:${salt.toString('base64')}$${createHash('sha256').update(client).digest('base64')}:${createHmac('sha256',key).update('Server Key').digest('base64')}`;
}
const assertion = (condition:string,message:string):string => `IF (${condition}) IS NOT TRUE THEN RAISE EXCEPTION ${quote(message)}; END IF;`;
export const identity = (role:string):string => assertion(`current_database()='jobfray' AND current_user=${quote(role)} AND session_user=${quote(role)} AND current_setting('server_version_num')::int BETWEEN 170000 AND 179999 AND (SELECT ssl AND version IN ('TLSv1.2','TLSv1.3') AND bits>=128 FROM pg_stat_ssl WHERE pid=pg_backend_pid())`,'Database identity or TLS mismatch');
const safeEnvelope=(body:string):string => `\\set VERBOSITY verbose\n\\set SHOW_CONTEXT never\nBEGIN; SET LOCAL search_path TO public; SET LOCAL lock_timeout='10s'; SET LOCAL statement_timeout='120s';\n${body}\nCOMMIT;`;
const catalog=():string=>readFileSync('scripts/phase6b/catalog.sql','utf8').trim().replace(/;$/,'');
function ledgerCheck(migrations:Migration[]):string {
  return `IF to_regclass('public._prisma_migrations') IS NULL THEN n:=0; ELSE
    ${assertion(`(SELECT relkind='r' FROM pg_class WHERE oid='public._prisma_migrations'::regclass) AND (SELECT jsonb_agg(jsonb_build_array(attname,format_type(atttypid,atttypmod),attnotnull) ORDER BY attnum) FROM pg_attribute WHERE attrelid='public._prisma_migrations'::regclass AND attnum>0 AND NOT attisdropped)='[["id","character varying(36)",true],["checksum","character varying(64)",true],["finished_at","timestamp with time zone",false],["migration_name","character varying(255)",true],["logs","text",false],["rolled_back_at","timestamp with time zone",false],["started_at","timestamp with time zone",true],["applied_steps_count","integer",true]]'::jsonb`,'Unexpected migration ledger structure')}
    SELECT count(*) INTO n FROM public._prisma_migrations;
    ${assertion('n<=7','Unexpected migration ledger size')}
    FOR r IN SELECT * FROM public._prisma_migrations ORDER BY migration_name LOOP
      i:=i+1;
      ${assertion(`r.migration_name=(ARRAY[${migrations.map(m=>quote(m.name)).join(',')}])[i] AND r.checksum=(ARRAY[${migrations.map(m=>quote(m.checksum)).join(',')}])[i] AND r.finished_at IS NOT NULL AND r.rolled_back_at IS NULL AND r.applied_steps_count=1`,'Unexpected, incomplete, failed or changed migration ledger')}
    END LOOP;
  END IF;`;
}
export function preflight(migrations:Migration[],base:Baseline):string {
  return `DO $preflight$ DECLARE n int; i int:=0; r record; actual jsonb; BEGIN
    ${identity('jobfray_owner')}
    ${assertion(`NOT EXISTS(SELECT FROM pg_namespace WHERE nspname<>'public' AND nspname<>'information_schema' AND nspname !~ '^pg_') AND NOT EXISTS(SELECT FROM pg_event_trigger) AND NOT EXISTS(SELECT FROM pg_foreign_server)`,'Unexpected schema, event trigger or foreign server')}
    ${assertion(`has_database_privilege(current_user,current_database(),'CREATE') AND has_schema_privilege(current_user,'public','CREATE') AND (SELECT rolcreaterole FROM pg_roles WHERE rolname=current_user)`,'Migration owner lacks required privileges')}
    ${assertion(`current_setting('max_connections')::int-current_setting('superuser_reserved_connections')::int-current_setting('reserved_connections')::int-(SELECT count(*) FROM pg_stat_activity)>=4`,'Insufficient observed free connection slots for initial pool and maintenance')}
    ${assertion(`(SELECT datconnlimit=-1 OR datconnlimit>=6 FROM pg_database WHERE datname='jobfray')`,'Database connection limit is too small for initial pools and maintenance')}
    ${ledgerCheck(migrations)}
    SELECT (${catalog()}) INTO actual;
    ${assertion(`actual=(${quote(JSON.stringify(base.snapshots))}::jsonb->n)`,'Catalog does not match committed migration boundary')}
    FOR r IN SELECT c.relname FROM pg_class c WHERE c.relnamespace='public'::regnamespace AND c.relkind='r' AND c.relname<>'_prisma_migrations' LOOP
      EXECUTE format('LOCK TABLE public.%I IN ACCESS EXCLUSIVE MODE',r.relname);
      EXECUTE format('SELECT EXISTS(SELECT FROM public.%I LIMIT 1)',r.relname) INTO STRICT r;
      ${assertion('NOT r.exists','Unexpected application data: initialization is for an unused database only')}
    END LOOP;
    IF EXISTS(SELECT FROM pg_roles WHERE rolname='jobfray_app') THEN
      ${assertion(`(SELECT shobj_description(oid,'pg_authid')=${quote(marker)} AND rolcanlogin AND NOT rolsuper AND NOT rolcreatedb AND NOT rolcreaterole AND NOT rolreplication AND NOT rolbypassrls AND NOT rolinherit AND rolconnlimit=2 FROM pg_roles WHERE rolname='jobfray_app') AND NOT EXISTS(SELECT FROM pg_auth_members WHERE member=(SELECT oid FROM pg_roles WHERE rolname='jobfray_app') OR (roleid=(SELECT oid FROM pg_roles WHERE rolname='jobfray_app') AND (member<>(SELECT oid FROM pg_roles WHERE rolname='jobfray_owner') OR NOT admin_option OR inherit_option OR set_option)))`,'Existing application role is unexpected or privileged')}
    END IF;
  END $preflight$;`;
}
const deleteTables=new Set(['JfSession','JfToken','JfRateBucket','JfMedia','JfDirectoryBusiness']);
const immutable=new Set(['JfCheckoutSnapshot','JfPaymentEvent','JfAudit']);
export function permissions(table:string):string[] {
  if(!table.startsWith('Jf'))return [];
  return ['SELECT','INSERT',...(immutable.has(table)?[]:['UPDATE']),...(deleteTables.has(table)?['DELETE']:[])];
}
function tables(base:Baseline):string[] {
  const last=base.snapshots[7] as {relations:unknown[][]};
  return last.relations.filter(row=>row[1]==='r').map(row=>String(row[0]));
}
export function aclChecks(base:Baseline):string {
 const expected=tables(base).flatMap(t=>['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER'].map(p=>assertion(`has_table_privilege('jobfray_app',${quote('public."'+t+'"')},${quote(p)})=${permissions(t).includes(p)}`,'Effective application table privilege mismatch'))).join('\n');
 return `DO $acl$ DECLARE r record; BEGIN
 ${expected}
 ${assertion(`NOT has_table_privilege('jobfray_app','public._prisma_migrations','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')`,'Application can access migration ledger')}
 ${assertion(`NOT has_database_privilege('jobfray_app','jobfray','CREATE,TEMP') AND has_database_privilege('jobfray_app','jobfray','CONNECT') AND NOT has_schema_privilege('jobfray_app','public','CREATE') AND has_schema_privilege('jobfray_app','public','USAGE')`,'Unexpected database or schema permissions')}
 ${assertion(`NOT EXISTS(SELECT FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid CROSS JOIN LATERAL aclexplode(a.attacl) x WHERE c.relnamespace='public'::regnamespace AND x.grantee IN (0,(SELECT oid FROM pg_roles WHERE rolname='jobfray_app')))`,'Column grants present')}
 ${assertion(`NOT EXISTS(SELECT FROM pg_class WHERE relnamespace='public'::regnamespace AND relowner=(SELECT oid FROM pg_roles WHERE rolname='jobfray_app')) AND NOT EXISTS(SELECT FROM pg_proc WHERE pronamespace='public'::regnamespace AND proowner=(SELECT oid FROM pg_roles WHERE rolname='jobfray_app')) AND NOT EXISTS(SELECT FROM pg_namespace WHERE nspowner=(SELECT oid FROM pg_roles WHERE rolname='jobfray_app')) AND NOT EXISTS(SELECT FROM pg_database WHERE datdba=(SELECT oid FROM pg_roles WHERE rolname='jobfray_app'))`,'Application owns database objects')}
 FOR r IN SELECT c.oid,c.relacl FROM pg_class c WHERE c.relnamespace='public'::regnamespace LOOP
 ${assertion(`NOT EXISTS(SELECT FROM aclexplode(r.relacl) WHERE grantee IN (0,(SELECT oid FROM pg_roles WHERE rolname='jobfray_app')) AND is_grantable)`,'Application or PUBLIC has grant options')}
 END LOOP;
 ${assertion(`NOT EXISTS(SELECT FROM pg_db_role_setting WHERE setrole=(SELECT oid FROM pg_roles WHERE rolname='jobfray_app')) AND NOT EXISTS(SELECT FROM pg_type WHERE typnamespace='public'::regnamespace AND typowner=(SELECT oid FROM pg_roles WHERE rolname='jobfray_app'))`,'Unexpected application settings or type ownership')}
 ${assertion(`NOT EXISTS(SELECT FROM pg_default_acl a CROSS JOIN LATERAL aclexplode(a.defaclacl) x WHERE x.grantee IN (0,(SELECT oid FROM pg_roles WHERE rolname='jobfray_app')) AND (x.is_grantable OR a.defaclobjtype IN ('r','S','n')))`,'Unsafe default application or PUBLIC privileges')}
 FOR r IN SELECT c.oid FROM pg_class c WHERE c.relnamespace='public'::regnamespace AND c.relkind='S' LOOP
 ${assertion(`NOT has_sequence_privilege('jobfray_app',r.oid,'USAGE,SELECT,UPDATE')`,'Application has sequence privileges')}
 END LOOP;
 ${assertion(`NOT EXISTS(SELECT FROM pg_namespace n CROSS JOIN LATERAL aclexplode(n.nspacl) x WHERE n.nspname='public' AND x.grantee IN (0,(SELECT oid FROM pg_roles WHERE rolname='jobfray_app')) AND x.is_grantable) AND NOT EXISTS(SELECT FROM pg_database d CROSS JOIN LATERAL aclexplode(d.datacl) x WHERE d.datname='jobfray' AND x.grantee IN (0,(SELECT oid FROM pg_roles WHERE rolname='jobfray_app')) AND x.is_grantable) AND NOT EXISTS(SELECT FROM pg_proc p CROSS JOIN LATERAL aclexplode(p.proacl) x WHERE p.pronamespace='public'::regnamespace AND x.grantee IN (0,(SELECT oid FROM pg_roles WHERE rolname='jobfray_app')) AND x.is_grantable)`,'Unexpected schema, database or function grant options')}
 ${assertion(`NOT EXISTS(SELECT FROM pg_proc p WHERE p.pronamespace='public'::regnamespace AND p.prosecdef) AND NOT EXISTS(SELECT FROM pg_roles WHERE rolname='jobfray_app' AND (rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls OR rolinherit)) AND NOT EXISTS(SELECT FROM pg_auth_members WHERE member=(SELECT oid FROM pg_roles WHERE rolname='jobfray_app') OR (roleid=(SELECT oid FROM pg_roles WHERE rolname='jobfray_app') AND (member<>(SELECT oid FROM pg_roles WHERE rolname='jobfray_owner') OR NOT admin_option OR inherit_option OR set_option)))`,'Privileged function or application role')}
 FOR r IN SELECT p.oid FROM pg_proc p WHERE p.pronamespace='public'::regnamespace LOOP
 ${assertion(`has_function_privilege('jobfray_app',r.oid,'EXECUTE')`,'Missing invoker function permission')}
 END LOOP;
 FOR r IN SELECT t.oid FROM pg_type t WHERE t.typnamespace='public'::regnamespace LOOP
 ${assertion(`has_type_privilege('jobfray_app',r.oid,'USAGE')`,'Missing type permission')}
 END LOOP;
 END $acl$;`;
}
export function initialization(migrations:Migration[],base:Baseline,verifier:string):string {
 const grants=tables(base).filter(t=>permissions(t).length).map(t=>`GRANT ${permissions(t).join(',')} ON TABLE public."${t}" TO jobfray_app;`).join('\n');
 return safeEnvelope(`SELECT pg_advisory_xact_lock(771161399);
 ${preflight(migrations,base)}
 CREATE TABLE IF NOT EXISTS public._prisma_migrations (id varchar(36) PRIMARY KEY,checksum varchar(64) NOT NULL,finished_at timestamptz,migration_name varchar(255) NOT NULL,logs text,rolled_back_at timestamptz,started_at timestamptz NOT NULL DEFAULT now(),applied_steps_count integer NOT NULL DEFAULT 0);
 ${migrations.map(m=>`DO $migration$ BEGIN IF NOT EXISTS(SELECT FROM public._prisma_migrations WHERE migration_name=${quote(m.name)}) THEN
 EXECUTE ${quote(m.sql)};
 INSERT INTO public._prisma_migrations(id,checksum,finished_at,migration_name,applied_steps_count) VALUES(${quote(randomUUID())},${quote(m.checksum)},clock_timestamp(),${quote(m.name)},1);
 END IF; END $migration$;`).join('\n')}
 ${preflight(migrations,base)}
 DO $role$ BEGIN IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='jobfray_app') THEN
 CREATE ROLE jobfray_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS CONNECTION LIMIT 2 PASSWORD ${quote(verifier)};
 COMMENT ON ROLE jobfray_app IS ${quote(marker)};
 END IF; END $role$;
 REVOKE CREATE ON SCHEMA public FROM PUBLIC;
 REVOKE TEMPORARY ON DATABASE jobfray FROM PUBLIC;
 REVOKE ALL ON DATABASE jobfray FROM jobfray_app;
 GRANT CONNECT ON DATABASE jobfray TO jobfray_app;
 REVOKE ALL ON SCHEMA public FROM jobfray_app;
 GRANT USAGE ON SCHEMA public TO jobfray_app;
 REVOKE ALL ON ALL TABLES IN SCHEMA public FROM jobfray_app;
 REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM jobfray_app;
 DO $functions$ DECLARE f record; BEGIN
 FOR f IN SELECT p.oid::regprocedure AS signature FROM pg_proc p WHERE p.pronamespace='public'::regnamespace AND NOT EXISTS(SELECT FROM pg_depend d WHERE d.classid='pg_proc'::regclass AND d.objid=p.oid AND d.deptype='e') LOOP
 EXECUTE format('REVOKE ALL ON FUNCTION %s FROM jobfray_app',f.signature);
 EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO jobfray_app',f.signature);
 END LOOP; END $functions$;
 ${grants}
 ${aclChecks(base)}
 SELECT jsonb_build_object('max_connections',current_setting('max_connections'),'reserved_connections',current_setting('reserved_connections'),'superuser_reserved_connections',current_setting('superuser_reserved_connections'),'sessions',(SELECT count(*) FROM pg_stat_activity),'database_limit',(SELECT datconnlimit FROM pg_database WHERE datname=current_database()),'owner_limit',(SELECT rolconnlimit FROM pg_roles WHERE rolname=current_user),'app_limit',2,'shared_buffers',current_setting('shared_buffers'),'work_mem',current_setting('work_mem'),'maintenance_work_mem',current_setting('maintenance_work_mem'));
 `);
}
export function run(driver:Driver,raw:string|undefined,base:Baseline,migrations:Migration[]):void {
 const target=targetFrom(raw);
 const existing=driver.sql(safeEnvelope(preflight(migrations,base)+"\nSELECT EXISTS(SELECT FROM pg_roles WHERE rolname='jobfray_app');"),target,'identity, TLS and catalog preflight').trim();
 if(existing!=='t' && existing!=='f')throw new Error('Unexpected preflight response.');
 driver.log('Identity, verified TLS, empty contents and migration boundary passed.');
 const proposed=new URL(target.url);proposed.username='jobfray_app';proposed.password=randomBytes(32).toString('hex');proposed.search='';
 proposed.searchParams.set('sslmode','require');proposed.searchParams.set('sslaccept','strict');proposed.searchParams.set('schema','public');proposed.searchParams.set('connection_limit','2');proposed.searchParams.set('pool_timeout','10');proposed.searchParams.set('connect_timeout','10');
 const stored=driver.secret(proposed.href,existing==='t');
 let app:URL;try{app=new URL(stored);}catch{throw new Error('Protected application credential is invalid.');}
 if(app.hostname!==host || app.username!=='jobfray_app' || app.pathname!=='/jobfray' || !/^[a-f0-9]{64}$/.test(decodeURIComponent(app.password)) || app.port!==target.url.port || app.search!==proposed.search)throw new Error('Protected application credential does not match this initialization.');
 const appTarget={url:app,password:decodeURIComponent(app.password)};
 driver.log('Protected application credential saved or recovered; starting atomic initialization.');
 const capacity=driver.sql(initialization(migrations,base,scram(appTarget.password)),target,'atomic migrations, catalog and role verification');
 driver.sql(safeEnvelope(`DO $identity$ BEGIN ${identity('jobfray_app')} END $identity$; ${aclChecks(base)}`),appTarget,'restricted application login and effective permissions');
 driver.log('Seven migrations, exact catalog, ledger, application login and effective permissions verified.');
 // Only the explicit capacity SELECT is allowed out of the child process.
 for(const line of capacity.split(/\r?\n/)){if(line.startsWith('{')){const data:unknown=JSON.parse(line);driver.log('Observed connection/memory capacity: '+JSON.stringify(data));}}
 driver.log('Use one shared PrismaClient, pool 2; combined initial application pools <=4, subject to observed available slots. Backup/restore and deployment acceptance remain separate.');
}
export function childFailure(stage:string,result:{error?:Error;status:number|null;signal?:string|null;stderr?:string|null},secrets:string[]):Error {
 const detail=result.error ?? Object.assign(new Error(result.stderr?.trim() || 'Child returned no diagnostic output'),{code:result.stderr?.match(/(?:ERROR|FATAL):\s+([0-9A-Z]{5}):/)?.[1] ?? (result.signal ? `SIGNAL_${result.signal}` : `EXIT_${result.status}`)});
 return failure(`${stage}; child-process execution`,detail,secrets);
}
function systemDriver():Driver {
 const env:NodeJS.ProcessEnv={...Object.fromEntries(Object.entries(process.env).filter(([key])=>['PATH','SYSTEMROOT','WINDIR','COMSPEC','PATHEXT','TEMP','TMP','USERPROFILE','APPDATA','LOCALAPPDATA'].includes(key.toUpperCase()))),NODE_ENV:'production'};
 return {
  sql(input,target,stage){
   const result=spawnSync('C:/Program Files/PostgreSQL/17/bin/psql.exe',['-X','-w','-qAt','-v','ON_ERROR_STOP=1'],{input,encoding:'utf8',maxBuffer:16*1024*1024,windowsHide:true,env:{...env,PGHOST:host,PGPORT:'5432',PGDATABASE:'jobfray',PGUSER:decodeURIComponent(target.url.username),PGPASSWORD:target.password,...libpqTLS(),PGCONNECT_TIMEOUT:'10',PGAPPNAME:'JobFray-Phase6B-owner'}});
   if(result.error || result.status!==0)throw childFailure(stage,result,[target.password,target.url.password,target.url.href]);
   return result.stdout;
  },
  secret(candidate,roleExists){
   const result=spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',resolve('scripts/phase6b/protect-secret.ps1')],{input:JSON.stringify({candidate,roleExists}),encoding:'utf8',windowsHide:true,env});
   if(result.error || result.status!==0 || !result.stdout.trim())throw childFailure('protected credential child process',result,[candidate]);
   return result.stdout.trim();
  },
  log(message){console.log(message);}
 };
}
async function main():Promise<void> {
 try {if(process.platform!=='win32')throw new Error('Run from owner Windows PowerShell.');const base:Baseline=baselineData;const driver=systemDriver();const raw=process.env.JF_MIGRATION_DATABASE_URL;
 console.log('[credential availability] checking');
 if(!raw)throw failure('credential availability',new Error('JF_MIGRATION_DATABASE_URL is missing'));
 console.log('[credential availability] passed');
 let target:Target;try{target=targetFrom(raw);}catch(error){throw failure('URL parsing and authorized target',error,[raw]);}
 console.log('[URL parsing and authorized target] passed');
 const migrations=migrationsFromDisk(base);await diagnose(target,driver);
 console.log('[Prisma migration TLS and authentication] checking');
 const migrationURL=prismaMigrationURL(target.url);
 const prisma=spawnSync(process.execPath,['node_modules/prisma/build/index.js','db','execute','--schema','prisma/schema.prisma','--stdin'],{input:'BEGIN READ ONLY; SELECT 1; ROLLBACK;',encoding:'utf8',windowsHide:true,env:{...Object.fromEntries(Object.entries(process.env).filter(([key])=>['PATH','SYSTEMROOT','WINDIR','COMSPEC','PATHEXT','TEMP','TMP','USERPROFILE','APPDATA','LOCALAPPDATA'].includes(key.toUpperCase()))),NODE_ENV:'production',DATABASE_URL:migrationURL.href}});
 if(prisma.error || prisma.status!==0)throw childFailure('Prisma migration TLS and authentication',prisma,[raw,migrationURL.href,target.password,target.url.password]);
 console.log('[Prisma migration TLS and authentication] passed');
 run(driver,raw,base,migrations);}
 catch(error){const raw=process.env.JF_MIGRATION_DATABASE_URL;let password='';try{password=decodeURIComponent(new URL(raw??'').password);}catch{}
 console.error(sanitize(error instanceof Error?error.message:'Phase6B failed; details suppressed.',[raw??'',password]));process.exitCode=1;}
}

if(process.argv[1] && import.meta.url===pathToFileURL(resolve(process.argv[1])).href)void main();
