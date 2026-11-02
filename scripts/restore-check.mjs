// Restore into new, isolated resources; never overwrite or remove original volumes.
import {spawnSync} from 'node:child_process';
import {readFile,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {createHash,randomBytes} from 'node:crypto';
if(!process.argv[2])throw new Error('Usage: node --env-file=.env scripts/restore-check.mjs SNAPSHOT_DIRECTORY');
const source=resolve(process.argv[2]),manifest=JSON.parse(await readFile(join(source,'manifest.json'),'utf8'));
if(manifest.image==='postgres:18-alpine')manifest.image='postgres:18-alpine@sha256:10a5c69a83035ab5239f5620d708520e8b28f5aa1f2b20143e6024532edadfb5';
if(manifest.image!=='postgres:18-alpine@sha256:10a5c69a83035ab5239f5620d708520e8b28f5aa1f2b20143e6024532edadfb5')throw new Error('Unsupported database image');
if(manifest.version!==1)throw new Error('Unsupported snapshot manifest');
const suffix=randomBytes(5).toString('hex'),container=`arca-rh-restore-${suffix}`,volumes=[`${container}-postgres`,`${container}-contract`,`${container}-payment`];
const env={...process.env,POSTGRES_PASSWORD:randomBytes(32).toString('base64url')};
function command(args,options={}){const r=spawnSync('docker',args,{maxBuffer:256*1024*1024,env,...options});if(r.status!==0)throw new Error(`Restore command failed: ${args[0]} ${args[1]||''}. ${r.stderr?.toString().slice(0,500)||''}`);return r.stdout;}
let started=false;
try{
 for(const item of [...manifest.databases,...manifest.documents]){
  if(!/^[a-z-]+\.(dump|tar)$/.test(item.file))throw new Error('Invalid manifest path');
  const bytes=await readFile(join(source,item.file));if(createHash('sha256').update(bytes).digest('hex')!==item.sha256)throw new Error('Backup integrity failure');
 }
 command(['run','-d','--name',container,'--network','none','-e','POSTGRES_PASSWORD','-e','POSTGRES_USER=arca_root','--mount',`type=volume,source=${volumes[0]},target=/var/lib/postgresql`,manifest.image]);started=true;
 for(let n=0;n<60;n++){
  const ready=spawnSync('docker',['exec',container,'pg_isready','-h','127.0.0.1','-U','arca_root','-d','postgres']);
  if(ready.status===0)break;if(n===59)throw new Error('Isolated PostgreSQL did not become ready');
  await new Promise(r=>setTimeout(r,1000));
 }
 const results=[];
 for(const db of manifest.databases){
  if(!['identity','personnel','vacation','contract','payment'].includes(db.name))throw new Error('Invalid database');
  const password=process.env[`${db.name.toUpperCase()}_DB_PASSWORD`];if(!password)throw new Error('Missing local database credential');
  const sql=`CREATE ROLE arca_${db.name} LOGIN PASSWORD '${password.replaceAll("'","''")}';\nCREATE DATABASE arca_${db.name} OWNER arca_${db.name};\nREVOKE CONNECT ON DATABASE arca_${db.name} FROM PUBLIC;\n`;
  command(['exec','-i',container,'psql','-v','ON_ERROR_STOP=1','-U','arca_root','-d','postgres'],{input:sql});
  command(['exec','-i',container,'pg_restore','--exit-on-error','--no-owner','--no-acl','-U','arca_root','--role',`arca_${db.name}`,'-d',`arca_${db.name}`],{input:await readFile(join(source,db.file))});
  for(const [table,count] of Object.entries(db.counts||{})){
   if(!/^[A-Za-z_][A-Za-z0-9_]*$/.test(table))throw new Error('Invalid table name');
   const actual=Number(command(['exec',container,'psql','-U','arca_root','-d',`arca_${db.name}`,'-Atc',`SELECT count(*) FROM "${table}"`]).toString().trim());
   if(actual!==count)throw new Error(`Restored row count mismatch: ${db.name}.${table}`);
  }
  results.push({database:db.name,countsMatched:true});
 }
 for(const document of manifest.documents){
  const volume=`${container}-${document.name}`;
  command(['volume','create',volume]);
  command(['run','--rm','--network','none','--entrypoint','tar','--mount',`type=volume,source=${volume},target=/documents`,'--mount',`type=bind,source=${source},target=/backup,readonly`,manifest.image,'-C','/documents','-xf',`/backup/${document.file}`]);
  const hashes=command(['run','--rm','--network','none','--entrypoint','sh','--workdir','/documents','--mount',`type=volume,source=${volume},target=/documents,readonly`,manifest.image,'-c','find . -type f -exec sha256sum {} \\; | sort']).toString().trim();
  if(hashes!==document.fileHashes)throw new Error(`Restored PDF contents differ: ${document.name}`);
  results.push({documents:document.name,fileHashesMatched:true});
 }
 await writeFile(join(source,'restore-evidence.json'),JSON.stringify({verifiedAt:new Date().toISOString(),isolated:true,results},null,2)+'\n');
 console.log('PASS restore: five databases, row counts, private document archives and SHA-256 integrity. Original data untouched.');
}finally{
 // Exact generated names; only resources created by this restore check are removed.
 if(started)command(['rm','-f',container]);
 for(const volume of volumes){const exists=spawnSync('docker',['volume','inspect',volume],{stdio:'ignore'});if(exists.status===0)command(['volume','rm',volume]);}
}
