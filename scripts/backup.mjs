// Administrative snapshot: stop writers, dump each owned database and its private PDFs.
import {spawnSync} from 'node:child_process';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {resolve,join,dirname} from 'node:path';
import {createHash} from 'node:crypto';
const names=['identity','personnel','vacation','contract','payment'];
const output=resolve(process.argv[2]||`.runtime/backups/${new Date().toISOString().replaceAll(':','-')}`);
await mkdir(dirname(output),{recursive:true,mode:0o700});
await mkdir(output,{mode:0o700});
if(process.platform==='win32'){
 const account=`${process.env.USERDOMAIN}\\${process.env.USERNAME}`;
 const acl=spawnSync('icacls',[output,'/inheritance:r','/grant:r',`${account}:(OI)(CI)F`,'/grant:r','SYSTEM:(OI)(CI)F'],{stdio:'pipe'});
 if(acl.status!==0)throw new Error('Cannot restrict snapshot directory permissions');
}
function command(args,options={}){
 const r=spawnSync('docker',args,{maxBuffer:256*1024*1024,...options});
 if(r.status!==0)throw new Error(`Backup command failed: ${args[0]} ${args[1]||''}. ${r.stderr?.toString().slice(0,500)||''}`);
 return r.stdout;
}
const configuration=JSON.parse(command(['compose','config','--format','json']).toString());
const existing=command(['compose','ps','--services','--status','running']).toString().trim().split(/\r?\n/);
const running=names.map(n=>n+'-service').filter(n=>existing.includes(n));
const manifest={version:1,createdAt:new Date().toISOString(),image:'postgres:18-alpine@sha256:10a5c69a83035ab5239f5620d708520e8b28f5aa1f2b20143e6024532edadfb5',databases:[],documents:[]};
try{
 if(running.length)command(['compose','stop',...running]);
 for(const name of names){
  const file=`${name}.dump`;
  const bytes=command(['compose','exec','-T','postgres','pg_dump','--username','arca_root','--dbname',`arca_${name}`,'--format=custom','--no-owner','--no-acl']);
  await writeFile(join(output,file),bytes,{mode:0o600});
  const countSql="SELECT json_object_agg(tablename,n) FROM (SELECT t.tablename,(xpath('/row/c/text()',query_to_xml(format('SELECT count(*) c FROM %I',t.tablename),false,true,'')))[1]::text::bigint n FROM pg_tables t WHERE schemaname='public') q";
  const counts=JSON.parse(command(['compose','exec','-T','postgres','psql','-U','arca_root','-d',`arca_${name}`,'-Atc',countSql]).toString().trim()||'{}');
  manifest.databases.push({name,file,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),counts});
 }
 for(const name of ['contract','payment']){
  const file=`${name}-documents.tar`;
  command(['run','--rm','--network','none','--entrypoint','tar','--mount',`type=volume,source=${(configuration.volumes?.[`${name}-documents`]?.name||`${configuration.name}_${name}-documents`)},target=/documents,readonly`,'--mount',`type=bind,source=${output},target=/backup`,manifest.image,'-C','/documents','-cf',`/backup/${file}`,'.']);
  const bytes=await readFile(join(output,file));
  const fileHashes=command(['run','--rm','--network','none','--entrypoint','sh','--workdir','/documents','--mount',`type=volume,source=${(configuration.volumes?.[`${name}-documents`]?.name||`${configuration.name}_${name}-documents`)},target=/documents,readonly`,manifest.image,'-c','find . -type f -exec sha256sum {} \\; | sort']).toString().trim();
  manifest.documents.push({name,file,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),fileHashes});
 }
 await writeFile(join(output,'manifest.json'),JSON.stringify(manifest,null,2)+'\n',{mode:0o600});
 console.log(`Snapshot completo: ${output}. Cinco bases y dos volúmenes PDF; contiene datos privados.`);
}finally{
 if(running.length)command(['compose','start',...running]);
}
