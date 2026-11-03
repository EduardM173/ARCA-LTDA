import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
import {spawnSync} from 'node:child_process';
import {unlink,mkdir,writeFile} from 'node:fs/promises';
import argon from 'argon2';
const require=createRequire(import.meta.url);
const clients=Object.fromEntries(['identity','personnel','vacation','contract','payment'].map(n=>[n,new (require(`../apps/${n}-service/generated/client`).PrismaClient)()]));
const run=randomUUID(),conceptIds=[],password=randomUUID()+'-Aa1!',users=[],employees=[],departments=[],positions=[],contracts=[],payments=[],templates=[],requests=[],policies=[],personnelPolicies=[];
const base=process.env.API_BASE||'http://localhost:3000/api/v1/';
async function request(path,method='GET',body,cookie='',expected=200){
 const suppliedRequestId=randomUUID();const res=await fetch(base+path,{method,headers:{'x-request-id':suppliedRequestId,origin:'http://localhost:5173','content-type':'application/json',cookie},body:body===undefined?undefined:JSON.stringify(body)});
 const data=res.headers.get('content-type')?.includes('application/json')?await res.json():Buffer.from(await res.arrayBuffer());
 assert.equal(res.status,expected,`${method} ${path}: ${JSON.stringify(data)}`);
 const requestId=res.headers.get('x-request-id');assert.match(requestId||'',/^[0-9a-f-]{36}$/i);assert.notEqual(requestId,suppliedRequestId,'Gateway must generate its own correlation ID');
 if(res.ok&&method==='POST'){
 let event;
 if(path==='auth/login')event=await clients.identity.audit.findFirst({where:{resource:data.id,action:'LOGIN_ACCEPTED'},orderBy:{createdAt:'desc'}});
 if(path==='employees')event=await clients.personnel.employmentEvent.findFirst({where:{employeeId:data.id,action:'ALTA'}});
 if(path==='vacations/requests')event=await clients.vacation.vacationAudit.findFirst({where:{resource:data.id,action:'REQUEST_CREATED'}});
 if(path==='contracts')event=await clients.contract.contractAudit.findFirst({where:{resourceId:data.id},orderBy:{createdAt:'desc'}});
 if(path==='payments')event=await clients.payment.paymentAudit.findFirst({where:{paymentId:data.id},orderBy:{createdAt:'desc'}});
 if(['auth/login','employees','vacations/requests','contracts','payments'].includes(path))assert.equal(event?.requestId,requestId,'Persisted audit must carry Gateway request ID: '+path);
 }
 return {data,res};
}
async function login(roles){const u=await clients.identity.user.create({data:{email:`test-${users.length}-${run}@example.invalid`,passwordHash:await argon.hash(password),roles,scopeAll:true,permissions:roles.includes('ADMIN')?['users.manage','salary.read','salary.write','employee.ratify','contracts.issue']:roles.includes('FINANCE')?['payments.issue','payments.record']:roles.includes('APPROVER')?['vacations.approve']:[]}});users.push(u.id);return (await request('auth/login','POST',{email:u.email,password},'',201)).res.headers.get('set-cookie').split(';')[0]}
const today=new Intl.DateTimeFormat('sv-SE',{timeZone:'America/La_Paz',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());let steps=0;const pass=s=>{console.log('PASS '+s);steps++};
try{
 const admin=await login(['ADMIN','HR']),approver=await login(['APPROVER']),finance=await login(['FINANCE']),board=await login(['BOARD']);
 await request('employees','GET',undefined,'',401);pass('sesión obligatoria');
 const d=(await request('departments','POST',{name:'SINTETICO '+run},admin,201)).data;departments.push(d.id);
 const p=(await request('positions','POST',{name:'SINTETICO '+run},admin,201)).data;positions.push(p.id);
 const input={code:'T-'+run,name:'Funcionario sintético de integración',hiredAt:'2025-01-01',departmentId:d.id,positionId:p.id,salary:'5000.10',currency:'BOB'};
 const e=(await request('employees','POST',input,admin,201)).data;employees.push(e.id);assert.equal(e.salaries[0].amount,'5000.1');
 await request('employees','POST',input,admin,409);pass('alta persistente y duplicados');
 await request('employees/'+e.id,'PATCH',{departmentId:d.id,positionId:p.id,effectiveAt:today,version:999},admin,409);
 await request('employees/'+e.id,'PATCH',{departmentId:d.id,positionId:p.id,effectiveAt:today,version:e.version,role:'ADMIN'},admin,422);pass('conflicto de versión y mass assignment');
 await request('employees?page=1&q=','GET',undefined,board,403);const summary=(await request('employees/summary','GET',undefined,board)).data;assert.ok(summary.total>=1);assert.equal(summary.items,undefined);
 await request('employees/'+e.id,'GET',undefined,board,403);await request('payments','GET',undefined,admin,403);pass('salarios ocultos en API y separación de Finanzas');
 await request('employees/'+e.id+'/ratification','POST',{date:'2025-02-01',meaning:'Ratificación sintética para pruebas, no política institucional',version:e.version},admin,201);
 const policy=(await request('vacations/policy','POST',{counting:'CALENDAR',carryover:true,holidays:[],reservePending:false,leapDay:'PENDING',cancelPending:true,cancelApproved:true,approval:true},admin,201)).data;policies.push(policy.id);
 const balance=(await request('vacations/balance/'+e.id,'GET',undefined,admin)).data;assert.ok(balance.available>=15);
 for(const [start,end] of [['2027-01-01','2027-01-10'],['2027-02-01','2027-02-10']]){const r=(await request('vacations/requests','POST',{employeeId:e.id,start,end},admin,201)).data;requests.push(r.id)}
 const results=await Promise.all(requests.map(id=>fetch(base+'vacations/requests/'+id+'/approve',{method:'POST',headers:{origin:'http://localhost:5173','content-type':'application/json',cookie:approver},body:'{}'})));assert.deepEqual(results.map(r=>r.status).sort(),[201,409]);pass('aprobación concurrente sin saldo negativo');
 const t=(await request('templates','POST',{name:'SINTETICO '+run,body:'Contrato de {{name}} ({{code}}). Ingreso {{hiredAt}}, salario {{salary}} {{currency}}, prueba de {{probationDays}} días.'},admin,201)).data;templates.push(t.id);
 await request('templates','POST',{name:'Ataque',body:'<script>fetch("https://example.com")</script>'},admin,400);
 const c=(await request('contracts','POST',{employeeId:e.id,templateId:t.id,probationDays:90},admin,201)).data;contracts.push(c.id);
 await request('contracts/'+c.id+'/issue','POST',{},admin,201);await request('contracts/'+c.id+'/issue','POST',{},admin,201);
 const pdf=(await request('contracts/'+c.id+'/pdf','GET',undefined,admin)).data;assert.equal(pdf.subarray(0,5).toString(),'%PDF-');await mkdir('.runtime/test-evidence',{recursive:true});await writeFile('.runtime/test-evidence/contract.pdf',pdf);
 await request('contracts/'+c.id+'/pdf','GET',undefined,board,403);pass('plantilla restringida, PDF real, emisión idempotente y descarga autorizada');
 const conceptA=(await request('payments/concepts','POST',{name:'Abono sintético '+run,type:'ABONO'},finance,201)).data;const conceptD=(await request('payments/concepts','POST',{name:'Descuento sintético '+run,type:'DESCUENTO'},finance,201)).data;
 conceptIds.push(conceptA.id,conceptD.id);
 const pay=(await request('payments','POST',{employeeId:e.id,period:today.slice(0,7),lines:[{concept:conceptA.name,type:'ABONO',amount:'0.20'},{concept:conceptD.name,type:'DESCUENTO',amount:'0.10'}]},finance,201)).data;payments.push(pay.id);assert.equal(pay.net,'5000.2');
 const issued=(await request('payments/'+pay.id+'/issue','POST',{},finance,201)).data;assert.equal(issued.status,'EMITIDO');
 await request('payments/'+pay.id+'/record-payment','POST',{date:today,reference:'SINTETICO '+run,evidence:'Referencia sintética de integración, no transferencia bancaria'},finance,201);
 const slip=(await request('payments/'+pay.id+'/pdf','GET',undefined,finance)).data;await writeFile('.runtime/test-evidence/payment.pdf',slip);pass('aritmética decimal y emisión distinta de pago');
 const old=await clients.personnel.employee.findUnique({where:{id:e.id}});await request('employees/'+e.id+'/salary','POST',{amount:'6000.00',effectiveAt:today,version:old.version},admin,201);assert.equal((await clients.contract.contract.findUnique({where:{id:c.id}})).snapshot.salary,'5000.10');pass('snapshot contractual inmutable ante cambio salarial');
 const personnelPolicy=(await request('employees/policy','POST',{allowRetroactiveSalary:true,allowReentry:false,reentryTenure:'RESET',compensationPoint:'START',approval:true},admin,201)).data;personnelPolicies.push(personnelPolicy.id);
 const salaryBefore=await clients.personnel.employee.findUniqueOrThrow({where:{id:e.id}});
 await request('employees/'+e.id+'/salary','POST',{amount:'5500.25',effectiveAt:'2025-06-01',version:salaryBefore.version},admin,400);
 const retroReason='Rectificación sintética autorizada para verificar historial';
 await request('employees/'+e.id+'/salary','POST',{amount:'5500.25',effectiveAt:'2025-06-01',version:salaryBefore.version,reason:retroReason},admin,201);
 const retroEvent=await clients.personnel.employmentEvent.findFirstOrThrow({where:{employeeId:e.id,action:'SALARIO'},orderBy:{createdAt:'desc'}});
 assert.equal(retroEvent.data.reason,retroReason);assert.equal(retroEvent.data.policyId,personnelPolicy.id);assert.equal(retroEvent.data.retroactive,true);
 assert.equal((await clients.personnel.salary.findUniqueOrThrow({where:{employeeId_effectiveAt:{employeeId:e.id,effectiveAt:new Date('2025-06-01')}}})).amount.toFixed(2),'5500.25');
 assert.equal((await clients.contract.contract.findUniqueOrThrow({where:{id:c.id}})).snapshot.salary,'5000.10');pass('salario retroactivo exige motivo y conserva historial y PDF previo');
 for(const rid of requests){const r=await clients.vacation.leaveRequest.findUnique({where:{id:rid}});if(r.status==='APROBADA')await request('vacations/requests/'+rid+'/cancel','POST',{reason:'Cancelación sintética antes de baja'},approver,201);else if(r.status==='PENDIENTE')await request('vacations/requests/'+rid+'/reject','POST',{reason:'Cierre sintético antes de baja'},approver,201)}
 const updated=await clients.personnel.employee.findUnique({where:{id:e.id}});await request('employees/'+e.id+'/termination','POST',{date:today,reason:'Baja sintética de integración',version:updated.version},admin,201);await request('contracts/'+c.id+'/pdf','GET',undefined,admin);pass('baja conserva documentos históricos');
 await request('users/'+users[3],'PATCH',{active:false},admin);await request('employees','GET',undefined,board,401);pass('sesión revocada después de bloquear usuario');
 if(!process.env.API_BASE||process.env.DIRECT_PERSONNEL_URL){const direct=await fetch((process.env.DIRECT_PERSONNEL_URL||'http://localhost:3002')+'/employees',{headers:{'X-User-Role':'ADMIN'}});assert.equal(direct.status,401)}
 const csrf=await fetch(base+'departments',{method:'POST',headers:{origin:'https://untrusted.invalid',cookie:admin,'content-type':'application/json'},body:'{"name":"CSRF"}'});assert.equal(csrf.status,403);pass('credencial interna y origen de escritura verificados');
 console.log(`${steps} comprobaciones de integración superadas.`);
}finally{
 await clients.vacation.movement.deleteMany({where:{employeeId:{in:employees}}});await clients.vacation.entitlement.deleteMany({where:{employeeId:{in:employees}}});await clients.vacation.vacationAudit.deleteMany({where:{actor:{in:users}}});await clients.vacation.outbox.deleteMany({where:{requestId:{in:requests}}});await clients.vacation.leaveRequest.deleteMany({where:{id:{in:requests}}});await clients.vacation.policy.deleteMany({where:{id:{in:policies}}});
 await clients.contract.contractAudit.deleteMany({where:{actorId:{in:users}}});await clients.contract.contract.deleteMany({where:{id:{in:contracts}}});await clients.contract.template.deleteMany({where:{id:{in:templates}}});await clients.payment.paymentAudit.deleteMany({where:{actor:{in:users}}});await clients.payment.payment.deleteMany({where:{id:{in:payments}}});await clients.payment.concept.deleteMany({where:{id:{in:conceptIds}}});
 await clients.personnel.employmentPeriod.deleteMany({where:{employeeId:{in:employees}}});await clients.personnel.employmentEvent.deleteMany({where:{employeeId:{in:employees}}});await clients.personnel.salary.deleteMany({where:{employeeId:{in:employees}}});await clients.personnel.employee.deleteMany({where:{id:{in:employees}}});await clients.personnel.personnelPolicy.deleteMany({where:{id:{in:personnelPolicies}}});await clients.personnel.department.deleteMany({where:{id:{in:departments}}});await clients.personnel.position.deleteMany({where:{id:{in:positions}}});
 await clients.identity.session.deleteMany({where:{userId:{in:users}}});await clients.identity.passwordReset.deleteMany({where:{userId:{in:users}}});await clients.identity.audit.deleteMany({where:{OR:[{actor:{in:users}},{resource:{in:users}}]}});await clients.identity.user.deleteMany({where:{id:{in:users}}});
 const cleanupErrors=[];
 try{
  if(process.env.DOCKER_FIXTURE_DOCUMENTS==='true'){
   for(const [service,ids] of [['contract',contracts],['payment',payments]]){
    if(!ids.length)continue;
    if(ids.some(id=>!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)))throw new Error('Invalid fixture PDF identifier');
    const code=`const{unlink}=require('node:fs/promises');const{join}=require('node:path');const ids=${JSON.stringify(ids)};(async()=>{for(const id of ids){try{await unlink(join('/app/.runtime/documents',process.env.SERVICE,id+'.pdf'))}catch(e){if(e.code!=='ENOENT')throw e}}})().catch(e=>{console.error('Fixture PDF cleanup failed: '+e.code);process.exitCode=1});`;
    const result=spawnSync('docker',['compose','exec','-T',service+'-service','node'],{input:code,encoding:'utf8'});
    if(result.status!==0)cleanupErrors.push(new Error('Container fixture PDF cleanup failed: '+service));
   }
  }else for(const id of [...contracts,...payments]){try{await unlink('.runtime/documents/local/'+id+'.pdf')}catch(error){if(error.code!=='ENOENT')cleanupErrors.push(error)}}
 for(const file of ['.runtime/test-evidence/contract.pdf','.runtime/test-evidence/payment.pdf']){try{await unlink(file)}catch(error){if(error.code!=='ENOENT')cleanupErrors.push(error)}}
 }finally{await Promise.all(Object.values(clients).map(c=>c.$disconnect()));}
 if(cleanupErrors.length)throw new AggregateError(cleanupErrors,'Fixture PDFs could not be fully cleaned');
}
