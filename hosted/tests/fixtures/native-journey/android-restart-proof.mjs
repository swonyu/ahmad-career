// Validate only returned fixed process-boundary originals. No commands or paths
// from this object are executed/read; the guarded operation owns that I/O.
import path from 'node:path';
import {CheckpointError,SHA,canonical,sha256} from './control-state.mjs';
import {decodeAndroidJSON} from './android-json.mjs';
import {androidWorkspaceKey} from './android-witness.mjs';

const fail=code=>{throw new CheckpointError(code);};
const same=(a,b)=>canonical(a)===canonical(b);
const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const exact=(v,keys)=>object(v)&&Object.keys(v).sort().join(',')===[...keys].sort().join(',');
const integer=(v,min=0)=>Number.isSafeInteger(v)&&v>=min;
const METHOD='com.saleh.careerfinder.NativeDocumentJourneyTest#nativeDocumentJourneyFirstProcess_usesActualPickerAndPersistsPreparedA';
const UTF8=new TextDecoder('utf-8',{fatal:true});
const COMMANDS=['firstMethod','forceStop','processBefore','processAfter','pidofBefore','pidofAfter'];
const STAT_KEYS=['device','inode','mode','uid','gid','size','mtimeSeconds','ctimeSeconds','links','fileType','permissionMode',
  'rawMtimeText','mtimePrecisionMilliseconds','symlinkObserved','rawStatText','statSource'];
function decodedText(bytes){try{return UTF8.decode(bytes);}catch{fail('android_restart_original_utf8');}}

function original(value,bytes,root,area,expectedName=null){
  if(!exact(value,['name','path','bytes','sha256'])||typeof value.name!=='string'||!/^[-A-Za-z0-9_.]{1,160}$/.test(value.name)||
     expectedName!==null&&value.name!==expectedName||value.path!==path.join(root,area,value.name)||
     !integer(value.bytes)||value.bytes>4*1024*1024||!SHA.test(value.sha256??'')||
     bytes!==null&&(!(bytes instanceof Uint8Array)||value.bytes!==bytes.length||value.sha256!==sha256(bytes)))
    fail('android_restart_original_binding');
}
function metadata(value,expectedSHA,expectedBytes,binding){
  if(!exact(value,['before','after','firstSHA256','secondSHA256'])||value.firstSHA256!==expectedSHA||
     value.secondSHA256!==expectedSHA||!same(value.before,value.after))fail('android_restart_file_identity');
  const s=value.before;
  if(!exact(s,STAT_KEYS)||!['device','inode','mode','uid','gid','size','mtimeSeconds','ctimeSeconds','links'].every(k=>integer(s[k]))||
     s.inode<1||s.mode!==0o100600||s.uid!==binding.appUID||s.gid!==binding.appGID||s.links!==1||
     s.size!==expectedBytes||s.fileType!=='regular'||s.permissionMode!==0o600||s.symlinkObserved!==false||
     s.mtimePrecisionMilliseconds!==1000||s.rawMtimeText!==String(s.mtimeSeconds)||
     s.statSource!=='toybox stat without -L; exact %d %i %f %u %g %s %Y %Z %h'||
     s.rawStatText!==[s.device,s.inode,s.mode.toString(16),s.uid,s.gid,s.size,s.mtimeSeconds,s.ctimeSeconds,s.links].join(' '))
    fail('android_restart_file_stat');
}
function processTable(raw,app){
  const lines=decodedText(raw).trimEnd().split(/\r?\n/);
  if(lines.length<2||lines.length>1024||!/^\s*PID\s+NAME\s+ARGS\s*$/.test(lines[0]))fail('android_restart_process_table');
  const rows=lines.slice(1).map(line=>{
    const m=/^\s*(\d+)\s+(\S+)\s+(.*\S)\s*$/.exec(line);
    if(!m||!integer(Number(m[1]),1))fail('android_restart_process_row');
    return {pid:Number(m[1]),name:m[2],arguments:m[3]};
  });
  if(new Set(rows.map(v=>v.pid)).size!==rows.length)fail('android_restart_process_duplicate');
  return {rows:rows.length,relevant:rows.filter(v=>[v.name,v.arguments.split(/\s+/)[0]].some(n=>n===app||n.startsWith(app+':'))),
    rawSHA256:sha256(raw),matchesExactMainAndColonChildren:true};
}

function methodSummary(raw){
  const text=decodedText(raw),events=[],allStatusCodes=[];let fields={};
  for(const line of text.split(/\r?\n/)){
    const field=/^INSTRUMENTATION_STATUS: ([^=]+)=(.*)$/.exec(line);if(field)fields[field[1]]=field[2];
    const status=/^INSTRUMENTATION_STATUS_CODE: (-?\d+)$/.exec(line);
    if(status){allStatusCodes.push(Number(status[1]));if(fields.class&&fields.test)events.push({method:fields.class+'#'+fields.test,code:Number(status[1])});fields={};}
  }
  const terminal=[...text.matchAll(/^INSTRUMENTATION_CODE: (-?\d+)\r?$/gm)].map(m=>Number(m[1]));
  const tests=[...text.matchAll(/^OK \((\d+) test\)\s*$/gm)].map(m=>Number(m[1]));
  if(!same(events,[{method:METHOD,code:1},{method:METHOD,code:0}])||!same(allStatusCodes,[1,0])||!same(terminal,[-1])||
     text.trimEnd().split(/\r?\n/).at(-1)!=='INSTRUMENTATION_CODE: -1'||!same(tests,[1])||
     /FAILURES!!!|INSTRUMENTATION_FAILED|INSTRUMENTATION_ABORTED|INSTRUMENTATION_RESULT: (?:shortMsg|longMsg)=|Fatal exception when running tests/.test(text))
    fail('android_restart_first_method_not_complete');
  return {expectedMethod:METHOD,events,allStatusCodes,finalCodes:terminal,finalCompleted:true,oneJUnitCompletion:true,rawSHA256:sha256(raw),passed:true};
}

function command(receipt,raw,shortArgs,binding,root,{exitCode=0}={}){
  if(!object(receipt)||receipt.schemaVersion!==1||receipt.exitCode!==exitCode||receipt.signal!==null||
     !integer(receipt.pid,1)||!Number.isFinite(receipt.startedAtMonotonic)||!Number.isFinite(receipt.completedAtMonotonic)||
     receipt.startedAtMonotonic<0||receipt.completedAtMonotonic<receipt.startedAtMonotonic||
     ['timedOut','cancelled','overflow','spawnError','cleanupBlocked'].some(k=>receipt[k]!==false)||
     receipt.closeObserved!==true||receipt.stdinContentsRetained!==false||receipt.stdinBytes!==0||
     !same(receipt.signals,[])||!same(receipt.arguments,['-P','5056','-s',binding.deviceID,...shortArgs])||
     !exact(raw,['stdout','stderr'])||!(raw.stdout instanceof Uint8Array)||!(raw.stderr instanceof Uint8Array)||
     raw.stdout.length>4*1024*1024||raw.stderr.length>65536||
     receipt.stdoutBytesObserved!==raw.stdout.length||receipt.stderrBytesObserved!==raw.stderr.length)
    fail('android_restart_command_receipt');
  original(receipt.stdout,raw.stdout,root,'commands');original(receipt.stderr,raw.stderr,root,'commands');
  return receipt;
}

/** Checks fixed actual originals, never a Boolean-only process assertion. */
export function validateAndroidRestartRelay(input,binding,{artifactRoot,now,checkpoint14CompletedAt}){
  const {boundaryBytes,seedHandoffBytes,restorePreActivityBytes,relayProof:p}=input;
  if(!path.isAbsolute(artifactRoot)||path.resolve(artifactRoot)!==artifactRoot||!Number.isFinite(now)||
     !exact(p,['schemaVersion','testID','deviceID','applicationID','appUID','appGID','source','observedAtMonotonic',
       'completedAtMonotonic','monotonicPrecisionMilliseconds','files','originals','postStopCiphertexts','firstMethod',
       'forceStop','noTargetProcess','deviceProofBefore','deviceProofAfter','commandOriginals'])||
     p.schemaVersion!==1||p.testID!==binding.testID||p.deviceID!==binding.deviceID||p.applicationID!==binding.applicationID||
     p.appUID!==binding.appUID||p.appGID!==binding.appGID||!same(p.source,binding.source)||
     p.monotonicPrecisionMilliseconds!==1||!integer(p.observedAtMonotonic)||!integer(p.completedAtMonotonic)||
     p.completedAtMonotonic<p.observedAtMonotonic||p.completedAtMonotonic>Math.floor(now)||
     !Number.isFinite(checkpoint14CompletedAt)||p.observedAtMonotonic<Math.floor(checkpoint14CompletedAt))
    fail('android_restart_relay_binding');
  const bodyNames=['first-process-complete.json','process-boundary.json','restore-pre-activity.json'];
  const bodyBytes=[seedHandoffBytes,boundaryBytes,restorePreActivityBytes];
  if(!exact(p.files,bodyNames)||!Array.isArray(p.originals)||p.originals.length!==3||
     new Set(p.originals.map(x=>x?.name)).size!==3||!exact(p.commandOriginals,COMMANDS))fail('android_restart_inventory');
  for(let i=0;i<3;i++){
    const b=bodyBytes[i],name=bodyNames[i];
    if(!(b instanceof Uint8Array)||b.length<1||b.length>32768)fail('android_restart_body_size');
    original(p.originals.find(v=>v.name===name),b,artifactRoot,'originals',name);
    metadata(p.files[name],sha256(b),b.length,binding);
  }
  const boundary=decodeAndroidJSON(boundaryBytes,16384),seed=decodeAndroidJSON(seedHandoffBytes,32768);
  const records=['connection','workspace-'+androidWorkspaceKey(binding.physicalOrigin,binding.workspaceID),
    'search-'+androidWorkspaceKey(binding.physicalOrigin,binding.workspaceID)];
  if(!exact(p.postStopCiphertexts,records)||!object(boundary.postStopCiphertexts))fail('android_restart_cipher_inventory');
  for(const name of records){
    const value=p.postStopCiphertexts[name];
    if(!exact(value,['before','after','firstSHA256','secondSHA256','original','raw']))fail('android_restart_cipher_shape');
    original(value.original,null,artifactRoot,'originals','post-stop-'+name+'.enc');
    original(value.raw,null,artifactRoot,'originals');
    if(value.original.bytes<30||value.original.bytes>2097152||value.original.sha256!==boundary.postStopCiphertexts[name])
      fail('android_restart_cipher_digest');
    const {before,after,firstSHA256,secondSHA256}=value;
    metadata({before,after,firstSHA256,secondSHA256},value.original.sha256,value.original.bytes,binding);
  }
  for(const value of [p.deviceProofBefore,p.deviceProofAfter])if(!object(value)||value.deviceID!==binding.deviceID||
    value.applicationID!==binding.applicationID||value.appUID!==binding.appUID||value.appGID!==binding.appGID||value.owned!==true)
    fail('android_restart_device_owner');
  const first=p.firstMethod;
  if(!exact(first,['summary','raw','exitCode'])||first.exitCode!==0||!object(first.summary))fail('android_restart_method_receipt');
  const raw=p.commandOriginals;
  const parsed=methodSummary(raw.firstMethod.stdout);
  for(const key of Object.keys(parsed))if(!same(first.summary[key],parsed[key]))fail('android_restart_method_summary');
  if(!same(first.raw,first.summary.childReceipt?.stdout))fail('android_restart_method_original');
  const firstArgs=first.summary.childReceipt?.arguments?.slice(4);
  // The arguments are bound to the exact method, phase, test ID and a SHA256
  // configuration. No app token or endpoint is accepted as an argument.
  const expectedFirst=['shell','-T','-n','am','instrument','-w','-r','-e','class',METHOD,'-e','career_native_journey','true',
    '-e','career_native_journey_phase','first','-e','career_native_journey_test_id',binding.testID,
    '-e','career_native_journey_config_sha256',null,binding.applicationID+'.test/androidx.test.runner.AndroidJUnitRunner'];
  if(!Array.isArray(firstArgs)||firstArgs.length!==expectedFirst.length||!SHA.test(firstArgs[21]??''))fail('android_restart_method_arguments');
  expectedFirst[21]=firstArgs[21];
  if(!same(firstArgs,expectedFirst))fail('android_restart_method_arguments');
  const firstReceipt=command(first.summary.childReceipt,raw.firstMethod,expectedFirst,binding,artifactRoot);
  if(!exact(p.forceStop,['command','exitCode','receipt'])||p.forceStop.exitCode!==0||
     !same(p.forceStop.command,['shell','-T','-n','am','force-stop',binding.applicationID]))fail('android_restart_force_stop');
  const force=command(p.forceStop.receipt,raw.forceStop,p.forceStop.command,binding,artifactRoot);
  if(raw.forceStop.stdout.length||raw.forceStop.stderr.length)fail('android_restart_force_stop_output');
  const n=p.noTargetProcess;
  if(!exact(n,['before','after','seedProcessAlreadyAbsent','noTargetPIDObserved'])||n.noTargetPIDObserved!==true||
     typeof n.seedProcessAlreadyAbsent!=='boolean'||!exact(n.before,['table','receipt','pidof'])||!exact(n.after,['table','receipt','pidof']))
    fail('android_restart_absence_proof');
  const ps=['shell','-T','-n','/system/bin/toybox','ps','-A','-o','PID,NAME,ARGS'];
  const beforeReceipt=command(n.before.receipt,raw.processBefore,ps,binding,artifactRoot);
  const afterReceipt=command(n.after.receipt,raw.processAfter,ps,binding,artifactRoot);
  const beforeTable=processTable(raw.processBefore.stdout,binding.applicationID),afterTable=processTable(raw.processAfter.stdout,binding.applicationID);
  if(!same(n.before.table,beforeTable)||!same(n.after.table,afterTable)||afterTable.relevant.length||
     n.seedProcessAlreadyAbsent!==!beforeTable.relevant.some(v=>v.pid===seed.process?.pid)||
     raw.processBefore.stderr.length||raw.processAfter.stderr.length)fail('android_restart_target_process_remains');
  const pidArgs=['shell','-T','-n','/system/bin/toybox','pidof',binding.applicationID];
  if(![0,1].includes(n.before.pidof.exitCode))fail('android_restart_pidof');
  const beforePID=command(n.before.pidof,raw.pidofBefore,pidArgs,binding,artifactRoot,{exitCode:n.before.pidof.exitCode});
  const afterPID=command(n.after.pidof,raw.pidofAfter,pidArgs,binding,artifactRoot,{exitCode:1});
  const beforeText=decodedText(raw.pidofBefore.stdout).trim();
  if(raw.pidofBefore.stderr.length||n.before.pidof.exitCode===0&&!/^[1-9][0-9]*(?: [1-9][0-9]*)*$/.test(beforeText)||
     n.before.pidof.exitCode===1&&beforeText!==''||raw.pidofAfter.stdout.length||raw.pidofAfter.stderr.length)
    fail('android_restart_pidof');
  if(firstReceipt.completedAtMonotonic>p.observedAtMonotonic+1||
     beforeReceipt.startedAtMonotonic<p.observedAtMonotonic||beforePID.startedAtMonotonic<beforeReceipt.completedAtMonotonic||
     force.startedAtMonotonic<beforePID.completedAtMonotonic||afterReceipt.startedAtMonotonic<force.completedAtMonotonic||
     afterPID.startedAtMonotonic<afterReceipt.completedAtMonotonic||afterPID.completedAtMonotonic>p.completedAtMonotonic+1)
    fail('android_restart_command_order');
  const {commandOriginals,...retainedProof}=p;
  return {retainedProof,commandOriginals,firstMethodRawSHA256:parsed.rawSHA256,boundarySHA256:sha256(boundaryBytes),
    scope:'Returned fixed owned-device originals; no new guest observation or inferred UI acceptance.'};
}
