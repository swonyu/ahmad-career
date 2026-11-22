// Runs the actual production validation functions over synthetic URLs only.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';

const root=path.resolve(process.argv[2]??path.resolve(import.meta.dirname,'../..'));
const before=process.argv.includes('--baseline');
const prefix='https://example.com/';
const rawUnicode=prefix+'界'.repeat(2048-prefix.length);
const canonical=new URL(rawUnicode).href;
assert.equal(rawUnicode.length,2048);
assert(canonical.length>2048);
let assertions=2;
const results=[];
for(const relative of ['hosted/server/validation.mjs','website/applications/validation.mjs']) {
  const file=path.join(root,relative),validationModule=await import(pathToFileURL(file));
  const sourceSHA256=createHash('sha256').update(await fs.readFile(file)).digest('hex');
  if(before) {
    assert.equal(validationModule.publicURL(rawUnicode),canonical);
    assert.equal(validationModule.profile({website:rawUnicode}).website,canonical);
    assertions+=2;
    results.push({file:relative,sourceSHA256,rawLength:rawUnicode.length,returnedLength:canonical.length,unsafeExpansionAccepted:true});
    continue;
  }
  for(const action of [()=>validationModule.publicURL(rawUnicode),()=>validationModule.profile({website:rawUnicode})]) {
    assert.throws(action,error=>error.code==='invalid_field'&&error.status===422&&error.message==='Website URL is invalid or too long.');assertions++;
  }
  for(const address of [prefix+'界'.repeat(50),prefix+'%E7%95%8C'.repeat(200),prefix+'x'.repeat(2048-prefix.length)]) {
    const expected=new URL(address).href;
    assert(expected.length<=2048);assert.equal(validationModule.publicURL(address),expected);assert.equal(validationModule.profile({website:address}).website,expected);assertions+=3;
  }
  assert.equal(validationModule.publicURL(prefix+'#ignored'),prefix);assertions++;
  for(const invalid of [prefix+'x'.repeat(2049-prefix.length),'http://example.com/','https://user:pass@example.com/','https://127.0.0.1/','https://example.local/','https://example.com:8443/']) {
    assert.throws(()=>validationModule.publicURL(invalid));assertions++;
  }
  results.push({file:relative,sourceSHA256,rawLength:rawUnicode.length,normalizedLength:canonical.length,rejectedBeforeProfileReturn:true,acceptableEncodedUnicodePreserved:true});
}
console.log(JSON.stringify({status:before?'baseline_reproduced_oversized_canonical_value':'candidate_passed',assertions,networkRequests:0,privateRecordsUsed:0,results},null,2));
