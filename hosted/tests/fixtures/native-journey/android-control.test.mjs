import test from 'node:test';
import assert from 'node:assert/strict';
import {canonical,sha256} from './control-state.mjs';
import {decodeAndroidJSON} from './android-json.mjs';
import {decodeAndroidCheckpointPacket} from './android-witness.mjs';
import {createAndroidLedgerState} from './android-ledger.mjs';
import {createAndroidDurableState} from './android-state.mjs';
import {BINDING,sample,repack,bytes,restartBodies,clone} from './android-control-fixtures.mjs';

function states(){return {ledger:createAndroidLedgerState({testID:BINDING.testID,workspaceID:BINDING.workspaceID,
  workerSHA256:BINDING.source.workerSHA256,bridgePort:BINDING.bridgePort,caFingerprint256:BINDING.caFingerprint256}),
  durable:createAndroidDurableState({binding:BINDING,followUpDay:BINDING.followUpDay})};}
function inspect(state,value){
  const decoded=decodeAndroidCheckpointPacket(value.packet,BINDING,value.request.sequence);
  const host=state.ledger.inspect(decoded.request,value.proof,{transportClosed:value.request.sequence>=13});
  assert.equal(host.ready,true);
  const local=state.durable.inspect(decoded,host);return {host,local};
}
function advance(state,sequence,options={}){const result=inspect(state,sample(sequence,options));result.host.commit();result.local.commit();return result;}
function through(last,options={}){const state=states();for(let i=1;i<=last;i++)advance(state,i,options);return state;}
const rejects=(fn,code)=>assert.throws(fn,error=>error?.code===code);

test('strict Android JSON rejects duplicate, unsafe and malformed Unicode values',()=>{
  for(const [source,code] of [['{"a":1,"a":2}','android_json_duplicate_key'],['9007199254740992','android_json_number'],
    ['"\\ud800"','android_json_unicode'],['1.5','android_json_number']])rejects(()=>decodeAndroidJSON(Buffer.from(source),2097152),code);
  assert.deepEqual(JSON.parse(JSON.stringify(decodeAndroidJSON(bytes({arabic:'عربي',emoji:'😀',slash:'/'}),2097152))),
    {arabic:'عربي',emoji:'😀',slash:'/'});
});
test('canonical JSON uses UTF-16 sorted keys and preserves array order',()=>{
  assert.equal(canonical({'\ue000':2,'😀':1,a:['ب','a']}),'{"a":["ب","a"],"😀":1,"":2}');
});
test('all sixteen actual-schema states accept with unavailable live result and retained disk search',()=>{
  const state=through(14);state.durable.bindRestartBoundary(restartBodies());advance(state,15);advance(state,16);
  assert.equal(state.ledger.complete,true);assert.equal(state.durable.complete,true);
});
test('partial stale page is a distinct valid stored outage branch',()=>{
  const state=through(14,{outage:'partial'});state.durable.bindRestartBoundary(restartBodies());
  advance(state,15,{outage:'partial'});advance(state,16,{outage:'partial'});assert.equal(state.durable.complete,true);
});
test('encrypted original cannot be truncated or replaced while its witness digest stays old',()=>{
  const value=sample(1);value.packet.ciphertexts.connection=value.packet.ciphertexts.connection.subarray(0,30);
  rejects(()=>decodeAndroidCheckpointPacket(value.packet,BINDING,1),'android_checkpoint_cipher_original');
});
test('encrypted-only connection rejects any injected clear credential field',()=>{
  const value=sample(1);value.witness.storage.connection.value={sessionToken:'synthetic-unexpected'};repack(value);
  rejects(()=>decodeAndroidCheckpointPacket(value.packet,BINDING,1),'android_checkpoint_cipher_original');
});
test('different owner/source bindings cannot admit an otherwise identical packet',()=>{
  for(const mutate of [v=>v.witness.scope.nativeTokenSHA256='f'.repeat(64),v=>v.witness.scope.workspaceKey='f'.repeat(64)]){
    const value=sample(1);mutate(value);repack(value);
    rejects(()=>decodeAndroidCheckpointPacket(value.packet,BINDING,1),'android_checkpoint_witness_scope');
  }
  const value=sample(1);value.witness.source.workerSHA256='f'.repeat(64);repack(value);
  rejects(()=>decodeAndroidCheckpointPacket(value.packet,BINDING,1),'android_checkpoint_witness_shape');
});
test('publication must preserve the exact original request and original five-second deadline',()=>{
  for(const mutate of [v=>v.publication.requestSHA256='f'.repeat(64),v=>v.publication.uiDeadlineElapsedMillis++]){
    const value=sample(1);mutate(value);value.packet.publication=bytes(value.publication);
    rejects(()=>decodeAndroidCheckpointPacket(value.packet,BINDING,1),'android_checkpoint_publication_binding');
  }
});
test('same PDF hash cannot make the historical A filename become current B',()=>{
  const state=through(6),value=sample(7);value.witness.storage.workspace.value.receipts[0].resumeName='CV-B.pdf';repack(value);
  rejects(()=>inspect(state,value),'android_state_prepared_receipt');
});
test('a hidden submission or additional workspace refresh cannot be counted as the required journey',()=>{
  const value=sample(6);value.proof.attempts[0].dispatchCount=1;
  rejects(()=>inspect(through(5),value),'android_ledger_zero_dispatch');
  const other=sample(4);other.proof.nativeCalls.push(clone(other.proof.nativeCalls.find(c=>c.path==='/api/apply/workspace')));
  other.proof.bridge.apiRequests++;
  rejects(()=>inspect(through(3),other),'android_ledger_state_advanced');
});
test('picker cancel must preserve canonical workspace and search, even if a new ciphertext is returned',()=>{
  const value=sample(4);value.witness.storage.workspace.value.profile.headline='Changed';
  value.witness.storage.workspace.value.serverProfile.headline='Changed';value.witness.live.profile.headline='Changed';repack(value);
  rejects(()=>inspect(through(3),value),'android_state_contact_changed');
  const state=through(3),valid=sample(4),changed=Buffer.concat([Buffer.from([1]),Buffer.alloc(32,9)]);
  valid.packet.ciphertexts.workspace=changed;valid.witness.storage.workspace.bytes=changed.length;
  valid.witness.storage.workspace.sha256=sha256(changed);repack(valid);
  assert.equal(inspect(state,valid).local.facts.pickerCancelUnchanged,true);
});
test('unavailable live response does not require fabricated unavailable durable page',()=>{
  const value=sample(12);assert.equal(value.witness.live.discovery.status,'unavailable');
  assert.equal(value.witness.storage.search.value.page.status,'complete');inspect(through(11),value);
});
test('unavailable response cannot silently replace the retained durable search',()=>{
  const value=sample(12);value.witness.storage.search.value.page.generatedAt='2026-11-22T05:00:01Z';repack(value);
  rejects(()=>inspect(through(11),value),'android_state_unavailable_branch');
});
test('private follow-up history and its exact URL identity survive transport loss',()=>{
  const value=sample(14);value.witness.storage.workspace.value.applicationRecords.records[0].current.record.note='Changed';repack(value);
  rejects(()=>inspect(through(13),value),'android_state_private_followup');
});
test('process restoration cannot be admitted without an actual boundary',()=>{
  rejects(()=>inspect(through(14),sample(15)),'android_state_process_changed');
});
test('restart body refuses reused process, changed post-stop ciphertext, or reseed claims',()=>{
  for(const kind of ['process','cipher','reseed']){
    const state=through(14),b=restartBodies(),before=JSON.parse(b.restorePreActivityBytes),seed=JSON.parse(b.seedHandoffBytes);
    if(kind==='process')before.process=seed.process;
    if(kind==='cipher')before.ciphertexts.connection='f'.repeat(64);
    if(kind==='reseed')before.noReseed=false;
    b.restorePreActivityBytes=bytes(before);
    rejects(()=>state.durable.bindRestartBoundary(b),'android_state_restore_before_activity');
  }
});
test('a new process must retain canonical B/A/follow-up but need not claim pre-stop randomized ciphertext equality',()=>{
  const state=through(14);state.durable.bindRestartBoundary(restartBodies());
  const value=sample(15),cipher=Buffer.concat([Buffer.from([1]),Buffer.alloc(32,7)]);
  value.packet.ciphertexts.workspace=cipher;value.witness.storage.workspace.bytes=cipher.length;value.witness.storage.workspace.sha256=sha256(cipher);repack(value);
  assert.equal(inspect(state,value).local.facts.persistedRestartUnchanged,true);
});
test('offline restart cannot retain test-service capability through a fabricated stored flag',()=>{
  const state=through(14);state.durable.bindRestartBoundary(restartBodies());
  const value=sample(15);value.witness.live.testService=true;repack(value);
  rejects(()=>inspect(state,value),'android_state_workspace_or_live_shape');
});
