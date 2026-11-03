import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {db} from '../apps/identity-service/src/db';
import {enqueue} from '../apps/identity-service/src/mail';

if(process.env.DEMO_LOCAL_ENABLE!=='yes'||process.env.NODE_ENV==='production')throw Error('Solo demostración local');
async function main(){
const user=await db.user.findUniqueOrThrow({where:{email:'demo01@demo.arca.test'}});
const key='demo-suppression:'+randomUUID();
const job=await enqueue(db,key,user.id,{kind:'VACATION',subject:'Supresión académica',text:'No enviar'});
try{
 let status='';for(let i=0;i<20;i++){const current=await db.mailDelivery.findUniqueOrThrow({where:{id:job.id}});status=current.status;if(status==='ERROR')break;await new Promise(resolve=>setTimeout(resolve,1000))}
 const result=await db.mailDelivery.findUniqueOrThrow({where:{id:job.id}});
 assert.equal(result.status,'ERROR');assert.equal(result.lastError,'DEMO_RECIPIENT_SUPPRESSED');assert.equal(result.acceptedAt,null);
 console.log('PASS correo demo: suprimido antes de SMTP real');
}finally{await db.mailDelivery.delete({where:{id:job.id}});await db.$disconnect()}
}
void main().catch(error=>{console.error(error.message);process.exitCode=1});
