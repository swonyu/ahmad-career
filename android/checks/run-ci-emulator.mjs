import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

// This owns one fresh virtual device on a disposable GitHub runner. It must never
// attach to the user's phones, existing AVDs, shared Mac or release credentials.
assert.equal(process.env.GITHUB_ACTIONS, 'true', 'Use the disposable CI job for this runner.');
assert.equal(process.platform, 'linux');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const sdk = process.env.ANDROID_HOME;
assert.ok(sdk && process.env.RUNNER_TEMP);
const runtime = fs.mkdtempSync(path.join(process.env.RUNNER_TEMP, 'career-android-'));
const evidence = path.join(root, 'android/checks/ci-evidence');
fs.mkdirSync(evidence, {recursive:true});
const env = {...process.env, ANDROID_AVD_HOME:path.join(runtime,'avd'), ANDROID_USER_HOME:path.join(runtime,'user'), ANDROID_SERIAL:'emulator-5580', ANDROID_ADB_SERVER_PORT:'5054', ADB_SERVER_SOCKET:'tcp:127.0.0.1:5054', ADB_MDNS_AUTO_CONNECT:'0'};
fs.mkdirSync(env.ANDROID_AVD_HOME,{recursive:true});fs.mkdirSync(env.ANDROID_USER_HOME,{recursive:true});
const adb = path.join(sdk, 'platform-tools/adb');
const processes = new Set(), lifecycles = new WeakMap(), results = [], installedPackages = new Set();
let fixture;
const delay = ms => new Promise(resolve => setTimeout(resolve,ms));
function own(child) {
  let spawned,spawnFailed,closed;
  const lifecycle={done:false,error:null,stopping:null,
    spawned:new Promise((resolve,reject)=>{spawned=resolve;spawnFailed=reject}),
    closed:new Promise(resolve=>{closed=resolve})};
  lifecycles.set(child,lifecycle);processes.add(child);
  // Install both listeners before yielding; spawn failures must reach the same
  // awaited cleanup path as ordinary nonzero exits.
  child.once('spawn',()=>spawned());
  child.on('error',error=>{lifecycle.error??=error;spawnFailed(error)});
  lifecycle.spawned.catch(()=>{});
  child.once('close',(code,signal)=>{
    lifecycle.done=true;processes.delete(child);closed({code,signal,error:lifecycle.error});
  });
  child.stdin?.on('error',()=>{}); // A child may close stdin before its own exit.
  return child;
}
async function within(promise,timeout) {
  let timer;
  try {return await Promise.race([
    promise.then(value=>({completed:true,value})),
    new Promise(resolve=>{timer=setTimeout(()=>resolve({completed:false}),timeout)})
  ])} finally {clearTimeout(timer)}
}
function signalOwned(child,signal) {
  // Each spawn has its own Linux process group, so Gradle/emulator descendants
  // cannot keep output pipes open after only their immediate parent is stopped.
  if(lifecycles.get(child).done)return;
  if(Number.isInteger(child.pid)&&child.pid>0) {
    try {process.kill(-child.pid,signal);return} catch(error) {if(error.code!=='ESRCH')throw error}
  }
  child.kill(signal);
}
async function terminate(child,grace=3000,killGrace=3000) {
  const lifecycle=lifecycles.get(child);
  if(lifecycle.done)return lifecycle.closed;
  if(lifecycle.stopping)return lifecycle.stopping;
  lifecycle.stopping=(async()=>{
    let signalError;
    try {signalOwned(child,'SIGTERM')}catch(error){signalError=error}
    let result=await within(lifecycle.closed,grace);
    if(result.completed)return result.value;
    try {signalOwned(child,'SIGKILL')}catch(error){signalError=error}
    result=await within(lifecycle.closed,killGrace);
    if(result.completed)return result.value;
    // A broken inherited pipe or unresponsive OS process must not hang evidence
    // upload indefinitely. Surface the failure after releasing our own handles.
    for(const stream of [child.stdin,child.stdout,child.stderr])stream?.destroy();
    child.unref();processes.delete(child);
    throw Error(`An owned subprocess did not close after SIGKILL${signalError?`: ${signalError.message}`:''}.`);
  })();
  return lifecycle.stopping;
}
async function awaitSpawn(child) {
  const result=await within(lifecycles.get(child).spawned,10000);
  if(!result.completed)throw Error('An owned subprocess did not report a successful spawn within ten seconds.');
}
async function start(command,args,log,cwd=root) {
  const output=fs.openSync(path.join(evidence,log),'a');
  let child;
  try {child=own(spawn(command,args,{cwd,env,detached:true,stdio:['ignore',output,output]}))}
  finally {fs.closeSync(output)}
  try {await awaitSpawn(child);return child}
  catch(error){try{await terminate(child)}catch(shutdown){console.warn(shutdown.message)}throw error}
}
async function run(command,args,{log,stdin,timeout=120000,cwd=root}={}) {
  const child=own(spawn(command,args,{cwd,env,detached:true,stdio:['pipe','pipe','pipe']}));
  const chunks=[];let bytes=0;
  const output=log?fs.createWriteStream(path.join(evidence,log),{flags:'a'}):null;
  for(const stream of [child.stdout,child.stderr])stream.on('data',part=>{output?.write(part);bytes+=part.length;if(bytes<32*1024*1024)chunks.push(part)});
  try {
    await awaitSpawn(child);child.stdin.end(stdin??'');
    const result=await within(lifecycles.get(child).closed,timeout);
    if(!result.completed)throw Error(`${path.basename(command)} timed out after ${timeout}ms; see ${log??'runner output'}.`);
    const {code,error}=result.value;
    if(error)throw error;
    const text=Buffer.concat(chunks).toString();
    if(code!==0)throw Error(`${path.basename(command)} failed (${code}); see ${log??'runner output'}. ${log?'':text.slice(-1000)}`);
    return text;
  } finally {
    try {await terminate(child)}finally{if(output)await new Promise(resolve=>output.end(resolve))}
  }
}
const device=(...args)=>run(adb,['-s',env.ANDROID_SERIAL,...args]);

function assertSyntheticObservations(observations,jobs,pdfByteLength) {
  assert.equal(observations.testOnly,true,'Only the isolated synthetic provider may supply these observations.');
  assert.ok(observations.counts && typeof observations.counts==='object' && !Array.isArray(observations.counts));
  const expectedCounts=Object.fromEntries([['success',1],['timeout',1],['cooldown',2]].map(([name,count])=>[new URL(jobs[name]).pathname.split('/').at(-1),count]));
  assert.equal(Object.keys(expectedCounts).length,3,'Each fixture scenario must use a distinct posting.');
  assert.deepEqual(Object.keys(observations.counts).sort(),Object.keys(expectedCounts).sort(),'No unexpected synthetic posting may receive a POST.');
  assert.ok(Array.isArray(observations.observations));
  assert.equal(observations.observations.length,4,'Success, uncertainty and explicit cooldown continuation require exactly four provider POSTs.');
  for(const [id,count] of Object.entries(expectedCounts)) {
    assert.equal(observations.counts[id],count,`Unexpected provider POST count for ${id}; a lost response must not cause a duplicate.`);
    const events=observations.observations.filter(event=>event.id===id);
    assert.equal(events.length,count,`The provider counter and recorded requests disagree for ${id}.`);
    assert.deepEqual(events.map(event=>event.count).sort((a,b)=>a-b),Array.from({length:count},(_,index)=>index+1));
    for(const event of events) {
      assert.equal(event.method,'POST');
      for(const field of ['multipart','hasPDFBytes','hasNameField','hasEmailField','hasResumeField'])
        assert.equal(event[field],true,`The synthetic provider did not receive a valid ${field} observation for ${id}.`);
      assert.ok(Number.isSafeInteger(event.byteLength) && event.byteLength>pdfByteLength && event.byteLength<=8*1024*1024,'The multipart byte length is invalid.');
      assert.match(event.bodySHA256,/^[a-f0-9]{64}$/,'Each recorded multipart request must have a full SHA-256 fingerprint.');
    }
  }
  return expectedCounts;
}

// Only extract PNG evidence from the known debuggable test apps. Never archive
// their private vault, tokens, database, arbitrary files or an entire data directory.
const screenshotDirectories={
  'com.saleh.careerfinder.preview':['cache/navigation-review-evidence','cache/linkedin-review-evidence','cache/strict-review-evidence'],
  'com.saleh.careerfinder.acceptance':['files']
};
async function readScreenshot(packageName,remotePath) {
  const child=own(spawn(adb,['-s',env.ANDROID_SERIAL,'exec-out','run-as',packageName,'cat',remotePath],{cwd:root,env,detached:true,stdio:['ignore','pipe','pipe']}));
  const chunks=[];let bytes=0,stderr='',oversized=false;
  child.stdout.on('data',part=>{
    bytes+=part.length;
    if(bytes>16*1024*1024){if(!oversized){oversized=true;terminate(child).catch(()=>{})}}else chunks.push(part);
  });
  child.stderr.on('data',part=>{stderr=(stderr+part.toString()).slice(-2000)});
  try {
    await awaitSpawn(child);
    const result=await within(lifecycles.get(child).closed,15000);
    assert.ok(result.completed,'Screenshot read exceeded its fifteen-second limit.');
    const {code,error}=result.value;
    if(error)throw error;
    assert.equal(code,0,`Screenshot read failed${oversized?' (size limit)':''}: ${stderr.trim()}`);
    assert.ok(!oversized,'The screenshot exceeded its bounded read.');
    const png=Buffer.concat(chunks);
    assert.ok(png.length>=45 && png.subarray(0,8).equals(Buffer.from('89504e470d0a1a0a','hex')) && png.subarray(12,16).toString()==='IHDR','The captured file is not a PNG.');
    assert.ok(png.subarray(-12).equals(Buffer.from('0000000049454e44ae426082','hex')),'The screenshot is incomplete.');
    const width=png.readUInt32BE(16),height=png.readUInt32BE(20);
    assert.ok(width>0 && height>0 && width<=8192 && height<=8192,'The screenshot dimensions are invalid.');
    return {png,width,height};
  } finally {await terminate(child)}
}
async function collectScreenshots() {
  const report={observedAt:new Date().toISOString(),device:env.ANDROID_SERIAL,captures:[],unavailable:[]};
  for(const packageName of installedPackages) {
    for(const directory of screenshotDirectories[packageName]??[]) {
      let listing;
      try {
        listing=await run(adb,['-s',env.ANDROID_SERIAL,'shell','run-as',packageName,'ls','-1',directory],{log:'screenshot-extraction.log',timeout:15000});
      } catch(error) {report.unavailable.push({packageName,directory,reason:error.message});continue}
      const names=listing.split(/\r?\n/).filter(name=>/^[a-z0-9][a-z0-9-]{0,100}\.png$/.test(name))
        .filter(name=>directory!=='files'||/^acceptance-[a-z0-9-]+\.png$/.test(name)).sort();
      if(names.length>64){report.unavailable.push({packageName,directory,reason:'More than 64 screenshot files; refusing an unbounded extraction.'});continue}
      if(names.length===0)report.unavailable.push({packageName,directory,reason:'No completed screenshot was present; a failed test may not have reached its capture.'});
      for(const name of names) {
        const remotePath=`${directory}/${name}`;
        try {
          const {png,width,height}=await readScreenshot(packageName,remotePath);
          const relative=path.join('captures',packageName,directory,name);
          const destination=path.join(evidence,relative);
          fs.mkdirSync(path.dirname(destination),{recursive:true});fs.writeFileSync(destination,png);
          report.captures.push({packageName,remotePath,file:relative,bytes:png.length,width,height,sha256:createHash('sha256').update(png).digest('hex')});
        } catch(error) {report.unavailable.push({packageName,remotePath,reason:error.message})}
      }
    }
  }
  fs.writeFileSync(path.join(evidence,'screenshots.json'),JSON.stringify(report,null,2));
  console.log(`Preserved ${report.captures.length} native screenshots; ${report.unavailable.length} paths were unavailable.`);
}
async function preserveFailureEvidence() {
  if(fixture) {
    try {
      const observations=await fixture.observations();
      fs.writeFileSync(path.join(evidence,'synthetic-provider-observations.json'),JSON.stringify(observations,null,2));
    } catch(error) {console.warn(`Synthetic provider observations could not be preserved: ${error.message}`)}
  }
  try {await collectScreenshots()} catch(error) {console.warn(`Screenshot extraction could not finish: ${error.message}`)}
}
async function configure(packageName) {
  await device('shell','wm','size','1080x1920');await device('shell','wm','density','480');
  await device('shell','settings','put','system','font_scale','1.8');
  await device('shell','settings','put','global','debug.force_rtl','1');
  await device('shell','cmd','uimode','night','yes');
  await device('shell','cmd','locale','set-app-locales',packageName,'--user','0','--locales','ar');
  for(const key of ['window_animation_scale','transition_animation_scale','animator_duration_scale'])await device('shell','settings','put','global',key,'0');
  const settings={size:(await device('shell','wm','size')).trim(),density:(await device('shell','wm','density')).trim(),fontScale:(await device('shell','settings','get','system','font_scale')).trim(),rtl:(await device('shell','settings','get','global','debug.force_rtl')).trim(),night:(await device('shell','cmd','uimode','night')).trim(),locales:(await device('shell','cmd','locale','get-app-locales',packageName,'--user','0')).trim()};
  assert.equal(settings.fontScale,'1.8');assert.equal(settings.rtl,'1');assert.match(settings.locales,/ar/);
  fs.writeFileSync(path.join(evidence,`${packageName}-settings.json`),JSON.stringify(settings,null,2));
}
async function instrument(label,packageName,classes,argumentsMap={},minimum=1) {
  const args=['-s',env.ANDROID_SERIAL,'shell','am','instrument','-w','-r','-e','class',classes.join(',')];
  for(const [name,value] of Object.entries(argumentsMap))args.push('-e',name,String(value));
  args.push(`${packageName}.test/androidx.test.runner.AndroidJUnitRunner`);
  const output=await run(adb,args,{log:label+'.log',timeout:15*60000});
  const count=Number(output.match(/OK \((\d+) tests?\)/)?.[1]??0);
  assert.ok(count>=minimum,`${label} did not report the required completed test count; inspect its log.`);
  assert.doesNotMatch(output,/FAILURES!!!|INSTRUMENTATION_FAILED|INSTRUMENTATION_STATUS_CODE: -(?:1|2|3|4)\b/);
  results.push({label,classes,tests:count,result:'passed'});
  console.log(`${label}: ${count} instrumented tests passed.`);
}
try {
  await run(path.join(sdk,'cmdline-tools/latest/bin/avdmanager'),['create','avd','--name','CareerFinderCI','--package','system-images;android-36;google_apis;x86_64','--device','pixel_7'],{stdin:'no\n',log:'avd-create.log'});
  await run(adb,['start-server'],{log:'adb.log'});
  const emulator=await start(path.join(sdk,'emulator/emulator'),['-avd','CareerFinderCI','-port','5580','-no-window','-no-audio','-no-snapshot','-no-boot-anim','-gpu','swiftshader','-memory','2048','-cores','2'],'emulator.log');
  let booted=false;
  for(let attempt=0;attempt<120;attempt++) {
    assert.equal(emulator.exitCode,null,'The owned emulator exited before boot.');
    try {if((await device('shell','getprop','sys.boot_completed')).trim()==='1'){booted=true;break}}catch{}
    await delay(2000);
  }
  assert.ok(booted,'The owned emulator did not finish booting.');
  await device('shell','input','keyevent','82');
  await device('install','-r',path.join(root,'android/app/build/outputs/apk/debug/app-debug.apk'));
  installedPackages.add('com.saleh.careerfinder.preview');
  await device('install','-r',path.join(root,'android/app/build/outputs/apk/androidTest/debug/app-debug-androidTest.apk'));
  await configure('com.saleh.careerfinder.preview');
  const testDirectory=path.join(root,'android/app/src/androidTest/java/com/saleh/careerfinder');
  const classes=fs.readdirSync(testDirectory).filter(name=>name.endsWith('.kt')).flatMap(name=>[...fs.readFileSync(path.join(testDirectory,name),'utf8').matchAll(/^class\s+(\w+(?:Test))\b/gm)].map(match=>match[1])).filter(name=>!['NativeHttpsAcceptanceTest','TlsBoundaryAcceptanceTest'].includes(name)).sort().map(name=>'com.saleh.careerfinder.'+name);
  assert.ok(classes.some(name=>name.endsWith('WorkspaceSafetyRegressionTest')),'New safety regressions must be selected.');
  await instrument('ordinary-phone','com.saleh.careerfinder.preview',classes,{},97);
  const {startTLSFixture}=await import('../../website/applications/fixtures/tls-fixture.mjs');
  fixture=await startTLSFixture({runtimeDir:path.join(runtime,'tls'),port:4943,mockPort:4944});
  await instrument('normal-preview-tls-boundary','com.saleh.careerfinder.preview',['com.saleh.careerfinder.TlsBoundaryAcceptanceTest'],{fixtureOrigin:fixture.origin});
  await run(path.join(root,'android/gradlew'),['--no-daemon','--max-workers=2','-PcareerAcceptance=true','-PcareerAcceptanceCa='+fixture.caPath,':app:assembleAcceptance',':app:assembleAcceptanceAndroidTest'],{cwd:path.join(root,'android'),log:'acceptance-build.log',timeout:10*60000});
  await device('install','-r',path.join(root,'android/app/build/outputs/apk/acceptance/app-acceptance.apk'));
  installedPackages.add('com.saleh.careerfinder.acceptance');
  await device('install','-r',path.join(root,'android/app/build/outputs/apk/androidTest/acceptance/app-acceptance-androidTest.apk'));
  await configure('com.saleh.careerfinder.acceptance');
  const currentPairingCode=fixture.service.createPairingCode().pairingCode;
  await instrument('native-https-phone','com.saleh.careerfinder.acceptance',['com.saleh.careerfinder.NativeHttpsAcceptanceTest'],{fixtureOrigin:fixture.origin,pairingCode:currentPairingCode,fixtureResumeBase64:fixture.resume.dataBase64,successUrl:fixture.jobs.success,timeoutUrl:fixture.jobs.timeout,cooldownUrl:fixture.jobs.cooldown});
  const observations=await fixture.observations();
  fs.writeFileSync(path.join(evidence,'synthetic-provider-observations.json'),JSON.stringify(observations,null,2));
  const providerPOSTCounts=assertSyntheticObservations(observations,fixture.jobs,Buffer.from(fixture.resume.dataBase64,'base64').length);
  const hashes={};for(const file of ['android/app/build/outputs/apk/debug/app-debug.apk','android/app/build/outputs/apk/androidTest/debug/app-debug-androidTest.apk','android/app/build/outputs/apk/acceptance/app-acceptance.apk','android/app/build/outputs/apk/androidTest/acceptance/app-acceptance-androidTest.apk'])hashes[file]=createHash('sha256').update(fs.readFileSync(path.join(root,file))).digest('hex');
  fs.writeFileSync(path.join(evidence,'verification.json'),JSON.stringify({commit:process.env.GITHUB_SHA,observedAt:new Date().toISOString(),result:'passed',results,hashes,providerPOSTCounts,screenshotManifest:'screenshots.json',realEmployerRequests:0,productionAccountsUsed:false,environment:'Disposable API36 x86_64 Google APIs phone; 360dp, 180% text, dark appearance, Arabic app locale and forced RTL; system trust for ordinary preview, isolated test CA only in acceptance variant.'},null,2));
} finally {
  try {await preserveFailureEvidence()} finally {
    try {if(fixture)await fixture.close()} finally {
      try {await run(adb,['-s',env.ANDROID_SERIAL,'emu','kill'],{log:'adb.log',timeout:10000})}catch(error){console.warn(`Emulator shutdown: ${error.message}`)}
      const shutdowns=await Promise.allSettled([...processes].map(child=>terminate(child)));
      for(const shutdown of shutdowns)if(shutdown.status==='rejected'){console.warn(shutdown.reason.message);process.exitCode=1}
      try {await run(adb,['kill-server'],{log:'adb.log',timeout:10000})}catch(error){console.warn(`Isolated ADB shutdown: ${error.message}`);process.exitCode=1}
    }
  }
}
