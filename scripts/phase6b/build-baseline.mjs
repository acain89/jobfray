// Offline fixture builder. Starts ONLY a new disposable loopback PostgreSQL 17 cluster.
import {execFileSync} from 'node:child_process';
import {mkdirSync,readFileSync,readdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
const bin='C:/Program Files/PostgreSQL/17/bin/',root=resolve('artifacts/phase6b-baseline');
const env=Object.fromEntries(Object.entries(process.env).filter(([k])=>!k.toUpperCase().startsWith('PG')&&!/DATABASE_URL/i.test(k)));
mkdirSync(root,{recursive:true});
const run=(exe,args,input)=>execFileSync(bin+exe,args,{env,encoding:'utf8',stdio:exe==='pg_ctl.exe'?'ignore':['pipe','pipe','pipe'],...(input?{input}:{})});
const resume=process.argv.includes('--already-started');
if(!resume)run('initdb.exe',['-D',root+'/data','-U','phase6b_fixture','--auth=trust','--encoding=UTF8','--locale=C']);
let started=false;
try {
 if(!resume)run('pg_ctl.exe',['-D',root+'/data','-l',root+'/server.log','-o','-h 127.0.0.1 -p 55489 -c max_connections=10','-w','start']);started=true;
 const sql=s=>run('psql.exe',['-X','-w','-h','127.0.0.1','-p','55489','-U','phase6b_fixture','-d','postgres','-Atq','-v','ON_ERROR_STOP=1'], 'SET search_path TO public;\n'+s);
 const query=readFileSync('scripts/phase6b/catalog.sql','utf8');
 const migrations=readdirSync('prisma/migrations',{withFileTypes:true}).filter(x=>x.isDirectory()).map(x=>x.name).sort();
 const snapshots=[JSON.parse(sql(query))];
 const hashes=[];
 for(const name of migrations){const data=readFileSync('prisma/migrations/'+name+'/migration.sql');hashes.push({name,checksum:createHash('sha256').update(data).digest('hex')});sql(data.toString());snapshots.push(JSON.parse(sql(query)));}
 writeFileSync('scripts/phase6b/baseline.json',JSON.stringify({postgresMajor:17,schemaChecksum:createHash('sha256').update(readFileSync('prisma/schema.prisma')).digest('hex'),migrations:hashes,snapshots},null,2)+'\n');
 console.log('Built eight catalog fixtures from seven migrations on isolated loopback PostgreSQL 17.');
} finally {if(started)run('pg_ctl.exe',['-D',root+'/data','-m','fast','-w','stop']);}
