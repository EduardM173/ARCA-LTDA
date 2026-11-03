import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {join} from 'node:path';
import {randomBytes,randomUUID} from 'node:crypto';

const access=readFileSync('.runtime/initial-access.txt','utf8');
const adminEmail=access.match(/^Correo: (.+)$/m)?.[1],adminPassword=access.match(/^Contraseña temporal: (.+)$/m)?.[1];
assert.ok(adminEmail&&adminPassword);
const base='http://localhost:5173/api/v1/';
const login=await fetch(base+'auth/login',{method:'POST',headers:{origin:'http://localhost:5173','content-type':'application/json'},body:JSON.stringify({email:adminEmail,password:adminPassword})});
assert.equal(login.status,201,'Admin login: '+login.status);
const cookie=login.headers.get('set-cookie')?.split(';')[0];assert.ok(cookie);
const email='arca-audit-'+randomUUID()+'@example.invalid',password=randomBytes(24).toString('base64url');
let userId;
try{
 const created=await fetch(base+'users',{method:'POST',headers:{origin:'http://localhost:5173',cookie,'content-type':'application/json'},body:JSON.stringify({email,password,roles:['FINANCE'],permissions:[],scopeAll:true,departmentIds:[]})});
 assert.equal(created.status,201,'Create finance fixture: '+created.status);
 userId=(await created.json()).id;assert.match(userId,/^[0-9a-f-]{36}$/);
 const python=join(process.env.USERPROFILE,'.codex','tools','selenium-env','Scripts','python.exe');
 const py=spawnSync(python,['tests/finance-audit-ui.py'],{env:{...process.env,ARCA_FIXTURE_EMAIL:email,ARCA_FIXTURE_PASSWORD:password},encoding:'utf8'});
 assert.equal(py.status,0,py.stdout+'\n'+py.stderr);
 console.log(py.stdout.trim());
}finally{
 if(userId){
  const id="'"+userId+"'::uuid",idText="'"+userId+"'";
  const sql=[
   'DELETE FROM "Session" WHERE "userId" = '+id+';',
   'DELETE FROM "PasswordReset" WHERE "userId" = '+id+';',
   'DELETE FROM "EmailVerification" WHERE "userId" = '+idText+';',
   'DELETE FROM "MailDelivery" WHERE "recipientId" = '+id+';',
   'DELETE FROM "Audit" WHERE "actor" = '+idText+' OR "resource" = '+idText+';',
   'DELETE FROM "User" WHERE "id" = '+id+';'
  ].join('\n');
  const cleaned=spawnSync('docker',['compose','exec','-T','postgres','sh','-c','psql -U "$POSTGRES_USER" -d arca_identity -v ON_ERROR_STOP=1'],{input:sql,encoding:'utf8'});
  assert.equal(cleaned.status,0,cleaned.stderr);
  assert.match(cleaned.stdout,/DELETE 1\s*$/);
  console.log('Finance fixture cleaned by exact ID');
 }
}
