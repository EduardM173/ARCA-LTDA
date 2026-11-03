import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const db=new(require('../apps/personnel-service/generated/client').PrismaClient)();
const rows=(await readFile('README_DEMO_LOCAL.md','utf8')).split('\n').filter(x=>/^\| \d+ \|/.test(x)).map(x=>{const c=x.split('|').map(s=>s.trim());return {email:c[3],password:c[4]}});
const base='http://127.0.0.1:3000/api/v1/';
async function fetchApi(path,method='GET',body,cookie=''){const r=await fetch(base+path,{method,headers:{origin:'http://localhost:5173','content-type':'application/json',cookie},body:body?JSON.stringify(body):undefined});return {status:r.status,data:r.headers.get('content-type')?.includes('json')?await r.json():null,r}}
async function login(i){const x=await fetchApi('auth/login','POST',rows[i]);assert.equal(x.status,201);return x.r.headers.get('set-cookie').split(';')[0]}
try{
 const hr=await login(2),finance=await login(16),board=await login(22);
 const listing=await fetchApi('employees?page=1',undefined,undefined,hr);assert.equal(listing.status,200);assert.ok(listing.data.items.length);const scope=listing.data.items[0].departmentId;assert.ok(listing.data.items.every(x=>x.departmentId===scope));
 const outside=await db.employee.findFirstOrThrow({where:{code:{startsWith:'DEMO-ARCA-'},departmentId:{not:scope}}});assert.equal((await fetchApi('employees/'+outside.id,'GET',undefined,hr)).status,403);
 const detail=await fetchApi('employees/'+listing.data.items[0].id,'GET',undefined,hr);assert.equal(detail.status,200);assert.equal(detail.data.salaries,undefined);assert.equal((await fetchApi('payments','GET',undefined,hr)).status,403);
 assert.equal((await fetchApi('payments?page=1','GET',undefined,finance)).status,200);assert.equal((await fetchApi('users?page=1','GET',undefined,finance)).status,403);
 assert.equal((await fetchApi('employees/summary','GET',undefined,board)).status,200);assert.equal((await fetchApi('employees?page=1','GET',undefined,board)).status,403);
 console.log('PASS demo permisos: ámbito HR, salario oculto, separación Finanzas y resumen Directorio');
}finally{await db.$disconnect()}
