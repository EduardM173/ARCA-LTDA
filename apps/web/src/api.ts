export type Row=Record<string,any>;
export class ApiError extends Error{constructor(message:string,public fields:Record<string,string>={}){super(message)}}
export async function api(path:string,method='GET',body?:unknown){
 const r=await fetch('/api/v1/'+path,{method,credentials:'same-origin',headers:{'content-type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});
 let data:Row;try{data=await r.json()}catch{throw new ApiError('Servicio no disponible; vuelva a intentarlo.')} if(!r.ok)throw new ApiError(data.message||'No fue posible completar la operación',data.fields||{});return data;
}
