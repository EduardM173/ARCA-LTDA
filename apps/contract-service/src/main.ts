import {Body,Controller,Get,Post,Patch,Req,Res,Param,Query,ConflictException,BadRequestException,HttpException,ForbiddenException} from '@nestjs/common';
import {PrismaClient,Prisma} from '../generated/client';
import {start,authorize,call,requirePermission} from '../../../packages/platform/src/http';
import {generatePdf,readPdf} from '../../../packages/platform/src/documents';
import {z} from 'zod';

const db=new PrismaClient({transactionOptions:{maxWait:15000,timeout:30000}});
const allowed=['name','code','hiredAt','salary','currency','probationDays'];
const uuid=z.uuid(),editable=['BORRADOR','ERROR_EMISION'];
const draft=z.object({employeeId:uuid,templateId:uuid,probationDays:z.number().int().min(0).max(365),requestKey:uuid.optional()}).strict();
export function render(body:string,values:Record<string,unknown>){
 if(/[<>]/.test(body)||/https?:|file:|javascript:/i.test(body))throw new BadRequestException('La plantilla solo admite texto y variables autorizadas');
 const result=body.replace(/{{\s*(\w+)\s*}}/g,(_,key)=>{if(!allowed.includes(key)||values[key]===undefined)throw new BadRequestException('Variable no permitida: '+key);return key==='hiredAt'?String(values[key]).slice(0,10):String(values[key])});
 if(result.includes('{{')||result.includes('}}'))throw new BadRequestException('Marcador de plantilla incompleto');
 return result;
}
function assertScope(actor:any,snapshot:any){if(actor.scopeAll===true)return;if(snapshot?.departmentId&&actor.departmentIds?.includes(snapshot.departmentId))return;throw new ForbiddenException('No tiene acceso al área de este documento')}
function scopeFilter(actor:any):Prisma.ContractWhereInput{return actor.scopeAll===true?{}:{OR:(actor.departmentIds||[]).map((id:string)=>({snapshot:{path:['departmentId'],equals:id}}))}}
function requestId(req:any){return String(req.res?.getHeader('X-Request-Id')||'').slice(0,100)||undefined}
function audit(tx:any,req:any,actor:string,resourceId:string,action:string,details:Record<string,unknown>={}){return tx.contractAudit.create({data:{resourceId,action,actorId:actor,requestId:requestId(req),details}})}
async function contractLock(tx:Prisma.TransactionClient,id:string){await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${id}))`}
function draftOnly(c:any){if(!editable.includes(c.status))throw new ConflictException('Solo se pueden editar borradores o emisiones fallidas')}
async function historicalPdf(c:any){try{return await readPdf(c.id,c.fileHash!)}catch{throw new HttpException('Documento histórico no disponible o integridad inválida; requiere restaurar una copia de respaldo autorizada',503)}}
async function employeeSnapshot(employeeId:string,actor:any){const e=await call('contract','personnel','/internal/employees/'+employeeId);assertScope(actor,e);if(e.status!=='ACTIVO')throw new BadRequestException('Funcionario dado de baja');return e}

@Controller()
class ContractController{
 @Get('health')async health(){await db.$queryRaw`SELECT 1`;return {status:'ok'}}
 @Get('templates')async templates(@Req()req:any){await authorize(req,'contract',['ADMIN','HR']);return db.template.findMany({orderBy:[{name:'asc'},{version:'desc'}]})}
 @Post('templates')async template(@Req()req:any,@Body()body:unknown){
  const actor=await authorize(req,'contract',['ADMIN']);const input=z.object({name:z.string().trim().min(3).max(100),body:z.string().min(40).max(20000)}).strict().parse(body);render(input.body,Object.fromEntries(allowed.map(k=>[k,k])));
  return db.$transaction(async tx=>{await contractLock(tx,'template:'+input.name);const last=await tx.template.findFirst({where:{name:input.name},orderBy:{version:'desc'}});const t=await tx.template.create({data:{...input,version:(last?.version||0)+1}});await audit(tx,req,actor.id,t.id,'TEMPLATE_VERSION_CREATED',{version:t.version});return t});
 }
 @Patch('templates/:id')async templateStatus(@Req()req:any,@Param('id')id:string,@Body()body:unknown){const actor=await authorize(req,'contract',['ADMIN']);const input=z.object({active:z.boolean()}).strict().parse(body);return db.$transaction(async tx=>{const t=await tx.template.update({where:{id:uuid.parse(id)},data:input});await audit(tx,req,actor.id,id,'TEMPLATE_STATUS',{active:t.active});return t})}
 @Get('contracts/summary')async summary(@Req()req:any){const actor=await authorize(req,'contract',['ADMIN','HR','BOARD']);const rows=await db.contract.groupBy({by:['status'],where:scopeFilter(actor),_count:true});return {total:rows.reduce((n,r)=>n+r._count,0),byStatus:Object.fromEntries(rows.map(r=>[r.status,r._count]))}}
 @Get('contracts/policy')async policy(@Req()req:any,@Res({passthrough:true})res:any){await authorize(req,'contract',['ADMIN','HR']);const policy=await db.contractPolicy.findFirst({orderBy:{approvedAt:'desc'}});if(!policy)res.status(204);return policy}
 @Get('contracts/audit')async audits(@Req()req:any,@Query()q:any){const a=await authorize(req,'contract',['ADMIN']);if(!a.scopeAll)throw new ForbiddenException('La auditoría global requiere ámbito organizacional');const page=z.coerce.number().int().min(1).max(100000).default(1).parse(q.page);const action=z.string().trim().max(80).optional().parse(q.action||undefined),actorId=uuid.optional().parse(q.actor||undefined);const from=z.iso.date().optional().parse(q.from||undefined),to=z.iso.date().optional().parse(q.to||undefined);if(from&&to&&from>to)throw new BadRequestException('Rango de fechas inválido');const where={...(action?{action:{contains:action,mode:'insensitive' as const}}:{}),...(actorId?{actorId}:{}),...(from||to?{createdAt:{...(from?{gte:new Date(from)}:{}),...(to?{lt:new Date(new Date(to).getTime()+86400000)}:{})}}:{})};const [total,items]=await db.$transaction([db.contractAudit.count({where}),db.contractAudit.findMany({where,select:{id:true,resourceId:true,action:true,actorId:true,createdAt:true,requestId:true},orderBy:{createdAt:'desc'},take:25,skip:(page-1)*25})]);return {total,page,items}}
 @Post('contracts/policy')async approvePolicy(@Req()req:any,@Body()body:unknown){
  const actor=await authorize(req,'contract',['ADMIN']);const input=z.object({allowVoid:z.boolean(),allowRectification:z.boolean(),rationale:z.string().trim().min(15).max(2000),approved:z.literal(true)}).strict().parse(body);
  return db.$transaction(async tx=>{const p=await tx.contractPolicy.create({data:{allowVoid:input.allowVoid,allowRectification:input.allowRectification,rationale:input.rationale,approvedBy:actor.id}});await audit(tx,req,actor.id,p.id,'POLICY_APPROVED',{allowVoid:p.allowVoid,allowRectification:p.allowRectification});return p});
 }
 @Get('contracts')async list(@Req()req:any,@Query()query:any){
  const actor=await authorize(req,'contract',['ADMIN','HR']);const page=z.coerce.number().int().min(1).max(100000).default(1).parse(query.page);const where:Prisma.ContractWhereInput={...scopeFilter(actor),...(query.employeeId?{employeeId:uuid.parse(query.employeeId)}:{}),...(query.status?{status:z.enum(['BORRADOR','EMITIENDO','ERROR_EMISION','EMITIDO','ANULADO']).parse(query.status)}:{})};
  const [total,items]=await db.$transaction([db.contract.count({where}),db.contract.findMany({where,orderBy:[{createdAt:'desc'},{id:'asc'}],take:25,skip:(page-1)*25})]);return query.page?{total,page,items}:items;
 }
 @Post('contracts')async create(@Req()req:any,@Body()body:unknown){
  const actor=await authorize(req,'contract',['ADMIN','HR']);const input=draft.parse(body);const employee=await employeeSnapshot(input.employeeId,actor);
  return db.$transaction(async tx=>{if(input.requestKey){await contractLock(tx,'create:'+actor.id+input.requestKey);const existing=await tx.contract.findUnique({where:{createdBy_requestKey:{createdBy:actor.id,requestKey:input.requestKey}}});if(existing){assertScope(actor,existing.snapshot);if(existing.employeeId!==input.employeeId||existing.templateId!==input.templateId||existing.probationDays!==input.probationDays)throw new ConflictException('La clave del intento ya corresponde a otro borrador');return existing}}await tx.template.findFirstOrThrow({where:{id:input.templateId,active:true}});const c=await tx.contract.create({data:{...input,snapshot:employee,createdBy:actor.id}});await audit(tx,req,actor.id,c.id,'DRAFT_CREATED');return c});
 }
 @Patch('contracts/:id')async edit(@Req()req:any,@Param('id')id:string,@Body()body:unknown){
  const actor=await authorize(req,'contract',['ADMIN','HR']);const input=z.object({templateId:uuid,probationDays:z.number().int().min(0).max(365),version:z.number().int().positive(),refreshSnapshot:z.boolean()}).strict().parse(body);uuid.parse(id);const old=await db.contract.findUniqueOrThrow({where:{id}});assertScope(actor,old.snapshot);draftOnly(old);const snapshot=input.refreshSnapshot?await employeeSnapshot(old.employeeId,actor):old.snapshot;
  return db.$transaction(async tx=>{await contractLock(tx,id);const c=await tx.contract.findUniqueOrThrow({where:{id}});assertScope(actor,c.snapshot);draftOnly(c);if(c.version!==input.version)throw new ConflictException('El borrador cambió; recargue antes de guardar');await tx.template.findFirstOrThrow({where:{id:input.templateId,active:true}});const result=await tx.contract.update({where:{id},data:{templateId:input.templateId,probationDays:input.probationDays,snapshot:snapshot as Prisma.InputJsonValue,status:'BORRADOR',fileHash:null,version:{increment:1}}});await audit(tx,req,actor.id,id,'DRAFT_UPDATED',{snapshotRefreshed:input.refreshSnapshot,version:result.version});return result});
 }
 @Get('contracts/:id/preview')async preview(@Req()req:any,@Param('id')id:string){const actor=await authorize(req,'contract',['ADMIN','HR']);const c=await db.contract.findUniqueOrThrow({where:{id:uuid.parse(id)}});assertScope(actor,c.snapshot);const t=await db.template.findUniqueOrThrow({where:{id:c.templateId}});return {text:render(t.body,{...c.snapshot as any,probationDays:c.probationDays}),templateVersion:t.version,templateName:t.name,status:c.status,contract:c}}
 @Get('contracts/:id/audit')async history(@Req()req:any,@Param('id')id:string){const actor=await authorize(req,'contract',['ADMIN','HR']);const c=await db.contract.findUniqueOrThrow({where:{id:uuid.parse(id)}});assertScope(actor,c.snapshot);return db.contractAudit.findMany({where:{resourceId:id},orderBy:{createdAt:'asc'}})}
 @Post('contracts/:id/issue')async issue(@Req()req:any,@Param('id')id:string){
  const actor=await authorize(req,'contract',['ADMIN','HR']);requirePermission(actor,'contracts.issue');uuid.parse(id);
  try{return await db.$transaction(async tx=>{
   // Holding this lock through file generation and metadata commit serializes
   // retries. A crash releases it and rolls back state; an uncommitted PDF can
   // then be regenerated under its original ID without touching emitted records.
   await contractLock(tx,id);const c=await tx.contract.findUniqueOrThrow({where:{id}});assertScope(actor,c.snapshot);
   if(['EMITIDO','ANULADO'].includes(c.status)){if(c.status==='ANULADO')throw new ConflictException('Contrato anulado');await historicalPdf(c);return c}
   if(![...editable,'EMITIENDO'].includes(c.status))throw new ConflictException('Estado no emitible');
   const e=await employeeSnapshot(c.employeeId,actor);if(e.version!==(c.snapshot as any).version)throw new ConflictException('La ficha cambió desde el borrador; actualice sus datos antes de emitir');
   const t=await tx.template.findUniqueOrThrow({where:{id:c.templateId}});if(!t.active)throw new ConflictException('La plantilla está desactivada; seleccione una versión activa');
   if(c.originalId){const policy=await tx.contractPolicy.findFirst({orderBy:{approvedAt:'desc'}});if(!policy?.allowRectification)throw new ConflictException('Requiere política de rectificación aprobada')}
   await tx.contract.update({where:{id},data:{status:'EMITIENDO'}});
   const fileHash=await generatePdf(id,'Contrato · '+id,[`Plantilla ${t.name} · versión ${t.version}`,...(c.originalId?[`Rectifica el documento ${c.originalId}`]:[]),render(t.body,{...c.snapshot as any,probationDays:c.probationDays})]);await readPdf(id,fileHash);
   const result=await tx.contract.update({where:{id},data:{status:'EMITIDO',fileHash,issuedAt:new Date(),version:{increment:1}}});await audit(tx,req,actor.id,id,c.status==='EMITIENDO'?'ISSUE_RECOVERED':'ISSUED',{fileHash,templateVersion:t.version,originalId:c.originalId});return result;
  })}catch(error){if(error instanceof HttpException)throw error;await db.contract.updateMany({where:{id,status:{in:[...editable,'EMITIENDO']}},data:{status:'ERROR_EMISION'}}).catch(()=>{});throw new BadRequestException('No se completó la emisión; el borrador se conserva y puede reintentar')}
 }
 @Post('contracts/:id/void')async void(@Req()req:any,@Param('id')id:string,@Body()body:unknown){
  const actor=await authorize(req,'contract',['ADMIN']);requirePermission(actor,'contracts.issue');const {reason}=z.object({reason:z.string().trim().min(10).max(2000)}).strict().parse(body);uuid.parse(id);
  return db.$transaction(async tx=>{await contractLock(tx,id);const p=await tx.contractPolicy.findFirst({orderBy:{approvedAt:'desc'}});if(!p?.allowVoid)throw new ConflictException('Requiere política de anulación aprobada');const c=await tx.contract.findUniqueOrThrow({where:{id}});assertScope(actor,c.snapshot);if(c.status==='ANULADO')return c;if(c.status!=='EMITIDO')throw new ConflictException('Solo se anulan contratos emitidos');await historicalPdf(c);const result=await tx.contract.update({where:{id},data:{status:'ANULADO',version:{increment:1}}});await audit(tx,req,actor.id,id,'VOIDED',{reason,policyId:p.id});return result});
 }
 @Post('contracts/:id/rectify')async rectify(@Req()req:any,@Param('id')id:string,@Body()body:unknown){
  const actor=await authorize(req,'contract',['ADMIN']);requirePermission(actor,'contracts.issue');const input=z.object({reason:z.string().trim().min(10).max(2000),requestKey:uuid}).strict().parse(body);uuid.parse(id);const c=await db.contract.findUniqueOrThrow({where:{id}});assertScope(actor,c.snapshot);const snapshot=await employeeSnapshot(c.employeeId,actor);
  return db.$transaction(async tx=>{await contractLock(tx,'rectify:'+id);const policy=await tx.contractPolicy.findFirst({orderBy:{approvedAt:'desc'}});if(!policy?.allowRectification)throw new ConflictException('Requiere política de rectificación aprobada');const original=await tx.contract.findUniqueOrThrow({where:{id}});if(!['EMITIDO','ANULADO'].includes(original.status))throw new ConflictException('La rectificación requiere un documento histórico emitido');const existing=await tx.contract.findUnique({where:{createdBy_requestKey:{createdBy:actor.id,requestKey:input.requestKey}}});if(existing){if(existing.originalId!==id)throw new ConflictException('Clave de intento utilizada');return existing}const r=await tx.contract.create({data:{employeeId:c.employeeId,templateId:c.templateId,probationDays:c.probationDays,snapshot,createdBy:actor.id,requestKey:input.requestKey,originalId:id}});await audit(tx,req,actor.id,r.id,'RECTIFICATION_DRAFT',{originalId:id,reason:input.reason,policyId:policy.id});await audit(tx,req,actor.id,id,'RECTIFICATION_LINKED',{replacementDraftId:r.id});return r});
 }
 @Get('contracts/:id/pdf')async pdf(@Req()req:any,@Res()res:any,@Param('id')id:string){const actor=await authorize(req,'contract',['ADMIN','HR']);const c=await db.contract.findUniqueOrThrow({where:{id:uuid.parse(id)}});assertScope(actor,c.snapshot);if(!['EMITIDO','ANULADO'].includes(c.status)||!c.fileHash)throw new ConflictException('Documento no emitido');const data=await historicalPdf(c);res.setHeader('content-type','application/pdf');res.setHeader('content-disposition',`attachment; filename="contrato-${id}.pdf"`);res.send(data)}
}
void start(ContractController,'contract',Number(process.env.CONTRACT_PORT||3004),db);
