import {createRequire} from 'node:module';
import {randomUUID} from 'node:crypto';
import {mkdir,readFile,writeFile,unlink} from 'node:fs/promises';
import argon from 'argon2';
const require=createRequire(import.meta.url),identity=new(require('../apps/identity-service/generated/client').PrismaClient)(),personnel=new(require('../apps/personnel-service/generated/client').PrismaClient)();
const file='.runtime/administration-ui-fixture.json';
try{
 if(process.argv[2]==='verify'){
  const f=JSON.parse(await readFile(file,'utf8'));const created=await identity.user.findUniqueOrThrow({where:{email:f.createdEmail}}),admin=await identity.user.findUniqueOrThrow({where:{email:f.email}}),area=await personnel.department.findUniqueOrThrow({where:{name:f.catalogRenamed}});
  if(!created.roles.includes('APPROVER')||!created.permissions.includes('vacations.approve')||created.scopeAll||created.departmentIds.length!==1||created.departmentIds[0]!==f.departmentId||!created.active||area.active||!await argon.verify(admin.passwordHash,f.changedPassword))throw new Error('UI data persistence check failed');
  console.log('PASS administration UI data persisted in identity/personnel databases');
 }else if(process.argv[2]==='cleanup'){
  const f=JSON.parse(await readFile(file,'utf8'));const users=await identity.user.findMany({where:{email:{in:[f.email,f.createdEmail]}},select:{id:true}}),ids=users.map(u=>u.id);
  await identity.session.deleteMany({where:{userId:{in:ids}}});await identity.passwordReset.deleteMany({where:{userId:{in:ids}}});await identity.emailVerification.deleteMany({where:{userId:{in:ids}}});await identity.mailDelivery.deleteMany({where:{recipientId:{in:ids}}});await identity.audit.deleteMany({where:{OR:[{actor:{in:ids}},{resource:{in:ids}}]}});await identity.user.deleteMany({where:{id:{in:ids}}});
  await personnel.department.deleteMany({where:{name:{in:[f.departmentName,f.catalogName,f.catalogRenamed]}}});await unlink(file);console.log('PASS administration UI fixture cleaned');
 }else{
  const key=randomUUID(),password=randomUUID()+'-Aa1!',email=`admin-ui-${key}@example.invalid`,createdEmail=`created-ui-${key}@example.invalid`,departmentName='ADMIN UI '+key;
  const department=await personnel.department.create({data:{name:departmentName}});
  const u=await identity.user.create({data:{email,passwordHash:await argon.hash(password),roles:['ADMIN','HR'],permissions:['users.manage'],scopeAll:true,departmentIds:[]}});
  await mkdir('.runtime',{recursive:true});await writeFile(file,JSON.stringify({userId:u.id,email,password,createdEmail,createdPassword:randomUUID()+'-Bb2!',changedPassword:randomUUID()+'-Cc3!',departmentId:department.id,departmentName,catalogName:'UI AREA '+key,catalogRenamed:'UI RENAMED '+key}),{mode:0o600,flag:'wx'});console.log('PASS administration UI fixture prepared (private local file)');
 }
}finally{await identity.$disconnect();await personnel.$disconnect()}
