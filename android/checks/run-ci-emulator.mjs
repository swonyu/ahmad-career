import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import {createScreenshotCollector, inspectPNG} from './screenshot-evidence.mjs';
import {RESTART_CLASS, RESTART_METHODS, partitionRestartClasses, assertSingleRestartExecution,
  restartOriginalNames, createRestartEvidenceCollector, requireShellV2Features,
  parseOwnedPackagePids, parseOwnedProcessTable} from './cv-restart-evidence.mjs';

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
// adb permits local daemon startup for a hostless TCP socket. Its local-host
// check treats numeric 127.0.0.1 as remote and refuses to auto-start that server.
const env = {...process.env, ANDROID_AVD_HOME:path.join(runtime,'avd'), ANDROID_USER_HOME:path.join(runtime,'user'), ANDROID_SERIAL:'emulator-5580', ANDROID_ADB_SERVER_PORT:'5054', ADB_SERVER_SOCKET:'tcp:5054', ADB_MDNS_AUTO_CONNECT:'0'};
fs.mkdirSync(env.ANDROID_AVD_HOME,{recursive:true});fs.mkdirSync(env.ANDROID_USER_HOME,{recursive:true});
const adb = path.join(sdk, 'platform-tools/adb');
const processes = new Set(), lifecycles = new WeakMap(), results = [], installedPackages = new Set();
let fixture;
const restartPackage = 'com.saleh.careerfinder.preview';
const restartNamespace = 'cv-restart-' + randomBytes(16).toString('hex');
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
async function run(command,args,{log,stdin,timeout=120000,cwd=root,onTimeout,exitCodes=[0],withExitCode=false}={}) {
  const child=own(spawn(command,args,{cwd,env,detached:true,stdio:['pipe','pipe','pipe']}));
  const chunks=[];let bytes=0;
  const output=log?fs.createWriteStream(path.join(evidence,log),{flags:'a'}):null;
  for(const stream of [child.stdout,child.stderr])stream.on('data',part=>{output?.write(part);bytes+=part.length;if(bytes<32*1024*1024)chunks.push(part)});
  try {
    await awaitSpawn(child);child.stdin.end(stdin??'');
    const result=await within(lifecycles.get(child).closed,timeout);
    if(!result.completed) {
      if(onTimeout) {
        const controller=new AbortController();
        try {
          // Observe the stalled app before terminating its instrumentation client.
          const diagnostics=await within(Promise.resolve().then(()=>onTimeout(controller.signal)),60000);
          if(!diagnostics.completed)console.warn('Timeout diagnostics exceeded their sixty-second limit.');
        } catch {console.warn('Timeout diagnostics unavailable.')}
        finally {controller.abort()}
      }
      throw Error(`${path.basename(command)} timed out after ${timeout}ms; see ${log??'runner output'}.`);
    }
    const {code,error}=result.value;
    if(error)throw error;
    const text=Buffer.concat(chunks).toString();
    if(!exitCodes.includes(code))throw Error(`${path.basename(command)} failed (${code}); see ${log??'runner output'}. ${log?'':text.slice(-1000)}`);
    return withExitCode?{text,code}:text;
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
// The separately required restart collector also admits only its fixed synthetic
// geometry/semantics/process markers; encrypted vault bytes never leave the app.
async function readPNG(args, timeout=15000) {
  const child=own(spawn(adb,['-s',env.ANDROID_SERIAL,...args],{cwd:root,env,detached:true,stdio:['ignore','pipe','pipe']}));
  const chunks=[];let bytes=0,stderr='',oversized=false;
  child.stdout.on('data',part=>{
    bytes+=part.length;
    if(bytes>16*1024*1024){if(!oversized){oversized=true;terminate(child).catch(()=>{})}}else chunks.push(part);
  });
  child.stderr.on('data',part=>{stderr=(stderr+part.toString()).slice(-2000)});
  try {
    await awaitSpawn(child);
    const result=await within(lifecycles.get(child).closed,timeout);
    if(!result.completed) {
      const error=Error('Screenshot read exceeded its bounded limit (at most fifteen seconds).');
      error.code='SCREENSHOT_READ_TIMEOUT';throw error;
    }
    const {code,error}=result.value;
    if(error)throw error;
    if(code!==0) {
      const failure=Error('Screenshot read failed'+(oversized?' (size limit)':'')+': '+stderr.trim());
      if(/device offline|device.*not found|error: closed|no devices\/emulators found/i.test(stderr))
        failure.code='SCREENSHOT_DEVICE_UNAVAILABLE';
      throw failure;
    }
    assert.ok(!oversized,'The screenshot exceeded its bounded read.');
    const png=Buffer.concat(chunks);
    return {png,...inspectPNG(png)};
  } finally {await terminate(child)}
}
// Each original uses negotiated shell-v2 exit status and separate binary stdout.
// A lost transport, empty file or changed digest stops the phase without retry.
async function readRestartOriginal(remotePath, timeout) {
  assert.ok(installedPackages.has(restartPackage));
  const allowed=[...restartOriginalNames('seed'),...restartOriginalNames('restore')];
  const prefix='cache/application-cv-restart-evidence-'+restartNamespace+'/';
  assert.ok(remotePath.startsWith(prefix)&&allowed.includes(remotePath.slice(prefix.length)));
  const deadline=performance.now()+timeout;
  const remaining=()=>{
    const left=Math.floor(deadline-performance.now());
    assert.ok(left>0,'The bounded original read expired.');return left;
  };
  const remote=async(...args)=>{
    const child=own(spawn(adb,['-s',env.ANDROID_SERIAL,'shell','-T','-n','run-as',restartPackage,
      '/system/bin/toybox',...args],{cwd:root,env,detached:true,stdio:['ignore','pipe','pipe']}));
    const chunks=[];let bytes=0,oversized=false;
    for(const stream of [child.stdout,child.stderr])stream.on('data',part=>{
      bytes+=part.length;
      if(bytes>8192){oversized=true;terminate(child).catch(()=>{})}else chunks.push(part);
    });
    try {
      assert.ok((await within(lifecycles.get(child).spawned,remaining())).completed,'Original metadata spawn timed out.');
      const result=await within(lifecycles.get(child).closed,remaining());
      assert.ok(result.completed,'Original metadata read timed out.');
      if(result.value.error)throw result.value.error;
      assert.equal(result.value.code,0,'Original metadata read failed.');
      assert.ok(!oversized);remaining();
      return Buffer.concat(chunks).toString('utf8');
    } finally {await terminate(child)}
  };
  assert.equal((await remote('stat','-c','%F',remotePath)).trim(),'regular file');
  const sizeText=(await remote('stat','-c','%s',remotePath)).trim();
  assert.match(sizeText,/^[1-9][0-9]*$/);
  const remoteBytes=Number(sizeText);
  assert.ok(Number.isSafeInteger(remoteBytes)&&remoteBytes<=5*1024*1024,
    'The original size is outside the 1..5MB bound.');
  const digest=async()=>{
    const parts=(await remote('sha256sum',remotePath)).trim().split(/\s+/);
    assert.equal(parts.length,2);assert.match(parts[0],/^[a-f0-9]{64}$/);
    assert.equal(parts[1],remotePath);return parts[0];
  };
  const remoteSHA256Before=await digest();
  const child=own(spawn(adb,['-s',env.ANDROID_SERIAL,'shell','-T','-n','run-as',restartPackage,
    '/system/bin/toybox','cat',remotePath],{cwd:root,env,detached:true,stdio:['ignore','pipe','pipe']}));
  const chunks=[];let bytes=0,stderr='',oversized=false;
  child.stdout.on('data',part=>{
    bytes+=part.length;
    if(bytes>5*1024*1024){oversized=true;terminate(child).catch(()=>{})}else chunks.push(part);
  });
  child.stderr.on('data',part=>{stderr=(stderr+part.toString()).slice(-2000)});
  const retainPartial=()=>{
    const partial=path.join(evidence,'cv-restart-partials',path.basename(remotePath)+'.partial');
    fs.mkdirSync(path.dirname(partial),{recursive:true});
    const descriptor=fs.openSync(partial,'wx',0o600);
    try {fs.writeFileSync(descriptor,Buffer.concat(chunks));fs.fsyncSync(descriptor)}
    finally {fs.closeSync(descriptor)}
  };
  let original;
  try {
    assert.ok((await within(lifecycles.get(child).spawned,remaining())).completed,'Original binary spawn timed out.');
    const result=await within(lifecycles.get(child).closed,remaining());
    assert.ok(result.completed,'The original binary transfer timed out.');
    if(result.value.error)throw result.value.error;
    assert.equal(result.value.code,0,'The original transfer failed: '+stderr.trim());
    assert.ok(!oversized,'The original transfer exceeded its byte limit.');
    original=Buffer.concat(chunks);
    assert.equal(original.length,remoteBytes,'The original transfer was truncated or changed size.');
    assert.equal(createHash('sha256').update(original).digest('hex'),remoteSHA256Before);
  } catch(error) {
    retainPartial();throw error;
  } finally {await terminate(child)}
  try {
    const remoteSHA256After=await digest();remaining();
    assert.equal(remoteSHA256After,remoteSHA256Before,'The guest original changed during transfer.');
    return {bytes:original,remoteBytes,remoteSHA256Before,remoteSHA256After};
  } catch(error) {retainPartial();throw error}
}
const restartCollector=createRestartEvidenceCollector({
  evidence,device:env.ANDROID_SERIAL,commit:process.env.GITHUB_SHA,namespace:restartNamespace,
  readOriginal:readRestartOriginal,
});

const screenshotCollector=createScreenshotCollector({
  evidence,device:env.ANDROID_SERIAL,commit:process.env.GITHUB_SHA,
  readScreenshot:async(packageName,remotePath,timeout)=>
    (await readPNG(['exec-out','run-as',packageName,'cat',remotePath],timeout)).png,
});

async function captureNativeFailure(packageName,signal) {
  assert.equal(packageName,'com.saleh.careerfinder.acceptance');
  assert.ok(installedPackages.has(packageName),'Diagnostics require the installed isolated acceptance app.');
  const report={observedAt:new Date().toISOString(),packageName,device:env.ANDROID_SERIAL,checks:[]};
  const collect=async(name,action)=>{
    if(signal?.aborted){report.checks.push({name,result:'unavailable',reason:'Diagnostic time limit reached.'});return}
    try {await action();report.checks.push({name,result:'captured'})}
    catch(error){report.checks.push({name,result:'unavailable',reason:error.message})}
  };
  await Promise.all([
    collect('current-screen',async()=>{
      const {png,width,height}=await readPNG(['exec-out','screencap','-p']);
      if(signal?.aborted)return;
      const file='native-https-failure-screen.png';
      fs.writeFileSync(path.join(evidence,file),png);
      report.screen={file,width,height,bytes:png.length,sha256:createHash('sha256').update(png).digest('hex')};
    }),
    (async()=>{
      let pid;
      await collect('app-pid',async()=>{
        const value=(await run(adb,['-s',env.ANDROID_SERIAL,'shell','pidof',packageName],{log:'native-https-failure-pid.log',timeout:10000})).trim();
        assert.match(value,/^[1-9][0-9]{0,9}$/,'The acceptance app must have one numeric PID.');
        pid=value;report.pid=Number(value);
      });
      await Promise.all([
        collect('filtered-logcat',async()=>{
          // Never log instrumentation argv: it contains the pairing code and PDF.
          // Restrict output to this app's PID when alive and a fixed tag allowlist.
          const args=['-s',env.ANDROID_SERIAL,'logcat','-d','-t','300','-v','threadtime'];
          if(pid)args.push('--pid',pid);
          args.push('CareerPhoneAcceptance:I','TestRunner:I','AndroidRuntime:E','System.err:W','*:S');
          await run(adb,args,{log:'native-https-failure-logcat.log',timeout:15000});
        }),
        collect('app-thread-backtrace',async()=>{
          assert.ok(pid,'The acceptance app PID was unavailable.');
          // -b requests thread stacks only, not a full tombstone or memory dump.
          // run-as confines this best-effort request to the owned debug app UID.
          await run(adb,['-s',env.ANDROID_SERIAL,'shell','run-as',packageName,'/system/bin/debuggerd','-b',pid],
            {log:'native-https-failure-threads.log',timeout:15000});
        })
      ]);
    })()
  ]);
  if(!signal?.aborted)fs.writeFileSync(path.join(evidence,'native-https-failure-diagnostics.json'),JSON.stringify(report,null,2));
}

async function preserveFailureEvidence() {
  if(fixture) {
    try {
      const observations=await fixture.observations();
      fs.writeFileSync(path.join(evidence,'synthetic-provider-observations.json'),JSON.stringify(observations,null,2));
    } catch(error) {console.warn(`Synthetic provider observations could not be preserved: ${error.message}`)}
  }
  for(const packageName of installedPackages) {
    try {
      await screenshotCollector.collect(packageName,{phase:'failure-or-cleanup',
        includeFailure:!results.some(result=>result.label==='native-https-phone'&&result.result==='passed')});
    } catch(error) {console.warn('Screenshot extraction could not finish: '+error.message)}
  }
  const restartVerification=restartCollector.verify();
  console.log('Verified '+restartVerification.verifiedOriginals+' of 44 required restart originals; '+restartVerification.result+'.');
  try {
    const gate=screenshotCollector.verify();
    console.log('Preserved '+gate.capturedRequiredCaptures+' of '+gate.expectedRequiredCaptures+' required native screenshots.');
  } catch(error) {console.warn('Screenshot manifest could not be verified: '+error.message)}
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
async function instrument(label,packageName,classes,argumentsMap={},minimum=1,restartPhase) {
  const args=['-s',env.ANDROID_SERIAL,'shell','am','instrument','-w','-r','-e','class',classes.join(',')];
  for(const [name,value] of Object.entries(argumentsMap))args.push('-e',name,String(value));
  args.push(`${packageName}.test/androidx.test.runner.AndroidJUnitRunner`);
  let diagnosticsAttempted=false;
  const captureDiagnostics=async signal=>{
    if(diagnosticsAttempted)return;
    diagnosticsAttempted=true;
    await captureNativeFailure(packageName,signal);
  };
  try {
    const output=await run(adb,args,{log:label+'.log',timeout:15*60000,
      onTimeout:label==='native-https-phone'?captureDiagnostics:undefined});
    const count=Number(output.match(/OK \((\d+) tests?\)/)?.[1]??0);
    assert.ok(count>=minimum,`${label} did not report the required completed test count; inspect its log.`);
    assert.doesNotMatch(output,/FAILURES!!!|INSTRUMENTATION_FAILED|INSTRUMENTATION_STATUS_CODE: -(?:1|2|3|4)\b/);
    const exactExecution=restartPhase?assertSingleRestartExecution(output,restartPhase):undefined;
    results.push({label,classes,tests:count,result:'passed',...(exactExecution?{exactExecution}:{})});
    console.log(label+': '+count+' instrumented tests passed.');
    return exactExecution;
  } catch(error) {
    if(label==='native-https-phone'&&!diagnosticsAttempted) {
      try {await captureDiagnostics()}
      catch {console.warn('Native failure diagnostics unavailable.')}
    }
    throw error;
  }
}
try {
  await run(process.execPath,['--test',path.join(root,'android/checks/screenshot-evidence.test.mjs'),path.join(root,'android/checks/cv-restart-evidence.test.mjs')],
    {log:'screenshot-evidence-tests.log',timeout:60000});
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
  const discovered=fs.readdirSync(testDirectory).filter(name=>name.endsWith('.kt')).flatMap(name=>[...fs.readFileSync(path.join(testDirectory,name),'utf8').matchAll(/^class\s+(\w+(?:Test))\b/gm)].map(match=>match[1])).filter(name=>!['NativeHttpsAcceptanceTest','TlsBoundaryAcceptanceTest'].includes(name)).sort().map(name=>'com.saleh.careerfinder.'+name);
  const restartSource=path.join(testDirectory,'ApplicationCvHistoryProcessRestartTest.kt');
  const selection=partitionRestartClasses(discovered,fs.readFileSync(restartSource,'utf8'));
  const classes=selection.ordinary;
  assert.ok(classes.some(name=>name.endsWith('WorkspaceSafetyRegressionTest')),'New safety regressions must be selected.');
  assert.ok(classes.some(name=>name.endsWith('NativeLocalizationAcceptanceTest')),'Bilingual dialog and language-control regressions must be selected.');
  const pressureMethod='com.saleh.careerfinder.CareerReadTransportRegressionTest#historicalRecoveryUnderRetainedHeapPressurePreservesEarlierWorkspace';
  assert.ok(classes.includes(pressureMethod.split('#')[0]),'The pressure fixture class must remain in ordinary discovery.');
  fs.writeFileSync(path.join(evidence,'instrumentation-selection.json'),JSON.stringify({
    discovered,ordinary:classes,ordinaryMinimum:105,requiredRestartClass:selection.restart,
    requiredRestartMethods:selection.methods,restartMethodsCountTowardOrdinaryMinimum:false,
    separatelyScopedPressure:{method:pressureMethod,ordinaryExcludedBy:'notClass exact method',
      requiredHeapBytes:192*1024*1024,requiredArgument:'careerRecoveryPressure192MiB=true',
      ordinaryRunClaimsPressurePass:false,originalRegressionMethodsExcluded:false}},null,2));
  // This new bounded pressure proof has a dedicated reviewed 192 MiB run. Every
  // original regression remains selected; a larger generic CI heap is not a product failure.
  await instrument('ordinary-phone','com.saleh.careerfinder.preview',classes,{notClass:pressureMethod},105);
  // Preserve completed preview evidence before the acceptance build and later device work.
  await screenshotCollector.collect('com.saleh.careerfinder.preview',{phase:'ordinary-phone'});
  // Restart is an additional required phase, not an excluded or renamed test.
  const checkout=(await run('git',['rev-parse','HEAD'])).trim();
  assert.equal(checkout,process.env.GITHUB_SHA);
  assert.equal((await run('git',['status','--porcelain','--untracked-files=all','--',
    'android/app/src','shared/localization'])).trim(),'','Restart requires the unchanged checkout sources.');
  const sourceFiles=['android/app/build/outputs/apk/debug/app-debug.apk',
    'android/app/build/outputs/apk/androidTest/debug/app-debug-androidTest.apk',
    'android/app/src/androidTest/java/com/saleh/careerfinder/ApplicationCvHistoryProcessRestartTest.kt'];
  const restartHashes=Object.fromEntries(sourceFiles.map(file=>[file,createHash('sha256').update(fs.readFileSync(path.join(root,file))).digest('hex')]));
  fs.writeFileSync(path.join(evidence,'cv-restart-source.json'),JSON.stringify({
    commit:checkout,namespace:restartNamespace,hashes:restartHashes,packageName:restartPackage},null,2));
  requireShellV2Features(await device('features'));
  const restartArguments=phase=>({career_cv_restart_phase:phase,
    career_cv_restart_namespace:restartNamespace,career_source_sha:checkout});
  const seedExecution=await instrument('cv-history-restart-seed',restartPackage,
    [RESTART_CLASS+'#'+RESTART_METHODS.seed],restartArguments('seed'),1,'seed');
  await device('shell','-T','-n','sync');
  const seeded=await restartCollector.collect('seed',seedExecution);
  const packagePids=async()=>{
    const main=parseOwnedPackagePids(await run(adb,
      ['-s',env.ANDROID_SERIAL,'shell','-T','-n','/system/bin/toybox','pidof',restartPackage],
      {timeout:10000,exitCodes:[0,1],withExitCode:true}));
    const table=await run(adb,['-s',env.ANDROID_SERIAL,'shell','-T','-n',
      '/system/bin/toybox','ps','-A','-w','-o','PID,NAME'],{timeout:10000});
    return parseOwnedProcessTable(table,main);
  };
  const packagePidsBefore=await packagePids();
  await device('shell','-T','-n','am','force-stop','--user','0',restartPackage);
  const packagePidsAfter=await packagePids();
  assert.deepEqual(packagePidsAfter,[],'The owned target process must be absent before restore.');
  restartCollector.recordProcessBoundary({packageName:restartPackage,forceStopCompleted:true,
    packagePidsBefore,packagePidsAfter,observedAt:new Date().toISOString(),
    seedPID:seeded.processID,reinstallOrDataClearBetweenPhases:false});
  const restoreExecution=await instrument('cv-history-restart-restore',restartPackage,
    [RESTART_CLASS+'#'+RESTART_METHODS.restore],restartArguments('restore'),1,'restore');
  await device('shell','-T','-n','sync');
  await restartCollector.collect('restore',restoreExecution);
  for(const [file,digest] of Object.entries(restartHashes))
    assert.equal(createHash('sha256').update(fs.readFileSync(path.join(root,file))).digest('hex'),digest);
  assert.equal(restartCollector.verify().result,'passed','The required restart evidence is incomplete.');
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
  await screenshotCollector.collect('com.saleh.careerfinder.acceptance',{phase:'native-https-phone'});
  const observations=await fixture.observations();
  fs.writeFileSync(path.join(evidence,'synthetic-provider-observations.json'),JSON.stringify(observations,null,2));
  const providerPOSTCounts=assertSyntheticObservations(observations,fixture.jobs,Buffer.from(fixture.resume.dataBase64,'base64').length);
  const hashes={};for(const file of ['android/app/build/outputs/apk/debug/app-debug.apk','android/app/build/outputs/apk/androidTest/debug/app-debug-androidTest.apk','android/app/build/outputs/apk/acceptance/app-acceptance.apk','android/app/build/outputs/apk/androidTest/acceptance/app-acceptance-androidTest.apk'])hashes[file]=createHash('sha256').update(fs.readFileSync(path.join(root,file))).digest('hex');
  const screenshotVerification=screenshotCollector.verify();
  const restartVerification=restartCollector.verify();
  fs.writeFileSync(path.join(evidence,'verification.json'),JSON.stringify({commit:process.env.GITHUB_SHA,observedAt:new Date().toISOString(),result:screenshotVerification.result==='captured'&&restartVerification.result==='passed'?'passed':'failed',testsResult:'passed',results,hashes,providerPOSTCounts,screenshotVerification,restartVerification,screenshotManifest:'screenshots.json',realEmployerRequests:0,productionAccountsUsed:false,environment:'Disposable API36 x86_64 Google APIs phone; 360dp, 180% text, dark appearance, Arabic app locale and forced RTL; system trust for ordinary preview, isolated test CA only in acceptance variant.'},null,2));
  assert.equal(screenshotVerification.result,'captured','Required native screenshot evidence is incomplete; inspect screenshots.json. Instrumented test results remain recorded separately.');
  assert.equal(restartVerification.result,'passed','Required two-phase restart acceptance is incomplete; inspect cv-restart.json.');
} catch(error) {
  fs.writeFileSync(path.join(evidence,'verification.json'),JSON.stringify({
    commit:process.env.GITHUB_SHA,observedAt:new Date().toISOString(),result:'failed',
    testsResult:'incomplete-or-failed',results,reason:String(error.message??error).slice(0,2000),
    screenshotVerification:screenshotCollector.verify(),restartVerification:restartCollector.verify(),
    realEmployerRequests:0,productionAccountsUsed:false},null,2));
  throw error;
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
