import {PrismaClient} from '../apps/identity-service/generated/client';
import * as argon from 'argon2';import {createInterface} from 'node:readline/promises';
const db=new PrismaClient();const rl=createInterface({input:process.stdin,output:process.stdout});
async function main(){
 if(await db.user.count())throw new Error('Bootstrap ya realizado');
 const email=await rl.question('Correo del primer administrador: ');
 if(!email.includes('@'))throw new Error('Correo inválido');
 // Password supplied via a process environment variable, never a command-line argument.
 const password=process.env.BOOTSTRAP_PASSWORD;
 if(!password||password.length<12)throw new Error('Configure BOOTSTRAP_PASSWORD (mínimo 12 caracteres) solo para este proceso');
 await db.$transaction(async tx=>{await tx.$executeRaw`SELECT pg_advisory_xact_lock(93001)`;if(await tx.user.count())throw new Error('Bootstrap ya realizado');await tx.user.create({data:{email:email.toLowerCase(),passwordHash:await argon.hash(password,{type:argon.argon2id}),roles:['ADMIN','HR'],scopeAll:true,permissions:['users.manage','salary.read','salary.write','employee.ratify','contracts.issue']}})});
 console.log('Administrador creado. Las cuentas de Finanzas y Aprobación se conceden explícitamente.');
}
main().catch(()=>{console.error('No se pudo crear el administrador. Compruebe el estado de bootstrap y la configuración.');process.exitCode=1}).finally(async()=>{rl.close();await db.$disconnect()});
