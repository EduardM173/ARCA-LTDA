// Only for a new, isolated CI checkout. Existing local secrets are never overwritten.
import {writeFile} from 'node:fs/promises';
import {randomBytes,generateKeyPairSync} from 'node:crypto';
const secret=()=>randomBytes(32).toString('base64url');
const {privateKey,publicKey}=generateKeyPairSync('ed25519');
const lines=[`POSTGRES_PASSWORD=${secret()}`,'APP_PUBLIC_URL=http://localhost:5173',`GATEWAY_PRIVATE_KEY=${Buffer.from(privateKey.export({type:'pkcs8',format:'pem'})).toString('base64')}`,`GATEWAY_PUBLIC_KEY=${Buffer.from(publicKey.export({type:'spki',format:'pem'})).toString('base64')}`,`MAIL_ENCRYPTION_KEY=${randomBytes(32).toString('hex')}`];
for(const name of ['identity','personnel','vacation','contract','payment']){
 const password=secret();lines.push(`${name.toUpperCase()}_DB_PASSWORD=${password}`,`${name.toUpperCase()}_DATABASE_URL=postgresql://arca_${name}:${password}@localhost:55432/arca_${name}?schema=public`);
}
for(const name of ['personnel','vacation','contract','payment'])lines.push(`${name.toUpperCase()}_KEY=${secret()}`);
lines.push('SMTP_HOST=smtp.gmail.com','SMTP_PORT=587','SMTP_USER=','SMTP_PASSWORD=','SMTP_FROM=','BOOTSTRAP_EMAIL=ci-admin@example.invalid');
await writeFile('.env',lines.join('\n')+'\n',{flag:'wx',mode:0o600});
console.log('Created isolated CI configuration without exposing values. External SMTP requires separate approved credentials.');
