import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const access=readFileSync('.runtime/initial-access.txt','utf8');
const email=access.match(/^Correo: (.+)$/m)?.[1];
const password=access.match(/^Contraseña temporal: (.+)$/m)?.[1];
assert.ok(email&&password,'Falta el acceso inicial local');
const base='http://localhost:5173/api/v1/';
const login=await fetch(base+'auth/login',{method:'POST',headers:{origin:'http://localhost:5173','content-type':'application/json'},body:JSON.stringify({email,password})});
assert.equal(login.status,201);
const cookie=login.headers.get('set-cookie')?.split(';')[0];assert.ok(cookie);
const profile=await login.json();assert.ok(profile.id);
for(const domain of ['users','employees','vacations','contracts']){
 const response=await fetch(base+domain+'/audit?page=1',{headers:{cookie}});
 assert.equal(response.status,200,`${domain}: ${response.status}`);
 const result=await response.json();
 assert.equal(result.page,1);assert.equal(typeof result.total,'number');assert.ok(Array.isArray(result.items));
 assert.ok(result.items.length<=25);assert.ok(response.headers.get('x-request-id'));
 console.log(domain,'audits',result.total);
 const filtered=await fetch(base+domain+'/audit?page=1&actor='+profile.id+'&from=2026-01-01&to=2026-12-31',{headers:{cookie}});
 assert.equal(filtered.status,200,`${domain}: filtros`);
 const selection=await filtered.json();assert.ok(selection.items.every(item=>(item.actor||item.actorId)===profile.id));
}
const denied=await fetch(base+'payments/audit?page=1',{headers:{cookie}});
assert.equal(denied.status,403,'El administrador sin FINANCE no debe consultar auditoría financiera');
const invalid=await fetch(base+'users/audit?page=0',{headers:{cookie}});
assert.equal(invalid.status,422);
console.log('Audit reads and authorization PASS');
