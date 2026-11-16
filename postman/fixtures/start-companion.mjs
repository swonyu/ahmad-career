// Dedicated, synthetic-only application-under-test server. Never loads real config.
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createApplicationService} from '../../website/applications/service.mjs';

const port = Number(process.env.CAREER_FIXTURE_PORT || 4908);
const mockPort = Number(process.env.CAREER_FIXTURE_MOCK_PORT || 4907);
if (![port,mockPort].every(n => Number.isInteger(n) && n >= 1024 && n <= 65535)) {
  throw new Error('Fixture ports must be integers from 1024 through 65535.');
}
const origin = `http://127.0.0.1:${port}`;
const mockBase = `http://127.0.0.1:${mockPort}/lever`;
const fixtures = JSON.parse(fs.readFileSync(new URL('./jobs.json', import.meta.url),'utf8'));
const dir = fs.mkdtempSync(path.join(os.tmpdir(),'career-postman-fixture-'));
fs.chmodSync(dir,0o700);
const configPath = path.join(dir,'fixture-config.json');
const postings = Object.fromEntries(Object.values(fixtures.jobs).map(id => [id, {
  revision:'synthetic-fixture-v1',
  reviewedAt:new Date(Date.now()-1000).toISOString(),
  expiresAt:new Date(Date.now()+60*60*1000).toISOString(),
  hasCustomQuestions:false,
  requiredFields:['name','email','resume'],
  privacyPolicyUrl:'https://example.com/fixture-privacy'
}]));
fs.writeFileSync(configPath,JSON.stringify({version:1,connectors:[{
  provider:'lever',region:'global',site:fixtures.site,
  apiKeyEnv:'CAREER_LEVER_FIXTURE_KEY',postings
}]}),{mode:0o600});
const service = createApplicationService({
  origin,dataDir:path.join(dir,'data'),configPath,
  env:{NODE_ENV:'test',CAREER_LEVER_FIXTURE_KEY:fixtures.apiKey},
  testOnly:{enabled:true,baseURL:mockBase,timeoutMs:350}
});
const pairing = service.createPairingCode();
const controlFile=path.join(dir,'fixture-control.json');
fs.writeFileSync(controlFile,JSON.stringify({mobilePairingCode:pairing.pairingCode}),{mode:0o600});
const server = http.createServer(async(req,res) => {
  if (!await service.handle(req,res)) {
    res.writeHead(404,{'Content-Type':'application/json'});
    res.end(JSON.stringify({ok:false,error:{code:'fixture_route',message:'Application API only'}}));
  }
});
server.listen(port,'127.0.0.1',() => {
  console.log(JSON.stringify({event:'fixture-ready',mode:'test',origin,mockBase,dataDir:dir,controlFile}));
});
async function close() {
  server.close();
  await service.close();
  process.exitCode=0;
}
process.once('SIGINT',close);
process.once('SIGTERM',close);
