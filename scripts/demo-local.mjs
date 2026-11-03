// Local academic fixture. Never run with a non-loopback database or in production.
import {createRequire} from 'node:module';
import {randomBytes} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {readFile,writeFile} from 'node:fs/promises';
import argon from 'argon2';
const require=createRequire(import.meta.url);
const identity=new (require('../apps/identity-service/generated/client').PrismaClient)();
const personnel=new (require('../apps/personnel-service/generated/client').PrismaClient)();
const file='README_DEMO_LOCAL.md',action=process.argv[2]||'verify';
const people=[
 ['Valeria Quispe Rojas','ADMIN'],['Mauricio Choque Flores','ADMIN'],
 ['Sofía Mamani Vargas','HR'],['Diego Huanca Rojas','HR'],['Andrea Poma Lima','HR'],['Lucas Paredes Flores','HR'],['Rocío Torres Vaca','HR'],['Celia Arias Roca','HR'],['Hernán Flores Condori','HR'],['Noelia Guzmán Siles','HR'],
 ['Gabriel Ticona Flores','APPROVER'],['Laura Condori Quispe','APPROVER'],['Fernanda Calle Ríos','APPROVER'],['David Salinas Vega','APPROVER'],['Teresa Arce Ribera','APPROVER'],['Omar Rivero Paz','APPROVER'],
 ['Carla Rojas Arce','FINANCE'],['Ricardo Flores Valdez','FINANCE'],['Paula Mendoza Salazar','FINANCE'],['Adrián Villarroel Soria','FINANCE'],['Mariana Castro Durán','FINANCE'],['Isaac López Peña','FINANCE'],
 ['Elena Vaca Soria','BOARD'],['Fernando Andrade Soliz','BOARD'],['Patricia López Montero','BOARD'],
 ['Rosa Vera Delgado','HR,APPROVER'],['Bruno Aguilar Rocha','HR,FINANCE'],['Marina Poma Torres','HR'],['Pablo Hinojosa Ríos','APPROVER'],['Sergio Zubieta Flores','HR']
];
const areas=['Recursos Humanos','Finanzas y Contabilidad','Operaciones','Tecnología','Atención al Cliente','Comercial','Cumplimiento y Riesgos','Administración'];
const jobs=['Auxiliar de RR. HH.','Analista de Personal','Especialista de Nómina','Supervisor de Operaciones','Jefe de Operaciones','Coordinador de Tecnología','Analista de Sistemas','Especialista de Soporte','Auxiliar Contable','Analista Financiero','Supervisor de Atención','Ejecutivo Comercial','Analista de Riesgos','Coordinador Administrativo','Gerente de Área','Auxiliar Administrativo'];
const positionByArea=[[0,1],[2,8,9],[3,4],[5,6,7],[10,15],[11,14],[12,14],[13,15]];
function safe(){if(process.env.NODE_ENV==='production'||process.env.DEMO_LOCAL_ENABLE!=='yes')throw Error('El entorno de demostración requiere DEMO_LOCAL_ENABLE=yes y desarrollo local');for(const key of ['IDENTITY_DATABASE_URL','PERSONNEL_DATABASE_URL']){const value=process.env[key];if(!value||!/^postgres(?:ql)?:\/\/[^@]+@(?:127\.0\.0\.1|localhost):55432\//.test(value))throw Error(key+' debe apuntar a 127.0.0.1:55432')} }
const email=i=>`demo${String(i+1).padStart(2,'0')}@demo.arca.test`;
const code=i=>`DEMO-ARCA-${String(i+1).padStart(3,'0')}`;
const permissions=roles=>[...(roles.includes('ADMIN')?['users.manage','salary.read','salary.write','employee.ratify','contracts.issue']:[]),...(roles.includes('FINANCE')?['payments.issue','payments.record']:[]),...(roles.includes('APPROVER')?['vacations.approve']:[])];
const names=['Quispe','Mamani','Choque','Condori','Huanca','Poma','Flores','Vargas','Rojas','Arce','Torres','Rivero'];
function protectCredentials(){if(process.platform!=='win32')return;const account=`${process.env.USERDOMAIN}\\${process.env.USERNAME}`;const result=spawnSync('icacls',[file,'/inheritance:r','/grant:r',`${account}:(F)`,'NT AUTHORITY\\SYSTEM:(F)','BUILTIN\\Administrators:(F)'],{encoding:'utf8'});if(result.status!==0)throw Error('No se pudo restringir el acceso local al archivo de credenciales')}
async function run(){safe();
 const existing=await readFile(file,'utf8').catch(()=>null);
 if(action==='seed'){
  if(!existing && (await identity.user.count({where:{email:{endsWith:'@demo.arca.test'}}})))throw Error('Existen cuentas demo sin archivo local de credenciales: no se regenerarán contraseñas ni se sobrescribirán usuarios');
  const lines=existing?.split('\n')||['# ARCA RH — Datos de prueba','', 'Solo para desarrollo local. Datos y remuneraciones sintéticos, sin validez institucional.','', '| Nº | Nombre | Correo | Contraseña | Roles | Ámbito | Estado | Prueba |','|---:|---|---|---|---|---|---|---|'];
  const departments=[];for(const area of areas)departments.push(await personnel.department.upsert({where:{name:`DEMO ARCA · ${area}`},create:{name:`DEMO ARCA · ${area}`},update:{}}));
  const positions=[];for(const job of jobs)positions.push(await personnel.position.upsert({where:{name:`DEMO ARCA · ${job}`},create:{name:`DEMO ARCA · ${job}`},update:{}}));
  const catalogFile='.runtime/demo-catalogs.json',catalogs={departments:departments.map(d=>d.id),positions:positions.map(p=>p.id)};
  const oldCatalogs=JSON.parse(await readFile(catalogFile,'utf8').catch(()=>'null'));
  if(oldCatalogs&&(JSON.stringify(oldCatalogs.departments)!==JSON.stringify(catalogs.departments)||JSON.stringify(oldCatalogs.positions)!==JSON.stringify(catalogs.positions)))throw Error('Catálogos demo distintos del inventario local; no se modificarán');
  if(!oldCatalogs)await writeFile(catalogFile,JSON.stringify(catalogs,null,2)+'\n',{mode:0o600});
  for(let i=0;i<people.length;i++){
   const [name,rolesText]=people[i],roles=rolesText.split(','),mail=email(i),scopeAll=roles.includes('ADMIN')||roles.includes('BOARD')||roles.includes('FINANCE')&&i<25;
   const departmentIds=scopeAll?[]:[departments[i%departments.length].id];
   const password=randomBytes(21).toString('base64url')+'aA1!';
   const user=await identity.user.findUnique({where:{email:mail}});
   if(user?.verifiedAt)await identity.user.update({where:{id:user.id},data:{verifiedAt:null}});
   if(!user){await identity.user.create({data:{email:mail,passwordHash:await argon.hash(password),roles,permissions:permissions(roles),scopeAll,departmentIds,verifiedAt:null,active:i!==29}});
    lines.push(`| ${i+1} | ${name} | ${mail} | ${password} | ${roles.join(', ')} | ${scopeAll?'Organización':departments[i%departments.length].name} | ${i===29?'Desactivada':'Activa'} | ${rolesText} |`);
    await writeFile(file,lines.join('\n')+'\n',{mode:0o600});
   }
  }
  for(let i=0;i<120;i++){
   const name=i<people.length?people[i][0]:`${['Ana','María','José','Luis','Carmen','Pedro','Elena','Raúl','Teresa','Mario'][i%10]} ${names[i%names.length]} ${names[(i+5)%names.length]}`;
   const year=i%9===0?2026:2013+(i%12),hiredAt=i===99?new Date(Date.UTC(2020,1,29)):i===115?new Date(Date.UTC(2020,10,15)):new Date(Date.UTC(year,Math.min(i%12,9),Math.min(20,1+i%25)));
   const candidatePositions=positionByArea[i%8],positionId=positions[candidatePositions[Math.floor(i/8)%candidatePositions.length]].id;
   const actor=(await identity.user.findUniqueOrThrow({where:{email:email(0)}})).id;
   const employee=await personnel.employee.findUnique({where:{code:code(i)}});if(employee){if(!oldCatalogs?.aligned){if(employee.hiredAt>new Date()||i===99&&employee.hiredAt.toISOString().slice(0,10)!=='2020-02-29'||i===115&&employee.hiredAt.toISOString().slice(0,10)!=='2020-11-15'){const corrected=i===99||i===115?hiredAt:new Date(Date.UTC(2026,9,Math.min(20,1+i%25)));await personnel.$transaction([personnel.employee.update({where:{id:employee.id},data:{hiredAt:corrected,ratifiedAt:i===99?new Date(Date.UTC(2020,3,15)):i===115?new Date(Date.UTC(2020,11,30)):null}}),personnel.salary.updateMany({where:{employeeId:employee.id,effectiveAt:employee.hiredAt},data:{effectiveAt:corrected}}),personnel.employmentPeriod.updateMany({where:{employeeId:employee.id,startsAt:employee.hiredAt},data:{startsAt:corrected}})])}else if(employee.ratifiedAt&&employee.ratifiedAt<employee.hiredAt){const corrected=new Date(employee.hiredAt.getTime()+45*86400000);await personnel.employee.update({where:{id:employee.id},data:{ratifiedAt:corrected>new Date()?null:corrected}})}if(employee.departmentId===departments[i%8].id&&employee.positionId!==positionId)await personnel.employee.update({where:{id:employee.id},data:{positionId}})}continue;}
   const inactive=i%17===0,proposedRatification=new Date(hiredAt.getTime()+45*86400000),ratified=i%11===0||proposedRatification>new Date()?null:proposedRatification;
   await personnel.employee.create({data:{code:code(i),name,document:`DEMO-DOC-${String(i+1).padStart(4,'0')}`,email:i<30?email(i):null,hiredAt,ratifiedAt:ratified,status:inactive?'BAJA':'ACTIVO',terminatedAt:inactive?new Date(Date.UTC(2026,9,1)):null,terminationReason:inactive?'Baja sintética de demostración':null,departmentId:departments[i%8].id,positionId,currency:'BOB',salaries:{create:{amount:(3500+(i%16)*370).toFixed(2),effectiveAt:hiredAt,actor}},periods:{create:{startsAt:hiredAt,endsAt:inactive?new Date(Date.UTC(2026,9,1)):null,actor}}}});
  }
  const ids=(await personnel.employee.findMany({where:{code:{startsWith:'DEMO-ARCA-'}},select:{id:true}})).map(e=>e.id);
  if(!oldCatalogs?.aligned)await writeFile(catalogFile,JSON.stringify({...catalogs,aligned:true},null,2)+'\n',{mode:0o600});
  await personnel.employmentEvent.deleteMany({where:{employeeId:{in:ids},action:'ALTA',data:{path:['source'],equals:'DEMO_ARCA_LOCAL'}}});
  if(!lines.some(x=>x.startsWith('## Uso local'))){lines.push('','## Uso local','','Inicie ARCA RH en http://localhost:5173, use cualquiera de los correos y contraseñas de la tabla y cierre sesión antes de alternar perfiles. Las cuentas no tienen correo entregable: la recuperación por SMTP no se aplica a estos perfiles ficticios.','', 'Con PostgreSQL publicado únicamente en 127.0.0.1:55432 mediante `compose.dev.yaml`, establezca `$env:DEMO_LOCAL_ENABLE="yes"` en PowerShell y ejecute `pnpm demo:seed` para completar datos faltantes o `pnpm demo:verify` para comprobarlos. `pnpm demo:reset` solo muestra el inventario; la eliminación exacta requiere `node --env-file=.env scripts/demo-reset.mjs --confirm=DELETE-DEMO-ARCA`. Conserve este archivo hasta completar la limpieza: las contraseñas no se pueden recuperar desde sus hashes.');await writeFile(file,lines.join('\n')+'\n',{mode:0o600})}
  const described=lines.map(line=>{const match=line.match(/^\| (\d+) \|/);if(!match)return line;const roles=people[Number(match[1])-1]?.[1].split(',')||[],abilities=[...(roles.includes('ADMIN')?['usuarios, catálogos, políticas y Personal']:[]),...(roles.includes('HR')?['funcionarios y solicitudes de vacaciones']:[]),...(roles.includes('APPROVER')?['aprobar o rechazar vacaciones según ámbito']:[]),...(roles.includes('FINANCE')?['boletas, conceptos y pagos simulados']:[]),...(roles.includes('BOARD')?['indicadores institucionales']:[])];const cells=line.split('|');cells[8]=' '+(Number(match[1])===30?'rechazo de inicio de sesión':abilities.join('; '))+' ';return cells.join('|')});
  await writeFile(file,described.map(line=>line.startsWith('Regeneración idempotente:')?'Con PostgreSQL publicado únicamente en 127.0.0.1:55432 mediante `compose.dev.yaml`, establezca `$env:DEMO_LOCAL_ENABLE="yes"` en PowerShell y ejecute `pnpm demo:seed` para completar datos faltantes o `pnpm demo:verify` para comprobarlos. `pnpm demo:reset` solo muestra el inventario; la eliminación exacta requiere `node --env-file=.env scripts/demo-reset.mjs --confirm=DELETE-DEMO-ARCA`. Conserve este archivo hasta completar la limpieza: las contraseñas no se pueden recuperar desde sus hashes.':line).join('\n').trimEnd()+'\n',{mode:0o600});
  protectCredentials();
  console.log('Datos locales de identidad, catálogos y Personal cargados.');
 }else if(action==='verify'){
  if(!existing)throw Error('Falta README_DEMO_LOCAL.md');const users=await identity.user.findMany({where:{email:{endsWith:'@demo.arca.test'}}});const employees=await personnel.employee.count({where:{code:{startsWith:'DEMO-ARCA-'}}});
  if(users.length!==30||employees!==120)throw Error(`Carga incompleta: ${users.length} cuentas, ${employees} funcionarios`);
  for(let i=0;i<30;i++){const user=users.find(u=>u.email===email(i));const line=existing.split('\n').find(l=>l.includes(`| ${email(i)} |`));if(!user||!line||!await argon.verify(user.passwordHash,line.split('|')[4].trim()))throw Error('Credencial local inválida: '+email(i));if(user.roles.slice().sort().join(',')!==people[i][1].split(',').sort().join(',')||user.active!==(i!==29)||user.verifiedAt)throw Error('Perfil demo inesperado: '+email(i));if(!user.scopeAll&&user.departmentIds.length!==1)throw Error('Ámbito demo inesperado: '+email(i));}
  if((await personnel.department.count({where:{name:{startsWith:'DEMO ARCA · '}}}))!==8||(await personnel.position.count({where:{name:{startsWith:'DEMO ARCA · '}}}))!==16)throw Error('Catálogos de demostración incompletos');
  const original=(await readFile('.runtime/initial-access.txt','utf8').catch(()=>'' )).match(/^Correo: (.+)$/m)?.[1];if(original){const administrator=await identity.user.findUnique({where:{email:original}});if(!administrator?.active||!administrator.roles.includes('ADMIN'))throw Error('Administrador original no disponible')}
  console.log('PASS: 30 cuentas, credenciales, perfiles y ámbitos; 8 áreas, 16 cargos y 120 funcionarios en PostgreSQL.');
 }else throw Error('Acción admitida: seed o verify');
}
try{await run()}finally{await identity.$disconnect();await personnel.$disconnect()}
