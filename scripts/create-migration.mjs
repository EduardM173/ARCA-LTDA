import {spawnSync} from 'node:child_process';import{mkdirSync,writeFileSync}from'node:fs';
const[service,name]=process.argv.slice(2);if(!['identity','personnel','vacation','contract','payment'].includes(service)||!/^\d{14}_[a-z_]+$/.test(name||''))throw new Error('Invalid migration target');
const schema=`apps/${service}-service/prisma/schema.prisma`,folder=`apps/${service}-service/prisma/migrations/${name}`;
const r=spawnSync(process.execPath,['--env-file=.env','node_modules/prisma/build/index.js','migrate','diff','--from-schema-datasource',schema,'--to-schema-datamodel',schema,'--script'],{encoding:'utf8'});
if(r.status)throw new Error('Migration diff failed; no database changes applied');mkdirSync(folder,{recursive:true});writeFileSync(folder+'/migration.sql',r.stdout);console.log('Migration SQL generated: '+folder);
