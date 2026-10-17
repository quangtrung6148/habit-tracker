import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
const sql=readFileSync(new URL('../supabase/tests/integrity.sql',import.meta.url),'utf8');
const container=process.env.SUPABASE_DB_CONTAINER||'supabase_db_habit-tracker';
const result=spawnSync('docker',['exec','-i',container,'psql','-U','postgres','-d','postgres','--set','ON_ERROR_STOP=1'],{input:sql,encoding:'utf8'});
if(result.error){console.error('Docker/Supabase local unavailable. Start Supabase first.');process.exit(1);}
process.stdout.write(result.stdout||'');process.stderr.write(result.stderr||'');process.exit(result.status??1);
