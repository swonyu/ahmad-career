// Private Android witness decoder. No I/O or runtime on import.
// Draft only until bound to the Android owner's final schema/source freeze.
import {CheckpointError, SHA, UUID, canonical, sha256, decodeControlRequest} from './control-state.mjs';
import {decodeAndroidJSON} from './android-json.mjs';

export const ANDROID_WITNESS_LIMITS = Object.freeze({
  witnessBytes: 2097152, publicationBytes: 16384, ciphertextBytes: 2097152,
  uiBudgetMilliseconds: 5000, hostBudgetMilliseconds: 4500,
});
export const ANDROID_SOURCE_KEYS = Object.freeze([
  'sourceManifestSHA256', 'appAPKsha256', 'testAPKsha256', 'workerSHA256', 'bootstrapSHA256',
]);
const fail = code => { throw new CheckpointError(code); };
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const integer = (value, maximum = Number.MAX_SAFE_INTEGER) =>
  Number.isSafeInteger(value) && value >= 0 && value <= maximum;
const exactKeys = (value, keys) => object(value) &&
  Object.keys(value).sort().join(',') === [...keys].sort().join(',');
const bytesValid = (value, maximum) => value instanceof Uint8Array &&
  value.byteLength > 0 && value.byteLength <= maximum;
const same = (left, right) => canonical(left) === canonical(right);
const uppercaseUUID = value => typeof value === 'string' &&
  UUID.test(value) && value === value.toUpperCase();

export function androidWorkspaceKey(physicalOrigin, workspaceID) {
  if (typeof physicalOrigin !== 'string' || !/^https:\/\/10\.0\.2\.2:[1-9][0-9]{3,4}$/.test(physicalOrigin) ||
      !UUID.test(workspaceID ?? '')) fail('android_checkpoint_scope_binding');
  const port = Number(physicalOrigin.slice(physicalOrigin.lastIndexOf(':') + 1));
  if (port < 1024 || port > 65535) fail('android_checkpoint_scope_binding');
  return sha256(physicalOrigin + '\n' + workspaceID);
}

function processValid(process) {
  return exactKeys(process, ['pid', 'startTicks', 'nonce']) &&
    integer(process.pid, 2147483647) && process.pid > 0 &&
    typeof process.startTicks === 'string' && /^[1-9][0-9]{0,19}$/.test(process.startTicks) &&
    uppercaseUUID(process.nonce);
}

function storageOriginal(kind, metadata, ciphertext, prefix, workspaceKey) {
  const withValue = kind !== 'connection';
  const keys = ['recordName', 'bytes', 'sha256', 'evidenceFile'];
  if (withValue) keys.push('value', 'canonicalSHA256');
  if (!exactKeys(metadata, keys) ||
      metadata.recordName !== (withValue ? kind + '-' + workspaceKey : 'connection') ||
      metadata.evidenceFile !== prefix + '-' + kind + '.enc' ||
      !integer(metadata.bytes, ANDROID_WITNESS_LIMITS.ciphertextBytes) || metadata.bytes < 30 ||
      !SHA.test(metadata.sha256 ?? '') ||
      !bytesValid(ciphertext, ANDROID_WITNESS_LIMITS.ciphertextBytes) ||
      ciphertext.byteLength !== metadata.bytes || ciphertext[0] !== 1 ||
      sha256(ciphertext) !== metadata.sha256) fail('android_checkpoint_cipher_original');
  if (withValue && (!object(metadata.value) || !SHA.test(metadata.canonicalSHA256 ?? '') ||
      sha256(canonical(metadata.value)) !== metadata.canonicalSHA256))
    fail('android_checkpoint_clear_digest');
  return {sha256: metadata.sha256, bytes: metadata.bytes,
    canonicalSHA256: withValue ? metadata.canonicalSHA256 : null};
}

/**
 * Decode only the immutable fixed packet. The separate participant must first
 * verify the source-bound relay's actual UID/inode/mode/mtime/two-read proofs.
 * This does not decrypt Keystore ciphertext or claim atomic UI/disk observation.
 * Pinned instrumentation supplies values read through the actual SecureVault.
 */
export function decodeAndroidCheckpointPacket(packet, binding, expectedSequence) {
  if (!exactKeys(packet, ['request', 'publication', 'witness', 'ciphertexts']) ||
      !object(packet.ciphertexts) || !uppercaseUUID(binding?.testID) ||
      !UUID.test(binding?.workspaceID ?? '') || !['en', 'ar'].includes(binding?.language) ||
      !SHA.test(binding?.nativeTokenSHA256 ?? '') ||
      !exactKeys(binding?.source, ANDROID_SOURCE_KEYS) ||
      !ANDROID_SOURCE_KEYS.every(key => SHA.test(binding.source[key] ?? '')))
    fail('android_checkpoint_binding');
  const workspaceKey = androidWorkspaceKey(binding.physicalOrigin, binding.workspaceID);
  const request = decodeControlRequest(packet.request, binding.testID, expectedSequence);
  const witness = decodeAndroidJSON(packet.witness, ANDROID_WITNESS_LIMITS.witnessBytes);
  const publication = decodeAndroidJSON(packet.publication, ANDROID_WITNESS_LIMITS.publicationBytes);
  const prefix = String(expectedSequence).padStart(3, '0');
  if (!exactKeys(witness, ['schemaVersion', 'platform', 'testID', 'sequence', 'checkpoint',
        'language', 'observation', 'process', 'source', 'scope', 'storage', 'live']) ||
      witness.schemaVersion !== 1 || witness.platform !== 'android' ||
      witness.testID !== request.testID || witness.sequence !== request.sequence ||
      witness.checkpoint !== request.checkpoint || witness.language !== binding.language ||
      !processValid(witness.process) || !same(witness.source, binding.source) ||
      !object(witness.live)) fail('android_checkpoint_witness_shape');
  if (!exactKeys(witness.scope, ['origin', 'workspaceID', 'workspaceKey', 'nativeTokenSHA256']) ||
      witness.scope.origin !== binding.physicalOrigin || witness.scope.workspaceID !== binding.workspaceID ||
      witness.scope.workspaceKey !== workspaceKey ||
      witness.scope.nativeTokenSHA256 !== binding.nativeTokenSHA256)
    fail('android_checkpoint_witness_scope');
  const observation = witness.observation;
  if (!exactKeys(observation, ['startedElapsedNanos', 'finishedElapsedNanos', 'wallTime',
        'sequentialNotAtomicUIAndDisk']) ||
      !integer(observation.startedElapsedNanos) || !integer(observation.finishedElapsedNanos) ||
      observation.finishedElapsedNanos < observation.startedElapsedNanos ||
      observation.sequentialNotAtomicUIAndDisk !== true ||
      typeof observation.wallTime !== 'string' || observation.wallTime.length > 64 ||
      !Number.isFinite(Date.parse(observation.wallTime)))
    fail('android_checkpoint_observation_shape');
  if (!exactKeys(publication, ['schemaVersion', 'testID', 'sequence', 'checkpoint', 'process',
        'uiBudgetStartedElapsedMillis', 'uiBudgetStartedElapsedNanos', 'uiDeadlineElapsedMillis',
        'witnessFinishedElapsedNanos', 'requestSHA256', 'witnessSHA256', 'publicationOrder']) ||
      publication.schemaVersion !== 1 || publication.testID !== request.testID ||
      publication.sequence !== request.sequence || publication.checkpoint !== request.checkpoint ||
      !same(publication.process, witness.process) ||
      !integer(publication.uiBudgetStartedElapsedMillis) ||
      !integer(publication.uiBudgetStartedElapsedNanos) ||
      !integer(publication.uiDeadlineElapsedMillis) ||
      publication.uiDeadlineElapsedMillis - publication.uiBudgetStartedElapsedMillis !==
        ANDROID_WITNESS_LIMITS.uiBudgetMilliseconds ||
      publication.witnessFinishedElapsedNanos !== observation.finishedElapsedNanos ||
      publication.witnessFinishedElapsedNanos > publication.uiBudgetStartedElapsedNanos ||
      publication.requestSHA256 !== sha256(packet.request) ||
      publication.witnessSHA256 !== sha256(packet.witness) ||
      publication.publicationOrder !== 'ciphertexts_then_witness_then_budget_marker_then_request_last')
    fail('android_checkpoint_publication_binding');
  // Samples are sequential. The actual UI millisecond guard remains authoritative.
  const sampledBudgetMillis = publication.uiBudgetStartedElapsedNanos / 1000000;
  if (sampledBudgetMillis < publication.uiBudgetStartedElapsedMillis - 1 ||
      sampledBudgetMillis >= publication.uiDeadlineElapsedMillis)
    fail('android_checkpoint_publication_clock');
  if (!exactKeys(witness.storage, ['connection', 'workspace', 'search']) ||
      witness.storage.connection === null) fail('android_checkpoint_storage_shape');
  const kinds = ['connection', 'workspace', 'search'].filter(kind => witness.storage[kind] !== null);
  if (Object.keys(packet.ciphertexts).sort().join(',') !== [...kinds].sort().join(','))
    fail('android_checkpoint_cipher_inventory');
  const originals = Object.create(null);
  for (const kind of kinds)
    originals[kind] = storageOriginal(kind, witness.storage[kind], packet.ciphertexts[kind], prefix, workspaceKey);
  return Object.freeze({request, witness, publication, workspaceKey, originals,
    hashes: Object.freeze({request: sha256(packet.request), witness: sha256(packet.witness),
      publication: sha256(packet.publication)})});
}
