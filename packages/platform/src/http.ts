import 'reflect-metadata';
import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Module, UnauthorizedException, ForbiddenException } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ExpressAdapter } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { SignJWT, jwtVerify, importPKCS8, importSPKI } from 'jose';
import { randomUUID } from 'node:crypto';
import { AsyncLocalStorage } from 'node:async_hooks';
const requestContext=new AsyncLocalStorage<{requestId:string}>();
export function currentRequestId(){return requestContext.getStore()?.requestId;}
const requestIdPattern=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { ZodError } from 'zod';
export type Actor={id:string;roles:string[];permissions?:string[];scopeAll?:boolean;departmentIds?:string[];authVersion?:number};
export function assertDepartment(actor:Actor,departmentId?:string){if(!actor.scopeAll&&(!departmentId||!actor.departmentIds?.includes(departmentId)))throw new ForbiddenException('El recurso está fuera de su ámbito autorizado');}
export function departmentWhere(actor:Actor){return actor.scopeAll?{}:{departmentId:{in:actor.departmentIds||[]}};}
export const permissionCatalog=['users.manage','salary.read','salary.write','employee.ratify','contracts.issue','payments.issue','payments.record','vacations.approve'];
export function requirePermission(actor:Actor,permission:string){if(!actor.permissions?.includes(permission))throw new ForbiddenException('Requiere permiso explícito: '+permission);}
const keys:Record<string,string|undefined>={gateway:process.env.GATEWAY_KEY,vacation:process.env.VACATION_KEY,contract:process.env.CONTRACT_KEY,payment:process.env.PAYMENT_KEY,personnel:process.env.PERSONNEL_KEY};
export async function token(issuer:string,audience:string,actor?:Actor){
 if(issuer==='gateway'){
  if(!process.env.GATEWAY_PRIVATE_KEY)throw new Error('Missing gateway signing key');
  const key=await importPKCS8(Buffer.from(process.env.GATEWAY_PRIVATE_KEY,'base64').toString(),'EdDSA');
  return new SignJWT({actor}).setProtectedHeader({alg:'EdDSA'}).setIssuer(issuer).setAudience(audience).setIssuedAt().setExpirationTime('30s').sign(key);
 }
 if(!keys[issuer])throw new Error('Missing service credential');
 return new SignJWT({actor}).setProtectedHeader({alg:'HS256'}).setIssuer(issuer).setAudience(audience).setIssuedAt().setExpirationTime('30s').sign(new TextEncoder().encode(keys[issuer]));
}
export async function identity(req:any,audience:string,allowed=['gateway']):Promise<{actor?:Actor;issuer:string}>{
 try{
 const raw=String(req.headers.authorization||'').replace(/^Bearer /,'');
 for(const issuer of allowed){try{
 if(issuer==='gateway'&&!process.env.GATEWAY_PUBLIC_KEY||issuer!=='gateway'&&!keys[issuer])continue;
 const verificationKey=issuer==='gateway'?await importSPKI(Buffer.from(process.env.GATEWAY_PUBLIC_KEY!,'base64').toString(),'EdDSA'):new TextEncoder().encode(keys[issuer]);
 const {payload}=await jwtVerify(raw,verificationKey,{issuer,audience,algorithms:[issuer==='gateway'?'EdDSA':'HS256']});
 return {actor:payload.actor as Actor|undefined,issuer};
 }catch{}}
 }catch{}
 throw new UnauthorizedException('Credencial inválida');
}
export async function authorize(req:any,audience:string,roles:string[]):Promise<Actor>{
 const {actor}=await identity(req,audience);
 if(!actor)throw new UnauthorizedException();
 if(!roles.some(r=>actor.roles.includes(r)))throw new ForbiddenException('No tiene permiso para esta acción');
 return actor;
}
@Catch()
class Errors implements ExceptionFilter{
 catch(error:any,host:ArgumentsHost){
 const res=host.switchToHttp().getResponse();
 if(!(error instanceof HttpException)&&!(error instanceof ZodError))console.error(JSON.stringify({event:'request_failed',type:error.name,code:error.code,requestId:currentRequestId()}));
 let status=error instanceof HttpException?error.getStatus():500;
 let message=error instanceof HttpException?error.message:'No fue posible completar la operación';
 if(error instanceof ZodError){status=422;message=error.issues.map(i=>i.path.join('.')+': '+i.message).join('; ')}
 if(error.code==='P2002'){status=409;message='Ya existe un registro con estos datos'}
 if(error.code==='P2025'){status=404;message='Registro no encontrado'}
 if(error.code==='P2034'){status=409;message='Conflicto concurrente; vuelva a intentarlo'}
 res.status(status).json({code:status,message,...(error instanceof ZodError?{fields:Object.fromEntries(error.issues.map(i=>[i.path.join('.'),i.message]))}:{}),requestId:res.getHeader('X-Request-Id')});
 }
}
export async function start(controller:any,name:string,port:number,db?:any,providers:any[]=[]){
 @Module({controllers:[controller],providers}) class App{}
 const app=await NestFactory.create(App,new ExpressAdapter(),{logger:['error','warn']});
 app.use(helmet());app.use(cookieParser());
 app.use((req:any,res:any,next:any)=>{const incoming=req.headers['x-request-id'];const requestId=name!=='gateway'&&typeof incoming==='string'&&requestIdPattern.test(incoming)?incoming:randomUUID();req.headers['x-request-id']=requestId;res.setHeader('X-Request-Id',requestId);res.setHeader('Cache-Control','no-store');requestContext.run({requestId},next)});
 app.useGlobalFilters(new Errors());
 const doc=SwaggerModule.createDocument(app,new DocumentBuilder().setTitle('ARCA RH · '+name).setVersion('1').addBearerAuth().build());
 SwaggerModule.setup('openapi',app,doc);
 app.enableShutdownHooks();
 if(db)await db.$connect();
 await app.listen(Number(process.env.PORT||port),process.env.BIND_HOST||'127.0.0.1');console.log(`${name} listening on ${process.env.PORT||port}`);
}
export const services:Record<string,string>={identity:process.env.IDENTITY_URL||'http://localhost:3001',personnel:process.env.PERSONNEL_URL||'http://localhost:3002',vacation:process.env.VACATION_URL||'http://localhost:3003',contract:process.env.CONTRACT_URL||'http://localhost:3004',payment:process.env.PAYMENT_URL||'http://localhost:3005'};
export async function call(issuer:string,target:string,path:string,actor?:Actor,body?:unknown){
 let res:Response;
 try{res=await fetch(services[target]+path,{method:body===undefined?'GET':'POST',headers:{authorization:'Bearer '+await token(issuer,target,actor),'content-type':'application/json','x-request-id':currentRequestId()||randomUUID()},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(5000)})}
 catch{throw new HttpException('Servicio '+target+' no disponible',503)}
 const data=await res.json();if(!res.ok)throw new HttpException(data.message||'Error del servicio',res.status);return data;
}
export function date(value:string){return new Date(value+'T00:00:00Z')}
export function businessToday(){return new Intl.DateTimeFormat('sv-SE',{timeZone:'America/La_Paz',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());}
