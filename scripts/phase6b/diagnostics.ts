import { trustedCA } from './tls';
import { lookup } from 'node:dns/promises';
import { connect as tcpConnect } from 'node:net';
import { connect as tlsConnect } from 'node:tls';
import { readFileSync } from 'node:fs';
import type { Driver, Target } from './initialize';

// Never print SQL input, child stdout, environment, or an unfiltered Error stack.
export function sanitize(message:string, secrets:string[]=[]):string {
  for(const secret of secrets.filter(Boolean).sort((a,b)=>b.length-a.length)) {
    for(const form of new Set([secret,encodeURIComponent(secret)])) message=message.split(form).join('[REDACTED]');
  }
  return message.replace(/postgres(?:ql)?:\/\/[^\s"']+/gi,'[REDACTED URL]')
    .replace(/SCRAM-SHA-256\$[^\s"';]+/g,'[REDACTED VERIFIER]')
    .replace(/(password\s*[=:]\s*)(?:"[^"]*"|'[^']*'|[^\s;]+)/gi,'$1[REDACTED]')
    .replace(/[\x00-\x08\x0b-\x1f\x7f]/g,' ').slice(0,3000);
}
export function failure(stage:string,error:unknown,secrets:string[]=[]):Error {
  const e=error as {message?:string;code?:string};
  return new Error(sanitize(`[${stage}] failed${e?.code ? ` (code ${e.code})`:''}: ${e?.message??'Unknown failure'}. No automatic repair attempted.`,secrets));
}
export async function networkProbe(host:string,tls:boolean):Promise<void> {
  const ca=tls ? trustedCA() : undefined;
  await new Promise<void>((resolve,reject)=>{
    const socket=tcpConnect({host,port:5432});
    let secure:ReturnType<typeof tlsConnect>|undefined;
    let done=false;
    const timer=setTimeout(()=>finish(Object.assign(new Error('Connection or TLS negotiation timed out'),{code:'ETIMEDOUT'})),10000);
    const finish=(error?:Error)=>{if(done)return;done=true;clearTimeout(timer);secure?.destroy();socket.destroy();if(error)reject(error);else resolve();};
    socket.once('error',finish);
    socket.once('connect',()=>{
      if(!tls){finish();return;}
      // PostgreSQL SSLRequest, before sending any startup packet or credentials.
      socket.write(Buffer.from([0,0,0,8,4,210,22,47]));
      socket.once('data',data=>{
        if(data.length!==1 || data[0]!==83){finish(Object.assign(new Error('Server rejected PostgreSQL TLS negotiation'),{code:'PG_SSL_REJECTED'}));return;}
        secure=tlsConnect({socket,servername:host,rejectUnauthorized:true,ca,minVersion:'TLSv1.2'});
        secure.once('error',finish);
        secure.once('secureConnect',()=>finish());
      });
    });
    socket.once('end',()=>finish(Object.assign(new Error('Server closed connection during negotiation'),{code:'ECONNRESET'})));
  });
}
export interface Probes { dns(host:string):Promise<unknown>; network(host:string,tls:boolean):Promise<void> }
export async function diagnose(target:Target,driver:Driver,probes:Probes={dns:host=>lookup(host,{all:true}),network:networkProbe}):Promise<void> {
  const stage=async(name:string,action:()=>unknown|Promise<unknown>)=>{
    driver.log(`[${name}] checking`);
    try{await action();driver.log(`[${name}] passed`);}catch(error){throw failure(name,error,[target.password,target.url.password,target.url.href]);}
  };
  await stage('DNS resolution',()=>probes.dns(target.url.hostname));
  await stage('TCP connectivity port 5432',()=>probes.network(target.url.hostname,false));
  await stage('TLS negotiation and certificate validation',()=>probes.network(target.url.hostname,true));
  const query=(sql:string,name:string)=>driver.sql(`\\set VERBOSITY verbose\n\\set SHOW_CONTEXT never\nBEGIN READ ONLY; SET LOCAL statement_timeout='10s'; ${sql}\nROLLBACK;`,target,name);
  await stage('PostgreSQL authentication',()=>query('SELECT 1;','PostgreSQL authentication'));
  await stage('database identity and version',()=>{
    const result=query("SELECT current_database()='jobfray' AND current_user='jobfray_owner' AND session_user='jobfray_owner' AND current_setting('server_version_num')::int BETWEEN 170000 AND 179999;",'database identity and version').trim();
    if(result!=='t')throw Object.assign(new Error('Expected jobfray / jobfray_owner / PostgreSQL 17'),{code:'IDENTITY_MISMATCH'});
  });
  await stage('catalog access',()=>query(readFileSync('scripts/phase6b/catalog.sql','utf8')+"; SELECT count(*) FROM pg_catalog.pg_roles;",'catalog access'));
  await stage('required extension availability',()=>{
    const result=query("SELECT count(DISTINCT name)=3 FROM pg_catalog.pg_available_extensions WHERE name IN ('cube','earthdistance','pg_trgm');",'required extension availability').trim();
    if(result!=='t')throw Object.assign(new Error('Required server extensions: cube, earthdistance, pg_trgm; one or more unavailable'),{code:'EXTENSION_UNAVAILABLE'});
  });
}
