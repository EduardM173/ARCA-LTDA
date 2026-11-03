import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomBytes,randomUUID} from 'node:crypto';
import {spawnSync} from 'node:child_process';
const row=(await readFile('README_DEMO_LOCAL.md','utf8')).split('\n').find(x=>x.startsWith('| 1 |')).split('|').map(x=>x.trim());
const base='http://127.0.0.1:3000/api/v1/';
async function request(path,method='GET',body,cookie=''){const r=await fetch(base+path,{method,headers:{origin:'http://localhost:5173','content-type':'application/json',cookie},body:body?JSON.stringify(body):undefined});const data=await r.json();assert.ok(r.ok,`${method} ${path}: ${r.status}`);return {data,r}}
const login=await request('auth/login','POST',{email:row[3],password:row[4]}),cookie=login.r.headers.get('set-cookie').split(';')[0];
const department=(await request('departments','GET',undefined,cookie)).data.find(x=>x.name==='DEMO ARCA · Recursos Humanos');assert.ok(department);
let id;
try{
 const created=await request('users','POST',{email:`audit-${randomUUID()}@demo.arca.test`,password:randomBytes(20).toString('base64url')+'Aa1!',roles:['HR'],permissions:[],scopeAll:false,departmentIds:[department.id]},cookie);id=created.data.id;
 await request('users/'+id,'PATCH',{active:false},cookie);
 for(const action of ['USER_CREATED','USER_UPDATED']){const result=await request('users/audit?page=1&action='+action,'GET',undefined,cookie);assert.ok(result.data.items.some(x=>x.resource===id),action)}
 console.log('PASS auditoría demo: creación y modificación reales de usuario por API');
}finally{
 if(id){assert.match(id,/^[0-9a-f-]{36}$/i);const code=`const P=require('./apps/identity-service/generated/client');const d=new P.PrismaClient(),id='${id}';(async()=>{await d.mailDelivery.deleteMany({where:{recipientId:id}});await d.emailVerification.deleteMany({where:{userId:id}});await d.passwordReset.deleteMany({where:{userId:id}});await d.session.deleteMany({where:{userId:id}});await d.user.delete({where:{id}})})().catch(()=>process.exitCode=1).finally(()=>d.$disconnect())`;const result=spawnSync('docker',['compose','exec','-T','identity-service','node'],{input:code,encoding:'utf8'});if(result.status!==0)throw Error('La cuenta temporal de auditoría requiere limpieza por ID '+id)}
}
