import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
import {randomUUID} from 'node:crypto';
import {mkdir,writeFile,readFile,unlink} from 'node:fs/promises';
import {resolve} from 'node:path';
import {SignJWT,importPKCS8} from 'jose';

const require=createRequire(import.meta.url);
const contracts=new(require('../apps/contract-service/generated/client').PrismaClient)();
const personnel=new(require('../apps/personnel-service/generated/client').PrismaClient)();
const actor={id:randomUUID(),roles:['ADMIN','HR'],permissions:['contracts.issue'],scopeAll:true,departmentIds:[]};
const ids=[],templates=[],policies=[],children=[];
let employee,department,position;
const documents=resolve('.runtime/contracts-test-documents'),blocked=resolve('.runtime/contracts-test-blocked');
function child(path,port,extra={}){const p=spawn(process.execPath,['--env-file=.env','--import','tsx',path],{env:{...process.env,PORT:String(port),CONTRACT_PORT:String(port),PERSONNEL_URL:'http://localhost:3102',DOCUMENTS_DIR:documents,...extra},stdio:['ignore','pipe','pipe']});let logs='';p.stdout.on('data',b=>{logs+=b});p.stderr.on('data',b=>{logs+=b});children.push(p);return{p,logs:()=>logs}}
async function ready(port,p){for(let i=0;i<100;i++){if(p.p.exitCode!==null)throw new Error('Service exited: '+p.logs());try{const r=await fetch(`http://localhost:${port}/health`);if(r.ok)return}catch{}await new Promise(r=>setTimeout(r,100))}throw new Error('Service did not become healthy: '+p.logs())}
async function token(a=actor){const key=await importPKCS8(Buffer.from(process.env.GATEWAY_PRIVATE_KEY,'base64').toString(),'EdDSA');return new SignJWT({actor:a}).setProtectedHeader({alg:'EdDSA'}).setIssuer('gateway').setAudience('contract').setIssuedAt().setExpirationTime('30s').sign(key)}
async function api(path,method='GET',body,expected=200,a=actor,port=3104){const r=await fetch(`http://localhost:${port}/${path}`,{method,headers:{authorization:'Bearer '+await token(a),'content-type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});const data=r.headers.get('content-type')?.includes('json')?await r.json():Buffer.from(await r.arrayBuffer());assert.equal(r.status,expected,`${method} ${path}: ${JSON.stringify(data)}`);return data}
let checks=0;const pass=s=>{checks++;console.log('PASS contracts '+s)};
try{
 await mkdir(documents,{recursive:true});await writeFile(blocked,'Synthetic filesystem failure fixture');
 const pe=child('apps/personnel-service/src/main.ts',3102);await ready(3102,pe);
 const co=child('apps/contract-service/src/main.ts',3104);await ready(3104,co);
 const bad=child('apps/contract-service/src/main.ts',3105,{DOCUMENTS_DIR:blocked});await ready(3105,bad);
 department=await personnel.department.create({data:{name:'CONTRACT TEST '+actor.id}});position=await personnel.position.create({data:{name:'CONTRACT TEST '+actor.id}});
 employee=await personnel.employee.create({data:{code:'C-'+actor.id,name:'Funcionario sintético contratos',hiredAt:new Date('2025-01-01'),departmentId:department.id,positionId:position.id,currency:'BOB',salaries:{create:{amount:'5100.25',effectiveAt:new Date('2025-01-01'),actor:actor.id}}}});
 const t=await api('templates','POST',{name:'CONTRACT TEST '+actor.id,body:'Contrato de {{name}}, código {{code}}. Ingreso {{hiredAt}}. Remuneración {{salary}} {{currency}}. Periodo de prueba {{probationDays}} días.'},201);templates.push(t.id);
 const t2=await api('templates','POST',{name:t.name,body:t.body+' Nueva cláusula sintética.'},201);templates.push(t2.id);assert.equal(t2.version,2);
 await api('templates','POST',{name:'Malicious test',body:'Contrato {{name}} con {{unsupported}}: variable prohibida.'},400);
 await api(`templates/${t2.id}`,'PATCH',{active:false});pass('plantillas inmutables versionadas y activación auditada');
 const input={employeeId:employee.id,templateId:t.id,probationDays:90,requestKey:randomUUID()};const c=await api('contracts','POST',input,201);ids.push(c.id);
 assert.equal((await api('contracts','POST',input,201)).id,c.id);await api('contracts','POST',{...input,probationDays:30},409);
 await api(`contracts/${c.id}`,'PATCH',{templateId:t2.id,probationDays:60,version:c.version,refreshSnapshot:false},404);
 const edited=await api(`contracts/${c.id}`,'PATCH',{templateId:t.id,probationDays:60,version:c.version,refreshSnapshot:false});assert.equal(edited.version,2);
 await api(`contracts/${c.id}`,'PATCH',{templateId:t.id,probationDays:90,version:1,refreshSnapshot:false},409);pass('borrador editable, clave idempotente y conflicto de versión');
 assert.equal(c.snapshot.departmentId,department.id);const scoped={...actor,scopeAll:false,departmentIds:[department.id]};assert.equal((await api('contracts?page=1','GET',undefined,200,scoped)).total,1);
 const denied={...actor,scopeAll:false,departmentIds:[randomUUID()]};assert.equal((await api('contracts?page=1','GET',undefined,200,denied)).total,0);await api(`contracts/${c.id}/preview`,'GET',undefined,403,denied);
 await api(`contracts/${c.id}/issue`,'POST',{},403,{...actor,permissions:[]});await api(`contracts/${c.id}/pdf`,'GET',undefined,403,{...actor,roles:['BOARD']});pass('permisos de emisión y ámbito de recursos en backend');
 await personnel.employee.update({where:{id:employee.id},data:{version:{increment:1}}});await api(`contracts/${c.id}/issue`,'POST',{},409);
 const refreshed=await api(`contracts/${c.id}`,'PATCH',{templateId:t.id,probationDays:60,version:edited.version,refreshSnapshot:true});assert.equal(refreshed.snapshot.version,2);pass('revalidación de Personal y actualización explícita de snapshot');
 await contracts.contract.update({where:{id:c.id},data:{status:'EMITIENDO'}});
 const issued=await api(`contracts/${c.id}/issue`,'POST',{},201);assert.equal(issued.status,'EMITIDO');assert.ok(issued.fileHash);const pdf=await api(`contracts/${c.id}/pdf`);assert.equal(pdf.subarray(0,5).toString(),'%PDF-');
 const repeated=await Promise.all([api(`contracts/${c.id}/issue`,'POST',{},201),api(`contracts/${c.id}/issue`,'POST',{},201)]);assert.ok(repeated.every(r=>r.fileHash===issued.fileHash));assert.equal((await api(`contracts/${c.id}/audit`)).filter(a=>a.action==='ISSUE_RECOVERED').length,1);pass('EMITIENDO recuperado, PDF verificado y doble emisión sin duplicado');
 await personnel.salary.create({data:{employeeId:employee.id,effectiveAt:new Date('2026-01-01'),amount:'6500.75',actor:actor.id}});await personnel.employee.update({where:{id:employee.id},data:{version:{increment:1}}});assert.equal((await contracts.contract.findUnique({where:{id:c.id}})).snapshot.salary,'5100.25');assert.deepEqual(await api(`contracts/${c.id}/pdf`),pdf);pass('PDF y snapshot emitidos inmutables');
 const failure=await api('contracts','POST',{...input,requestKey:randomUUID()},201);ids.push(failure.id);await api(`contracts/${failure.id}/issue`,'POST',{},400,actor,3105);assert.equal((await contracts.contract.findUnique({where:{id:failure.id}})).status,'ERROR_EMISION');const retry=await api(`contracts/${failure.id}/issue`,'POST',{},201);assert.equal(retry.status,'EMITIDO');pass('fallo real de filesystem no declara emisión y reintento recupera');
 await api(`contracts/${c.id}/void`,'POST',{reason:'Anulación sintética de prueba'},409);
 const policy=await api('contracts/policy','POST',{allowVoid:true,allowRectification:true,rationale:'Aprobación sintética exclusiva de la prueba automatizada, no política institucional.',approved:true},201);policies.push(policy.id);
 const rectified=await api(`contracts/${c.id}/rectify`,'POST',{reason:'Cambio sintético autorizado en la prueba',requestKey:randomUUID()},201);ids.push(rectified.id);assert.equal(rectified.originalId,c.id);assert.equal(rectified.snapshot.salary,'6500.75');
 const annulled=await api(`contracts/${c.id}/void`,'POST',{reason:'Anulación sintética de prueba'},201);assert.equal(annulled.status,'ANULADO');assert.deepEqual(await api(`contracts/${c.id}/pdf`),pdf);pass('política explícita, rectificación vinculada y original conservado');
 const list=await api(`contracts?page=1&employeeId=${employee.id}&status=EMITIDO`);assert.equal(list.total,1);assert.equal(list.items[0].id,failure.id);pass('filtros y paginación reales');
 const summary=await api('contracts/summary','GET',undefined,200,{...actor,roles:['BOARD']});assert.equal(summary.total,ids.length);assert.equal(summary.snapshot,undefined);
 await writeFile(resolve(documents,failure.id+'.pdf'),'CORRUPTED SYNTHETIC TEST');await api(`contracts/${failure.id}/pdf`,'GET',undefined,503);assert.equal((await contracts.contract.findUnique({where:{id:failure.id}})).status,'EMITIDO');pass('indicadores agregados y corrupción histórica falla cerrada sin reescribir');
 const dependent=await api('contracts','POST',{...input,requestKey:randomUUID()},201);ids.push(dependent.id);
 const personnelExited=new Promise(r=>pe.p.once('exit',r));pe.p.kill();await personnelExited;
 await api(`contracts/${dependent.id}/issue`,'POST',{},503);
 assert.equal((await contracts.contract.findUniqueOrThrow({where:{id:dependent.id}})).status,'BORRADOR');
 assert.deepEqual(await api(`contracts/${c.id}/pdf`),pdf);pass('Personal caído bloquea nueva emisión y conserva PDF histórico');
 console.log(`${checks} comprobaciones Contratos aprobadas.`);
}finally{
 const exits=children.map(p=>p.exitCode!==null||p.signalCode!==null?Promise.resolve():new Promise(r=>p.once('exit',r)));
 for(const p of children)if(p.exitCode===null&&p.signalCode===null)p.kill();await Promise.all(exits);
 await contracts.contractAudit.deleteMany({where:{actorId:actor.id}});await contracts.contract.deleteMany({where:{id:{in:ids}}});await contracts.contractPolicy.deleteMany({where:{id:{in:policies}}});await contracts.template.deleteMany({where:{id:{in:templates}}});
 if(employee){await personnel.salary.deleteMany({where:{employeeId:employee.id}});await personnel.employee.delete({where:{id:employee.id}})}if(department)await personnel.department.delete({where:{id:department.id}});if(position)await personnel.position.delete({where:{id:position.id}});
 for(const id of ids)await unlink(resolve(documents,id+'.pdf')).catch(()=>{});await unlink(blocked).catch(()=>{});await contracts.$disconnect();await personnel.$disconnect();
}
