// Pure returned-evidence checks only: no processes, ADB, app, vault or network.
import test from 'node:test';
import assert from 'node:assert/strict';
import {validateAndroidRestartRelay} from './android-restart-proof.mjs';
import {restartFixture,changeCommandOriginal,methodOutput} from './android-restart-fixtures.mjs';
import {BINDING} from './android-control-fixtures.mjs';
const options={artifactRoot:'/private/synthetic-locale',now:101,checkpoint14CompletedAt:99};
const make=extra=>restartFixture({...options,...extra});
const check=value=>validateAndroidRestartRelay(value,BINDING,options);

test('clean raw method completion, explicit stop and no-process originals admit the boundary',()=>{
  const value=make(),verified=check(value);
  assert.equal(verified.boundarySHA256,value.relayProof.files['process-boundary.json'].firstSHA256);
  assert.equal(Object.hasOwn(verified.retainedProof,'commandOriginals'),false);
  assert.equal(verified.commandOriginals.firstMethod.stdout.length,methodOutput().length);
});
test('seed already absent remains an explicit observation rather than a forced-stop cause claim',()=>{
  const value=make({seedAlreadyAbsent:true});check(value);
  value.relayProof.noTargetProcess.seedProcessAlreadyAbsent=false;
  assert.throws(()=>check(value),e=>e.code==='android_restart_target_process_remains');
});
test('a runner crash after status zero cannot pass a forged true summary',()=>{
  const value=make();changeCommandOriginal(value,'firstMethod',Buffer.concat([methodOutput(),
    Buffer.from('INSTRUMENTATION_RESULT: shortMsg=Process crashed.\nINSTRUMENTATION_CODE: 0\n')]),{updateMethodDigest:true});
  assert.equal(value.relayProof.firstMethod.summary.passed,true);
  assert.throws(()=>check(value),e=>e.code==='android_restart_first_method_not_complete');
});
test('method end without terminal JUnit completion is rejected even when the child exited zero',()=>{
  const value=make();changeCommandOriginal(value,'firstMethod',methodOutput().toString().replace('OK (1 test)',''),{updateMethodDigest:true});
  assert.throws(()=>check(value),e=>e.code==='android_restart_first_method_not_complete');
});
test('observed close and clean owned-command cleanup are required independently of raw success',()=>{
  for(const [field,value]of [['closeObserved',false],['cleanupBlocked',true]]){
    const input=make();input.relayProof.firstMethod.summary.childReceipt[field]=value;
    assert.throws(()=>check(input),e=>e.code==='android_restart_command_receipt');
  }
  const force=make();force.relayProof.forceStop.receipt.closeObserved=false;
  assert.throws(()=>check(force),e=>e.code==='android_restart_command_receipt');
});
test('a colon child in raw ps cannot be hidden by a main-package pidof miss',()=>{
  const value=make();changeCommandOriginal(value,'processAfter',
    'PID NAME ARGS\n1 init /system/bin/init\n8000 isolated '+BINDING.applicationID+':worker\n',{updateTable:true});
  assert.equal(value.relayProof.noTargetProcess.after.pidof.exitCode,1);
  assert.throws(()=>check(value),e=>e.code==='android_restart_target_process_remains');
});
test('mismatched immutable originals, device owner and stopped ciphertext are each rejected',()=>{
  const command=make();command.relayProof.commandOriginals.forceStop.stdout=Buffer.from('unexpected');
  assert.throws(()=>check(command),e=>e.code==='android_restart_command_receipt');
  const source=make();source.relayProof.source.workerSHA256='e'.repeat(64);
  assert.throws(()=>check(source),e=>e.code==='android_restart_relay_binding');
  const cipher=make();cipher.relayProof.postStopCiphertexts.connection.original.sha256='e'.repeat(64);
  assert.throws(()=>check(cipher),e=>e.code==='android_restart_cipher_digest');
  const identity=make();identity.relayProof.files['restore-pre-activity.json'].after.inode++;
  assert.throws(()=>check(identity),e=>e.code==='android_restart_file_identity');
});
test('boundary receipts cannot precede checkpoint fourteen or claim the wrong forced-stop target',()=>{
  const early=make();early.relayProof.observedAtMonotonic=98;
  assert.throws(()=>check(early),e=>e.code==='android_restart_relay_binding');
  const wrong=make();
  wrong.relayProof.forceStop.command[5]='another.package';
  assert.throws(()=>check(wrong),e=>e.code==='android_restart_force_stop');
});
