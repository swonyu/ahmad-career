// Run the actual companion through a local Postman simulation. Synthetic data only.
import {spawn} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const cli=process.env.CAREER_POSTMAN_CLI || 'postman';
const mockPort=Number(process.env.CAREER_FIXTURE_MOCK_PORT || 4907);
const port=Number(process.env.CAREER_FIXTURE_PORT || 4908);
if (![port,mockPort].every(n=>Number.isInteger(n)&&n>=1024&&n<=65535) || port===mockPort) {
  throw new Error('Choose distinct local fixture ports from 1024 through 65535.');
}
const runDir=fs.mkdtempSync(path.join(os.tmpdir(),'career-postman-run-'));
const children=[];
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const spawnLogged=(command,args,name,env=process.env)=>{
  const out=fs.openSync(path.join(runDir,name+'.out'),'w',0o600);
  const err=fs.openSync(path.join(runDir,name+'.err'),'w',0o600);
  const child=spawn(command,args,{cwd:root,env,stdio:['ignore',out,err]});
  fs.closeSync(out);fs.closeSync(err);children.push(child);
  child.on('error',error=>{child.launchError=error;});
  return child;
};
const done=child=>new Promise((resolve,reject)=>{
  if(child.launchError)return reject(child.launchError);
  if(child.exitCode!==null)return resolve(child.exitCode);
  child.once('error',reject);child.once('exit',code=>resolve(code??1));
});
async function ready(child,url) {
  for(let n=0;n<100;n++) {
    if(child.launchError)throw child.launchError;
    if(child.exitCode!==null)throw new Error('Fixture process exited before becoming ready.');
    try{const r=await fetch(url,{signal:AbortSignal.timeout(300)});if(r.ok)return;}catch{}
    await pause(100);
  }
  throw new Error('Fixture process did not become ready within ten seconds.');
}
let exitCode=1;
try {
  const version=spawnLogged(cli,['--version'],'cli-version');
  if(await done(version)!==0)throw new Error('Postman CLI is unavailable.');
  const lint=spawnLogged(cli,['collection','lint','postman/collections/verified-applications'],'lint');
  if(await done(lint)!==0)throw new Error('Postman collection lint failed.');
  const sim=spawnLogged(cli,['simulation','run','postman/simulations/lever/lever.sim.yaml','--port',String(mockPort),'--output','ndjson','--no-history'],'simulation');
  await ready(sim,`http://127.0.0.1:${mockPort}/lever/v0/postings/career-fixture/00000000-0000-4000-8000-000000000001`);
  const app=spawnLogged(process.execPath,['postman/fixtures/start-companion.mjs'],'companion',{
    ...process.env,CAREER_FIXTURE_PORT:String(port),CAREER_FIXTURE_MOCK_PORT:String(mockPort)
  });
  await ready(app,`http://127.0.0.1:${port}/api/apply/status`);
  const readyEvent=fs.readFileSync(path.join(runDir,'companion.out'),'utf8').trim().split('\n').map(s=>{try{return JSON.parse(s)}catch{return null}}).find(e=>e?.event==='fixture-ready');
  if(!readyEvent?.controlFile)throw new Error('Missing isolated fixture control file.');
  const control=JSON.parse(fs.readFileSync(readyEvent.controlFile,'utf8'));
  const collection=spawnLogged(cli,[
    'collection','run','postman/collections/verified-applications','--report-events=false',
    '--env-var',`baseUrl=http://127.0.0.1:${port}`,
    '--env-var',`mockUrl=http://127.0.0.1:${mockPort}/lever`,
    '--env-var',`mobilePairingCode=${control.mobilePairingCode}`,
    '--output',path.join(runDir,'report')
  ],'collection');
  exitCode=await done(collection);
  fs.writeFileSync(path.join(runDir,'result.json'),JSON.stringify({
    mode:'test',exitCode,runDir,liveEmployerRequests:0,
    dataDir:readyEvent.dataDir,
    providerEvidence:'Documented Lever protocol modeled by a local Postman simulation; no live provider acceptance claimed.'
  },null,2));
  console.log(fs.readFileSync(path.join(runDir,'lint.out'),'utf8').trim());
  console.log(fs.readFileSync(path.join(runDir,'collection.out'),'utf8').trim());
  if(exitCode)console.error(fs.readFileSync(path.join(runDir,'collection.err'),'utf8').trim());
} catch(error) {
  console.error(error.message);
} finally {
  for(const child of [...children].reverse()) {
    if(child.exitCode!==null || !child.pid)continue;
    child.kill('SIGINT');
    await Promise.race([done(child).catch(()=>{}),pause(3000)]);
    if(child.exitCode===null)child.kill('SIGTERM');
  }
  console.log(JSON.stringify({event:'acceptance-finished',exitCode,runDir,mode:'test'}));
  process.exitCode=exitCode;
}
