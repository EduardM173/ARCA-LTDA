// Additional temporal cases via authorized local API, after the core fixture.
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const path='.runtime/demo-manifest.json',m=JSON.parse(await readFile(path,'utf8'));
if(process.env.DEMO_LOCAL_ENABLE!=='yes'||process.env.NODE_ENV==='production'||!m.flowsComplete)throw Error('Requiere fixture demo completo en desarrollo local');
if(m.assignmentChanged&&m.retroSalary){console.log('Historial demo ya cargado; no se duplicaron movimientos.');process.exit(0)}
const row=(await readFile('README_DEMO_LOCAL.md','utf8')).split('\n').find(line=>line.startsWith('| 1 |')).split('|').map(x=>x.trim());
const base='http://127.0.0.1:3000/api/v1/';
async function call(endpoint,method='GET',body,cookie=''){const response=await fetch(base+endpoint,{method,headers:{origin:'http://localhost:5173','content-type':'application/json',cookie},body:body?JSON.stringify(body):undefined});const data=response.headers.get('content-type')?.includes('json')?await response.json():Buffer.from(await response.arrayBuffer());if(!response.ok)throw Error(`${method} ${endpoint}: HTTP ${response.status}`);return {data,response}}
const login=await call('auth/login','POST',{email:row[3],password:row[4]});const cookie=login.response.headers.get('set-cookie').split(';')[0];
async function employee(code){const found=await call('employees?page=1&q='+encodeURIComponent(code),'GET',undefined,cookie);const item=found.data.items.find(x=>x.code===code);if(!item)throw Error('Funcionario demo no localizado: '+code);return (await call('employees/'+item.id,'GET',undefined,cookie)).data}
async function save(){await writeFile(path,JSON.stringify(m,null,2)+'\n',{mode:0o600})}
const today=new Intl.DateTimeFormat('sv-SE',{timeZone:'America/La_Paz'}).format(new Date());
if(!m.assignmentChanged){const e=await employee('DEMO-ARCA-021'),catalog=(await call('departments','GET',undefined,cookie)).data;const target=catalog.find(x=>x.name==='DEMO ARCA · Tecnología');if(!target)throw Error('Área demo de destino ausente');await call('employees/'+e.id,'PATCH',{departmentId:target.id,positionId:e.positionId,effectiveAt:today,version:e.version},cookie);m.assignmentChanged=true;await save()}
if(!m.retroSalary){const e=await employee('DEMO-ARCA-004'),before=(await call('contracts/'+m.contract0+'/pdf','GET',undefined,cookie)).data,hash=createHash('sha256').update(before).digest('hex');await call('employees/'+e.id+'/salary','POST',{amount:'5850.75',effectiveAt:'2025-01-01',version:e.version,reason:'Vigencia retroactiva sintética aprobada por política académica local'},cookie);const after=(await call('contracts/'+m.contract0+'/pdf','GET',undefined,cookie)).data;if(createHash('sha256').update(after).digest('hex')!==hash)throw Error('PDF histórico cambió tras salario retroactivo');m.retroSalary=true;await save()}
console.log('PASS historial demo: cambio de área con fecha efectiva y salario retroactivo motivado; PDF anterior inmutable');
