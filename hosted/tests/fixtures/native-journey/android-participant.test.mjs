// Host-only synthetic relay/lifecycle checks. No ADB, app, harness or network.
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,realpath,chmod,readFile,writeFile,rename,mkdir,readdir,rm} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import {performance} from 'node:perf_hooks';
import {createAndroidCheckpointParticipant} from './android-participant.mjs';
import {validateAndroidRequestRelay} from './android-relay-proof.mjs';
import {decodeAndroidCheckpointPacket} from './android-witness.mjs';
import {sha256} from './control-state.mjs';
import {sample,clone,BINDING} from './android-control-fixtures.mjs';
import {restartFixture} from './android-restart-fixtures.mjs';

const names=['android-participant.mjs','android-relay-proof.mjs','android-witness.mjs','android-json.mjs',
  'android-ledger.mjs','android-state.mjs','android-restart-proof.mjs','control-state.mjs','contract.mjs','data.mjs'];
const pins=()=>Promise.all(names.map(async name=>{
  const filename=fileURLToPath(new URL(name,import.meta.url));return {path:filename,sha256:sha256(await readFile(filename))};
}));
const descriptor=(name,bytes)=>({name,bytes:bytes.length,sha256:sha256(bytes)});
function stat(size,inode,directory=false){
  const v={device:1,inode,mode:directory?0o40700:0o100600,uid:BINDING.appUID,gid:BINDING.appGID,size,
    mtimeSeconds:1700000000,ctimeSeconds:1700000000,links:directory?2:1,fileType:directory?'directory':'regular',
    permissionMode:directory?0o700:0o600,rawMtimeText:'1700000000',mtimePrecisionMilliseconds:1000,symlinkObserved:false,
    statSource:'toybox stat without -L; exact %d %i %f %u %g %s %Y %Z %h'};
  v.rawStatText=[v.device,v.inode,v.mode.toString(16),v.uid,v.gid,v.size,v.mtimeSeconds,v.ctimeSeconds,v.links].join(' ');return v;
}
function clock(milliseconds){return {raw:(milliseconds/1000).toFixed(2)+' 0.00',lowerMillis:milliseconds,
  upperExclusiveMillis:milliseconds+10,precisionMilliseconds:10,source:'/proc/uptime first field'};}
const deviceProof=()=>({deviceID:BINDING.deviceID,applicationID:BINDING.applicationID,appUID:BINDING.appUID,owned:true});
function common(value,observed){return {schemaVersion:1,testID:BINDING.testID,sequence:value.request.sequence,
  checkpoint:value.request.checkpoint,deviceID:BINDING.deviceID,applicationID:BINDING.applicationID,appUID:BINDING.appUID,
  source:clone(BINDING.source),observedAtMonotonic:observed,completedAtMonotonic:Math.floor(performance.now()),
  monotonicPrecisionMilliseconds:1,deviceProof:deviceProof()};}
function requestProof(value,observed){
  const prefix=String(value.request.sequence).padStart(3,'0'),pkt=value.packet;
  const list=[[prefix+'-request.json',pkt.request],[prefix+'-publication.json',pkt.publication],
    [prefix+'-android-witness.json',pkt.witness],...Object.entries(pkt.ciphertexts).map(([kind,b])=>[prefix+'-'+kind+'.enc',b])];
  const files=Object.fromEntries(list.map(([name,b],index)=>{const s=stat(b.length,1000+value.request.sequence*10+index);
    return [name,{before:s,after:clone(s),firstSHA256:sha256(b),secondSHA256:sha256(b)}];}));
  const original=descriptor(prefix+'-request-observation.raw',Buffer.from('synthetic original'));
  const start=value.publication.uiBudgetStartedElapsedMillis;
  return {...common(value,observed),files,directory:{before:stat(4096,900,true),after:stat(4096,900,true)},
    guestClock:{requestObservation:clock(start+100),before:clock(start+110),after:clock(start+120)},
    noSymlinkEvidence:'run-as fixed paths reject -L; toybox stat has no -L and mode must be regular or owned directory',
    requestObservation:{stat:clone(files[prefix+'-request.json'].before),sha256:original.sha256},
    originals:[original,descriptor(prefix+'-packet.raw',Buffer.from('synthetic packet')),...list.map(([name,b])=>descriptor(name,b))]};
}
function responseProof(value,observed,bytes){
  const prefix=String(value.request.sequence).padStart(3,'0'),name=prefix+'-response.json',s=stat(bytes.length,2000+value.request.sequence);
  return {...common(value,observed),files:{[name]:{before:s,after:clone(s),firstSHA256:sha256(bytes),secondSHA256:sha256(bytes)}},
    guestClock:{after:clock(value.publication.uiBudgetStartedElapsedMillis+130)},
    originals:[descriptor(prefix+'-response-readback.raw',Buffer.from('synthetic reply raw')),descriptor(name,bytes)],
    publication:'exclusive temporary; file fsync; no-overwrite hard link; same-inode temporary removal; directory fsync',noRetry:true};
}

async function setup(t,options={}){
  const root=await realpath(await mkdtemp(path.join(os.tmpdir(),'android-participant-pure-')));await chmod(root,0o700);
  t.after(()=>rm(root,{recursive:true,force:true}));
  let current=sample(1),board='open',closed=false,takes=0,publishes=0;
  const calls=[];
  const relay={
    async takeCheckpoint(seq,args){takes++;if(options.absent)return null;
      const observed=Math.floor(performance.now());if(!options.missingObservation)args.onRequestObserved();
      if(options.delay)await new Promise(resolve=>setTimeout(resolve,options.delay));
      const result={packet:current.packet,relayProof:requestProof(current,observed)};
      options.mutateRequest?.(result);return result;
    },
    async publishResponse(seq,bytes,args){publishes++;args.remainingMilliseconds();
      const result={bytes,relayProof:responseProof(current,Math.floor(performance.now()),bytes)};
      options.mutateResponse?.(result);return result;
    }};
  const bridge={async evidence(){const proof=clone(current.proof);
      proof.board=board;proof.controls=board==='open'?[]:board==='closed'?[{board}]:[{board:'closed'},{board:'unavailable'}];return proof;},
    async close(){assert.equal(closed,false);closed=true;calls.push('close');return {closed:true,ownSocketCount:0};}};
  const harness={async setBoard(value){calls.push(value);board=value;return {ok:true,board};}};
  const expectedSourceFiles=await pins();
  let mutablePin;
  if(options.mutablePin){mutablePin=path.join(root,'extra-source.txt');await writeFile(mutablePin,'original',{mode:0o600});
    expectedSourceFiles.push({path:mutablePin,sha256:sha256('original')});}
  const participant=await createAndroidCheckpointParticipant({harness,bridge,relay,binding:BINDING,evidenceParent:root,
    expectedSourceFiles,stopAt:performance.now()+(options.bound??60000)});
  return {participant,root,calls,mutablePin,setSequence(n){current=sample(n);},
    counts(){return {takes,publishes};},getCurrent:()=>current};
}

test('fourteen actual-schema checkpoints execute each control once and wait for an explicit boundary without another relay read',async t=>{
  const x=await setup(t);
  for(let i=1;i<=14;i++){x.setSequence(i);assert.equal(await x.participant.poll(),true);}
  assert.deepEqual(x.calls,['closed','unavailable','close']);
  assert.deepEqual(x.counts(),{takes:14,publishes:14});
  assert.equal(await x.participant.poll(),false);assert.deepEqual(x.counts(),{takes:14,publishes:14});
  const s=x.participant.status();assert.equal(s.lastAcceptedSequence,14);assert.equal(s.nextSequence,15);
  assert.equal(s.complete,false);assert.equal(s.boundaryBound,false);assert.equal(s.failure,null);
  x.participant.stop();assert.equal((await x.participant.settle()).settled,true);
});
test('an absent request neither starts the host budget nor advances state',async t=>{
  const x=await setup(t,{absent:true});assert.equal(await x.participant.poll(),false);
  assert.equal(x.participant.status().lastAcceptedSequence,0);assert.equal(x.participant.status().failure,null);
});
test('all sixteen checkpoints require and preserve the clean raw process boundary before accepting offline restore',async t=>{
  const x=await setup(t);
  for(let i=1;i<=14;i++){x.setSequence(i);assert.equal(await x.participant.poll(),true);}
  const boundary=restartFixture({artifactRoot:path.dirname(x.root),at:Math.floor(performance.now())});
  const admitted=await x.participant.bindRestartBoundary(boundary);
  assert.equal(admitted.bound,true);assert.equal(admitted.nextSequence,15);
  for(let i=15;i<=16;i++){x.setSequence(i);assert.equal(await x.participant.poll(),true);}
  assert.equal(x.participant.complete,true);assert.equal(x.participant.status().lastAcceptedSequence,16);
  assert.equal(x.participant.status().nextSequence,17);assert.equal(x.participant.status().boundaryBound,true);
  assert.equal(x.participant.status().failure,null);assert.deepEqual(x.calls,['closed','unavailable','close']);
  const output=path.join(x.root,'android-control-'+BINDING.testID);
  const proof=JSON.parse(await readFile(path.join(output,'restart-accepted.json')));
  assert.equal(proof.originals.length,16);
  assert.equal(proof.firstMethodRawSHA256,boundary.relayProof.firstMethod.summary.rawSHA256);
  assert.deepEqual(await readFile(path.join(output,'restart-firstMethod.stdout')),boundary.relayProof.commandOriginals.firstMethod.stdout);
  assert.equal(await x.participant.poll(),false);assert.deepEqual(x.counts(),{takes:16,publishes:16});
});
test('unobserved child closure leaves fourteen accepted checkpoints and blocks restore without another relay read',async t=>{
  const x=await setup(t);
  for(let i=1;i<=14;i++){x.setSequence(i);await x.participant.poll();}
  const boundary=restartFixture({artifactRoot:path.dirname(x.root),at:Math.floor(performance.now())});
  boundary.relayProof.firstMethod.summary.childReceipt.closeObserved=false;
  await assert.rejects(x.participant.bindRestartBoundary(boundary),e=>e.code==='android_restart_command_receipt');
  assert.equal(x.participant.status().lastAcceptedSequence,14);assert.equal(x.participant.status().boundaryBound,false);
  assert.equal(x.participant.status().complete,false);assert.equal(x.participant.status().failureRetention,'retained');
  assert.deepEqual(x.counts(),{takes:14,publishes:14});
  assert.equal((await x.participant.settle()).settled,true);
});
test('a complete packet without the immediate observation callback is rejected',async t=>{
  const x=await setup(t,{missingObservation:true});
  await assert.rejects(x.participant.poll(),e=>e.code==='android_participant_observation_missing');
  assert.equal(x.counts().publishes,0);assert.equal(x.participant.status().failureRetention,'retained');
});
test('a source change after construction stops before host observation/control or response',async t=>{
  const x=await setup(t,{mutablePin:true});await writeFile(x.mutablePin,'changed');
  await assert.rejects(x.participant.poll(),e=>e.code==='android_participant_source_changed');
  assert.equal(x.counts().publishes,0);assert.deepEqual(x.calls,[]);
});
test('guest file ownership/digest disagreement cannot be blessed by a matching witness',async t=>{
  const x=await setup(t,{mutateRequest(result){result.relayProof.files['001-request.json'].after.uid++;}});
  await assert.rejects(x.participant.poll(),e=>e.code==='android_relay_stat');assert.equal(x.counts().publishes,0);
});
test('late work retains failure and cannot advance or publish, even when the relay later returns',async t=>{
  const x=await setup(t,{bound:180,delay:250});
  await assert.rejects(x.participant.poll(),e=>e.code==='android_participant_operation_deadline');
  assert.equal(x.participant.status().lastAcceptedSequence,0);assert.equal(x.counts().publishes,0);
  const settled=await x.participant.settle({milliseconds:1000});assert.equal(settled.settled,true);
});
test('readback disagreement leaves the checkpoint unaccepted after its one publication attempt',async t=>{
  const x=await setup(t,{mutateResponse(result){result.bytes=Buffer.from('different');}});
  await assert.rejects(x.participant.poll(),e=>e.code==='android_relay_response_shape');
  assert.equal(x.counts().publishes,1);assert.equal(x.participant.status().lastAcceptedSequence,0);
});
test('replacing the private evidence directory blocks ownership and writes no invented acceptance',async t=>{
  const x=await setup(t);const output=path.join(x.root,'android-control-'+BINDING.testID);
  await rename(output,output+'-original');await mkdir(output,{mode:0o700});
  await assert.rejects(x.participant.poll(),e=>e.code==='android_participant_directory_changed');
  assert.deepEqual(await readdir(output),[]);assert.equal(x.participant.status().failureRetention,'retention_rejected');
});
test('raw timestamp precision and guest deadline are checked without inventing nanosecond file times',()=>{
  const value=sample(1),start=performance.now(),proof=requestProof(value,Math.floor(start));
  const decoded=decodeAndroidCheckpointPacket(value.packet,BINDING,1);
  const timing={pollStarted:start-1,started:start,now:performance.now()+1,deadline:start+4500};
  validateAndroidRequestRelay({packet:value.packet,relayProof:proof},decoded,BINDING,timing);
  const bad=clone(proof);bad.files['001-request.json'].before.mtimePrecisionMilliseconds=1;
  assert.throws(()=>validateAndroidRequestRelay({packet:value.packet,relayProof:bad},decoded,BINDING,timing),e=>e.code==='android_relay_stat');
  const late=clone(proof);late.guestClock.after=clock(value.publication.uiDeadlineElapsedMillis);
  assert.throws(()=>validateAndroidRequestRelay({packet:value.packet,relayProof:late},decoded,BINDING,timing),e=>e.code==='android_relay_guest_deadline');
});
