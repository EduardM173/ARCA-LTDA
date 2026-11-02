import assert from 'node:assert/strict';
import {token} from '../packages/platform/src/http';
async function main(){
 const endpoint=(process.env.PAYMENT_TEST_URL||'http://localhost:3305/')+'payments/summary';
 for(const [roles,status]of [[['BOARD'],200],[['FINANCE'],200],[['HR'],403]]as [string[],number][]){
  const res=await fetch(endpoint,{headers:{authorization:'Bearer '+await token('gateway','payment',{id:'summary-check',roles,scopeAll:true})}});
  assert.equal(res.status,status);if(res.ok){const data=await res.json();assert.deepEqual(Object.keys(data).sort(),['byStatus','period','total']);assert.equal(typeof data.total,'number')}
 }
 const scoped=await fetch(endpoint,{headers:{authorization:'Bearer '+await token('gateway','payment',{id:'no-scope',roles:['BOARD'],scopeAll:false,departmentIds:[]})}});assert.equal((await scoped.json()).total,0);
 console.log('PASS resumen agregado Pagos: BOARD/FINANCE, sin datos individuales y ámbito cerrado');
}
void main().catch(error=>{console.error(error);process.exitCode=1});
