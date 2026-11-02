import {createRequire} from 'node:module';
import {randomBytes} from 'node:crypto';
import {mkdir,writeFile} from 'node:fs/promises';
import argon from 'argon2';
const require=createRequire(import.meta.url),db=new(require('../apps/identity-service/generated/client').PrismaClient)();
try{
 if(await db.user.count())throw new Error('Bootstrap ya realizado. No se modificaron cuentas.');
 const email=process.env.BOOTSTRAP_EMAIL;if(!email?.includes('@'))throw new Error('Configure BOOTSTRAP_EMAIL');
 const password=randomBytes(24).toString('base64url');
 await db.$transaction(async tx=>{await tx.$executeRaw`SELECT pg_advisory_xact_lock(93001)`;if(await tx.user.count())throw new Error('Bootstrap ya realizado');await tx.user.create({data:{email:email.toLowerCase(),passwordHash:await argon.hash(password,{type:argon.argon2id}),roles:['ADMIN','HR'],scopeAll:true,permissions:['users.manage','salary.read','salary.write','employee.ratify','contracts.issue']}})});
 await mkdir('.runtime',{recursive:true});await writeFile('.runtime/initial-access.txt',`ARCA RH · Acceso inicial local\nURL: http://localhost:5173\nCorreo: ${email}\nContraseña temporal: ${password}\nCambie la contraseña en Mi cuenta y elimine este archivo después.\n`,{flag:'wx',mode:0o600});
 console.log('Administrador creado. Credenciales en .runtime/initial-access.txt (excluido de Git).');
}catch(e){console.error(e.message);process.exitCode=1}finally{await db.$disconnect()}
