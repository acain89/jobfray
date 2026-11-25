// Local-only protocol fixture. Never loads owner credentials or contacts Render.
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createServer } from 'node:net';
import { TLSSocket, createSecureContext } from 'node:tls';
import assert from 'node:assert/strict';
const dir=mkdtempSync(resolve('artifacts/phase6b-tls-'));
const openssl='C:/Program Files/Git/usr/bin/openssl.exe';
const file=n=>resolve(dir,n);
function ssl(args){const r=spawnSync(openssl,args,{encoding:'utf8',windowsHide:true});assert.equal(r.status,0,r.stderr);}
ssl(['req','-x509','-newkey','rsa:2048','-nodes','-keyout',file('ca.key'),'-out',file('ca.pem'),'-days','2','-subj','/CN=Phase6B Local Test CA','-addext','basicConstraints=critical,CA:TRUE']);
ssl(['req','-newkey','rsa:2048','-nodes','-keyout',file('server.key'),'-out',file('server.csr'),'-subj','/CN=localhost','-addext','subjectAltName=DNS:localhost']);
ssl(['x509','-req','-in',file('server.csr'),'-CA',file('ca.pem'),'-CAkey',file('ca.key'),'-CAcreateserial','-out',file('server.pem'),'-days','2','-copy_extensions','copy']);
const secureContext=createSecureContext({key:readFileSync(file('server.key')),cert:readFileSync(file('server.pem'))});
let startups=0;
const sockets=new Set();
const server=createServer(socket=>{
 sockets.add(socket);socket.on('close',()=>sockets.delete(socket));socket.on('error',()=>{});
 socket.once('data',request=>{
  assert.deepEqual(request,Buffer.from([0,0,0,8,4,210,22,47]));
  socket.write('S');
  const secure=new TLSSocket(socket,{isServer:true,secureContext});secure.on('error',()=>{});
  secure.once('data',()=>{startups++;secure.end();});
 });
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const port=server.address().port;
function child(command,args,env,input){return new Promise((resolve,reject)=>{
 const p=spawn(command,args,{env,windowsHide:true,stdio:['pipe','pipe','pipe']});
 let output='';p.stdout.on('data',b=>output+=b);p.stderr.on('data',b=>output+=b);
 const timer=setTimeout(()=>{p.kill();reject(new Error('Local TLS fixture timeout'));},15000);
 p.on('error',reject);p.on('close',code=>{clearTimeout(timer);resolve({code,output});});p.stdin.on('error',()=>{});p.stdin.end(input);
});}
// Explicit allowlist: no inherited DB URL, PG*, SSL_* or credentials.
const env={...Object.fromEntries(Object.entries(process.env).filter(([k])=>['PATH','SYSTEMROOT','WINDIR','TEMP','TMP','USERPROFILE','APPDATA','LOCALAPPDATA'].includes(k.toUpperCase()))),NODE_ENV:'test'};
try {
 for(const client of ['psql','prisma'])for(const scenario of ['trusted','wrong-host','untrusted']){
  const host=scenario==='wrong-host'?'127.0.0.1':'localhost';
  const ca=scenario==='untrusted'?resolve('prisma/certs/isrg-root-x1.pem'):file('ca.pem');
  const before=startups;
  let result;
  if(client==='psql')result=await child('C:/Program Files/PostgreSQL/17/bin/psql.exe',['-X','-w','-qAt'],{...env,PGHOST:host,PGPORT:String(port),PGDATABASE:'synthetic',PGUSER:'synthetic',PGSSLMODE:'verify-full',PGSSLROOTCERT:ca,PGSSLMINPROTOCOLVERSION:'TLSv1.2',PGCONNECT_TIMEOUT:'5'},'SELECT 1;');
  else {
   const url=new URL(`postgresql://synthetic:synthetic@${host}:${port}/synthetic`);
   url.searchParams.set('sslmode','require');url.searchParams.set('sslaccept','strict');url.searchParams.set('sslcert',ca.replaceAll('\\','/'));url.searchParams.set('connect_timeout','5');
   result=await child(process.execPath,['node_modules/prisma/build/index.js','db','execute','--schema','prisma/schema.prisma','--stdin'],{...env,DATABASE_URL:url.href},'SELECT 1;');
  }
  // The fixture closes after receiving StartupMessage, proving TLS acceptance.
  // It never authenticates, executes SQL, or emulates a real database.
  assert.notEqual(result.code,0);
  assert.equal(startups-before,scenario==='trusted'?1:0,`${client} ${scenario}: ${result.output}`);
  console.log(`${client}: ${scenario} ${scenario==='trusted'?'TLS accepted before fixture close':'rejected before startup'}`);
 }
} finally {for(const socket of sockets)socket.destroy();await new Promise(r=>server.close(r));}
