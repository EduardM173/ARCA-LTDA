import{spawn,spawnSync}from'node:child_process';import{randomUUID}from'node:crypto';
const name='arca_identity_test_'+randomUUID().replaceAll('-',''),database=new URL(process.env.IDENTITY_DATABASE_URL);database.pathname='/'+name;
const env={...process.env,IDENTITY_DATABASE_URL:database.toString(),IDENTITY_TEST_URL:'http://localhost:3401/',IDENTITY_TEST_ISOLATED:'1',PORT:'3401'};
let service,created=false;
function sql(input){const r=spawnSync('docker',['compose','exec','-T','postgres','psql','-U','arca_root','-d','postgres','-v','ON_ERROR_STOP=1'],{input,encoding:'utf8'});if(r.status)throw new Error('Isolated identity database administration failed');}
async function run(args){return new Promise((resolve,reject)=>{const p=spawn(process.execPath,args,{env,stdio:'inherit'});p.on('error',reject);p.on('exit',code=>code===0?resolve():reject(new Error('Isolated identity command failed with exit '+code)))})}
try{
 sql(`CREATE DATABASE "${name}" OWNER arca_identity;\nREVOKE CONNECT ON DATABASE "${name}" FROM PUBLIC;\n`);created=true;
 await run(['node_modules/prisma/build/index.js','migrate','deploy','--schema','apps/identity-service/prisma/schema.prisma']);
 service=spawn(process.execPath,['--import','tsx','apps/identity-service/src/main.ts'],{env,stdio:['ignore','ignore','ignore']});
 let healthy=false;for(let n=0;n<30;n++){try{healthy=(await fetch('http://localhost:3401/health')).ok;if(healthy)break}catch{}await new Promise(r=>setTimeout(r,1000))}if(!healthy)throw new Error('Isolated identity service failed healthcheck');
 await run(['--import','tsx','tests/identity-workflow.ts',...(process.argv.includes('--smtp')?['--smtp']:[])]);
 console.log('PASS isolated identity service; operational users and database preserved');
}finally{
 if(service){service.kill();await new Promise(r=>{if(service.exitCode!==null)r();else{service.once('exit',r);setTimeout(r,3000)}})}
 if(created)sql(`DROP DATABASE "${name}" WITH (FORCE);\n`);
}
