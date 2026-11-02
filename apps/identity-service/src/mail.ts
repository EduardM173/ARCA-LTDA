import nodemailer from 'nodemailer';
import {createCipheriv,createDecipheriv,randomBytes} from 'node:crypto';
import {BadRequestException} from '@nestjs/common';
import {db} from './db';
type Payload={kind:'VERIFY'|'RESET'|'VACATION';subject:string;text:string;departmentId?:string;requiredRole?:'APPROVER'};
function key(){const value=process.env.MAIL_ENCRYPTION_KEY;if(!value||!/^[0-9a-f]{64}$/i.test(value))throw new Error('MAIL_ENCRYPTION_KEY_MISSING');return Buffer.from(value,'hex')}
function encrypt(payload:Payload){const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key(),iv);const data=Buffer.concat([cipher.update(JSON.stringify(payload),'utf8'),cipher.final()]);return Buffer.concat([iv,cipher.getAuthTag(),data]).toString('base64')}
function decrypt(value:string):Payload{const b=Buffer.from(value,'base64'),cipher=createDecipheriv('aes-256-gcm',key(),b.subarray(0,12));cipher.setAuthTag(b.subarray(12,28));return JSON.parse(Buffer.concat([cipher.update(b.subarray(28)),cipher.final()]).toString())}
export function transport(){
 if(!['SMTP_HOST','SMTP_USER','SMTP_PASSWORD','SMTP_FROM'].every(k=>!!process.env[k]))throw new BadRequestException('SMTP_CONFIGURATION_MISSING');
 return nodemailer.createTransport({host:process.env.SMTP_HOST,port:Number(process.env.SMTP_PORT||587),secure:Number(process.env.SMTP_PORT)===465,requireTLS:true,auth:{user:process.env.SMTP_USER,pass:process.env.SMTP_PASSWORD},tls:{minVersion:'TLSv1.2'},connectionTimeout:10000,socketTimeout:15000,disableFileAccess:true,disableUrlAccess:true});
}
export async function enqueue(tx:any,keyValue:string,userId:string,payload:Payload){return tx.mailDelivery.upsert({where:{key:keyValue},update:{},create:{key:keyValue,recipientId:userId,encryptedPayload:encrypt(payload)}})}
let delivering=false;
export async function deliver(){
 if(delivering)return;delivering=true;
 try{await db.mailDelivery.updateMany({where:{status:'ENVIANDO',attempts:{gte:5},leaseUntil:{lt:new Date()}},data:{status:'ERROR',leaseUntil:null,lastError:'DELIVERY_LEASE_EXPIRED'}});const jobs=await db.mailDelivery.findMany({where:{status:{in:['PENDIENTE','ENVIANDO']},attempts:{lt:5},nextAttemptAt:{lte:new Date()},OR:[{leaseUntil:null},{leaseUntil:{lt:new Date()}}]},orderBy:{createdAt:'asc'},take:10});
 for(const job of jobs){
 const claim=await db.mailDelivery.updateMany({where:{id:job.id,attempts:job.attempts,OR:[{leaseUntil:null},{leaseUntil:{lt:new Date()}}]},data:{status:'ENVIANDO',leaseUntil:new Date(Date.now()+60000),attempts:{increment:1}}});if(!claim.count)continue;
 try{const recipient=await db.user.findUnique({where:{id:job.recipientId}}),payload=decrypt(job.encryptedPayload);
 if(!recipient?.active||payload.kind!=='VERIFY'&&!recipient.verifiedAt)throw new Error('RECIPIENT_NOT_VERIFIED');
 if(payload.kind==='VACATION'){if(!payload.departmentId||!recipient.scopeAll&&!recipient.departmentIds.includes(payload.departmentId))throw new Error('RECIPIENT_SCOPE_REVOKED');if(payload.requiredRole==='APPROVER'&&(!recipient.roles.includes('APPROVER')||!recipient.permissions.includes('vacations.approve')))throw new Error('RECIPIENT_PERMISSION_REVOKED');if(payload.requiredRole!=='APPROVER'&&!recipient.roles.some(r=>['ADMIN','HR','APPROVER'].includes(r)))throw new Error('RECIPIENT_PERMISSION_REVOKED')}
 const t=transport();try{const info=await t.sendMail({from:process.env.SMTP_FROM,to:recipient.email,messageId:`<${job.id}@arca-rh.local>`,subject:payload.subject,text:payload.text});if(!info.accepted?.length)throw new Error('SMTP_NOT_ACCEPTED')}finally{t.close()}
 await db.mailDelivery.update({where:{id:job.id},data:{status:'ACEPTADO_SMTP',acceptedAt:new Date(),leaseUntil:null,lastError:null,encryptedPayload:''}});
 }catch(error:any){const code=String(error.code||error.message||'SMTP_ERROR').replace(/[^A-Z0-9_]/g,'').slice(0,60);await db.mailDelivery.update({where:{id:job.id},data:{status:job.attempts+1>=5?'ERROR':'PENDIENTE',leaseUntil:null,lastError:code,nextAttemptAt:new Date(Date.now()+Math.min(3600000,30000*2**job.attempts))}})}
 }
 }finally{delivering=false}
}
export function startDelivery(){void deliver().catch(()=>{});setInterval(()=>void deliver().catch(()=>{}),10000).unref()}
