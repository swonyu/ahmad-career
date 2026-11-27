// Synthetic returned-original bundles for host-only boundary validation.
// No command in these objects is executed and no app or vault is initialized.
import path from 'node:path';
import {sha256} from './control-state.mjs';
import {BINDING,FIRST_PROCESS,clone,restartBodies} from './android-control-fixtures.mjs';

export const FIRST_METHOD='com.saleh.careerfinder.NativeDocumentJourneyTest#nativeDocumentJourneyFirstProcess_usesActualPickerAndPersistsPreparedA';
const METHOD_CLASS=FIRST_METHOD.split('#')[0],METHOD_NAME=FIRST_METHOD.split('#')[1];
export const methodOutput=()=>Buffer.from([
  'INSTRUMENTATION_STATUS: class='+METHOD_CLASS,'INSTRUMENTATION_STATUS: current=1',
  'INSTRUMENTATION_STATUS: test='+METHOD_NAME,'INSTRUMENTATION_STATUS_CODE: 1',
  'INSTRUMENTATION_STATUS: class='+METHOD_CLASS,'INSTRUMENTATION_STATUS: current=1',
  'INSTRUMENTATION_STATUS: test='+METHOD_NAME,'INSTRUMENTATION_STATUS_CODE: 0',
  'INSTRUMENTATION_RESULT: stream=','Time: 1.25','OK (1 test)','',
  'INSTRUMENTATION_CODE: -1',''].join('\n'));

const descriptor=(root,area,name,value)=>({name,path:path.join(root,area,name),bytes:value.length,sha256:sha256(value)});
function stat(value,inode,binding){
  const s={device:1,inode,mode:0o100600,uid:binding.appUID,gid:binding.appGID,size:value.length,
    mtimeSeconds:1700000000,ctimeSeconds:1700000000,links:1,fileType:'regular',permissionMode:0o600,
    rawMtimeText:'1700000000',mtimePrecisionMilliseconds:1000,symlinkObserved:false,
    statSource:'toybox stat without -L; exact %d %i %f %u %g %s %Y %Z %h'};
  s.rawStatText=[s.device,s.inode,s.mode.toString(16),s.uid,s.gid,s.size,s.mtimeSeconds,s.ctimeSeconds,s.links].join(' ');
  return {before:s,after:clone(s),firstSHA256:sha256(value),secondSHA256:sha256(value)};
}
function table(bytes,app){
  const lines=bytes.toString().trimEnd().split('\n');
  const rows=lines.slice(1).map(line=>{const [pid,name,...args]=line.trim().split(/\s+/);return {pid:Number(pid),name,arguments:args.join(' ')};});
  return {rows:rows.length,relevant:rows.filter(v=>[v.name,v.arguments.split(/\s+/)[0]].some(n=>n===app||n.startsWith(app+':'))),
    rawSHA256:sha256(bytes),matchesExactMainAndColonChildren:true};
}

export function restartFixture({artifactRoot,at=100,binding=BINDING,seedAlreadyAbsent=false}){
  const bodies=restartBodies(),commandOriginals={},receipts={};
  const args={
    firstMethod:['shell','-T','-n','am','instrument','-w','-r','-e','class',FIRST_METHOD,
      '-e','career_native_journey','true','-e','career_native_journey_phase','first',
      '-e','career_native_journey_test_id',binding.testID,'-e','career_native_journey_config_sha256','c'.repeat(64),
      binding.applicationID+'.test/androidx.test.runner.AndroidJUnitRunner'],
    forceStop:['shell','-T','-n','am','force-stop',binding.applicationID],
    processBefore:['shell','-T','-n','/system/bin/toybox','ps','-A','-o','PID,NAME,ARGS'],
    processAfter:['shell','-T','-n','/system/bin/toybox','ps','-A','-o','PID,NAME,ARGS'],
    pidofBefore:['shell','-T','-n','/system/bin/toybox','pidof',binding.applicationID],
    pidofAfter:['shell','-T','-n','/system/bin/toybox','pidof',binding.applicationID],
  };
  const psBase='  PID NAME ARGS\n    1 init /system/bin/init\n';
  const stdout={firstMethod:methodOutput(),forceStop:Buffer.alloc(0),
    processBefore:Buffer.from(psBase+(seedAlreadyAbsent?'':FIRST_PROCESS.pid+' '+binding.applicationID+' '+binding.applicationID+'\n')),
    processAfter:Buffer.from(psBase),pidofBefore:Buffer.from(seedAlreadyAbsent?'':FIRST_PROCESS.pid+'\n'),pidofAfter:Buffer.alloc(0)};
  let pid=7000;
  for(const name of Object.keys(args)){
    const raw={stdout:stdout[name],stderr:Buffer.alloc(0)};commandOriginals[name]=raw;
    receipts[name]={schemaVersion:1,name,pid:++pid,identity:{pid,start:'synthetic-start',command:'synthetic-private-adb'},
      startedAtMonotonic:at,completedAtMonotonic:at,exitCode:name==='pidofAfter'||name==='pidofBefore'&&seedAlreadyAbsent?1:0,
      signal:null,closeObserved:true,timedOut:false,cancelled:false,overflow:false,spawnError:false,cleanupBlocked:false,
      stdinContentsRetained:false,stdinBytes:0,signals:[],arguments:['-P','5056','-s',binding.deviceID,...args[name]],
      stdoutBytesObserved:raw.stdout.length,stderrBytesObserved:0,
      stdout:descriptor(artifactRoot,'commands',name+'.stdout',raw.stdout),stderr:descriptor(artifactRoot,'commands',name+'.stderr',raw.stderr)};
  }
  const methodSummary={expectedMethod:FIRST_METHOD,events:[{method:FIRST_METHOD,code:1},{method:FIRST_METHOD,code:0}],
    allStatusCodes:[1,0],finalCodes:[-1],finalCompleted:true,oneJUnitCompletion:true,rawSHA256:sha256(commandOriginals.firstMethod.stdout),
    passed:true,childReceipt:receipts.firstMethod};
  const bodyNames=['first-process-complete.json','process-boundary.json','restore-pre-activity.json'];
  const bodyBytes=[bodies.seedHandoffBytes,bodies.boundaryBytes,bodies.restorePreActivityBytes];
  const postStop=JSON.parse(bodies.boundaryBytes).postStopCiphertexts,postStopCiphertexts={};
  for(const [index,name]of Object.keys(postStop).entries()){
    const kind=name.split('-')[0];
    const cipher=Buffer.concat([Buffer.from([1]),Buffer.from(sha256(kind+'-post-stop'),'hex')]);
    postStopCiphertexts[name]={...stat(cipher,8100+index,binding),
      original:descriptor(artifactRoot,'originals','post-stop-'+name+'.enc',cipher),
      raw:descriptor(artifactRoot,'originals','raw-'+index+'.bin',Buffer.from('synthetic bounded original frame'))};
  }
  const device=()=>({deviceID:binding.deviceID,applicationID:binding.applicationID,appUID:binding.appUID,appGID:binding.appGID,owned:true});
  const relayProof={schemaVersion:1,testID:binding.testID,deviceID:binding.deviceID,applicationID:binding.applicationID,
    appUID:binding.appUID,appGID:binding.appGID,source:clone(binding.source),observedAtMonotonic:at,completedAtMonotonic:at,
    monotonicPrecisionMilliseconds:1,files:Object.fromEntries(bodyNames.map((name,i)=>[name,stat(bodyBytes[i],8000+i,binding)])),
    originals:bodyNames.map((name,i)=>descriptor(artifactRoot,'originals',name,bodyBytes[i])),postStopCiphertexts,
    firstMethod:{summary:methodSummary,raw:receipts.firstMethod.stdout,exitCode:0},
    forceStop:{command:args.forceStop,exitCode:0,receipt:receipts.forceStop},
    noTargetProcess:{before:{table:table(stdout.processBefore,binding.applicationID),receipt:receipts.processBefore,pidof:receipts.pidofBefore},
      after:{table:table(stdout.processAfter,binding.applicationID),receipt:receipts.processAfter,pidof:receipts.pidofAfter},
      seedProcessAlreadyAbsent:seedAlreadyAbsent,noTargetPIDObserved:true},deviceProofBefore:device(),deviceProofAfter:device(),commandOriginals};
  return {...bodies,relayProof};
}

/** Keep descriptor hashes consistent so negative cases exercise semantic gates. */
export function changeCommandOriginal(input,name,stdout,{updateTable=false,updateMethodDigest=false}={}){
  const p=input.relayProof,pair=p.commandOriginals[name];pair.stdout=Buffer.from(stdout);
  const receipt=name==='firstMethod'?p.firstMethod.summary.childReceipt:name==='forceStop'?p.forceStop.receipt:
    name==='processBefore'?p.noTargetProcess.before.receipt:name==='processAfter'?p.noTargetProcess.after.receipt:
      name==='pidofBefore'?p.noTargetProcess.before.pidof:p.noTargetProcess.after.pidof;
  receipt.stdout={...receipt.stdout,bytes:pair.stdout.length,sha256:sha256(pair.stdout)};receipt.stdoutBytesObserved=pair.stdout.length;
  if(name==='firstMethod'){p.firstMethod.raw=receipt.stdout;if(updateMethodDigest)p.firstMethod.summary.rawSHA256=sha256(pair.stdout);}
  if(updateTable){const target=name==='processBefore'?p.noTargetProcess.before:p.noTargetProcess.after;target.table=table(pair.stdout,p.applicationID);}
  return input;
}
