import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';

const access=readFileSync('.runtime/initial-access.txt','utf8');
const email=access.match(/^Correo: (.+)$/m)?.[1],password=access.match(/^Contraseña temporal: (.+)$/m)?.[1];
assert.ok(email&&password);
const base='http://localhost:5173/api/v1/';
const login=await fetch(base+'auth/login',{method:'POST',headers:{origin:'http://localhost:5173','content-type':'application/json'},body:JSON.stringify({email,password})});
assert.equal(login.status,201);
const cookie=login.headers.get('set-cookie')?.split(';')[0];assert.ok(cookie);
const records=[];
try{
 for(const [path,table] of [['departments','Department'],['positions','Position']]){
  const name='ARCA TEST '+randomUUID().slice(0,12);
  const headers={origin:'http://localhost:5173',cookie,'content-type':'application/json'};
  const created=await fetch(base+path,{method:'POST',headers,body:JSON.stringify({name})});
  assert.equal(created.status,201,`${path}: alta`);
  const row=await created.json();assert.match(row.id,/^[0-9a-f-]{36}$/);records.push({id:row.id,table});
  const duplicate=await fetch(base+path,{method:'POST',headers,body:JSON.stringify({name:name.toLowerCase()})});
  assert.equal(duplicate.status,409,`${path}: duplicado sin distinguir mayúsculas`);
  console.log(path,'duplicate rejected');
 }
}finally{
 for(const {id,table} of records){
  const sql=`DELETE FROM "${table}" WHERE "id" = '${id}'::uuid;`;
  const result=spawnSync('docker',['compose','exec','-T','postgres','sh','-c','psql -U "$POSTGRES_USER" -d arca_personnel -v ON_ERROR_STOP=1'],{input:sql,encoding:'utf8'});
  assert.equal(result.status,0,`Limpieza exacta de ${table}: ${result.stderr}`);
  assert.match(result.stdout,/DELETE 1/);
 }
}
console.log('Catalog duplicate API and exact fixture cleanup PASS');
