import {createRequire} from 'node:module';
import {randomUUID} from 'node:crypto';
import {mkdir,writeFile,unlink} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import argon from 'argon2';
const require=createRequire(import.meta.url),staff=new(require('../apps/personnel-service/generated/client').PrismaClient)(),identity=new(require('../apps/identity-service/generated/client').PrismaClient)();
const run=randomUUID(),password=randomUUID()+'-Aa1!',users=[],departments=[],positions=[],codes=['U-'+run,'R-'+run];
const inputFile='.runtime/personnel-ui-'+run+'.json';
let beforePolicies=[];
try{
 beforePolicies=(await staff.personnelPolicy.findMany({select:{id:true}})).map(p=>p.id);
 for(const roles of [['ADMIN','HR'],['HR']]){const u=await identity.user.create({data:{email:`ui-personnel-${users.length}-${run}@example.invalid`,passwordHash:await argon.hash(password),roles,permissions:roles.includes('ADMIN')?['users.manage','salary.read','salary.write','employee.ratify']:[],scopeAll:true,verifiedAt:new Date()}});users.push(u)}
 for(const label of ['A','B']){departments.push(await staff.department.create({data:{name:'UI '+label+' '+run}}));positions.push(await staff.position.create({data:{name:'UI '+label+' '+run}}))}
 await mkdir('.runtime',{recursive:true});await writeFile(inputFile,JSON.stringify({today:new Intl.DateTimeFormat('sv-SE',{timeZone:'America/La_Paz'}).format(new Date()),base:process.env.UI_URL||'http://localhost:5173',password,users:users.map(u=>({email:u.email})),departments,positions,codes,policyBefore:beforePolicies}),{mode:0o600});
 const python=process.env.USERPROFILE+'\\.codex\\tools\\selenium-env\\Scripts\\python.exe';
 const r=spawnSync(python,['tests/personnel-ui.py',inputFile],{stdio:'inherit'});if(r.status!==0)process.exitCode=r.status||1;
}finally{
 const employees=await staff.employee.findMany({where:{code:{in:codes}},select:{id:true}}),ids=employees.map(e=>e.id);
 await staff.employmentEvent.deleteMany({where:{employeeId:{in:ids}}});await staff.employmentPeriod.deleteMany({where:{employeeId:{in:ids}}});await staff.salary.deleteMany({where:{employeeId:{in:ids}}});await staff.employee.deleteMany({where:{id:{in:ids}}});
 // Delete only policies approved by this test's synthetic administrator, never other runs.
 await staff.personnelPolicy.deleteMany({where:{approvedBy:{in:users.map(u=>u.id)}}});
 await staff.department.deleteMany({where:{id:{in:departments.map(d=>d.id)}}});await staff.position.deleteMany({where:{id:{in:positions.map(p=>p.id)}}});
 await identity.session.deleteMany({where:{userId:{in:users.map(u=>u.id)}}});await identity.passwordReset.deleteMany({where:{userId:{in:users.map(u=>u.id)}}});await identity.emailVerification.deleteMany({where:{userId:{in:users.map(u=>u.id)}}});await identity.audit.deleteMany({where:{OR:[{actor:{in:users.map(u=>u.id)}},{resource:{in:users.map(u=>u.id)}}]}});await identity.user.deleteMany({where:{id:{in:users.map(u=>u.id)}}});
 await unlink(inputFile).catch(()=>{});await identity.$disconnect();await staff.$disconnect();
}
