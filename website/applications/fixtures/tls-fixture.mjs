// Test-only HTTPS boundary for real native clients. No live configuration or upstream is loaded.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import https from 'node:https';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {randomUUID} from 'node:crypto';
import {createApplicationService} from '../service.mjs';
import {fixtureCertificates} from './certificates.mjs';

const mockPath=fileURLToPath(new URL('../../../postman/mocks/lever/default.js',import.meta.url));
const pdfPath=fileURLToPath(new URL('../../../postman/fixtures/integration-resume.pdf',import.meta.url));
const site='career-fixture';
const ids={success:'00000000-0000-4000-8000-000000000001',noReceipt:'00000000-0000-4000-8000-000000000002',serverError:'00000000-0000-4000-8000-000000000003',timeout:'00000000-0000-4000-8000-000000000004',cooldown:'00000000-0000-4000-8000-000000000005',rejected:'00000000-0000-4000-8000-000000000006',redirect:'00000000-0000-4000-8000-000000000007'};
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const privateJSON=(file,value)=>fs.writeFileSync(file,JSON.stringify(value,null,2)+'\n',{mode:0o600});

export async function startTLSFixture({runtimeDir,port=4943,mockPort=4944,timeoutMs=350}={}) {
  if(![port,mockPort].every(p=>Number.isInteger(p)&&p>=1024&&p<=65535)||port===mockPort)throw new Error('Use two distinct fixture ports from 1024 through 65535.');
  const certs=fixtureCertificates(runtimeDir??fs.mkdtempSync(path.join(os.tmpdir(),'career-native-tls-')));
  const origin=`https://10.0.2.2:${port}`,mockOrigin=`http://127.0.0.1:${mockPort}`;
  const runDir=path.join(certs.runtimeDir,'runs',randomUUID());fs.mkdirSync(runDir,{recursive:true,mode:0o700});
  const controlFile=path.join(certs.runtimeDir,'control.private.json');
  const mock=spawn(process.execPath,[mockPath],{env:{PATH:process.env.PATH,PORT:String(mockPort),NODE_ENV:'test'},stdio:['ignore','ignore','pipe']});
  let mockError='',service,server,closed=false;
  mock.stderr.on('data',chunk=>{mockError=(mockError+chunk.toString()).slice(-2000)});
  const mockFailure=new Promise((_,reject)=>{mock.once('error',reject);mock.once('exit',code=>{if(!closed)reject(new Error(`Synthetic provider exited before fixture shutdown (code ${code}).`))})});
  // Keep rejection handled even after startup; the fixture process owns this child only.
  mockFailure.catch(()=>{});
  async function observations(){const response=await fetch(mockOrigin+'/__test/observations',{signal:AbortSignal.timeout(1000)});if(!response.ok)throw new Error('Synthetic provider observations unavailable.');const result=await response.json();if(result.testOnly!==true)throw new Error('The upstream is not the synthetic provider.');return result}
  async function close() {
    if(closed)return;closed=true;
    if(server){server.close();server.closeIdleConnections()}
    if(service)await service.close();
    if(server)server.closeAllConnections();
    try{privateJSON(path.join(runDir,'observations.private.json'),await observations())}catch{}
    if(mock.exitCode===null){mock.kill('SIGTERM');await Promise.race([once(mock,'exit'),delay(1500)]);if(mock.exitCode===null)mock.kill('SIGKILL')}
    privateJSON(path.join(runDir,'stopped.private.json'),{testOnly:true,stoppedAt:new Date().toISOString()});
  }
  try {
    await Promise.race([mockFailure,(async()=>{
      for(let i=0;i<60;i++) {
        if(mock.exitCode!==null)throw new Error('Synthetic provider could not bind its loopback port.');
        try {const result=await observations();await delay(100);if(mock.exitCode!==null)throw new Error('Synthetic provider failed to bind.');if(result.observations.length||Object.keys(result.counts).length)throw new Error('The synthetic provider is not fresh. Choose unused fixture ports.');return}catch(error){if(i===59||mock.exitCode!==null)throw error;await delay(50)}
      }
    })()]);
    const createdAt=Date.now(),configPath=path.join(runDir,'connector.private.json');
    const postings=Object.fromEntries(Object.values(ids).map(id=>[id,{revision:'native-tls-fixture-v1',reviewedAt:new Date(createdAt-1000).toISOString(),expiresAt:new Date(createdAt+60*60000).toISOString(),hasCustomQuestions:false,requiredFields:['name','email','resume','consentMarketing'],privacyPolicyUrl:'https://example.com/fixture-privacy'}]));
    privateJSON(configPath,{version:1,connectors:[{provider:'lever',region:'global',site,apiKeyEnv:'CAREER_LEVER_FIXTURE_KEY',postings}]});
    const dataDir=path.join(runDir,'data');
    service=createApplicationService({origin,dataDir,configPath,env:{NODE_ENV:'test',CAREER_LEVER_FIXTURE_KEY:'fixture-key-never-real'},testOnly:{enabled:true,allowEmulatorTLS:true,baseURL:mockOrigin,timeoutMs}});
    server=https.createServer({key:fs.readFileSync(certs.keyPath),cert:fs.readFileSync(certs.certPath),minVersion:'TLSv1.2'},async(req,res)=>{
      if(!await service.handle(req,res)){res.writeHead(404,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify({ok:false,error:{code:'fixture_route',message:'Application API only'}}))}
    });
    server.requestTimeout=30000;server.headersTimeout=10000;
    server.listen(port,'127.0.0.1');await once(server,'listening');
    const paired=service.createPairingCode();
    const control={schemaVersion:1,testOnly:true,mode:'test',origin,bindAddress:'127.0.0.1',mockOrigin,caPath:certs.caPath,caFingerprint256:certs.caFingerprint256,certificateExpiresAt:certs.expiresAt,dataDir,runDir,controlFile,pid:process.pid,pairingCode:paired.pairingCode,pairingExpiresAt:paired.expiresAt,jobs:Object.fromEntries(Object.entries(ids).map(([name,id])=>[name,`https://jobs.lever.co/${site}/${id}`])),resume:{name:'Fixture-CV.pdf',mime:'application/pdf',dataBase64:fs.readFileSync(pdfPath).toString('base64')}};
    privateJSON(controlFile,control);
    return {service,server,...control,observations,close};
  } catch(error) {await close();throw new Error(`Isolated TLS fixture could not start: ${error.message}${mockError?' (inspect the selected local mock port)':''}`)}
}

if(process.argv[1]&&pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url) {
  const args=process.argv.slice(2);let runtimeDir,port=4943,mockPort=4944,initOnly=false;
  for(let i=0;i<args.length;i++) {
    if(args[i]==='--runtime-dir')runtimeDir=args[++i];
    else if(args[i]==='--port')port=Number(args[++i]);
    else if(args[i]==='--mock-port')mockPort=Number(args[++i]);
    else if(args[i]==='--init-only')initOnly=true;
    else throw new Error('Use --runtime-dir ABSOLUTE_PRIVATE_DIRECTORY [--port 4943] [--mock-port 4944] [--init-only].');
  }
  if(!runtimeDir)throw new Error('--runtime-dir is required so the acceptance build can use its public CA.');
  if(initOnly) {
    const {runtimeDir:directory,caPath,caFingerprint256,expiresAt}=fixtureCertificates(runtimeDir);
    console.log(JSON.stringify({event:'fixture-certificates-ready',testOnly:true,runtimeDir:directory,caPath,caFingerprint256,expiresAt}));
  } else {
    const fixture=await startTLSFixture({runtimeDir,port,mockPort});
    console.log(JSON.stringify({event:'native-tls-fixture-ready',mode:'test',origin:fixture.origin,bindAddress:fixture.bindAddress,caPath:fixture.caPath,controlFile:fixture.controlFile,dataDir:fixture.dataDir}));
    for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>fixture.close().catch(()=>{process.exitCode=1}));
  }
}
