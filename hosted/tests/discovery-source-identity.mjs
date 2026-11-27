import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import {sourceRecord,parseDiscoverySourceIdentity} from '../shared/discovery-source-identity.mjs';
import {createDiscoveryHandler,parseDiscoverySource,normalizeDiscoveryJob,DISCOVERY_SOURCES} from '../server/discovery.mjs';
import {SERVICE_ORIGIN} from '../server/applications.mjs';

const uuid='12345678-1234-4abc-8def-123456789abc';
const greenhouseForms=[
  'greenhouse:Canonical',
  'https://boards.greenhouse.io/Canonical',
  'https://job-boards.greenhouse.io/canonical/',
  'HTTPS://JOB-BOARDS.GREENHOUSE.IO/Canonical',
  'https://boards.greenhouse.io:443/canonical',
  'https://boards.greenhouse.io/canonical/jobs/0',
  'https://job-boards.greenhouse.io/canonical/jobs/12345678901234567890/',
  'https://boards.greenhouse.io/canonical?utm_source=synthetic&gh_jid=123',
  'https://boards.greenhouse.io/embed/job_board?for=Canonical',
  'https://boards.greenhouse.io/embed/job_board?for=canoni%63al',
];
const leverGlobalForms=[
  'lever:global:Spotify',
  'https://jobs.lever.co/Spotify',
  'https://jobs.lever.co/spotify/',
  `https://jobs.lever.co/spotify/${uuid.toUpperCase()}`,
  `https://jobs.lever.co/spotify/${uuid}/apply`,
  `https://jobs.lever.co/spotify/${uuid}?lever-source=synthetic&utm_campaign=fixture`,
];
const leverEUForms=[
  'lever:eu:Spotify',
  'https://jobs.eu.lever.co/Spotify/',
  `https://jobs.eu.lever.co/spotify/${uuid}/apply?lever-origin=synthetic`,
];
const messages={
  input:'Choose a supported HTTPS employer-board URL or source ID.',
  relative:'Use the direct employer-board URL without encoded or relative path segments.',
  url:'The employer-board URL is invalid.',
  credentials:'Use a supported HTTPS board URL without credentials, fragments or a custom port.',
  embed:'Use the employer board token from its Greenhouse link.',
  greenhouse:'Use a Greenhouse board or direct job posting link.',
  lever:'Use a Lever board or direct job posting link.',
  provider:'This board is not supported. Choose Greenhouse or Lever, or keep its link as a manual opportunity.',
  parameters:'Remove extra parameters from the employer-board URL.',
  id:'Use greenhouse:board, lever:global:board or lever:eu:board.',
  board:'A board token must contain 1–80 letters, digits, underscores or hyphens.',
};
const rejected=[
  [undefined,'input'],[null,'input'],[42,'input'],[{},'input'],[[],'input'],
  ['x'.repeat(2049),'input'],[' greenhouse:canonical','input'],['greenhouse:canonical\n','input'],
  ['https://boards.greenhouse.io\\canonical','input'],['','id'],['http://jobs.lever.co/spotify','id'],
  ['Greenhouse:canonical','id'],['lever:spotify','id'],['lever:apac:spotify','id'],
  ['https://','url'],['https://boards.greenhouse.io/a/../canonical','relative'],
  ['https://boards.greenhouse.io/%63anonical','relative'],['https://user@jobs.lever.co/spotify','credentials'],
  ['https://user:secret@jobs.lever.co/spotify','credentials'],['https://jobs.lever.co:444/spotify','credentials'],
  ['https://jobs.lever.co/spotify#apply','credentials'],['https://example.invalid/canonical','provider'],
  ['https://boards.greenhouse.io.example.invalid/canonical','provider'],
  ['https://boards.greenhouse.io/canonical/jobs/not-a-number','greenhouse'],
  ['https://boards.greenhouse.io/canonical/jobs/123456789012345678901','greenhouse'],
  ['https://jobs.lever.co/spotify/not-a-uuid','lever'],
  [`https://jobs.eu.lever.co/spotify/${uuid}/other`,'lever'],
  ['https://boards.greenhouse.io/embed/job_board?for=canonical&for=other','embed'],
  ['https://boards.greenhouse.io/embed/job_board?for=canonical&extra=1','embed'],
  ['https://boards.greenhouse.io/canonical?unknown=1','parameters'],
  ['greenhouse:-invalid','board'],['greenhouse:_invalid','board'],
  ['greenhouse:'+ 'a'.repeat(81),'board'],['greenhouse:أعمال','board'],
  ['https://boards.greenhouse.io/embed/job_board?for=co%2Fname','board'],
];

function thrown(fn){
  try {fn();} catch(error) {return error;}
  assert.fail('The invalid source must throw');
}

test('source records retain their canonical fields and explicit catalog names',()=>{
  assert.deepEqual(sourceRecord('lever','eu','synthetic-board','Synthetic employer'),{
    id:'lever:eu:synthetic-board',name:'Synthetic employer',provider:'lever',region:'eu',
    board:'synthetic-board',boardUrl:'https://jobs.eu.lever.co/synthetic-board',
  });
  assert.deepEqual(sourceRecord('greenhouse','global','synthetic'),{
    id:'greenhouse:synthetic',name:'synthetic',provider:'greenhouse',region:'global',
    board:'synthetic',boardUrl:'https://job-boards.greenhouse.io/synthetic',
  });
});

test('Greenhouse IDs, hosts, posting links and embeds share one canonical identity',()=>{
  const expected=sourceRecord('greenhouse','global','canonical');
  for(const value of greenhouseForms) assert.deepEqual(parseDiscoverySourceIdentity(value),expected,value);
  assert.equal(parseDiscoverySourceIdentity('greenhouse:'+ 'a'.repeat(80)).board.length,80);
});

test('Lever board and posting forms canonicalize while provider and region remain distinct',()=>{
  const global=sourceRecord('lever','global','spotify'),eu=sourceRecord('lever','eu','spotify');
  for(const value of leverGlobalForms) assert.deepEqual(parseDiscoverySourceIdentity(value),global,value);
  for(const value of leverEUForms) assert.deepEqual(parseDiscoverySourceIdentity(value),eu,value);
  const ids=['greenhouse:spotify','lever:global:spotify','lever:eu:spotify'].map(value=>parseDiscoverySourceIdentity(value).id);
  assert.equal(new Set(ids).size,3);
  assert.equal(global.boardUrl,'https://jobs.lever.co/spotify');
  assert.equal(eu.boardUrl,'https://jobs.eu.lever.co/spotify');
});

test('raw invalid forms retain the existing validation messages without URL normalization bypasses',()=>{
  for(const [value,key] of rejected){
    const error=thrown(()=>parseDiscoverySourceIdentity(value));
    assert.equal(error.constructor,Error,String(value));
    assert.equal(error.message,messages[key],String(value));
    assert.equal(error.code,undefined);
  }
});

test('an injected rejection callback receives the exact message and preserves its thrown error',()=>{
  const marker=new Error('Synthetic caller-owned rejection');let calls=0;
  const error=thrown(()=>parseDiscoverySourceIdentity('lever:spotify',message=>{
    calls++;assert.equal(message,messages.id);throw marker;
  }));
  assert.equal(error,marker);assert.equal(calls,1);
});

test('the pure module loads independently without a server or Node dependency graph',async()=>{
  const source=await readFile(new URL('../shared/discovery-source-identity.mjs',import.meta.url),'utf8');
  assert.doesNotMatch(source,/^\s*import\b|\bimport\s*\(|\b(?:require|process|Buffer)\b/m);
  const standalone=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
  assert.deepEqual(standalone.parseDiscoverySourceIdentity(leverEUForms[2]),sourceRecord('lever','eu','spotify'));
});

test('the server wrapper keeps all existing branded and frozen catalog records',()=>{
  assert.deepEqual(DISCOVERY_SOURCES.map(value=>value.name),[
    'Canonical','DoorDash','Spotify','Freenome','Duolingo','Lyra Health','Zoox',
  ]);
  for(const catalog of DISCOVERY_SOURCES){
    assert(Object.isFrozen(catalog));
    assert.equal(parseDiscoverySource(catalog.id),catalog);
    assert.equal(parseDiscoverySource(catalog.boardUrl),catalog);
    const pure=parseDiscoverySourceIdentity(catalog.id);
    assert.deepEqual({...pure,name:catalog.name},catalog);
  }
  for(const value of [...greenhouseForms,...leverGlobalForms]){
    const canonical=parseDiscoverySourceIdentity(value);
    assert.equal(parseDiscoverySource(value),DISCOVERY_SOURCES.find(item=>item.id===canonical.id));
  }
  for(const value of leverEUForms) assert.deepEqual(parseDiscoverySource(value),parseDiscoverySourceIdentity(value));
});

test('the server wrapper retains its DiscoveryError class, code, status and exact message',()=>{
  let constructor;
  for(const [value,key] of rejected){
    const error=thrown(()=>parseDiscoverySource(value));
    constructor??=error.constructor;
    assert.equal(error.constructor,constructor);
    assert.equal(error.constructor.name,'DiscoveryError');
    assert(error instanceof Error);
    assert.equal(error.code,'invalid_query');
    assert.equal(error.status,400);
    assert.equal(error.retrySeconds,0);
    assert.equal(error.message,messages[key],String(value));
  }
});

test('canonical duplicate sources are still rejected before database or provider access',async()=>{
  for(const sources of [
    ['greenhouse:canonical',greenhouseForms[6]],
    ['lever:global:spotify',leverGlobalForms[4]],
    ['lever:eu:spotify',leverEUForms[2]],
  ]){
    let fetches=0,databaseReads=0;
    const handler=createDiscoveryHandler({fetchImpl:async()=>{fetches++;assert.fail('No provider request is allowed');},clock:()=>0});
    const env={get DB(){databaseReads++;assert.fail('A duplicate request must fail before storage access');}};
    const url=new URL('/api/discovery/search',SERVICE_ORIGIN);
    for(const source of sources) url.searchParams.append('source',source);
    const response=await handler(new Request(url),env),data=await response.json();
    assert.equal(response.status,400);
    assert.deepEqual(data.error,{code:'invalid_query',message:'Choose each employer board only once.'});
    assert.equal(fetches,0);assert.equal(databaseReads,0);
  }
});

test('the retained server UUID validator still protects Lever job normalization',()=>{
  const source=parseDiscoverySource('lever:global:synthetic');
  const valid=normalizeDiscoveryJob({id:uuid.toUpperCase(),text:'Synthetic role',categories:{location:'Riyadh'}},source,0);
  assert.equal(valid.id,'lever:global:synthetic:'+uuid);
  assert.equal(valid.url,'https://jobs.lever.co/synthetic/'+uuid);
  assert.equal(normalizeDiscoveryJob({id:'not-a-uuid',text:'Synthetic role'},source,0),null);
});
