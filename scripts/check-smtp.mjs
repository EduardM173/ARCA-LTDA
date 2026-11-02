import nodemailer from 'nodemailer';
import {writeFile,mkdir} from 'node:fs/promises';
const required=['SMTP_HOST','SMTP_PORT','SMTP_USER','SMTP_PASSWORD','SMTP_FROM'];
const configured=required.every(k=>!!process.env[k]);
const result={configured,tlsVerified:false,authenticated:false,accepted:false,received:false,checkedAt:new Date().toISOString()};
try{
 if(!configured)throw new Error('SMTP_CONFIGURATION_MISSING');
 const transport=nodemailer.createTransport({host:process.env.SMTP_HOST,port:Number(process.env.SMTP_PORT),secure:Number(process.env.SMTP_PORT)===465,requireTLS:true,auth:{user:process.env.SMTP_USER,pass:process.env.SMTP_PASSWORD},tls:{minVersion:'TLSv1.2'},connectionTimeout:15000,socketTimeout:20000,disableFileAccess:true,disableUrlAccess:true});
 await transport.verify();result.tlsVerified=true;result.authenticated=true;
 if(process.argv.includes('--send')){
 const to=process.env.BOOTSTRAP_EMAIL;if(!to)throw new Error('CONTROLLED_RECIPIENT_MISSING');
 const info=await transport.sendMail({from:process.env.SMTP_FROM,to,subject:'ARCA RH · comprobación de correo transaccional',text:'Esta es una prueba real del transporte SMTP de ARCA RH. No contiene contraseñas ni datos de funcionarios. Confirme la recepción en el chat del proyecto.'});
 result.accepted=info.accepted?.length===1;
 }
 transport.close();
}catch(error){result.error=String(error.code||error.message).replace(/[^A-Z0-9_]/g,'').slice(0,80);process.exitCode=1}
await mkdir('.runtime',{recursive:true});await writeFile('.runtime/smtp-evidence.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
