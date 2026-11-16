import assert from 'node:assert/strict';
import {linkedinProfileURL,profile,safeProfile} from '../server/validation.mjs';
import {requirementsError} from '../server/provider.mjs';

const accepted = [
  ['https://linkedin.com/in/example','https://www.linkedin.com/in/example'],
  ['HTTPS://SA.LINKEDIN.COM:443/in/Example/?trk=phone#about','https://www.linkedin.com/in/Example'],
  ['https://uk.linkedin.com/in/José','https://www.linkedin.com/in/Jos%C3%A9'],
  ['https://www.linkedin.com/in/سلام','https://www.linkedin.com/in/%D8%B3%D9%84%D8%A7%D9%85'],
  ['https://www.linkedin.com/in/a%2bb','https://www.linkedin.com/in/a%2Bb'],
  ['https://www.linkedin.com/in/a+b','https://www.linkedin.com/in/a%2Bb'],
  ['https://www.linkedin.com/in/%41_~-','https://www.linkedin.com/in/A_~-'],
  ['https://www.linkedin.com/in/a%3fb','https://www.linkedin.com/in/a%3Fb'],
  ["https://www.linkedin.com/in/a!'()*b",'https://www.linkedin.com/in/a%21%27%28%29%2Ab'],
];
const rejected = [null, false, 17, {}, [], '',
  'https://www.linkedin.com/in/'+'س'.repeat(400),
  'http://www.linkedin.com/in/example', 'https://linkedin.com.evil.example/in/example',
  'https://evil.example/linkedin.com/in/example', 'https://user@www.linkedin.com/in/example',
  'https://www.linkedin.com:444/in/example', 'https://www.linkedin.com:/in/example',
  'https://www%2elinkedin.com/in/example', 'https://mobile.linkedin.com/in/example',
  'https://www.linkedin.com/company/example', 'https://www.linkedin.com/jobs/view/123',
  'https://www.linkedin.com/in/', 'https://www.linkedin.com/in/a/b',
  'https://www.linkedin.com/in/a//', 'https://www.linkedin.com/in/../example',
  'https://www.linkedin.com/in/a/../example', 'https://www.linkedin.com/in/%2e',
  'https://www.linkedin.com/in/%2E%2E', 'https://www.linkedin.com/in/a%2fb',
  'https://www.linkedin.com/in/a%5cb', 'https://www.linkedin.com/in/a%252fb',
  'https://www.linkedin.com/in/a%0ab', 'https://www.linkedin.com/in/a%C2%85b',
  'https://www.linkedin.com/in/a%20b', 'https://www.linkedin.com/in/a%C2%A0b',
  'https://www.linkedin.com/in/a%FFb', 'https://www.linkedin.com/in/a%',
  'https://www.linkedin.com/in/a%E2%80%AEb', 'https://www.linkedin.com/in/a%E2%80%8Db',
  'https://www.linkedin.com/in/a\u200bb', 'https://www.linkedin.com/in/example#%E2%80%AE',
  'https://www.linkedin.com/in/example?trk=%0a', 'https://www.linkedin.com/in/example#%FF',
  'https://www.linkedin.com/in/exam\nple', 'https://www.linkedin.com/in/example ',
  'https://www.linkedin.com\\evil.example/in/example',
];
for (const [input,expected] of accepted) {
  assert.equal(linkedinProfileURL(input),expected);
  assert.equal(linkedinProfileURL(expected),expected,'Canonical URLs must be idempotent');
}
for (const input of rejected) assert.throws(()=>linkedinProfileURL(input),{code:'invalid_linkedin'},String(input));
const link=accepted[0][1];
assert.equal(profile({}).linkedin,'');
assert.equal(profile({linkedin:accepted[0][0]}).linkedin,link);
assert.equal(profile({headline:'Edited on an older phone'},{linkedin:link}).linkedin,link);
assert.equal(profile({linkedin:''},{linkedin:link}).linkedin,'');
for (const value of [null,false,[],17]) assert.throws(()=>profile({linkedin:value}),{code:'invalid_linkedin'});
assert.equal(safeProfile({},0).linkedin,'');
assert.equal(requirementsError({website:'',linkedin:link},{},{requiredFields:['urls']}),'');
assert.match(requirementsError({website:'',linkedin:''},{},{requiredFields:['urls']}),/urls/);
console.log(`PASS LinkedIn URL boundary: ${accepted.length} canonical examples, ${rejected.length} rejected inputs, migration and provider requirements.`);
