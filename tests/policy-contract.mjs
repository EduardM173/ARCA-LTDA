import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';

const source=readFileSync('apps/web/src/api.ts','utf8');
const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const {api,ApiError}=await import('data:text/javascript,'+encodeURIComponent(js));
const originalFetch=globalThis.fetch;
try{
 globalThis.fetch=async()=>new Response(null,{status:204});
 assert.equal(await api('vacations/policy'),null);
 assert.equal(await api('contracts/policy'),null);
 globalThis.fetch=async()=>new Response('',{status:200});
 assert.equal(await api('vacations/policy'),null); // compatibilidad con la respuesta anterior
 await assert.rejects(api('users'),e=>e instanceof ApiError&&e.message.includes('vacía'));
 globalThis.fetch=async()=>new Response('texto inválido',{status:200});
 await assert.rejects(api('contracts/policy'),e=>e instanceof ApiError&&e.message.includes('inválida'));
 globalThis.fetch=async()=>new Response(JSON.stringify({message:'Acceso denegado'}),{status:403,headers:{'x-request-id':'contract-test'}});
 await assert.rejects(api('contracts/policy'),e=>e instanceof ApiError&&e.status===403&&e.requestId==='contract-test');
 globalThis.fetch=async()=>{throw new Error('offline')};
 await assert.rejects(api('vacations/policy'),e=>e instanceof ApiError&&e.message.includes('Servicio no disponible'));
}finally{globalThis.fetch=originalFetch}

const raw=readFileSync('.runtime/initial-access.txt','utf8');
const email=raw.match(/^Correo: (.+)$/m)?.[1],password=raw.match(/^Contraseña temporal: (.+)$/m)?.[1];
assert.ok(email&&password,'La cuenta local de comprobación debe existir');
const base='http://localhost:5173/api/v1/';
const login=await fetch(base+'auth/login',{method:'POST',headers:{origin:'http://localhost:5173','content-type':'application/json'},body:JSON.stringify({email,password})});
assert.equal(login.status,201);
const cookie=login.headers.get('set-cookie')?.split(';')[0];assert.ok(cookie);
for(const path of ['vacations/policy','contracts/policy','employees/policy']){
 const response=await fetch(base+path,{headers:{cookie}});
 assert.ok([200,204].includes(response.status),`${path}: ${response.status}`);
 assert.ok(response.headers.get('x-request-id'));
 if(response.status===204)assert.equal(await response.text(),'');
 else assert.ok((await response.json()).id);
}
console.log('Policy contract: empty/legacy/malformed/403/network/live PASS');
