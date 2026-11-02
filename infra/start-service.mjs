import {spawn} from 'node:child_process';
const allowed=['identity-service','personnel-service','vacation-service','contract-service','payment-service','api-gateway'];
const service=process.env.SERVICE;
if(!allowed.includes(service))throw new Error('SERVICE is missing or invalid');
function run(args){return new Promise((resolve,reject)=>{const child=spawn(process.execPath,args,{stdio:'inherit'});child.on('error',reject);child.on('exit',code=>code===0?resolve():reject(new Error(`Service setup exited ${code}`)))});}
if(service!=='api-gateway')await run(['node_modules/prisma/build/index.js','migrate','deploy','--schema',`apps/${service}/prisma/schema.prisma`]);
const child=spawn(process.execPath,[`dist/apps/${service}/src/main.js`],{stdio:'inherit'});
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>child.kill(signal));
child.on('exit',code=>process.exit(code??1));child.on('error',()=>process.exit(1));
