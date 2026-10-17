import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
const skip = new Set(['.git','.tools','node_modules','.next','dist','coverage','.agents','_bmad','_bmad-output','.temp','test-results','playwright-report','.vercel']);
const patterns = [/sb_secret_[A-Za-z0-9_-]{16,}/, /gh[pousr]_[A-Za-z0-9]{25,}/, /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/];
let failures = 0;
async function visit(dir) {
  for (const entry of await readdir(dir,{withFileTypes:true})) {
    if(skip.has(entry.name) || /^\.env(?:\.local|\..*\.local)?$/.test(entry.name)) continue;
    const file = path.join(dir,entry.name);
    if(entry.isDirectory()) await visit(file);
    else {
      const value=await readFile(file,'utf8');
      const jwtValues=value.match(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g)||[];
      const privilegedJwt=jwtValues.some(token=>{try{return JSON.parse(Buffer.from(token.split('.')[1],'base64url').toString()).role==='service_role';}catch{return false;}});
      if(patterns.some(pattern=>pattern.test(value))||privilegedJwt){console.error(`Potential secret: ${file}`); failures++;}
    }
  }
}
await visit(process.cwd());
if(failures)process.exitCode=1;else console.log('Secret scan passed (known key formats; review environment separately).');
