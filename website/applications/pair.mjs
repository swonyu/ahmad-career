// Explicit administrator-only local command. No HTTP endpoint can issue pairing codes.
import fs from 'node:fs';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {pairingSchema,issuePairingCode} from './pairing.mjs';

const args=process.argv.slice(2);
function option(name){const i=args.indexOf(name);return i<0?undefined:args[i+1]}
if(args.includes('--help')) {
  console.log('Usage: node applications/pair.mjs --data-dir /private/application-data [--workspace EXISTING_ID]\nRun after starting the companion. The one-use code expires in five minutes. Keep it private.');
  process.exit(0);
}
const dataDir=option('--data-dir')??process.env.CAREER_APPLY_DATA_DIR;
if(!dataDir){console.error('Provide the companion’s explicit --data-dir. No directory is guessed.');process.exit(1)}
const dbPath=path.join(path.resolve(dataDir),'applications.sqlite');
if(!fs.existsSync(dbPath)||fs.lstatSync(dbPath).isSymbolicLink()){console.error('Start the companion first; its existing private database was not found.');process.exit(1)}
let db;
try {
  db=new DatabaseSync(dbPath);db.exec('PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000; PRAGMA synchronous=FULL;');
  if(!db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='workspaces'").get())throw Error('schema');
  db.exec(pairingSchema);
  const code=issuePairingCode(db,{workspaceId:option('--workspace')??null});
  console.log(JSON.stringify(code,null,2));
} catch {console.error('The code could not be issued. Check the existing ledger and workspace identifier.');process.exitCode=1}
finally{db?.close()}
