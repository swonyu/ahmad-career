import {createHash,createHmac,timingSafeEqual} from 'node:crypto';
import {fail,sha256} from './validation.mjs';

export const READ_VERSION=2;
export const MAX_FRAGMENT_BYTES=4*1024*1024;
export const MAX_FRAME_BYTES=6*1024*1024;
export const MAX_METADATA_BYTES=16*1024;
export const MAX_CURSOR_BYTES=2048;
export const SNAPSHOT_LIFETIME_MS=5*60*1000;
export const READ_HEADERS=Object.freeze({'X-Career-Read-Version':'2'});
const HEX64=/^[a-f0-9]{64}$/;
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const KINDS=new Set(['workspace','profile','job','plan','plan-state','receipts']);
const badUnits=/[\uD800-\uDFFF]/u;
const isIndex=value=>Number.isSafeInteger(value)&&value>=0;
const textKeys=new Set(['firstName','lastName','email','phone','city','headline']);
const jobTextKeys=new Set(['title','company','location','sourceName','summary','reason']);
const receiptTextKeys=new Set(['title','company','resumeName','applicationId','requirementsRevision']);
const itemTextKeys=new Set(['title','company','reason','applicationId','requirementsRevision']);
const summaryTextKeys=new Set(['name','email','phone','comments']);
const changedMessage='Your workspace changed while it was loading. Refresh to load the complete current version.';
const invalidMessage='The workspace recovery request is invalid. Refresh before trying again.';

export function readV2Requested(request) {
  return request.headers.get('X-Career-Read-Version')==='2'||/^\/api\/(?:phone|apply)\/read(?:-export)?$/.test(new URL(request.url).pathname);
}
export function hasMalformedText(value) {
  if(typeof value==='string')return badUnits.test(value);
  if(Array.isArray(value))return value.some(hasMalformedText);
  if(value&&typeof value==='object')return Object.keys(value).some(key=>badUnits.test(key)||hasMalformedText(value[key]));
  return false;
}
export function escapedLegacyDisplay(value) {
  // Unicode mode matches only unpaired UTF-16 units, preserving complete pairs.
  return value.replace(/[\uD800-\uDFFF]/gu,unit=>'\\u'+unit.charCodeAt(0).toString(16).toUpperCase().padStart(4,'0'));
}
function profilePath(path) {
  return path.length===1&&textKeys.has(path[0])
    ||path.length===2&&['skills','targetRoles'].includes(path[0])&&isIndex(path[1])
    ||path.length===2&&path[0]==='resume'&&path[1]==='name';
}
function jobPath(path) {return path.length===1&&jobTextKeys.has(path[0]);}
function receiptPath(path) {
  return path.length===1&&receiptTextKeys.has(path[0])||path.length===2&&path[0]==='error'&&path[1]==='message';
}
function planPath(path) {
  if(path[0]!=='items'||!isIndex(path[1]))return false;
  const rest=path.slice(2);
  return rest.length===1&&itemTextKeys.has(rest[0])
    ||rest.length===2&&rest[0]==='job'&&jobTextKeys.has(rest[1])
    ||rest.length===2&&rest[0]==='payloadSummary'&&summaryTextKeys.has(rest[1])
    ||rest.length===2&&rest[0]==='resume'&&rest[1]==='name';
}
/** Historical display/evidence fields only: never authority IDs, URLs, hashes, states or enums. */
export function legacyTextPathAllowed(kind,path) {
  if(!Array.isArray(path)||!path.length||path.some(part=>typeof part!=='string'&&!isIndex(part)))return false;
  if(kind==='workspace') {
    if(path[0]==='profile')return profilePath(path.slice(1));
    if(path[0]==='jobs'&&isIndex(path[1]))return jobPath(path.slice(2));
    if(path[0]==='attempts'&&isIndex(path[1]))return receiptPath(path.slice(2));
    if(path[0]==='recoverablePlans'&&isIndex(path[1]))return planPath(path.slice(2));
  }
  if(kind==='profile'&&path[0]==='profile')return profilePath(path.slice(1));
  if(kind==='job'&&path[0]==='job')return jobPath(path.slice(1));
  if(['plan','plan-state'].includes(kind)&&path[0]==='plan')return planPath(path.slice(1));
  if(kind==='plan-state'&&path[0]==='attempts'&&isIndex(path[1]))return receiptPath(path.slice(2));
  if(kind==='receipts'&&path[0]==='receipts'&&isIndex(path[1]))return receiptPath(path.slice(2));
  return false;
}

// The streaming serializer recognizes this private value without materializing
// another complete JSON string or base64 copy of the historical document.
class OriginalJSONBase64 {constructor(value){this.value=value;}}
export function makeReadDocument(data,kind) {
  const legacyText=[],encodedText=new Map();
  let unsupported=null;
  function project(value,path=[]) {
    if(typeof value==='string') {
      if(!badUnits.test(value))return value;
      if(!legacyTextPathAllowed(kind,path)){unsupported??='malformed_url_or_control';return value;}
      // A reviewed name/title can appear in hundreds of immutable records.
      // Share only its request-local encoding, retaining every original path.
      let encoded=encodedText.get(value);
      if(!encoded){encoded={utf16leBase64:Buffer.from(value,'utf16le').toString('base64'),display:escapedLegacyDisplay(value)};encodedText.set(value,encoded);}
      legacyText.push({path,utf16leBase64:encoded.utf16leBase64});
      return encoded.display;
    }
    if(Array.isArray(value))return value.map((item,index)=>project(item,[...path,index]));
    if(value&&typeof value==='object') {
      const result=Object.create(null);
      for(const key of Object.keys(value).sort()) {
        if(badUnits.test(key))unsupported='malformed_object_key';
        result[key]=project(value[key],[...path,key]);
      }
      return result;
    }
    return value;
  }
  const projected=project(data);
  return unsupported
    ?{documentVersion:1,mode:'raw-recovery',reasonCode:unsupported,originalJSONBase64:new OriginalJSONBase64(data)}
    :{documentVersion:1,mode:'view',data:projected,legacyText};
}
function* bytesOf(text) {
  const bytes=Buffer.from(text);
  for(let offset=0;offset<bytes.length;offset+=65536)yield bytes.subarray(offset,offset+65536);
}
function* originalBase64(value) {
  let remainder=Buffer.alloc(0);
  for(const bytes of canonicalReadChunks(value)) {
    const combined=remainder.length?Buffer.concat([remainder,bytes]):bytes;
    const end=combined.length-combined.length%3;
    if(end)yield Buffer.from(combined.subarray(0,end).toString('base64'));
    remainder=Buffer.from(combined.subarray(end));
  }
  if(remainder.length)yield Buffer.from(remainder.toString('base64'));
}
function* canonicalTokens(value) {
  if(value instanceof OriginalJSONBase64) {
    yield Buffer.from('"');yield* originalBase64(value.value);yield Buffer.from('"');return;
  }
  if(value===null||typeof value!=='object') {
    yield* bytesOf(JSON.stringify(value)??'null');return;
  }
  if(Array.isArray(value)) {
    yield Buffer.from('[');
    for(let index=0;index<value.length;index++){if(index)yield Buffer.from(',');yield* canonicalTokens(value[index]);}
    yield Buffer.from(']');return;
  }
  yield Buffer.from('{');let first=true;
  for(const key of Object.keys(value).filter(key=>value[key]!==undefined).sort()) {
    if(!first)yield Buffer.from(',');first=false;
    yield* bytesOf(JSON.stringify(key));yield Buffer.from(':');yield* canonicalTokens(value[key]);
  }
  yield Buffer.from('}');
}
/** Canonical JSON in bounded blocks, avoiding one stream pull/buffer per token. */
export function* canonicalReadChunks(value) {
  let block=Buffer.allocUnsafe(65536),used=0;
  for(const token of canonicalTokens(value)) {
    for(let offset=0;offset<token.length;) {
      const length=Math.min(token.length-offset,block.length-used);
      token.copy(block,used,offset,offset+length);used+=length;offset+=length;
      if(used===block.length){yield block;block=Buffer.allocUnsafe(65536);used=0;}
    }
  }
  if(used)yield block.subarray(0,used);
}
export function measureReadDocument(document,{offset=0,retainFragment=true}={}) {
  if(!Number.isSafeInteger(offset)||offset<0)fail('invalid_read_cursor',invalidMessage);
  const digest=createHash('sha256'),parts=[];let totalBytes=0,retained=0;
  for(const bytes of canonicalReadChunks(document)) {
    const start=totalBytes;totalBytes+=bytes.byteLength;
    if(!Number.isSafeInteger(totalBytes))fail('read_unavailable','The complete workspace recovery document could not be read safely.',503);
    digest.update(bytes);
    if(retainFragment&&retained<MAX_FRAGMENT_BYTES&&totalBytes>offset&&start<offset+MAX_FRAGMENT_BYTES) {
      const part=bytes.subarray(Math.max(0,offset-start),Math.min(bytes.byteLength,offset+MAX_FRAGMENT_BYTES-start));
      if(part.length){parts.push(Buffer.from(part));retained+=part.length;}
    }
  }
  if(offset>=totalBytes)fail('invalid_read_cursor',invalidMessage);
  return{sha256:digest.digest('hex'),totalBytes,fragment:retainFragment?Buffer.concat(parts,retained):null};
}
function safeEqual(a,b){return typeof a==='string'&&typeof b==='string'&&a.length===b.length&&timingSafeEqual(Buffer.from(a),Buffer.from(b));}
function signingKey(salt) {
  if(typeof salt!=='string'||!HEX64.test(salt))fail('service_unavailable','The application identity ledger is not initialized.',503);
  return createHmac('sha256',salt).update('career-finder/read-transport/v2').digest();
}
export function assertReadScope(scope) {
  if(!scope||!['phone','apply'].includes(scope.audience)||typeof scope.accountId!=='string'||!scope.accountId.length||scope.accountId.length>250||badUnits.test(scope.accountId)
    ||scope.workspaceId!==null&&!UUID.test(scope.workspaceId)||!HEX64.test(scope.sessionBinding))fail('read_identity_unavailable','The signed-in workspace identity could not be verified. Refresh before trying again.',409);
}
function validSpec(spec) {
  return KINDS.has(spec.kind)&&(['job','plan','plan-state'].includes(spec.kind)?UUID.test(spec.resourceId):spec.resourceId===null)
    &&(spec.kind==='plan-state'?['','stop'].includes(spec.variant):spec.variant==='');
}
export function signReadCursor(claims,salt) {
  const body=Buffer.from(JSON.stringify(claims)).toString('base64url');
  const result=body+'.'+createHmac('sha256',signingKey(salt)).update(body).digest('hex');
  if(result.length>MAX_CURSOR_BYTES)fail('read_unavailable','The workspace recovery request could not be created safely.',503);
  return result;
}
export function readCursorFromURL(url) {
  if([...url.searchParams.keys()].some(key=>key!=='cursor')||url.searchParams.getAll('cursor').length!==1)fail('invalid_read_cursor',invalidMessage);
  return url.searchParams.get('cursor');
}
export function verifyReadCursor(cursor,{scope,salt,now}) {
  assertReadScope(scope);
  if(typeof cursor!=='string'||cursor.length>MAX_CURSOR_BYTES||!/^[-_A-Za-z0-9]+\.[a-f0-9]{64}$/.test(cursor))fail('invalid_read_cursor',invalidMessage);
  const [encoded,signature]=cursor.split('.');
  const expected=createHmac('sha256',signingKey(salt)).update(encoded).digest('hex');
  if(!safeEqual(signature,expected))fail('invalid_read_cursor',invalidMessage);
  let claims;
  try {
    const bytes=Buffer.from(encoded,'base64url');if(bytes.toString('base64url')!==encoded)throw Error();claims=JSON.parse(bytes.toString('utf8'));
  } catch {fail('invalid_read_cursor',invalidMessage);}
  const keys=['version','audience','accountHash','sessionBinding','workspaceId','kind','resourceId','variant','asOf','expiresAt','sha256','totalBytes','offset'];
  if(!claims||typeof claims!=='object'||Array.isArray(claims)||Object.keys(claims).length!==keys.length||Object.keys(claims).some(key=>!keys.includes(key))
    ||claims.version!==2||!validSpec(claims)||!HEX64.test(claims.sha256)||!HEX64.test(claims.accountHash)||!HEX64.test(claims.sessionBinding)
    ||!UUID.test(claims.workspaceId)||!Number.isSafeInteger(claims.totalBytes)||claims.totalBytes<=0||!Number.isSafeInteger(claims.offset)||claims.offset<0||claims.offset>=claims.totalBytes||claims.offset%MAX_FRAGMENT_BYTES!==0
    ||typeof claims.asOf!=='string'||typeof claims.expiresAt!=='string'||!Number.isFinite(Date.parse(claims.asOf))||!Number.isFinite(Date.parse(claims.expiresAt))
    ||new Date(Date.parse(claims.asOf)).toISOString()!==claims.asOf||new Date(Date.parse(claims.expiresAt)).toISOString()!==claims.expiresAt
    ||Date.parse(claims.expiresAt)-Date.parse(claims.asOf)!==SNAPSHOT_LIFETIME_MS||Date.parse(claims.asOf)>now+1000)fail('invalid_read_cursor',invalidMessage);
  if(claims.audience!==scope.audience||claims.accountHash!==sha256(scope.accountId)||claims.workspaceId!==scope.workspaceId||!safeEqual(claims.sessionBinding,scope.sessionBinding))fail('workspace_changed','The signed-in workspace changed. Reload this page before making changes.',409);
  if(now>=Date.parse(claims.expiresAt))fail('snapshot_expired','This workspace recovery request expired. Refresh to load the current version.',409);
  return claims;
}
function checkedMeasurement(document,offset,expected,retainFragment=true) {
  let measured;
  try {measured=measureReadDocument(document,{offset,retainFragment});}
  catch(error) {
    // A valid cursor can point beyond a subsequently shortened document.
    if(expected&&error?.code==='invalid_read_cursor')fail('snapshot_changed',changedMessage,409);
    throw error;
  }
  if(expected&&(measured.totalBytes!==expected.totalBytes||!safeEqual(measured.sha256,expected.sha256)))fail('snapshot_changed',changedMessage,409);
  return measured;
}
export function createReadFrame({data,spec,scope,salt,asOf,expected=null,operation=null}) {
  assertReadScope(scope);
  if(!validSpec(spec))fail('invalid_read_cursor',invalidMessage);
  const document=makeReadDocument(data,spec.kind),offset=expected?.offset??0;
  const measured=checkedMeasurement(document,offset,expected);
  const expiresAt=expected?.expiresAt??new Date(Date.parse(asOf)+SNAPSHOT_LIFETIME_MS).toISOString();
  const common={version:2,audience:scope.audience,accountHash:sha256(scope.accountId),sessionBinding:scope.sessionBinding,workspaceId:scope.workspaceId,
    kind:spec.kind,resourceId:spec.resourceId,variant:spec.variant,asOf,expiresAt,sha256:measured.sha256,totalBytes:measured.totalBytes};
  const end=offset+measured.fragment.byteLength;
  if(scope.workspaceId===null&&end<measured.totalBytes)fail('read_unavailable','The empty workspace response could not be read safely.',503);
  const read={version:2,kind:spec.kind,accountId:scope.accountId,workspaceId:scope.workspaceId,asOf,expiresAt,sha256:measured.sha256,totalBytes:measured.totalBytes,offset,byteLength:measured.fragment.byteLength,
    nextCursor:end<measured.totalBytes?signReadCursor({...common,offset:end},salt):null,
    exportCursor:scope.workspaceId===null?null:signReadCursor({...common,offset:0},salt)};
  const body={ok:true,read,payloadBase64:measured.fragment.toString('base64'),operation};
  const metadataBytes=Buffer.byteLength(JSON.stringify({...body,payloadBase64:''}));
  if(metadataBytes>MAX_METADATA_BYTES||metadataBytes+body.payloadBase64.length>MAX_FRAME_BYTES)fail('read_unavailable','The workspace recovery response exceeds the supported transport size.',503);
  return body;
}
export function createReadExport({data,spec,scope,expected}) {
  assertReadScope(scope);
  if(expected.offset!==0)fail('invalid_read_cursor',invalidMessage);
  const document=makeReadDocument(data,spec.kind),measured=checkedMeasurement(document,0,expected,false);
  const iterator=canonicalReadChunks(document);
  const stream=new ReadableStream({
    pull(controller){const next=iterator.next();if(next.done)controller.close();else controller.enqueue(next.value);},
    cancel(){iterator.return?.();},
  });
  return new Response(stream,{headers:{...READ_HEADERS,'Content-Type':'application/json; charset=utf-8','Content-Disposition':'attachment; filename="career-finder-recovery.json"',
    'Cache-Control':'private, no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff',
    'X-Career-Read-SHA256':measured.sha256,'X-Career-Read-Bytes':String(measured.totalBytes),
    'X-Career-Read-Workspace-Id':scope.workspaceId,'X-Career-Read-Account-SHA256':sha256(scope.accountId)}});
}

/** Validate untrusted sidecars before any client/test reconstruction. */
export function restoreReadDocument(document,kind) {
  if(!document||Array.isArray(document)||Object.keys(document).length!==4||Object.keys(document).some(key=>!['documentVersion','mode','data','legacyText'].includes(key))
    ||document.documentVersion!==1||document.mode!=='view'||!document.data||typeof document.data!=='object'||Array.isArray(document.data)||!Array.isArray(document.legacyText)||hasMalformedText(document.data))throw Error('invalid-read-document');
  const value=structuredClone(document.data),seen=new Set();
  for(const item of document.legacyText) {
    if(!item||Object.keys(item).length!==2||Object.keys(item).some(key=>!['path','utf16leBase64'].includes(key))||!Array.isArray(item.path)||typeof item.utf16leBase64!=='string'||!legacyTextPathAllowed(kind,item.path))throw Error('invalid-legacy-text');
    const key=JSON.stringify(item.path);if(seen.has(key))throw Error('duplicate-legacy-text');seen.add(key);
    const bytes=Buffer.from(item.utf16leBase64,'base64');
    if(!bytes.length||bytes.length%2||bytes.toString('base64')!==item.utf16leBase64)throw Error('invalid-legacy-text');
    const raw=bytes.toString('utf16le');if(!badUnits.test(raw))throw Error('invalid-legacy-text');
    let parent=value;
    for(const part of item.path.slice(0,-1)){if(!parent||typeof parent!=='object'||!Object.hasOwn(parent,part))throw Error('invalid-legacy-path');parent=parent[part];}
    const last=item.path.at(-1);
    if(!parent||typeof parent!=='object'||!Object.hasOwn(parent,last)||typeof parent[last]!=='string'||parent[last]!==escapedLegacyDisplay(raw))throw Error('invalid-legacy-path');
    Object.defineProperty(parent,last,{value:raw,writable:true,enumerable:true,configurable:true});
  }
  return value;
}
