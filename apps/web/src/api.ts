export type Row=Record<string,any>;
export class ApiError extends Error{constructor(message:string,public fields:Record<string,string>={},public status?:number,public requestId?:string){super(message)}}
export async function api(path:string,method='GET',body?:unknown){
 let r:Response;try{r=await fetch('/api/v1/'+path,{method,credentials:'same-origin',headers:{'content-type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)})}catch{throw new ApiError('Servicio no disponible; vuelva a intentarlo.')}
 const requestId=r.headers.get('x-request-id')||undefined;const raw=await r.text();let data:Row|null=null;
 const policyRead=method==='GET'&&/^(vacations|contracts|employees|payments)\/policy$/.test(path);
 if(!raw&&r.ok){if(r.status===204||policyRead&&r.status===200)return null as unknown as Row;throw new ApiError('Respuesta vacía inesperada del servicio.',{},r.status,requestId)}
 if(raw){try{data=JSON.parse(raw)}catch{throw new ApiError('Respuesta inválida del servicio; vuelva a intentarlo.',{},r.status,requestId)}}
 if(!r.ok){const message=typeof data?.message==='string'?data.message:r.status===403?'Acceso denegado':r.status===401?'Inicie sesión':r.status>=500?'Servicio no disponible; vuelva a intentarlo.':'No fue posible completar la operación';throw new ApiError(message,data?.fields||{},r.status,requestId)}
 return data as Row;
}
