import {spawnSync} from 'node:child_process';
import assert from 'node:assert/strict';
function docker(args,allowFailure=false){const r=spawnSync('docker',args,{encoding:'utf8'});if(!allowFailure&&r.status!==0)throw new Error(`Infrastructure check failed: ${args[0]}`);return r;}
const names=['identity','personnel','vacation','contract','payment'];
const rows=docker(['compose','ps','--format','json']).stdout.trim().split(/\r?\n/).filter(Boolean).flatMap(s=>{const v=JSON.parse(s);return Array.isArray(v)?v:[v]});
assert.equal(rows.length,8,'All eight Compose services must be running');
for(const row of rows){
 assert.equal(row.Health,'healthy',`Healthcheck: ${row.Service}`);
 const id=docker(['compose','ps','-q',row.Service]).stdout.trim();
 if(row.Service!=='postgres')assert.notEqual(docker(['exec',id,'id','-u']).stdout.trim(),'0','Application must not run as root');
 if(row.Service==='postgres'){
  const published=docker(['port',id]).stdout.trim();
  if(process.env.ALLOW_DEV_DATABASE_PORT==='true')assert.ok(!published||published.includes('127.0.0.1:55432'),'Development SQL port must remain loopback-only');
  else assert.equal(published,'','Canonical PostgreSQL must not publish a host port');
 }
 const environment=JSON.parse(docker(['inspect',id,'--format','{{json .Config.Env}}']).stdout);
 const has=name=>environment.some(value=>value.startsWith(name+'=')&&value.length>name.length+1);
 if(row.Service!=='identity-service')for(const secret of ['SMTP_PASSWORD','SMTP_USER','MAIL_ENCRYPTION_KEY'])assert.equal(has(secret),false,`${secret} must be limited to Identity`);
 if(row.Service!=='api-gateway')assert.equal(has('GATEWAY_PRIVATE_KEY'),false,'Gateway signing key must remain exclusive');
 if(names.some(n=>row.Service===n+'-service')){
  assert.equal(docker(['port',id]).stdout.trim(),'','Domain service must not publish a host port');
 }
}
for(const from of names){
 const env=`${from.toUpperCase()}_DB_PASSWORD`;
 const own=docker(['compose','exec','-T','postgres','sh','-c',`PGPASSWORD="$${env}" psql -h 127.0.0.1 -U arca_${from} -d arca_${from} -Atc 'SELECT 1'`]);
 assert.equal(own.stdout.trim(),'1');
 for(const target of names.filter(n=>n!==from)){
  const other=docker(['compose','exec','-T','postgres','sh','-c',`PGPASSWORD="$${env}" psql -h 127.0.0.1 -U arca_${from} -d arca_${target} -Atc 'SELECT 1'`],true);
  assert.notEqual(other.status,0,'Cross-database access must be rejected');
 }
}
console.log('PASS infrastructure: eight healthy services, private domain ports, non-root applications, restricted secrets, five own-database connections and 20 cross-database denials.');
