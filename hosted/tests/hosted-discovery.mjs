import assert from 'node:assert/strict';
import {mkdtemp,readFile,readdir,rm,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {build} from 'esbuild';
import {createDiscoveryHandler,parseDiscoverySource,DISCOVERY_LIMITS} from '../server/discovery.mjs';
import {SERVICE_ORIGIN} from '../server/applications.mjs';

const groups=[],base=Date.now();let time=base,calls=[],records=new Map(),behavior=null,handler,db,phoneModel,workerdRequests=0,clientSchemaResponses=0;
const directory=await mkdtemp(join(tmpdir(),'career-discovery-client-'));
// Use the SDK adapter to preserve isolated v4 fixture semantics on Miniflare5.
const mf=new Miniflare(convertV4MiniflareOptions({modules:true,script:'export default {fetch(){return new Response("isolated public discovery checks")}}',compatibilityDate:'2026-05-15',d1Databases:['DB']}));
const gh=(id,title='Synthetic opportunity',location='London')=>({id,internal_job_id:id+100000,title,location:{name:location},updated_at:new Date(base-60000).toISOString(),absolute_url:'https://unexpected.example/ignored'});
const lever=(n,title='Synthetic opportunity',location='Berlin')=>({id:'00000000-0000-4000-8000-'+String(n).padStart(12,'0'),text:title,categories:{location},country:'DE',descriptionPlain:'Synthetic public description',workplaceType:'unspecified'});
async function migrate(database){for(const file of(await readdir(new URL('../drizzle/',import.meta.url))).filter(f=>f.endsWith('.sql')).sort())for(const sql of(await readFile(new URL('../drizzle/'+file,import.meta.url),'utf8')).split('--> statement-breakpoint').map(s=>s.trim()).filter(Boolean))await database.prepare(sql).run()}
async function fixture(address,options){
  const url=new URL(address);assert(['boards-api.greenhouse.io','api.lever.co','api.eu.lever.co'].includes(url.hostname));assert.equal(options.method,'GET');assert.equal(options.redirect,'manual');
  assert.deepEqual(Object.keys(options.headers).sort(),['Accept','User-Agent']);assert.equal(options.headers.Accept,'application/json');assert(options.signal instanceof AbortSignal);
  calls.push({url:url.href,headers:options.headers});
  if(behavior){const result=await behavior(url,options,calls.length);if(result)return result}
  if(url.hostname==='boards-api.greenhouse.io'){
    assert.match(url.pathname,/^\/v1\/boards\/[a-z0-9_-]+\/jobs$/);assert.equal(url.search,'');
    const source='greenhouse:'+url.pathname.split('/')[3],jobs=records.get(source)??[gh(1)];return Response.json({jobs,meta:{total:jobs.length}});
  }
  assert.match(url.pathname,/^\/v0\/postings\/[a-z0-9_-]+$/);assert.deepEqual([...url.searchParams.keys()].sort(),['limit','mode','skip']);assert.equal(url.searchParams.get('limit'),'100');assert.equal(url.searchParams.get('mode'),'json');
  const source='lever:'+(url.hostname==='api.eu.lever.co'?'eu':'global')+':'+url.pathname.split('/')[3],rows=records.get(source)??[lever(1)],skip=Number(url.searchParams.get('skip'));
  return Response.json(rows.slice(skip,skip+100));
}
async function reset(){time=base;calls=[];records=new Map();behavior=null;await db.batch([db.prepare('DELETE FROM discovery_cache'),db.prepare('DELETE FROM discovery_rates')]);handler=createDiscoveryHandler({clock:()=>time,fetchImpl:fixture})}
async function check(name,fn){await reset();await fn();groups.push(name);console.log('PASS',name)}
async function call({sources=['greenhouse:synthetic'],q,location,remote,cursor,headers={},method='GET',path='/api/discovery/search',requestHandler=handler,environment={DB:db},noIP=false}={}){
  const u=new URL(SERVICE_ORIGIN+path);if(path.endsWith('/search'))for(const source of sources)u.searchParams.append('source',source);
  for(const [key,value] of Object.entries({q,location,remote,cursor}))if(value!==undefined)u.searchParams.set(key,value);
  const response=await requestHandler(new Request(u,{method,headers:{...(noIP?{}:{'cf-connecting-ip':'192.0.2.4'}),...headers}}),environment);
  const data=await response.json();validateClientResponse(path,response.status,data);
  return {status:response.status,data,headers:response.headers};
}
function validateClientResponse(path,status,data){
  if(status!==200)return;
  if(path.startsWith('/api/discovery/search'))phoneModel.discoveryPageSchema.parse(data);
  else if(path.startsWith('/api/discovery/sources'))phoneModel.catalogSchema.parse(data);
  else return;
  clientSchemaResponses++;
}
async function cached(source='greenhouse:synthetic'){return db.prepare('SELECT * FROM discovery_cache WHERE id=?').bind(source).first()}


async function rejectedBody({headers,oversized=false,cleanup='resolve',code}){
  let cancelled=0,release=()=>{},timer;
  const pendingCleanup=cleanup==='pending'?new Promise(resolve=>{release=resolve}):null;
  const response=new Response(new ReadableStream({
    start(controller){controller.enqueue(oversized?new Uint8Array(DISCOVERY_LIMITS.maxResponseBytes+1):new TextEncoder().encode('{"jobs":[]}'))},
    cancel(){cancelled++;if(cleanup==='reject')return Promise.reject(new Error('Synthetic cleanup failure'));return pendingCleanup}
  }),{headers});
  behavior=()=>response;
  const pending=call();
  try{
    const result=await Promise.race([pending,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('Rejected source waited for transport cleanup')),2000)})]);
    assert.equal(result.status,200);assert.equal(result.data.status,'unavailable');assert.deepEqual(result.data.jobs,[]);
    assert.equal(result.data.sources[0].error.code,code);assert.equal(result.data.sources[0].checkedAt,null);
    assert.equal(cancelled,1);assert.equal(response.body.locked,false);assert.equal((await cached()).lease_until,0);
    await new Promise(resolve=>setImmediate(resolve));
    return result;
  }finally{
    clearTimeout(timer);release();await pending.catch(()=>{});
    if(!response.body.locked)await response.body.cancel().catch(()=>{});
  }
}

try{
  await build({entryPoints:['app/phone/model.ts'],outfile:join(directory,'model.mjs'),bundle:true,platform:'node',format:'esm'});
  phoneModel=await import(pathToFileURL(join(directory,'model.mjs')).href);
  db=await mf.getD1Database('DB');await migrate(db);
  await check('Public catalog has seven verified sources, four mixed defaults and no account dependency',async()=>{
    const result=await call({path:'/api/discovery/sources',environment:{}});assert.equal(result.status,200);assert.equal(result.data.version,1);assert.equal(result.data.sources.length,7);assert.equal(result.data.defaultSources.length,4);assert.equal(result.data.limits.pageSize,50);
    assert(result.data.defaultSources.includes('greenhouse:freenome'));assert(result.data.defaultSources.includes('lever:global:spotify'));assert.equal(calls.length,0);assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM workspaces').first()).n,0);
    assert.equal((await call({method:'HEAD'})).status,405);assert.equal((await call({method:'POST'})).status,405);assert.equal((await call({headers:{origin:'https://unrelated.example'}})).status,403);assert.equal((await call({headers:{host:'unrelated.example'}})).status,403);
  });
  await check('Phone client accepts actual default-board and EU search responses without a catalog-only region field',async()=>{
    const catalog=await call({path:'/api/discovery/sources',environment:{}});
    const defaults=await call({sources:catalog.data.defaultSources,q:'Synthetic'});
    assert.equal(defaults.status,200);assert.equal(defaults.data.status,'complete');assert.equal(defaults.data.sources.length,4);
    assert.deepEqual(new Set(defaults.data.sources.map(source=>source.provider)),new Set(['greenhouse','lever']));
    assert(defaults.data.sources.every(source=>!Object.hasOwn(source,'region')));assert(defaults.data.jobs.length>0);
    const eu=await call({sources:['lever:eu:synthetic']});assert.equal(eu.status,200);
    assert.equal(eu.data.sources[0].boardUrl,'https://jobs.eu.lever.co/synthetic');assert(eu.data.jobs.length>0);
  });
  await check('Strict source normalization accepts board and direct-posting links without arbitrary fetch URLs',async()=>{
    assert.equal(parseDiscoverySource('https://boards.greenhouse.io/Synthetic/jobs/123?gh_jid=123').id,'greenhouse:synthetic');
    assert.equal(parseDiscoverySource('https://boards.greenhouse.io/embed/job_board?for=synthetic').id,'greenhouse:synthetic');
    assert.equal(parseDiscoverySource('https://jobs.eu.lever.co/Synthetic/00000000-0000-4000-8000-000000000001/apply').id,'lever:eu:synthetic');
    for(const source of ['http://jobs.lever.co/x','https://127.0.0.1/x','https://jobs.lever.co.evil.example/x','https://user:pass@jobs.lever.co/x','https://jobs.lever.co:444/x','https://jobs.lever.co/x/%2fsecret','https://job-boards.greenhouse.io/x/../../secret','https://boards.greenhouse.io/x?redirect=https://example.com','greenhouse:../secret','lever:invalid:x','greenhouse:'+'a'.repeat(81)])assert.equal((await call({sources:[source]})).status,400,source);
    assert.equal(calls.length,0);
  });
  await check('Invalid filters, source counts and cursor parameters are rejected before provider traffic',async()=>{
    assert.equal((await call({q:'x'.repeat(121)})).status,400);assert.equal((await call({location:'x'.repeat(101)})).status,400);assert.equal((await call({remote:'maybe'})).status,400);assert.equal((await call({sources:['greenhouse:a','greenhouse:a']})).status,400);assert.equal((await call({sources:['greenhouse:a','greenhouse:b','greenhouse:c','greenhouse:d','greenhouse:e']})).status,400);assert.equal((await call({cursor:'not-a-cursor'})).status,400);assert.equal(calls.length,0);
  });
  await check('Public requests ignore account credentials and never persist or forward personal search terms',async()=>{
    const result=await call({q:'private-filter-987',location:'private-city-654',headers:{authorization:'Bearer synthetic-private-token',cookie:'__Host-sites-session=synthetic-hosting-cookie; __Host-career-session=synthetic-private-cookie','oai-authenticated-user-id':'synthetic-owner','oai-authenticated-user-email':'synthetic-private-email@example.invalid'}});
    assert.equal(result.status,200);assert.equal(result.data.status,'complete');assert.equal(result.data.jobs.length,0);assert.equal(calls.length,1);
    const all=JSON.stringify({cache:(await db.prepare('SELECT * FROM discovery_cache').all()).results,rates:(await db.prepare('SELECT * FROM discovery_rates').all()).results,calls});
    for(const secret of ['private-filter-987','private-city-654','synthetic-private-token','synthetic-hosting-cookie','synthetic-private-cookie','synthetic-owner','synthetic-private-email@example.invalid','192.0.2.4'])assert(!all.includes(secret),secret);
    assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM workspaces').first()).n,0);assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM native_sessions').first()).n,0);
  });
  await check('Provider identities, plain text, unknown country and remote evidence remain distinct',async()=>{
    records.set('greenhouse:synthetic',[gh(1,'<b>Clinical coordinator</b>','Remote - California'),gh(2,'Remote sensing engineer','London'),{...gh(3,'Hybrid coordinator','Hybrid / London'),updated_at:'2026-02-31T12:00:00Z',first_published:new Date(base+86400000).toISOString()}]);
    const ghResult=await call();assert.equal(ghResult.data.jobs.find(j=>j.id.endsWith(':1')).remote,true);assert.equal(ghResult.data.jobs.find(j=>j.id.endsWith(':2')).remote,null);assert.equal(ghResult.data.jobs.find(j=>j.id.endsWith(':3')).remote,false);
    for(const job of ghResult.data.jobs){assert.equal(job.country,null);assert(job.url.startsWith('https://job-boards.greenhouse.io/synthetic/jobs/'));assert(!job.title.includes('<'));assert.equal(job.publishedAt,null)}assert.equal(ghResult.data.jobs.find(j=>j.id.endsWith(':3')).updatedAt,null);
    records.set('lever:eu:synthetic',[{...lever(7,'Support specialist','Berlin'),country:'DE',workplaceType:'remote',descriptionPlain:'<script>bad()</script><b>Help</b> &amp; support',createdAt:time}]);
    const lv=await call({sources:['lever:eu:synthetic']});assert.equal(lv.data.jobs[0].remote,true);assert.equal(lv.data.jobs[0].country,'DE');assert.equal(lv.data.jobs[0].summary,'Help & support');assert.equal(lv.data.jobs[0].publishedAt,null);assert(lv.data.jobs[0].url.startsWith('https://jobs.eu.lever.co/synthetic/'));assert(calls.at(-1).url.startsWith('https://api.eu.lever.co/'));
  });
  await check('Keyword AND, location text and remote-only filters operate on public metadata',async()=>{
    records.set('greenhouse:synthetic',[gh(1,'Senior clinical coordinator','Remote - London'),gh(2,'Junior clinical coordinator','Remote - Paris'),gh(3,'Senior clinical coordinator','London'),gh(4,'Senior clinical director','Remote - London')]);
    const result=await call({q:'clinical coordinator',location:'London',remote:'remote'});assert.equal(result.data.jobs.length,1);assert.equal(result.data.jobs[0].id,'greenhouse:synthetic:1');assert.equal(result.data.sources[0].availableCount,4);assert.equal(result.data.sources[0].matchedCount,1);
    assert.equal((await call({location:'.*'})).data.jobs.length,0);
  });
  await check('Latin keywords start at a word boundary instead of matching inside unrelated titles',async()=>{
    records.set('greenhouse:synthetic',[
      gh(1,'iOS Engineer'),gh(2,'Senior iOS Developer'),gh(3,'(iOS) Mobile Engineer'),gh(4,'Android / iOS Developer'),
      gh(5,'BIOS Engineer'),gh(6,'Biostatistician'),gh(7,'BioSystems Engineer'),gh(8,'Embedded bios technician'),
      gh(9,'iOS17 Engineer'),gh(10,'BIOS / iOS Engineer'),gh(11,'DébiOS Engineer'),gh(12,'Mobile_iOS Engineer'),
    ]);
    const result=await call({q:'iOS'});
    assert.equal(result.status,200);assert.deepEqual(new Set(result.data.jobs.map(job=>job.id)),new Set([1,2,3,4,9,10,12].map(id=>'greenhouse:synthetic:'+id)));
    assert.equal(result.data.sources[0].availableCount,12);assert.equal(result.data.sources[0].matchedCount,7);assert.equal(result.data.totalMatches,7);
  });
  await check('Keyword prefixes, case, accents and literal skill punctuation remain searchable',async()=>{
    records.set('greenhouse:synthetic',[
      gh(1,'C++ Engineer'),gh(2,'C# Engineer'),gh(3,'.NET Developer'),gh(4,'ASP.NET Developer'),gh(5,'NET Developer'),
      gh(6,'AC++ integration'),gh(7,'ABC# Developer'),gh(8,'Senior CAFÉ Developer'),gh(9,'Décafé Designer'),gh(10,'Cafe Engineering'),
      gh(11,'Software Engineer'),gh(12,'Engineering Manager'),gh(13,'Reengineering Specialist'),gh(14,'C++.* Specialist'),
    ]);
    const matches=async q=>new Set((await call({q})).data.jobs.map(job=>job.id));
    const ids=values=>new Set(values.map(id=>'greenhouse:synthetic:'+id));
    assert.deepEqual(await matches('C++'),ids([1,14]));assert.deepEqual(await matches('c#'),ids([2]));
    assert.deepEqual(await matches('.NET'),ids([3,4]));assert.deepEqual(await matches('C++.*'),ids([14]));
    assert.deepEqual(await matches('CaFÉ'),ids([8,10]));assert.deepEqual(await matches('engineer'),ids([1,2,10,11,12]));
  });
  await check('Arabic and continuous-script searches keep substring matching at mixed-script boundaries',async()=>{
    records.set('greenhouse:synthetic',[
      gh(1,'مطور iOS'),gh(2,'iOS开发工程师'),gh(3,'开发iOS工程师'),gh(4,'تطويرiOS'),
      gh(5,'مهندس برمجيات'),gh(6,'المهندس المدني'),gh(7,'软件工程师'),gh(8,'BIOS工程师'),
    ]);
    const matches=async q=>new Set((await call({q})).data.jobs.map(job=>job.id));
    const ids=values=>new Set(values.map(id=>'greenhouse:synthetic:'+id));
    assert.deepEqual(await matches('iOS'),ids([1,2,3,4]));assert.deepEqual(await matches('مُهَنْدِس'),ids([5,6]));
    assert.deepEqual(await matches('工程'),ids([2,3,7,8]));
  });
  await check('All keywords can span public metadata while location retains literal substring matching',async()=>{
    records.set('lever:global:synthetic',[
      {...lever(1,'iOS Engineer','New York'),descriptionPlain:'Swift apps'},
      {...lever(2,'iOS Engineer','New York'),descriptionPlain:'Kotlin apps'},
      {...lever(3,'BIOS Engineer','New York'),descriptionPlain:'Swift apps'},
      {...lever(4,'Backend Engineer','Yorkshire'),descriptionPlain:'Uses iOS and Swift'},
      {...lever(5,'iOS Engineer','Paris'),descriptionPlain:'Swift apps'},
    ]);
    const result=await call({sources:['lever:global:synthetic'],q:'IOS swift',location:'ork'});
    assert.deepEqual(new Set(result.data.jobs.map(job=>job.id)),new Set([1,4].map(id=>'lever:global:synthetic:00000000-0000-4000-8000-'+String(id).padStart(12,'0'))));
    assert.equal(result.data.sources[0].matchedCount,2);assert.equal(result.data.totalMatches,2);
    records.set('greenhouse:ios-lab',[gh(1,'Platform Engineer'),gh(2,'Accountant')]);
    const company=await call({sources:['greenhouse:ios-lab'],q:'ios engineer'});
    assert.deepEqual(company.data.jobs.map(job=>job.id),['greenhouse:ios-lab:1']);
  });
  await check('Shared board caching survives handler recreation and preserves original observation time',async()=>{
    const initial=await call();time+=120000;handler=createDiscoveryHandler({clock:()=>time,fetchImpl:fixture});const second=await call({q:'opportunity',headers:{'cf-connecting-ip':'192.0.2.8'}});
    assert.equal(calls.length,1);assert.equal(second.data.sources[0].status,'cached');assert.equal(second.data.jobs[0].checkedAt,initial.data.jobs[0].checkedAt);assert.equal(second.data.jobs[0].stale,false);
  });
  await check('Stable cursors page a fair multi-source result without duplicates and bind the original filters',async()=>{
    records.set('greenhouse:alpha',Array.from({length:70},(_,i)=>gh(i+1,'Synthetic '+String(i).padStart(3,'0'))));records.set('greenhouse:beta',Array.from({length:55},(_,i)=>gh(i+1001,'Synthetic '+String(i).padStart(3,'0'))));
    const sources=['greenhouse:alpha','greenhouse:beta'],a=await call({sources}),b=await call({sources,cursor:a.data.nextCursor}),c=await call({sources,cursor:b.data.nextCursor});
    assert.equal(a.data.jobs.length,50);assert.equal(b.data.jobs.length,50);assert.equal(c.data.jobs.length,25);assert.equal(c.data.nextCursor,null);assert.equal(new Set([...a.data.jobs,...b.data.jobs,...c.data.jobs].map(j=>j.id)).size,125);assert.equal(a.data.jobs[0].sourceId,'greenhouse:alpha');assert.equal(a.data.jobs[1].sourceId,'greenhouse:beta');assert.equal(calls.length,2);
    assert.equal((await call({sources,cursor:a.data.nextCursor,q:'changed'})).status,400);
  });
  await check('Cursors from the previous substring-matching rule require a fresh search',async()=>{
    records.set('greenhouse:synthetic',Array.from({length:60},(_,i)=>gh(i+1,'iOS Engineer '+String(i).padStart(3,'0'))));
    const first=await call({q:'iOS'}),cursor=JSON.parse(Buffer.from(first.data.nextCursor,'base64url').toString('utf8'));
    // Preserve the actual pre-upgrade cursor's snapshot shape and unchanged
    // filter hash. Only result-matching semantics changed, not these filters.
    const row=await cached(),jobs=JSON.parse(row.jobs_json).map(job=>({...job,checkedAt:row.checked_at}));
    const sha=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
    cursor.s=sha([{id:'greenhouse:synthetic',checkedAt:row.checked_at,rows:jobs.map(job=>job.id),content:sha(jobs)}]);
    const previous=Buffer.from(JSON.stringify(cursor)).toString('base64url');
    const rejected=await call({q:'iOS',cursor:previous});assert.equal(rejected.status,409);assert.equal(rejected.data.error.code,'discovery_changed');
    assert.match(rejected.data.error.message,/Start a new search/);assert.equal(calls.length,1);
    const changed=await call({q:'BIOS',cursor:previous});assert.equal(changed.status,400);assert.equal(changed.data.error.code,'invalid_query');
    const next=await call({q:'iOS',cursor:first.data.nextCursor});assert.equal(next.status,200);assert.equal(next.data.jobs.length,10);
    assert.equal(new Set([...first.data.jobs,...next.data.jobs].map(job=>job.id)).size,60);assert.equal(calls.length,1);
  });
  await check('Refreshing a source invalidates old cursors instead of silently mixing snapshots',async()=>{
    records.set('greenhouse:synthetic',Array.from({length:80},(_,i)=>gh(i+1)));const first=await call();time+=DISCOVERY_LIMITS.freshMilliseconds+1;records.get('greenhouse:synthetic').push(gh(1000));
    const page=await call({cursor:first.data.nextCursor});assert.equal(page.status,409);assert.equal(page.data.error.code,'discovery_changed');assert.equal((await call()).data.totalMatches,81);
  });
  await check('A failed source retains visibly stale facts while successful sources remain current',async()=>{
    const first=await call();time+=DISCOVERY_LIMITS.freshMilliseconds+1;behavior=url=>url.pathname.includes('/synthetic/')?new Response('unavailable',{status:503}):null;
    const mixed=await call({sources:['greenhouse:synthetic','greenhouse:other']});assert.equal(mixed.data.status,'partial');const stale=mixed.data.jobs.find(j=>j.sourceId==='greenhouse:synthetic');assert.equal(stale.stale,true);assert.equal(stale.checkedAt,first.data.jobs[0].checkedAt);assert.equal(mixed.data.sources.find(s=>s.id==='greenhouse:synthetic').error.code,'source_unavailable');assert.equal(mixed.data.jobs.find(j=>j.sourceId==='greenhouse:other').stale,false);
  });
  await check('Expired stale data and complete source failures are unavailable rather than an empty successful search',async()=>{
    await call();time+=DISCOVERY_LIMITS.staleMilliseconds+1;behavior=()=>new Response('unavailable',{status:503});const r=await call();assert.equal(r.data.status,'unavailable');assert.deepEqual(r.data.jobs,[]);assert.equal(r.data.sources[0].checkedAt,null);
  });
  await check('A missing board clears cached vacancies and the negative cooldown suppresses repeated requests',async()=>{
    await call();time+=DISCOVERY_LIMITS.freshMilliseconds+1;behavior=()=>new Response('gone',{status:404});const r=await call();assert.equal(r.data.status,'unavailable');assert.equal(r.data.sources[0].error.code,'board_missing');assert.equal((await cached()).jobs_json,'[]');assert.equal((await cached()).checked_at,null);
    await call();assert.equal(calls.length,2);time+=30000;await call();assert.equal(calls.length,2);
  });
  await check('Provider Retry-After is honored while cached timestamps remain unchanged',async()=>{
    const first=await call();time+=DISCOVERY_LIMITS.freshMilliseconds+1;behavior=()=>new Response('{}',{status:429,headers:{'content-type':'application/json','retry-after':'90'}});const r=await call();assert.equal(r.data.sources[0].status,'stale');assert.equal(r.data.sources[0].error.code,'source_rate_limited');assert.equal((await cached()).retry_at,time+90000);assert.equal(r.data.jobs[0].checkedAt,first.data.jobs[0].checkedAt);
    time+=61000;await call();assert.equal(calls.length,2);time+=30000;behavior=null;assert.equal((await call()).data.sources[0].status,'fresh');assert.equal(calls.length,3);
  });
  await check('D1 leases coalesce concurrent isolates without process-local queues',async()=>{
    let enter,release;const entered=new Promise(r=>enter=r),gate=new Promise(r=>release=r);behavior=async()=>{enter();await gate;return Response.json({jobs:[gh(1)],meta:{total:1}})};
    const first=call();await entered;const other=createDiscoveryHandler({clock:()=>time,fetchImpl:fixture}),second=await call({requestHandler:other});assert.equal(second.data.sources[0].error.code,'source_refreshing');assert.equal(calls.length,1);release();assert.equal((await first).data.jobs.length,1);assert.equal((await call({requestHandler:other})).data.sources[0].status,'cached');assert.equal(calls.length,1);
  });
  await check('Expired claims recover and late completions cannot overwrite a newer successful snapshot',async()=>{
    let enter,release;const entered=new Promise(r=>enter=r),gate=new Promise(r=>release=r);behavior=async(_url,_options,count)=>{if(count===1){enter();await gate;return Response.json({jobs:[gh(1,'Older response')],meta:{total:1}})}return Response.json({jobs:[gh(2,'Newer response')],meta:{total:1}})};
    const first=call();await entered;time+=DISCOVERY_LIMITS.leaseMilliseconds+1;const second=await call();assert.equal(second.data.jobs[0].title,'Newer response');release();assert.equal((await first).data.jobs[0].title,'Newer response');assert.match((await cached()).jobs_json,/Newer response/);assert.doesNotMatch((await cached()).jobs_json,/Older response/);
  });
  await check('Malformed provider data is attributed and never becomes a successful empty board',async()=>{
    behavior=()=>Response.json({jobs:[{id:1,title:null,internal_job_id:2}],meta:{total:1}});assert.equal((await call()).data.status,'unavailable');
    await reset();records.set('greenhouse:synthetic',[gh(1),{id:2,title:null,internal_job_id:3}]);const partial=await call();assert.equal(partial.data.status,'partial');assert.equal(partial.data.sources[0].error.code,'source_incomplete');assert.equal(partial.data.jobs.length,1);
    await reset();records.set('greenhouse:synthetic',[]);const empty=await call();assert.equal(empty.data.status,'complete');assert.equal(empty.data.jobs.length,0);
  });
  await check('Job-count and UTF-8 cache-byte limits remain below a D1 row and disclose partial coverage',async()=>{
    records.set('greenhouse:synthetic',Array.from({length:600},(_,i)=>gh(i+1)));const count=await call();assert.equal(count.data.sources[0].availableCount,500);assert.equal(count.data.limited,true);assert.match(count.data.notice,/retained subset/);
    await reset();records.set('greenhouse:synthetic',Array.from({length:500},(_,i)=>gh(i+1,'漢'.repeat(250),'界'.repeat(500))));const bytes=await call();assert(bytes.data.sources[0].availableCount<500);assert(bytes.data.sources[0].availableCount>0);assert.equal(bytes.data.limited,true);assert(Buffer.byteLength((await cached()).jobs_json)<=DISCOVERY_LIMITS.maxCacheBytes);
  });

  await check('A later temporary Lever failure preserves validated pages as partial and recovers after cooldown',async()=>{
    const source='lever:global:synthetic';records.set(source,Array.from({length:170},(_,i)=>lever(i+1)));
    behavior=url=>url.searchParams.get('skip')==='100'?new Response('temporarily unavailable',{status:503}):null;
    const partial=await call({sources:[source]});assert.equal(partial.data.status,'partial');assert.equal(partial.data.totalMatches,100);
    assert.equal(partial.data.sources[0].status,'fresh');assert.equal(partial.data.sources[0].error.code,'source_unavailable');assert.equal(partial.data.limited,false);
    const row=await cached(source);assert.equal(row.retry_at,time+60000);assert.equal(row.expires_at,time+60000);assert.equal(row.lease_until,0);
    time+=30000;assert.equal((await call({sources:[source]})).data.status,'partial');assert.equal(calls.length,2);
    time+=31000;behavior=null;const recovered=await call({sources:[source]});
    assert.equal(recovered.data.status,'complete');assert.equal(recovered.data.totalMatches,170);assert.equal(recovered.data.limited,false);
    assert.equal(recovered.data.sources[0].error,null);assert.equal((await cached(source)).retry_at,0);assert.equal(calls.length,4);
  });
  await check('The unchanged source deadline keeps completed Lever pages and starts no over-budget page',async()=>{
    const source='lever:global:synthetic';records.set(source,Array.from({length:250},(_,i)=>lever(i+1)));
    behavior=url=>{if(url.searchParams.get('skip')==='100')time+=DISCOVERY_LIMITS.sourceMilliseconds+1;return null};
    const partial=await call({sources:[source]});assert.equal(partial.data.status,'partial');assert.equal(partial.data.totalMatches,200);
    assert.equal(partial.data.sources[0].error.code,'source_timeout');assert.equal(partial.data.limited,false);assert.equal(calls.length,2);
  });
  await check('A later Lever rate limit keeps validated jobs while honoring the complete Retry-After interval',async()=>{
    const source='lever:global:synthetic';records.set(source,Array.from({length:170},(_,i)=>lever(i+1)));
    behavior=url=>url.searchParams.get('skip')==='100'?new Response('{}',{status:429,headers:{'content-type':'application/json','retry-after':'120'}}):null;
    const partial=await call({sources:[source]});assert.equal(partial.data.status,'partial');assert.equal(partial.data.sources[0].error.code,'source_rate_limited');
    assert.equal((await cached(source)).retry_at,time+120000);assert.equal((await cached(source)).expires_at,time+120000);
    time+=61000;assert.equal((await call({sources:[source]})).data.totalMatches,100);assert.equal(calls.length,2);
    time+=60000;behavior=null;assert.equal((await call({sources:[source]})).data.status,'complete');assert.equal(calls.length,4);
  });
  await check('A removed Lever board never keeps an earlier page as a partial current result',async()=>{
    const source='lever:global:synthetic';records.set(source,Array.from({length:170},(_,i)=>lever(i+1)));
    behavior=url=>url.searchParams.get('skip')==='100'?new Response('gone',{status:410}):null;
    const removed=await call({sources:[source]});assert.equal(removed.data.status,'unavailable');assert.deepEqual(removed.data.jobs,[]);
    assert.equal(removed.data.sources[0].error.code,'board_missing');assert.equal((await cached(source)).jobs_json,'[]');assert.equal((await cached(source)).checked_at,null);
  });


  await check('A later Lever body disconnect keeps validated jobs and permits a later complete refresh',async()=>{
    const source='lever:global:synthetic';records.set(source,Array.from({length:170},(_,i)=>lever(i+1)));let failedResponse;
    behavior=url=>{if(url.searchParams.get('skip')!=='100')return null;failedResponse=new Response(new ReadableStream({
      start(controller){controller.enqueue(new TextEncoder().encode('['))},
      pull(controller){controller.error(new TypeError('Synthetic private transport disconnect'))}
    }),{headers:{'content-type':'application/json'}});return failedResponse};
    const partial=await call({sources:[source]});assert.equal(partial.data.status,'partial');assert.equal(partial.data.totalMatches,100);
    assert.equal(partial.data.sources[0].error.code,'source_unavailable');assert.equal(partial.data.limited,false);
    assert.doesNotMatch(partial.data.sources[0].error.message,/Synthetic private/);assert.equal(failedResponse.body.locked,false);
    assert.equal((await cached(source)).retry_at,time+60000);assert.equal(calls.length,2);
    time+=61000;behavior=null;const recovered=await call({sources:[source]});assert.equal(recovered.data.status,'complete');
    assert.equal(recovered.data.totalMatches,170);assert.equal(recovered.data.sources[0].error,null);assert.equal((await cached(source)).retry_at,0);assert.equal(calls.length,4);
  });
  await check('A real later-page body timeout cancels the reader while preserving completed Lever pages',async()=>{
    const source='lever:global:synthetic';records.set(source,Array.from({length:170},(_,i)=>lever(i+1)));let response,cancellations=0;
    behavior=url=>{if(url.searchParams.get('skip')!=='100')return null;response=new Response(new ReadableStream({cancel(){cancellations++}}),{headers:{'content-type':'application/json'}});return response};
    const started=Date.now(),partial=await call({sources:[source]});assert.equal(partial.data.status,'partial');assert.equal(partial.data.totalMatches,100);
    assert.equal(partial.data.sources[0].error.code,'source_timeout');assert.equal(partial.data.limited,false);assert(Date.now()-started<10000);
    await new Promise(resolve=>setImmediate(resolve));assert.equal(cancellations,1);assert.equal(response.body.locked,false);assert.equal(calls.length,2);
  });
  await check('A later-page shared budget denial preserves jobs without an extra GET or early retry',async()=>{
    const source='lever:global:synthetic';records.set(source,Array.from({length:170},(_,i)=>lever(i+1)));time=Math.floor(base/60000)*60000+15000;
    await db.prepare('INSERT INTO discovery_rates(key,window,count) VALUES(?,?,?)').bind('upstream:custom',Math.floor(time/60000),DISCOVERY_LIMITS.customUpstreamRequestsPerMinute-1).run();
    const partial=await call({sources:[source]});assert.equal(partial.data.status,'partial');assert.equal(partial.data.totalMatches,100);
    assert.equal(partial.data.sources[0].error.code,'discovery_rate_limited');assert.equal(partial.data.limited,false);assert.equal(calls.length,1);
    const retryAt=time+45000;assert.equal((await cached(source)).retry_at,retryAt);
    time+=30000;assert.equal((await call({sources:[source]})).data.status,'partial');assert.equal(calls.length,1);assert.equal((await cached(source)).retry_at,retryAt);
    time=retryAt+1;assert.equal((await call({sources:[source]})).data.status,'complete');assert.equal(calls.length,3);
  });
  for(const [label,response,code] of [
    ['malformed',()=>Response.json({unexpected:[]}), 'source_response_invalid'],
    ['redirected',()=>new Response('',{status:302,headers:{location:'https://unexpected.example/private'}}),'source_redirected']
  ])await check('A '+label+' later Lever page is not salvaged as a fresh prefix',async()=>{
    const source='lever:global:synthetic';records.set(source,Array.from({length:170},(_,i)=>lever(i+1)));
    behavior=url=>url.searchParams.get('skip')==='100'?response():null;
    const result=await call({sources:[source]});assert.equal(result.data.status,'unavailable');assert.deepEqual(result.data.jobs,[]);
    assert.equal(result.data.sources[0].error.code,code);assert.equal((await cached(source)).checked_at,null);assert.equal(calls.length,2);
  });
  await check('A new partial snapshot invalidates old cursors and never mixes an old cached tail',async()=>{
    const source='lever:global:synthetic';records.set(source,Array.from({length:170},(_,i)=>lever(i+1,'Old role '+i)));
    const previous=await call({sources:[source]});assert.equal(previous.data.status,'complete');assert(previous.data.nextCursor);
    time+=DISCOVERY_LIMITS.freshMilliseconds+1;records.set(source,Array.from({length:170},(_,i)=>lever(i+1001,'New role '+i)));
    behavior=url=>url.searchParams.get('skip')==='100'?new Response('temporary outage',{status:503}):null;
    const outdated=await call({sources:[source],cursor:previous.data.nextCursor});assert.equal(outdated.status,409);assert.equal(outdated.data.error.code,'discovery_changed');
    const partial=await call({sources:[source]});assert.equal(partial.data.status,'partial');assert.equal(partial.data.totalMatches,100);
    assert(partial.data.jobs.every(job=>job.title.startsWith('New role ')));assert(JSON.parse((await cached(source)).jobs_json).every(job=>job.title.startsWith('New role ')));assert.equal(calls.length,4);
  });
  await check('A long provider cooldown outlives freshness and stale retention without sliding or new traffic',async()=>{
    const source='lever:global:synthetic';records.set(source,Array.from({length:170},(_,i)=>lever(i+1)));const started=time,retryAt=time+172800000;
    behavior=url=>url.searchParams.get('skip')==='100'?new Response('{}',{status:429,headers:{'content-type':'application/json','retry-after':'172800'}}):null;
    const partial=await call({sources:[source]});assert.equal(partial.data.status,'partial');assert.equal(partial.data.sources[0].status,'fresh');
    assert.equal((await cached(source)).retry_at,retryAt);assert.equal((await cached(source)).expires_at,started+DISCOVERY_LIMITS.freshMilliseconds);
    time=started+DISCOVERY_LIMITS.freshMilliseconds+1;const stale=await call({sources:[source]});assert.equal(stale.data.status,'partial');
    assert.equal(stale.data.sources[0].status,'stale');assert(stale.data.jobs.every(job=>job.stale));assert.equal(stale.data.sources[0].checkedAt,partial.data.sources[0].checkedAt);
    assert.equal((await cached(source)).retry_at,retryAt);assert.equal(calls.length,2);
    time=started+DISCOVERY_LIMITS.staleMilliseconds+1;const expired=await call({sources:[source]});assert.equal(expired.data.status,'unavailable');
    assert.deepEqual(expired.data.jobs,[]);assert.equal((await cached(source)).retry_at,retryAt);assert.equal(calls.length,2);
    time=retryAt+1;behavior=null;const recovered=await call({sources:[source]});assert.equal(recovered.data.status,'complete');
    assert.equal(recovered.data.totalMatches,170);assert.equal(recovered.data.sources[0].error,null);assert.equal((await cached(source)).retry_at,0);assert.equal(calls.length,4);
  });

  await check('Lever pages are bounded to five public GETs and 500 normalized postings',async()=>{
    records.set('lever:global:synthetic',Array.from({length:700},(_,i)=>lever(i+1)));const r=await call({sources:['lever:global:synthetic']});assert.equal(calls.length,5);assert.equal(r.data.sources[0].availableCount,500);assert.equal(r.data.limited,true);assert(calls.every(c=>!c.url.includes('key=')));
  });

  for(const [name,headers,code] of [
    ['Wrong MIME type',{'content-type':'text/html'},'source_response_invalid'],
    ['Oversized declared body',{'content-type':'application/json','content-length':String(DISCOVERY_LIMITS.maxResponseBytes+1)},'source_response_large'],
    ['Invalid declared body length',{'content-type':'application/json','content-length':'Infinity'},'source_response_large']
  ])await check(name+' releases its unread transport and remains an unavailable source',async()=>{
    await rejectedBody({headers,code});
  });
  for(const cleanup of ['reject','pending'])await check('Header rejection preserves its error when transport cleanup is '+cleanup,async()=>{
    await rejectedBody({headers:{'content-type':'text/html'},cleanup,code:'source_response_invalid'});
  });
  for(const cleanup of ['resolve','reject','pending'])await check('Streamed overflow releases its reader without waiting for '+cleanup+' cleanup',async()=>{
    await rejectedBody({headers:{'content-type':'application/json'},oversized:true,cleanup,code:'source_response_large'});
  });
  await check('A body-rejection cooldown permits a clean successful refresh without false empty-cache success',async()=>{
    await rejectedBody({headers:{'content-type':'text/html'},code:'source_response_invalid'});
    assert.equal(calls.length,1);const cooldown=await call();assert.equal(cooldown.data.status,'unavailable');assert.equal(calls.length,1);
    time+=61000;behavior=null;records.set('greenhouse:synthetic',[gh(22,'Recovered employer role')]);
    const recovered=await call();assert.equal(recovered.data.status,'complete');assert.equal(recovered.data.jobs[0].title,'Recovered employer role');
    assert.equal(recovered.data.sources[0].status,'fresh');assert.equal(calls.length,2);assert.equal((await cached()).error_code,null);
  });

  await check('Redirects and oversized responses are refused without following untrusted destinations',async()=>{
    behavior=()=>new Response('',{status:302,headers:{Location:'http://127.0.0.1/private'}});assert.equal((await call()).data.sources[0].error.code,'source_redirected');assert.equal(calls.length,1);
    await reset();behavior=()=>new Response('{}',{headers:{'content-type':'application/json','content-length':String(DISCOVERY_LIMITS.maxResponseBytes+1)}});assert.equal((await call()).data.sources[0].error.code,'source_response_large');
    await reset();behavior=()=>new Response(' '.repeat(DISCOVERY_LIMITS.maxResponseBytes+1),{headers:{'content-type':'application/json'}});assert.equal((await call()).data.sources[0].error.code,'source_response_large');
  });
  await check('A response arriving after timeout releases its unread body without changing the timeout outcome',async()=>{
    let cancelled=0,response;
    behavior=(_url,options)=>new Promise(resolve=>{
      options.signal.addEventListener('abort',()=>{
        response=new Response(new ReadableStream({cancel(){cancelled++}}),{headers:{'content-type':'application/json'}});
        resolve(response);
      },{once:true});
    });
    const result=await call();assert.equal(result.data.status,'unavailable');assert.equal(result.data.sources[0].error.code,'source_timeout');
    await new Promise(resolve=>setImmediate(resolve));assert.equal(cancelled,1);assert.equal(response.body.locked,false);
  });
  await check('A stalled response body is cancelled within the bounded provider timeout',async()=>{
    let cancelled=false;behavior=()=>new Response(new ReadableStream({cancel(){cancelled=true}}),{headers:{'content-type':'application/json'}});const start=Date.now(),r=await call();assert.equal(r.data.sources[0].error.code,'source_timeout');assert(cancelled);assert(Date.now()-start<10000);
  });
  await check('Client and missing-IP request budgets are shared, atomic and return Retry-After',async()=>{
    for(let i=0;i<DISCOVERY_LIMITS.unknownClientRequestsPerMinute;i++)assert.equal((await call({noIP:true})).status,200);const blocked=await call({noIP:true});assert.equal(blocked.status,429);assert(Number(blocked.headers.get('retry-after'))>0);assert.equal(calls.length,1);
    await reset();await db.prepare('INSERT INTO discovery_rates(key,window,count) VALUES(?,?,?)').bind('requests:global',Math.floor(time/60000),119).run();const results=await Promise.all(['192.0.2.10','192.0.2.11'].map(ip=>call({sources:['greenhouse:canonical'],headers:{'cf-connecting-ip':ip}})));assert.deepEqual(results.map(r=>r.status).sort(),[200,429]);
  });
  await check('Custom negative cache capacity and fetch budgets reserve service for the catalog',async()=>{
    await db.batch(Array.from({length:DISCOVERY_LIMITS.maxCustomCachedSources},(_,i)=>db.prepare('INSERT INTO discovery_cache(id,retry_at,error_code,error_message) VALUES(?,?,?,?)').bind('greenhouse:negative-'+i,time+600000,'board_missing','Synthetic missing board')));
    const blocked=await call();assert.equal(blocked.data.sources[0].error.code,'source_capacity');const allowed=await call({sources:['greenhouse:canonical']});assert.equal(allowed.data.sources[0].status,'fresh');assert.equal(calls.length,1);assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM discovery_cache').first()).n,97);
    await reset();await db.prepare('INSERT INTO discovery_rates(key,window,count) VALUES(?,?,?)').bind('upstream:custom',Math.floor(time/60000),DISCOVERY_LIMITS.customUpstreamRequestsPerMinute).run();assert.equal((await call()).data.status,'unavailable');assert.equal(calls.length,0);assert.equal((await call({sources:['greenhouse:canonical']})).data.status,'complete');assert.equal(calls.length,1);
  });
  await check('Concurrent custom source admission cannot exceed the durable cache quota',async()=>{
    await db.batch(Array.from({length:DISCOVERY_LIMITS.maxCustomCachedSources-1},(_,i)=>db.prepare('INSERT INTO discovery_cache(id,retry_at) VALUES(?,?)').bind('greenhouse:negative-'+i,time+600000)));
    const rows=await Promise.all(['greenhouse:last-a','greenhouse:last-b'].map(source=>call({sources:[source]})));assert.equal(rows.filter(r=>r.data.sources[0].status==='fresh').length,1);assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM discovery_cache').first()).n,DISCOVERY_LIMITS.maxCustomCachedSources);
  });
  await check('Security counters expire without storing raw IPs or requiring an applicant account',async()=>{
    await call();const keys=(await db.prepare('SELECT key FROM discovery_rates').all()).results.map(r=>r.key);assert(keys.some(k=>/^requests:[a-f0-9]{64}$/.test(k)));assert(keys.every(k=>!k.includes('192.0.2.4')));time+=11*60000;await call({headers:{'cf-connecting-ip':'192.0.2.88'}});assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM discovery_rates WHERE window<?').bind(Math.floor(time/60000)-10).first()).n,0);assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM workspaces').first()).n,0);
  });

  const built=await build({stdin:{contents:`import {createDiscoveryHandler} from './server/discovery.mjs'; import {SERVICE_ORIGIN} from './server/applications.mjs'; const handler=createDiscoveryHandler({fetchImpl:async()=>Response.json({jobs:Array.from({length:60},(_,i)=>({id:i+1,internal_job_id:i+2,title:'Synthetic runtime role '+i,location:{name:'Remote - Europe'}})),meta:{total:60}})}); export default {async fetch(request,env){const original=new URL(request.url),headers=new Headers(request.headers);headers.set('host',new URL(SERVICE_ORIGIN).host);const response=await handler(new Request(SERVICE_ORIGIN+original.pathname+original.search,new Request(request,{headers})),env);return response??new Response('Not found',{status:404})}};`,resolveDir:process.cwd(),sourcefile:'discovery-runtime-probe.mjs'},bundle:true,format:'esm',platform:'neutral',mainFields:['module','main'],target:'es2022',external:['node:*'],write:false});
  const runtime=new Miniflare(convertV4MiniflareOptions({modules:true,script:built.outputFiles[0].text,compatibilityDate:'2026-05-15',compatibilityFlags:['nodejs_compat'],d1Databases:['DB']}));
  try{
    const runtimeDB=await runtime.getD1Database('DB');await migrate(runtimeDB);
    const request=async(path,options={},status=200)=>{const res=await runtime.dispatchFetch(SERVICE_ORIGIN+path,options),data=await res.json();assert.equal(res.status,status,JSON.stringify(data));validateClientResponse(path,res.status,data);workerdRequests++;return data};
    const catalog=await request('/api/discovery/sources');assert.equal(catalog.sources.length,7);
    const first=await request('/api/discovery/search?source=greenhouse:runtime');assert.equal(first.jobs.length,50);assert.equal(first.status,'complete');
    const second=await request('/api/discovery/search?source=greenhouse:runtime&cursor='+first.nextCursor);assert.equal(second.jobs.length,10);assert.equal(second.nextCursor,null);
    const filtered=await request('/api/discovery/search?source=greenhouse:runtime&q=role%201&location=Europe&remote=remote');assert(filtered.jobs.length>0);assert(filtered.jobs.every(j=>j.country===null&&j.remote===true));
    await request('/api/discovery/search?source=greenhouse:runtime',{headers:{origin:'https://wrong.example'}},403);
    await request('/api/discovery/search?source=https://localhost/private',{},400);
    await request('/api/discovery/search',{method:'POST'},405);
    const tokenless=await request('/api/discovery/search?source=greenhouse:runtime',{headers:{Authorization:'Bearer synthetic-not-a-session'}});assert.equal(tokenless.status,'complete');
    assert.equal((await runtimeDB.prepare('SELECT COUNT(*) AS n FROM workspaces').first()).n,0);groups.push('Actual bundled workerd runs eight public discovery requests with real D1 and no account or R2');console.log('PASS',groups.at(-1));
  }finally{await runtime.dispose()}
  const paths=['server/discovery.mjs','server/discovery-keywords.mjs','server/discovery-contract.json','app/phone/model.ts','tests/fixtures/discovery-search-v1.json','worker/index.ts','db/schema.ts','tests/hosted-discovery.mjs',...(await readdir(new URL('../drizzle/',import.meta.url))).filter(f=>f.endsWith('.sql')).sort().map(f=>'drizzle/'+f)],sourceHashes={};
  for(const path of paths)sourceHashes[path]=createHash('sha256').update(await readFile(new URL('../'+path,import.meta.url))).digest('hex');
  await writeFile(new URL('./hosted-discovery-verification.json',import.meta.url),JSON.stringify({observedAt:new Date().toISOString(),status:'passed',groups:groups.length,checks:groups,actualWorkerdRequests:workerdRequests,clientSchemaResponses,publicProviderRequests:0,applicationSubmissions:0,scope:'Actual local D1 SQL concurrency/quotas/cache with production discovery handler and synthetic bounded provider GETs; actual bundled workerd public API requests. Every successful response is parsed by the phone client model. Real public source availability is recorded separately.',sourceHashes},null,2)+'\n');
  console.log(JSON.stringify({result:'PASS',groups:groups.length,actualWorkerdRequests:workerdRequests,clientSchemaResponses,employerApplicationPosts:0}));
}finally{await mf.dispose();await rm(directory,{recursive:true,force:true})}
