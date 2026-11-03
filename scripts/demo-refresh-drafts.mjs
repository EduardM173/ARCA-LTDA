// Refresh only demo drafts whose employee version changed during catalog alignment.
import {readFile,writeFile} from 'node:fs/promises';
const file='.runtime/demo-manifest.json',m=JSON.parse(await readFile(file,'utf8'));
if(process.env.DEMO_LOCAL_ENABLE!=='yes'||process.env.NODE_ENV==='production'||!m.flowsComplete)throw Error('Requiere fixture demo local completo');
if(m.draftsRefreshed){console.log('Borradores demo ya revisados.');process.exit(0)}
const rows=(await readFile('README_DEMO_LOCAL.md','utf8')).split('\n').filter(x=>/^\| \d+ \|/.test(x)).map(x=>{const c=x.split('|').map(v=>v.trim());return {email:c[3],password:c[4]}}),base='http://127.0.0.1:3000/api/v1/';
async function request(path,method='GET',body,cookie=''){const r=await fetch(base+path,{method,headers:{origin:'http://localhost:5173','content-type':'application/json',cookie},body:body?JSON.stringify(body):undefined});if(!r.ok)throw Error(`${method} ${path}: HTTP ${r.status}`);return {data:await r.json(),r}}
async function login(i){const r=await request('auth/login','POST',rows[i]);return r.r.headers.get('set-cookie').split(';')[0]}
const admin=await login(0),finance=await login(16);let contracts=0,payments=0;
for(let page=1;;page++){const data=(await request('contracts?page='+page,'GET',undefined,admin)).data;for(const draft of data.items.filter(x=>x.status==='BORRADOR')){const employee=(await request('employees/'+draft.employeeId,'GET',undefined,admin)).data;if(draft.snapshot.version!==employee.version){await request('contracts/'+draft.id,'PATCH',{templateId:draft.templateId,probationDays:draft.probationDays,version:draft.version,refreshSnapshot:true},admin);contracts++}}if(page*25>=data.total)break}
for(let page=1;;page++){const data=(await request('payments?status=BORRADOR&page='+page,'GET',undefined,finance)).data;for(const draft of data.items){const employee=(await request('employees/'+draft.employeeId,'GET',undefined,finance)).data;if(draft.snapshot.version!==employee.version){await request('payments/'+draft.id,'PATCH',{version:draft.version,lines:draft.lines},finance);payments++}}if(page*25>=data.total)break}
m.draftsRefreshed=true;await writeFile(file,JSON.stringify(m,null,2)+'\n',{mode:0o600});console.log('PASS borradores demo actualizados por API:',contracts,'contratos y',payments,'boletas');
