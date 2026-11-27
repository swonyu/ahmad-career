// Separate Android JSON boundary; accepted iPhone wire helpers stay unchanged.
import {CheckpointError} from './control-state.mjs';

export const ANDROID_JSON_MAX_BYTES = 2 * 1024 * 1024;
const fail = code => { throw new CheckpointError(code); };
function unicode(value) {
  for (let i = 0; i < value.length; i++) {
    const unit = value.charCodeAt(i);
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = value.charCodeAt(++i);
      if (!(next >= 0xdc00 && next <= 0xdfff)) fail('android_json_unicode');
    } else if (unit >= 0xdc00 && unit <= 0xdfff) fail('android_json_unicode');
  }
  return value;
}

/** Duplicate properties, malformed UTF-8/Unicode, unsafe numbers and excessive trees are rejected. */
export function decodeAndroidJSON(bytes, maximum = ANDROID_JSON_MAX_BYTES) {
  if (!(bytes instanceof Uint8Array) || !Number.isSafeInteger(maximum) ||
      maximum < 1 || maximum > ANDROID_JSON_MAX_BYTES || bytes.byteLength < 1 ||
      bytes.byteLength > maximum) fail('android_json_size');
  let source;
  try { source = new TextDecoder('utf-8', {fatal: true}).decode(bytes); }
  catch { fail('android_json_utf8'); }
  let at = 0, nodes = 0;
  const space = () => { while (/[\t\n\r ]/.test(source[at] ?? '\0')) at++; };
  const string = () => {
    const start = at++;
    while (at < source.length) {
      const character = source[at++];
      if (character === '"') {
        let result;
        try { result = JSON.parse(source.slice(start, at)); }
        catch { fail('android_json_invalid'); }
        return unicode(result);
      }
      if (character === '\\') at++;
    }
    fail('android_json_invalid');
  };
  function value(depth) {
    if (depth > 32 || ++nodes > 20000) fail('android_json_complexity');
    space();
    const character = source[at];
    if (character === '"') return string();
    if (character === '{' || character === '[') {
      at++; space();
      const array = character === '[', result = array ? [] : Object.create(null), seen = new Set();
      const end = array ? ']' : '}';
      if (source[at] === end) { at++; return result; }
      while (at < source.length) {
        space(); let key;
        if (!array) {
          if (source[at] !== '"') fail('android_json_invalid');
          key = string();
          if (seen.has(key)) fail('android_json_duplicate_key');
          seen.add(key); space();
          if (source[at++] !== ':') fail('android_json_invalid');
        }
        const next = value(depth + 1);
        if (array) result.push(next); else result[key] = next;
        space();
        if (source[at] === end) { at++; return result; }
        if (source[at++] !== ',') fail('android_json_invalid');
      }
      fail('android_json_invalid');
    }
    const match = /^(?:true|false|null|-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?)/.exec(source.slice(at));
    if (!match) fail('android_json_invalid');
    at += match[0].length; let result;
    try { result = JSON.parse(match[0]); }
    catch { fail('android_json_invalid'); }
    if (typeof result === 'number' && !Number.isSafeInteger(result)) fail('android_json_number');
    return result;
  }
  const result = value(0); space();
  if (at !== source.length) fail('android_json_invalid');
  return result;
}
