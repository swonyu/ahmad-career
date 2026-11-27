// Independent checks of the guarded relay's actual fixed-file evidence.
// No device, filesystem or network action occurs here.
import {CheckpointError, canonical, SHA, sha256} from './control-state.mjs';

const fail = code => { throw new CheckpointError(code); };
const object = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const exact = (v, keys) => object(v) && Object.keys(v).sort().join(',') === [...keys].sort().join(',');
const same = (a, b) => canonical(a) === canonical(b);
const integer = (v, min = 0) => Number.isSafeInteger(v) && v >= min;
const STAT_KEYS = ['device','inode','mode','uid','gid','size','mtimeSeconds','ctimeSeconds','links',
  'fileType','permissionMode','rawMtimeText','mtimePrecisionMilliseconds','symlinkObserved','rawStatText','statSource'];
const STAT_SOURCE = 'toybox stat without -L; exact %d %i %f %u %g %s %Y %Z %h';
const COMMON_KEYS = ['schemaVersion','testID','sequence','checkpoint','deviceID','applicationID','appUID','source',
  'observedAtMonotonic','completedAtMonotonic','monotonicPrecisionMilliseconds','files','guestClock','originals','deviceProof'];
const REQUEST_KEYS = [...COMMON_KEYS,'directory','noSymlinkEvidence','requestObservation'];
const RESPONSE_KEYS = [...COMMON_KEYS,'publication','noRetry'];
const NO_SYMLINK = 'run-as fixed paths reject -L; toybox stat has no -L and mode must be regular or owned directory';

function stat(value, binding, directory = false) {
  if (!exact(value, STAT_KEYS) || !['device','inode','mode','uid','gid','size','mtimeSeconds','ctimeSeconds','links'].every(k => integer(value[k])) ||
      value.inode < 1 || value.links < 1 || value.uid !== binding.appUID || value.gid !== binding.appGID ||
      value.fileType !== (directory ? 'directory' : 'regular') ||
      value.permissionMode !== (directory ? 0o700 : 0o600) || value.mode !== (directory ? 0o40700 : 0o100600) ||
      !directory && value.links !== 1 || value.symlinkObserved !== false || value.mtimePrecisionMilliseconds !== 1000 ||
      value.rawMtimeText !== String(value.mtimeSeconds) || value.statSource !== STAT_SOURCE)
    fail('android_relay_stat');
  const raw = [value.device,value.inode,value.mode.toString(16),value.uid,value.gid,value.size,
    value.mtimeSeconds,value.ctimeSeconds,value.links].join(' ');
  if (value.rawStatText !== raw) fail('android_relay_stat_raw_binding');
}

function clock(value, marker) {
  if (!exact(value, ['raw','lowerMillis','upperExclusiveMillis','precisionMilliseconds','source']) ||
      value.source !== '/proc/uptime first field' || value.precisionMilliseconds !== 10 ||
      !integer(value.lowerMillis) || value.upperExclusiveMillis !== value.lowerMillis + 10 ||
      typeof value.raw !== 'string') fail('android_relay_guest_clock');
  const match = /^([0-9]+)\.([0-9]{2}) ([0-9]+)\.([0-9]{2})$/.exec(value.raw);
  if (!match || Number(match[1]) * 1000 + Number(match[2]) * 10 !== value.lowerMillis ||
      value.upperExclusiveMillis <= marker.uiBudgetStartedElapsedMillis ||
      value.upperExclusiveMillis >= marker.uiDeadlineElapsedMillis)
    fail('android_relay_guest_deadline');
}

function common(proof, decoded, binding, timing, response) {
  if (!exact(proof, response ? RESPONSE_KEYS : REQUEST_KEYS) || proof.schemaVersion !== 1 ||
      proof.testID !== binding.testID || proof.sequence !== decoded.request.sequence ||
      proof.checkpoint !== decoded.request.checkpoint || proof.deviceID !== binding.deviceID ||
      proof.applicationID !== binding.applicationID || proof.appUID !== binding.appUID ||
      !same(proof.source, binding.source) || proof.monotonicPrecisionMilliseconds !== 1 ||
      !integer(proof.observedAtMonotonic) || !integer(proof.completedAtMonotonic) ||
      proof.completedAtMonotonic < proof.observedAtMonotonic ||
      proof.observedAtMonotonic < Math.floor(timing.pollStarted) ||
      proof.completedAtMonotonic > Math.floor(timing.now) || timing.now >= timing.deadline)
    fail('android_relay_identity_or_time');
  if (!response && (proof.observedAtMonotonic > Math.floor(timing.started) ||
      proof.completedAtMonotonic < Math.floor(timing.started))) fail('android_relay_observation_binding');
  if (response && proof.observedAtMonotonic < Math.floor(timing.started)) fail('android_relay_response_time');
  const device = proof.deviceProof;
  if (!object(device) || device.deviceID !== binding.deviceID || device.applicationID !== binding.applicationID ||
      device.appUID !== binding.appUID || device.owned !== true) fail('android_relay_device_proof');
  if (!Array.isArray(proof.originals) || proof.originals.length > 10 ||
      new Set(proof.originals.map(x => x?.name)).size !== proof.originals.length ||
      proof.originals.some(x => !exact(x,['name','bytes','sha256']) || typeof x.name !== 'string' ||
        !/^[A-Za-z0-9_.-]{1,150}$/.test(x.name) || !integer(x.bytes,1) || x.bytes > 8 * 1024 * 1024 + 65536 || !SHA.test(x.sha256 ?? '')))
    fail('android_relay_original_inventory');
}

function original(proof, name, bytes) {
  const value = proof.originals.find(x => x.name === name);
  if (!value || value.bytes !== bytes.length || value.sha256 !== sha256(bytes)) fail('android_relay_original_digest');
}

function file(value, bytes, binding) {
  if (!exact(value,['before','after','firstSHA256','secondSHA256'])) fail('android_relay_file_shape');
  stat(value.before,binding); stat(value.after,binding);
  if (!same(value.before,value.after) || value.before.size !== bytes.length ||
      value.firstSHA256 !== sha256(bytes) || value.secondSHA256 !== value.firstSHA256)
    fail('android_relay_file_identity_or_digest');
}

export function validateAndroidRequestRelay({packet,relayProof:proof}, decoded, binding, timing) {
  common(proof,decoded,binding,timing,false);
  const prefix = String(decoded.request.sequence).padStart(3,'0');
  const names = [[prefix+'-request.json',packet.request],[prefix+'-publication.json',packet.publication],
    [prefix+'-android-witness.json',packet.witness],
    ...Object.entries(packet.ciphertexts).map(([kind,bytes])=>[prefix+'-'+kind+'.enc',bytes])];
  if (!exact(proof.files,names.map(([name])=>name)) || !exact(proof.directory,['before','after']) ||
      !exact(proof.guestClock,['requestObservation','before','after']) || proof.noSymlinkEvidence !== NO_SYMLINK ||
      !exact(proof.requestObservation,['stat','sha256'])) fail('android_relay_request_shape');
  stat(proof.directory.before,binding,true); stat(proof.directory.after,binding,true);
  if (!same(proof.directory.before,proof.directory.after)) fail('android_relay_directory_changed');
  for (const [name,bytes] of names) { file(proof.files[name],bytes,binding); original(proof,name,bytes); }
  const expectedOriginals = names.map(([name])=>name).concat(prefix+'-request-observation.raw',prefix+'-packet.raw').sort();
  if (!same(proof.originals.map(x=>x.name).sort(),expectedOriginals)) fail('android_relay_request_originals');
  const observed = proof.originals.find(x=>x.name===prefix+'-request-observation.raw');
  if (observed.sha256 !== proof.requestObservation.sha256 ||
      !same(proof.requestObservation.stat,proof.files[prefix+'-request.json'].before))
    fail('android_relay_first_observation_changed');
  for (const value of Object.values(proof.guestClock)) clock(value,decoded.publication);
  if (proof.guestClock.before.lowerMillis > proof.guestClock.after.lowerMillis ||
      proof.guestClock.requestObservation.lowerMillis > proof.guestClock.before.lowerMillis)
    fail('android_relay_guest_order');
  return {device:proof.directory.before.device,inode:proof.directory.before.inode,uid:proof.directory.before.uid};
}

export function validateAndroidResponseRelay({bytes,relayProof:proof}, expectedBytes, decoded, binding, timing) {
  common(proof,decoded,binding,timing,true);
  const prefix = String(decoded.request.sequence).padStart(3,'0'), name = prefix+'-response.json';
  if (!(bytes instanceof Uint8Array) || !Buffer.from(bytes).equals(Buffer.from(expectedBytes)) ||
      !exact(proof.files,[name]) || !exact(proof.guestClock,['after']) || proof.noRetry !== true ||
      proof.publication !== 'exclusive temporary; file fsync; no-overwrite hard link; same-inode temporary removal; directory fsync' ||
      !same(proof.originals.map(x=>x.name).sort(),[prefix+'-response-readback.raw',name].sort()))
    fail('android_relay_response_shape');
  file(proof.files[name],bytes,binding); original(proof,name,bytes); clock(proof.guestClock.after,decoded.publication);
  return true;
}
