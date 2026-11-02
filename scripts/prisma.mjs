import { spawnSync } from 'node:child_process';
const services=['identity','personnel','vacation','contract','payment'];
for(const service of services){
 const r=spawnSync(process.execPath,['--env-file=.env','node_modules/prisma/build/index.js',...process.argv.slice(2),'--schema',`apps/${service}-service/prisma/schema.prisma`],{stdio:'inherit'});
 if(r.status!==0) process.exit(r.status??1);
}
