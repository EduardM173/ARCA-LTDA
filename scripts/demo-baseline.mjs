// One-time proof that reset preserves records which existed outside the fixture.
import {createRequire} from 'node:module';
import {readFile,writeFile} from 'node:fs/promises';
const require=createRequire(import.meta.url);
const db=Object.fromEntries(['identity','personnel','vacation','contract','payment'].map(n=>[n,new(require(`../apps/${n}-service/generated/client`).PrismaClient)()]));
const file='.runtime/demo-prior-records.json';
try{
 if(process.argv[2]==='capture'){
  const m=JSON.parse(await readFile('.runtime/demo-manifest.json','utf8'));
  const contractIds=[...Array.from({length:45},(_,i)=>m['contract'+i]),m.contractRectified].filter(Boolean),paymentIds=[...Array.from({length:80},(_,i)=>m['payment'+i]),m.paymentCorrected].filter(Boolean),leaveIds=[...Array.from({length:60},(_,i)=>m['leave'+i]),...Array.from({length:10},(_,i)=>m['leaveExtra'+i])].filter(Boolean);
  const saved={users:(await db.identity.user.findMany({where:{email:{not:{endsWith:'@demo.arca.test'}}},select:{id:true}})).map(x=>x.id),employees:(await db.personnel.employee.findMany({where:{code:{not:{startsWith:'DEMO-ARCA-'}}},select:{id:true}})).map(x=>x.id),contracts:(await db.contract.contract.findMany({where:{id:{notIn:contractIds}},select:{id:true}})).map(x=>x.id),payments:(await db.payment.payment.findMany({where:{id:{notIn:paymentIds}},select:{id:true}})).map(x=>x.id),leaves:(await db.vacation.leaveRequest.findMany({where:{id:{notIn:leaveIds}},select:{id:true}})).map(x=>x.id)};
  await writeFile(file,JSON.stringify(saved)+'\n',{mode:0o600});console.log('Inventario previo ajeno al fixture guardado:',Object.fromEntries(Object.entries(saved).map(([k,v])=>[k,v.length])));
 }else if(process.argv[2]==='check'){
  const saved=JSON.parse(await readFile(file,'utf8'));for(const [domain,ids] of Object.entries(saved)){const client=domain==='users'?db.identity:domain==='employees'?db.personnel:domain==='leaves'?db.vacation:domain==='contracts'?db.contract:db.payment;const model=domain==='users'?'user':domain==='employees'?'employee':domain==='leaves'?'leaveRequest':domain==='contracts'?'contract':'payment';const found=await client[model].count({where:{id:{in:ids}}});if(found!==ids.length)throw Error('Faltan registros ajenos en '+domain)}console.log('PASS limpieza: todos los IDs ajenos permanecen');
 }else throw Error('Use capture o check');
}finally{await Promise.all(Object.values(db).map(c=>c.$disconnect()))}
