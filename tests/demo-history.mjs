import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const row=(await readFile('README_DEMO_LOCAL.md','utf8')).split('\n').find(x=>x.startsWith('| 1 |')).split('|').map(x=>x.trim());
const base='http://127.0.0.1:3000/api/v1/';
const response=await fetch(base+'auth/login',{method:'POST',headers:{origin:'http://localhost:5173','content-type':'application/json'},body:JSON.stringify({email:row[3],password:row[4]})});assert.equal(response.status,201);const cookie=response.headers.get('set-cookie').split(';')[0];
async function get(path){const r=await fetch(base+path,{headers:{cookie}});assert.equal(r.status,200,path);return r.json()}
async function employee(code){const list=await get('employees?page=1&q='+code);const id=list.items.find(x=>x.code===code)?.id;assert.ok(id,code);return get('employees/'+id)}
const assigned=await employee('DEMO-ARCA-021');assert.ok(assigned.events.some(x=>x.action==='CAMBIO_ASIGNACION'&&x.data.after?.effectiveAt));
const salary=await employee('DEMO-ARCA-004');assert.ok(salary.events.some(x=>x.action==='SALARIO'&&x.data.retroactive===true&&x.data.reason));assert.ok(salary.salaries.some(x=>x.effectiveAt.startsWith('2025-01-01')&&Number(x.amount)===5850.75));
const leap=await employee('DEMO-ARCA-100');assert.ok(leap.hiredAt.startsWith('2020-02-29'));
const upcoming=await employee('DEMO-ARCA-116');assert.ok(upcoming.hiredAt.startsWith('2020-11-15'));
console.log('PASS historial demo API: asignación, salario retroactivo, 29/02 y próximo aniversario');
