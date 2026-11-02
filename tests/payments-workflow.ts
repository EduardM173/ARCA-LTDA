import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {unlink,mkdir,rmdir} from 'node:fs/promises';
import {PrismaClient as PaymentClient} from '../apps/payment-service/generated/client';
import {PrismaClient as PersonnelClient} from '../apps/personnel-service/generated/client';
import {token} from '../packages/platform/src/http';

const pay=new PaymentClient(),staff=new PersonnelClient(),run=randomUUID(),actor={id:randomUUID(),roles:['FINANCE'],permissions:['payments.issue','payments.record'],scopeAll:true};
const concepts:string[]=[],paymentIds:string[]=[],policies:string[]=[];
let employeeId='',departmentId='',positionId='';
const base=process.env.PAYMENT_TEST_URL||'http://localhost:3305/';
const period=new Intl.DateTimeFormat('sv-SE',{timeZone:'America/La_Paz'}).format(new Date()).slice(0,7);
async function request(path:string,method='GET',body?:unknown,expected=200,identity=actor){
 const res=await fetch(base+path,{method,headers:{authorization:'Bearer '+await token('gateway','payment',identity),'content-type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});
 const data=res.headers.get('content-type')?.includes('application/json')?await res.json():Buffer.from(await res.arrayBuffer());
 assert.equal(res.status,expected,`${method} ${path}: ${JSON.stringify(data)}`);return data;
}
let groups=0;function pass(label:string){groups++;console.log('PASS '+label)}
async function main(){try{
 departmentId=(await staff.department.create({data:{name:'PAYMENT TEST '+run}})).id;
 positionId=(await staff.position.create({data:{name:'PAYMENT TEST '+run}})).id;
 employeeId=(await staff.employee.create({data:{code:'P-'+run,name:'Funcionario sintético de Pagos',departmentId,positionId,hiredAt:new Date('2020-01-01'),currency:'BOB',salaries:{create:{amount:'5000.10',effectiveAt:new Date('2020-01-01'),actor:actor.id}}}})).id;
 const abono=await request('payments/concepts','POST',{name:'Abono sintético '+run,type:'ABONO'},201);concepts.push(abono.id);
 const descuento=await request('payments/concepts','POST',{name:'Descuento sintético '+run,type:'DESCUENTO'},201);concepts.push(descuento.id);
 const lines=[{conceptId:abono.id,amount:'0.20'},{conceptId:descuento.id,amount:'0.10'}];
 const first=await request('payments','POST',{employeeId,period,lines},201);paymentIds.push(first.id);assert.equal(first.net,'5000.2');
 await request('payments','POST',{employeeId,period,lines},409);pass('catálogo persistente, partidas múltiples, precisión decimal y duplicado');
 const updated=await request('payments/'+first.id,'PATCH',{version:first.version,lines:[...lines,{conceptId:abono.id,amount:'25.30'}]});assert.equal(updated.net,'5025.5');
 await request('payments/'+first.id,'PATCH',{version:first.version,lines},409);
 await request('payments/'+first.id,'PATCH',{version:updated.version,lines:[{conceptId:descuento.id,amount:'99999'}]},400);
 await request('payments/concepts/'+abono.id,'PATCH',{active:false});
 await request('payments/'+first.id,'PATCH',{version:updated.version,lines},400);
 await request('payments/concepts/'+abono.id,'PATCH',{active:true});pass('edición de borrador versionada, neto no negativo, conceptos inactivos');
 await request('payments/'+first.id+'/issue','POST',{},403,{...actor,permissions:[]});
 await request('payments/'+first.id,'GET',undefined,403,{...actor,scopeAll:false});
 const denied=await request('payments?page=1','GET',undefined,200,{...actor,scopeAll:false});assert.equal(denied.total,0);pass('permisos por acción y ámbito de recursos');
 await pay.payment.update({where:{id:first.id},data:{status:'EMITIENDO'}});
 const issued=await request('payments/'+first.id+'/issue','POST',{},201);assert.equal(issued.status,'EMITIDO');
 const again=await request('payments/'+first.id+'/issue','POST',{},201);assert.equal(issued.fileHash,again.fileHash);
 const pdf=await request('payments/'+first.id+'/pdf');assert.equal(pdf.subarray(0,5).toString(),'%PDF-');
 await request('payments/'+first.id,'PATCH',{version:issued.version,lines},409);pass('recuperación EMITIENDO, PDF real, emisión idempotente y snapshot protegido');
 await request('payments/'+first.id+'/correct','POST',{reason:'Rectificación sintética antes de aprobación'},409);
 const policy=await request('payments/policy','POST',{allowVoid:true,allowCorrections:true,reason:'Aprobación sintética temporal de política, eliminada tras la prueba',approval:true},201);policies.push(policy.id);
 const corrected=await request('payments/'+first.id+'/correct','POST',{reason:'Rectificación sintética autorizada sin movimiento bancario'},201);paymentIds.push(corrected.id);
 assert.equal(corrected.revisionOf,first.id);assert.equal(corrected.revision,1);assert.equal((await request('payments/'+first.id)).status,'RECTIFICADO');assert.equal((await request('payments/'+first.id+'/pdf')).subarray(0,5).toString(),'%PDF-');
 await request('payments/'+corrected.id+'/issue','POST',{},201);pass('política explícita y rectificación enlazada conserva original');
 const payment={date:new Date().toISOString().slice(0,10),reference:'SIMULADO-'+run,evidence:'Evidencia sintética de prueba: no transferencia bancaria',mode:'SIMULADO'};
 const paid=await request('payments/'+corrected.id+'/record-payment','POST',payment,201);assert.equal(paid.paymentMode,'SIMULADO');assert.equal(paid.paidBy,actor.id);assert.equal(paid.status,'PAGADO');
 const retry=await request('payments/'+corrected.id+'/record-payment','POST',payment,201);assert.equal(retry.version,paid.version);
 await request('payments/'+corrected.id+'/record-payment','POST',{...payment,evidence:'Datos distintos de reintento sintético'},409);
 await request('payments/'+corrected.id+'/void','POST',{reason:'Intento de anulación de un pago registrado'},409);
 const events=await request('payments/'+corrected.id+'/history');assert.equal(events.filter((e:any)=>e.action==='PAGO_REGISTRADO').length,1);pass('pago simulado trazable, idempotencia estricta y bloqueo de anulación financiera');
 const monthDate=new Date(period+'-01T00:00:00Z');monthDate.setUTCMonth(monthDate.getUTCMonth()+1);const nextPeriod=monthDate.toISOString().slice(0,7);
 const faulty=await request('payments','POST',{employeeId,period:nextPeriod,lines:[]},201);paymentIds.push(faulty.id);
 const badPath='.runtime/documents/local/'+faulty.id+'.pdf';await mkdir(badPath,{recursive:true});
 try{await request('payments/'+faulty.id+'/issue','POST',{},400);assert.equal((await request('payments/'+faulty.id)).status,'ERROR_EMISION')}finally{await rmdir(badPath)}
 await request('payments/'+faulty.id+'/issue','POST',{},201);pass('fallo real de escritura PDF conserva borrador y admite recuperación');
 const result=await request('payments?page=1&employeeId='+employeeId+'&period='+period+'&status=PAGADO');assert.equal(result.total,1);assert.equal(result.items[0].id,corrected.id);pass('filtros y paginación consultan PostgreSQL');
 console.log(`${groups} grupos de pruebas de Pagos superados.`);
}finally{
 await pay.paymentAudit.deleteMany({where:{actor:actor.id}});await pay.payment.deleteMany({where:{id:{in:paymentIds}}});await pay.concept.deleteMany({where:{id:{in:concepts}}});await pay.paymentPolicy.deleteMany({where:{id:{in:policies}}});
 if(employeeId){await staff.salary.deleteMany({where:{employeeId}});await staff.employee.delete({where:{id:employeeId}})}
 if(departmentId)await staff.department.delete({where:{id:departmentId}});if(positionId)await staff.position.delete({where:{id:positionId}});
 for(const id of paymentIds)await unlink('.runtime/documents/local/'+id+'.pdf').catch(()=>{});
 await pay.$disconnect();await staff.$disconnect();
}

}
void main().catch(error=>{console.error(error);process.exitCode=1});
