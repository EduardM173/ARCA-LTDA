import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const row=(await readFile('README_DEMO_LOCAL.md','utf8')).split('\n').find(line=>line.startsWith('| 23 |')).split('|').map(x=>x.trim());
const base='http://127.0.0.1:3000/api/v1/';
const login=await fetch(base+'auth/login',{method:'POST',headers:{origin:'http://localhost:5173','content-type':'application/json'},body:JSON.stringify({email:row[3],password:row[4]})});assert.equal(login.status,201);const cookie=login.headers.get('set-cookie').split(';')[0];
for(const [path,count] of [['employees/summary',120],['vacations/summary',70],['contracts/summary',46],['payments/summary',81]]){const response=await fetch(base+path,{headers:{cookie}});assert.equal(response.status,200,path);assert.equal((await response.json()).total,count,path)}
console.log('PASS tras reinicio PostgreSQL: cuatro dominios conservan 120/70/46/81 registros y sesión Directorio válida');
