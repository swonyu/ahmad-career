// API-only companion for the native phone clients. HTTPS termination is external.
import http from 'node:http';
import path from 'node:path';
import os from 'node:os';
import {createApplicationService} from './service.mjs';

const port=Number(process.env.CAREER_APPLY_PORT??8780);
if(!Number.isInteger(port)||port<1024||port>65535)throw new Error('CAREER_APPLY_PORT must be an integer from 1024 to 65535.');
const origin=process.env.CAREER_APPLY_ORIGIN??`http://127.0.0.1:${port}`;
const dataDir=process.env.CAREER_APPLY_DATA_DIR??path.join(os.homedir(),'.local','share','saleh-career-finder','applications');
let testOnly;
if(process.env.CAREER_APPLY_TEST_MODE==='1') {
  if(process.env.NODE_ENV!=='test'||!process.env.CAREER_APPLY_TEST_BASE_URL)throw new Error('Test mode requires NODE_ENV=test and an explicit local mock URL.');
  testOnly={enabled:true,baseURL:process.env.CAREER_APPLY_TEST_BASE_URL,timeoutMs:Number(process.env.CAREER_APPLY_TEST_TIMEOUT_MS??15000)};
} else if(process.env.NODE_ENV==='test'||process.env.CAREER_APPLY_TEST_BASE_URL)throw new Error('Refusing ambiguous test setup. Enable explicit isolated mock mode.');
const service=createApplicationService({dataDir,origin,testOnly});
const server=http.createServer((req,res)=>{
  service.handle(req,res).then(handled=>{
    if(!handled){res.writeHead(404,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify({ok:false,error:{code:'not_found',message:'This service exposes the Career Finder application API only.'}}))}
  }).catch(()=>{if(!res.headersSent){res.writeHead(500,{'Content-Type':'application/json'});res.end(JSON.stringify({ok:false,error:{code:'service_error',message:'The request could not be handled safely.'}}))}});
});
server.on('error',async()=>{console.error('The application API could not listen on its loopback port.');await service.close();process.exitCode=1});
server.listen(port,'127.0.0.1',()=>console.log(`Career Finder application API listening on 127.0.0.1:${port}; mode ${service.mode}. Phone access requires an HTTPS gateway and a one-use pairing code.`));
let stopping=false;
async function stop(){if(stopping)return;stopping=true;server.close();await service.close();server.closeAllConnections()}
process.on('SIGINT',stop);process.on('SIGTERM',stop);
