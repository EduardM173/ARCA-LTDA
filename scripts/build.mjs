import {spawnSync} from 'node:child_process';
import {mkdir,symlink,lstat} from 'node:fs/promises';
import {resolve} from 'node:path';
for(const args of [['node_modules/typescript/bin/tsc'],['node_modules/vite/bin/vite.js','build','--config','apps/web/vite.config.ts']]){
 const r=spawnSync(process.execPath,args,{stdio:'inherit'});if(r.status)process.exit(r.status);
}
for(const service of ['identity','personnel','vacation','contract','payment']){
 const target=resolve(`dist/apps/${service}-service/generated`);await mkdir(resolve(`dist/apps/${service}-service`),{recursive:true});
 if(!await lstat(target).catch(()=>null))await symlink(resolve(`apps/${service}-service/generated`),target,process.platform==='win32'?'junction':'dir');
}
