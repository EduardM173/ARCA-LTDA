import {spawn} from 'node:child_process';
const children=['identity-service','personnel-service','vacation-service','contract-service','payment-service','api-gateway'].map(name=>spawn(process.execPath,['--env-file=.env','--import','tsx',`apps/${name}/src/main.ts`],{stdio:'inherit'}));
children.push(spawn(process.execPath,['node_modules/vite/bin/vite.js','--config','apps/web/vite.config.ts'],{stdio:'inherit'}));
const stop=()=>children.forEach(p=>p.kill());
process.on('SIGINT',stop);process.on('SIGTERM',stop);
children.forEach(p=>p.on('exit',code=>{if(code)stop()}));
