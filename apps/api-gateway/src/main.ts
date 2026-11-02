import {Controller,All,Req,Res,HttpException} from '@nestjs/common';

import {start,services,token} from '../../../packages/platform/src/http';

const routes:Record<string,string>={auth:'identity',users:'identity',mail:'identity',employees:'personnel',departments:'personnel',positions:'personnel',vacations:'vacation',contracts:'contract',templates:'contract',payments:'payment'};

@Controller('api/v1')

class Gateway{

 @All('*path')async proxy(@Req()req:any,@Res()res:any){

 const path=req.originalUrl.replace(/^\/api\/v1/,'');const domain=path.split('?')[0].split('/')[1];const target=routes[domain];if(!target)throw new HttpException('Ruta no encontrada',404);

 if(!['GET','HEAD','OPTIONS'].includes(req.method)&&req.headers.origin!==process.env.APP_PUBLIC_URL)throw new HttpException('Origen no permitido',403);

 let actor: any;

 const publicPaths=['/auth/login','/auth/forgot-password','/auth/reset-password','/auth/verify-email'];

 if(!publicPaths.includes(path)){

 const check=await fetch(services.identity+'/auth/me',{headers:{authorization:'Bearer '+await token('gateway','identity'),cookie:req.headers.cookie||'','x-request-id':req.headers['x-request-id']},signal:AbortSignal.timeout(5000)}).catch(()=>{throw new HttpException('Identidad no disponible',503)});

 if(!check.ok)throw new HttpException('Inicie sesión',401);actor=await check.json();

 }

 const headers:Record<string,string>={authorization:'Bearer '+await token('gateway',target,actor),cookie:req.headers.cookie||'','content-type':'application/json','x-client-ip':req.ip,'x-request-id':req.headers['x-request-id']};

 const upstream=await fetch(services[target]+path,{method:req.method,headers,body:['GET','HEAD'].includes(req.method)?undefined:JSON.stringify(req.body||{}),signal:AbortSignal.timeout(30000)}).catch(()=>{throw new HttpException('Servicio no disponible; vuelva a intentarlo',503)});

 const cookie=upstream.headers.get('set-cookie');if(cookie)res.setHeader('set-cookie',cookie);

 for(const name of ['content-type','content-disposition']){const value=upstream.headers.get(name);if(value)res.setHeader(name,value)}

 res.status(upstream.status).send(Buffer.from(await upstream.arrayBuffer()));

 }

}

void start(Gateway,'gateway',3000);

