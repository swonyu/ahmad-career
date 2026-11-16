import assert from 'node:assert/strict';
import {readFile,readdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {build} from 'esbuild';
import {createDiscoveryHandler,parseDiscoverySource,DISCOVERY_LIMITS} from '../server/discovery.mjs';
import {SERVICE_ORIGIN} from '../server/applications.mjs';

const groups=[],base=Date.now();let time=base,calls=[],records=new Map(),behavior=null,handler,db,workerdRequests=0;
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
  return {status:response.status,data:await response.json(),headers:response.headers};
}
async function cached(source='greenhouse:synthetic'){return db.prepare('SELECT * FROM discovery_cache WHERE id=?').bind(source).first()}

try{
  db=await mf.getD1Database('DB');await migrate(db);
  await check('Public catalog has seven verified sources, four mixed defaults and no account dependency',async()=>{
    const result=await call({path:'/api/discovery/sources',environment:{}});assert.equal(result.status,200);assert.equal(result.data.version,1);assert.equal(result.data.sources.length,7);assert.equal(result.data.defaultSources.length,4);assert.equal(result.data.limits.pageSize,50);
    assert(result.data.defaultSources.includes('greenhouse:freenome'));assert(result.data.defaultSources.includes('lever:global:spotify'));assert.equal(calls.length,0);assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM workspaces').first()).n,0);
    assert.equal((await call({method:'HEAD'})).status,405);assert.equal((await call({method:'POST'})).status,405);assert.equal((await call({headers:{origin:'https://unrelated.example'}})).status,403);assert.equal((await call({headers:{host:'unrelated.example'}})).status,403);
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
    const result=await call({q:'private-filter-987',location:'private-city-654',headers:{authorization:'Bearer synthetic-private-token',cookie:'session=synthetic-private-cookie','oai-authenticated-user-id':'synthetic-owner'}});
    assert.equal(result.status,200);assert.equal(result.data.status,'complete');assert.equal(result.data.jobs.length,0);assert.equal(calls.length,1);
    const all=JSON.stringify({cache:(await db.prepare('SELECT * FROM discovery_cache').all()).results,rates:(await db.prepare('SELECT * FROM discovery_rates').all()).results,calls});
    for(const secret of ['private-filter-987','private-city-654','synthetic-private-token','synthetic-private-cookie','synthetic-owner','192.0.2.4'])assert(!all.includes(secret),secret);
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
  await check('Lever pages are bounded to five public GETs and 500 normalized postings',async()=>{
    records.set('lever:global:synthetic',Array.from({length:700},(_,i)=>lever(i+1)));const r=await call({sources:['lever:global:synthetic']});assert.equal(calls.length,5);assert.equal(r.data.sources[0].availableCount,500);assert.equal(r.data.limited,true);assert(calls.every(c=>!c.url.includes('key=')));
  });
  await check('Redirects and oversized responses are refused without following untrusted destinations',async()=>{
    behavior=()=>new Response('',{status:302,headers:{Location:'http://127.0.0.1/private'}});assert.equal((await call()).data.sources[0].error.code,'source_redirected');assert.equal(calls.length,1);
    await reset();behavior=()=>new Response('{}',{headers:{'content-type':'application/json','content-length':String(DISCOVERY_LIMITS.maxResponseBytes+1)}});assert.equal((await call()).data.sources[0].error.code,'source_response_large');
    await reset();behavior=()=>new Response(' '.repeat(DISCOVERY_LIMITS.maxResponseBytes+1),{headers:{'content-type':'application/json'}});assert.equal((await call()).data.sources[0].error.code,'source_response_large');
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

  const built=await build({stdin:{contents:`import {createDiscoveryHandler} from './server/discovery.mjs'; import {SERVICE_ORIGIN} from './server/applications.mjs'; const handler=createDiscoveryHandler({fetchImpl:async()=>Response.json({jobs:Array.from({length:60},(_,i)=>({id:i+1,internal_job_id:i+2,title:'Synthetic runtime role '+i,location:{name:'Remote - Europe'}})),meta:{total:60}})}); export default {async fetch(request,env){const original=new URL(request.url),headers=new Headers(request.headers);headers.set('host',new URL(SERVICE_ORIGIN).host);const response=await handler(new Request(SERVICE_ORIGIN+original.pathname+original.search,new Request(request,{headers})),env);return response??new Response('Not found',{status:404})}};`,resolveDir:process.cwd(),sourcefile:'discovery-runtime-probe.mjs'},bundle:true,format:'esm',platform:'neutral',target:'es2022',external:['node:*'],write:false});
  const runtime=new Miniflare(convertV4MiniflareOptions({modules:true,script:built.outputFiles[0].text,compatibilityDate:'2026-05-15',compatibilityFlags:['nodejs_compat'],d1Databases:['DB']}));
  try{
    const runtimeDB=await runtime.getD1Database('DB');await migrate(runtimeDB);
    const request=async(path,options={},status=200)=>{const res=await runtime.dispatchFetch(SERVICE_ORIGIN+path,options),data=await res.json();assert.equal(res.status,status,JSON.stringify(data));workerdRequests++;return data};
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
  const paths=['server/discovery.mjs','server/discovery-contract.json','tests/fixtures/discovery-search-v1.json','worker/index.ts','db/schema.ts','tests/hosted-discovery.mjs',...(await readdir(new URL('../drizzle/',import.meta.url))).filter(f=>f.endsWith('.sql')).sort().map(f=>'drizzle/'+f)],sourceHashes={};
  for(const path of paths)sourceHashes[path]=createHash('sha256').update(await readFile(new URL('../'+path,import.meta.url))).digest('hex');
  await writeFile(new URL('./hosted-discovery-verification.json',import.meta.url),JSON.stringify({observedAt:new Date().toISOString(),status:'passed',groups:groups.length,checks:groups,actualWorkerdRequests:workerdRequests,publicProviderRequests:0,applicationSubmissions:0,scope:'Actual local D1 SQL concurrency/quotas/cache with production discovery handler and synthetic bounded provider GETs; actual bundled workerd public API requests. Real public source availability is recorded separately.',sourceHashes},null,2)+'\n');
  console.log(JSON.stringify({result:'PASS',groups:groups.length,actualWorkerdRequests:workerdRequests,employerApplicationPosts:0}));
}finally{await mf.dispose()}
