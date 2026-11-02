import assert from 'node:assert/strict';
import {randomBytes,randomUUID,createHash,createDecipheriv,createCipheriv} from 'node:crypto';
import {SignJWT} from 'jose';
import argon from 'argon2';
import {PrismaClient} from '../apps/identity-service/generated/client';
import {token} from '../packages/platform/src/http';
const db=new PrismaClient(),run=randomUUID(),ids:string[]=[],hash=(s:string)=>createHash('sha256').update(s).digest('hex');
const base=process.env.IDENTITY_TEST_URL||'http://localhost:3001/';
const password=randomBytes(24).toString('base64url'),nextPassword=randomBytes(24).toString('base64url');
type Actor={id:string;roles:string[];permissions:string[];scopeAll:boolean};
async function request(path:string,method='GET',body?:unknown,actor?:Actor,cookie='',expected=200){
 const r=await fetch(base+path,{method,headers:{authorization:'Bearer '+await token('gateway','identity',actor),'content-type':'application/json',cookie,'x-client-ip':'identity-test-'+run},body:body===undefined?undefined:JSON.stringify(body)});
 const data=await r.json();assert.equal(r.status,expected,`${method} ${path}: expected ${expected}, got ${r.status}`);return{r,data};
}
async function create(roles:string[],permissions:string[],email?:string){const u=await db.user.create({data:{email:email||`identity-${ids.length}-${run}@example.invalid`,passwordHash:await argon.hash(password),roles,permissions,scopeAll:true,verifiedAt:new Date()}});ids.push(u.id);return{id:u.id,roles,permissions,scopeAll:true}}
async function login(email:string,pw=password){const{r,data}=await request('auth/login','POST',{email,password:pw},undefined,'',201);return{cookie:r.headers.get('set-cookie')!.split(';')[0],actor:data as Actor}}
function decrypt(value:string){const b=Buffer.from(value,'base64'),d=createDecipheriv('aes-256-gcm',Buffer.from(process.env.MAIL_ENCRYPTION_KEY!,'hex'),b.subarray(0,12));d.setAuthTag(b.subarray(12,28));return JSON.parse(Buffer.concat([d.update(b.subarray(28)),d.final()]).toString())}
let groups=0;const pass=(label:string)=>{groups++;console.log('PASS '+label)};
async function main(){try{
 if(process.env.IDENTITY_TEST_ISOLATED==='1')assert.equal(await db.user.count(),0,'Last-administrator tests require an empty isolated identity database');
 const admin=await create(['ADMIN'],['users.manage']),target=await create(['HR'],[]),targetUser=await db.user.findUniqueOrThrow({where:{id:target.id}});
 const session=await login(targetUser.email);assert.equal((await request('auth/me','GET',undefined,undefined,session.cookie)).data.id,target.id);
 await request('users','GET',undefined,{...admin,permissions:[]},'',403);await request('users/'+admin.id,'PATCH',{permissions:['users.manage']},admin,'',409);
 const forged=await new SignJWT({actor:admin}).setProtectedHeader({alg:'HS256'}).setIssuer('gateway').setAudience('identity').setExpirationTime('30s').sign(new TextEncoder().encode(process.env.GATEWAY_KEY||randomBytes(48).toString('hex')));
 assert.equal((await fetch(base+'users',{headers:{authorization:'Bearer '+forged}})).status,401);pass('Ed25519 gateway assertion, grants and self-grant denial');
 const oldReset=randomBytes(32).toString('base64url');await db.passwordReset.create({data:{id:hash(oldReset),userId:target.id,expiresAt:new Date(Date.now()+600000)}});
 const results=await Promise.all([1,2].map(async()=>{const r=await fetch(base+'auth/change-password',{method:'POST',headers:{authorization:'Bearer '+await token('gateway','identity',target),'content-type':'application/json'},body:JSON.stringify({currentPassword:password,password:nextPassword})});return r.status}));
 assert.equal(results.filter(s=>s===201).length,1);assert.ok(results.some(s=>[401,409].includes(s)));await request('auth/me','GET',undefined,undefined,session.cookie,401);
 await request('auth/reset-password','POST',{token:oldReset,password},undefined,'',400);pass('concurrent password change, session revocation and old reset invalidation');
 const current=await login(targetUser.email,nextPassword),expired=randomBytes(32).toString('base64url'),valid=randomBytes(32).toString('base64url');
 await db.passwordReset.createMany({data:[{id:hash(expired),userId:target.id,expiresAt:new Date(Date.now()-1000)},{id:hash(valid),userId:target.id,expiresAt:new Date(Date.now()+600000)}]});
 await request('auth/reset-password','POST',{token:expired,password},undefined,'',400);
 await request('auth/reset-password','POST',{token:valid,password},undefined,'',201);await request('auth/reset-password','POST',{token:valid,password},undefined,'',400);await request('auth/me','GET',undefined,undefined,current.cookie,401);pass('reset expiration, single use and session revocation');
 const frozen=await login(targetUser.email);await request('users/'+target.id,'PATCH',{active:false},admin);await request('auth/me','GET',undefined,undefined,frozen.cookie,401);pass('blocking account revokes its session');
 const revoked=await create(['APPROVER'],['vacations.approve']);const departmentId=randomUUID();await db.user.update({where:{id:revoked.id},data:{scopeAll:false,departmentIds:[]}});
 const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',Buffer.from(process.env.MAIL_ENCRYPTION_KEY!,'hex'),iv),bytes=Buffer.concat([cipher.update(JSON.stringify({kind:'VACATION',departmentId,requiredRole:'APPROVER',subject:'Not to be sent',text:'Synthetic permission revocation test'}),'utf8'),cipher.final()]);
 const deniedMail=await db.mailDelivery.create({data:{key:'revoked:'+run,recipientId:revoked.id,encryptedPayload:Buffer.concat([iv,cipher.getAuthTag(),bytes]).toString('base64')}});
 const expiredLease=await db.mailDelivery.create({data:{key:'lease:'+run,recipientId:revoked.id,encryptedPayload:'',status:'ENVIANDO',attempts:5,leaseUntil:new Date(Date.now()-1000)}});
 for(let n=0;n<20;n++){const rows=await db.mailDelivery.findMany({where:{id:{in:[deniedMail.id,expiredLease.id]}}});if(rows.find(m=>m.id===deniedMail.id)?.lastError==='RECIPIENT_SCOPE_REVOKED'&&rows.find(m=>m.id===expiredLease.id)?.status==='ERROR')break;await new Promise(r=>setTimeout(r,1000))}
 assert.equal((await db.mailDelivery.findUniqueOrThrow({where:{id:deniedMail.id}})).lastError,'RECIPIENT_SCOPE_REVOKED');assert.equal((await db.mailDelivery.findUniqueOrThrow({where:{id:expiredLease.id}})).status,'ERROR');pass('mail lease recovery and revoked scope denied before SMTP');
 if(process.env.IDENTITY_TEST_ISOLATED==='1'){
  const second=await create(['ADMIN'],['users.manage']);const statuses=await Promise.all([admin.id,second.id].map(async id=>(await fetch(base+'users/'+id,{method:'PATCH',headers:{authorization:'Bearer '+await token('gateway','identity',admin),'content-type':'application/json'},body:JSON.stringify({active:false})})).status));
  assert.deepEqual(statuses.sort(),[200,409]);assert.equal(await db.user.count({where:{active:true,roles:{has:'ADMIN'},permissions:{has:'users.manage'}}}),1);pass('last active administrator protected under concurrent changes');
 }
 if(process.argv.includes('--smtp')){
  const controlled=process.env.BOOTSTRAP_EMAIL||'';assert.match(controlled,/^[^@]+@gmail\.com$/i);const email=controlled.replace('@',`+arca-test-${run.slice(0,8)}@`),mailActor=await create(['HR'],[],email);await db.user.update({where:{id:mailActor.id},data:{verifiedAt:null}});
  await request('auth/request-verification','POST',{},mailActor,'',201);
  const verification=await db.mailDelivery.findFirstOrThrow({where:{recipientId:mailActor.id},orderBy:{createdAt:'desc'}});assert.ok(verification.encryptedPayload,'Capture encrypted payload before acceptance clears it');const payload=decrypt(verification.encryptedPayload),raw=new URL(payload.text.match(/https?:\/\/\S+/)[0]).searchParams.get('verify');
  await request('auth/verify-email','POST',{token:raw},undefined,'',201);await request('auth/verify-email','POST',{token:raw},undefined,'',400);
  await request('auth/forgot-password','POST',{email},undefined,'',201);const reset=await db.mailDelivery.findFirstOrThrow({where:{recipientId:mailActor.id,key:{startsWith:'reset:'}},orderBy:{createdAt:'desc'}});const resetPayload=decrypt(reset.encryptedPayload),resetRaw=new URL(resetPayload.text.match(/https?:\/\/\S+/)[0]).searchParams.get('reset');
  await request('auth/reset-password','POST',{token:resetRaw,password:nextPassword},undefined,'',201);
  for(let i=0;i<30;i++){const jobs=await db.mailDelivery.findMany({where:{id:{in:[verification.id,reset.id]}}});if(jobs.every(m=>m.status==='ACEPTADO_SMTP'))break;await new Promise(resolve=>setTimeout(resolve,1000))}
  assert.equal(await db.mailDelivery.count({where:{id:{in:[verification.id,reset.id]},status:'ACEPTADO_SMTP'}}),2);pass('real SMTP verification and password reset accepted; mailbox receipt remains separate evidence');
 }
 console.log(`${groups} identity groups passed`);
}finally{
 await db.mailDelivery.deleteMany({where:{recipientId:{in:ids}}});await db.emailVerification.deleteMany({where:{userId:{in:ids}}});await db.session.deleteMany({where:{userId:{in:ids}}});await db.passwordReset.deleteMany({where:{userId:{in:ids}}});await db.audit.deleteMany({where:{OR:[{actor:{in:ids}},{resource:{in:ids}}]}});await db.user.deleteMany({where:{id:{in:ids}}});await db.$disconnect();
}

}
void main().catch(error=>{console.error(error);process.exitCode=1});
