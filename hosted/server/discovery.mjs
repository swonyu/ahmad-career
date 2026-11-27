import {createHmac,randomBytes,randomUUID} from 'node:crypto';
import {sha256,countryCodes} from './validation.mjs';
import {SERVICE_ORIGIN} from './applications.mjs';
import {createDiscoveryKeywordMatcher,DISCOVERY_KEYWORD_MATCHING_VERSION} from './discovery-keywords.mjs';
import {sourceRecord,parseDiscoverySourceIdentity} from '../shared/discovery-source-identity.mjs';

export const DISCOVERY_LIMITS=Object.freeze({maxSources:4,pageSize:50,maxJobsPerSource:500,maxCachedSources:128,maxCustomCachedSources:96,maxCacheBytes:512*1024,maxResponseBytes:4*1024*1024,freshMilliseconds:10*60000,staleMilliseconds:24*3600000,sourceMilliseconds:10000,requestMilliseconds:5000,leaseMilliseconds:20000,requestsPerMinute:120,customRequestsPerMinute:60,requestsPerClientMinute:20,unknownClientRequestsPerMinute:6,upstreamRequestsPerMinute:60,customUpstreamRequestsPerMinute:30,refreshesPerClientMinute:8});
export const DISCOVERY_NOTICE='Search covers only the selected public employer boards. Results can change or close; open the employer posting to confirm requirements and location eligibility.';
const CATALOG_INPUT=[
  ['greenhouse','global','canonical','Canonical'],
  ['greenhouse','global','doordashusa','DoorDash'],
  ['lever','global','spotify','Spotify'],
  ['greenhouse','global','freenome','Freenome'],
  ['greenhouse','global','duolingo','Duolingo'],
  ['lever','global','lyrahealth','Lyra Health'],
  ['lever','global','zoox','Zoox'],
];
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
class DiscoveryError extends Error {constructor(code,message,status=400,retrySeconds=0){super(message);this.code=code;this.status=status;this.retrySeconds=retrySeconds}}
const invalid=(message='Use a supported employer board and valid search filters.')=>{throw new DiscoveryError('invalid_query',message)};
const json=(status,data,headers={})=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer',...headers}});
const fold=value=>value.normalize('NFKD').replace(/\p{M}/gu,'').toLowerCase();
function plain(value,max){
  if(typeof value!=='string')return '';
  const decoded=value.slice(0,20000).replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi,(whole,entity)=>{
    if(entity[0]!=='#')return ({amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:' '})[entity.toLowerCase()]??' ';
    const n=entity[1].toLowerCase()==='x'?parseInt(entity.slice(2),16):Number(entity.slice(1));return n>0&&n<=0x10ffff&&!(n>=0xd800&&n<=0xdfff)?String.fromCodePoint(n):' ';
  }).replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi,' ').replace(/<[^>]*>/g,' ').replace(/[<>\x00-\x1f\x7f\u202a-\u202e\u2066-\u2069]/g,' ').replace(/\s+/gu,' ').trim();
  return [...decoded].slice(0,max).join('');
}
export const DISCOVERY_SOURCES=Object.freeze(CATALOG_INPUT.map(args=>Object.freeze(sourceRecord(...args))));
export const DEFAULT_DISCOVERY_SOURCES=Object.freeze(DISCOVERY_SOURCES.slice(0,4).map(s=>s.id));

/** Only an ATS identity is accepted. No supplied URL is ever fetched. */
export function parseDiscoverySource(value){
  const source=parseDiscoverySourceIdentity(value,invalid);
  return DISCOVERY_SOURCES.find(item=>item.id===source.id)??source;
}

function parseQuery(url){
  if(url.search.length>9000)invalid('The search request is too long.');
  const p=url.searchParams,allowed=new Set(['source','q','location','remote','cursor']);
  for(const key of p.keys())if(!allowed.has(key)||key!=='source'&&p.getAll(key).length!==1)invalid('The search contains unsupported or repeated filter fields.');
  const sourceValues=p.getAll('source');if(sourceValues.length>DISCOVERY_LIMITS.maxSources)invalid('Choose at most four employer boards per search.');
  const sources=(sourceValues.length?sourceValues:DEFAULT_DISCOVERY_SOURCES).map(parseDiscoverySource);
  if(new Set(sources.map(s=>s.id)).size!==sources.length)invalid('Choose each employer board only once.');
  const q=p.get('q')??'',location=p.get('location')??'',remote=p.get('remote')??'any',cursor=p.get('cursor');
  if([...q].length>120||[...location].length>100||/[\x00-\x1f\x7f]/.test(q+location)||!['any','remote'].includes(remote))invalid('Use up to 120 keyword characters, 100 location characters and a valid remote filter.');
  const query={sources,q:fold(q.trim()),location:fold(location.trim()),remote};
  const queryHash=sha256(JSON.stringify({sources:sources.map(s=>s.id),q:query.q,location:query.location,remote}));
  let page=null;
  if(cursor!==null){
    if(cursor.length>512||!/^[A-Za-z0-9_-]+$/.test(cursor))invalid('This page cursor is invalid. Start a new search.');
    try{page=JSON.parse(Buffer.from(cursor,'base64url').toString('utf8'))}catch{invalid('This page cursor is invalid. Start a new search.')}
    if(!page||Object.keys(page).sort().join(',')!=='o,q,s,v'||page.v!==1||!Number.isInteger(page.o)||page.o<=0||page.o>=DISCOVERY_LIMITS.maxSources*DISCOVERY_LIMITS.maxJobsPerSource||page.o%DISCOVERY_LIMITS.pageSize||page.q!==queryHash||typeof page.s!=='string'||!/^[a-f0-9]{64}$/.test(page.s))invalid('The page cursor does not match these filters. Start a new search.');
  }
  return {...query,queryHash,page};
}
function remoteValue(job,provider,location){
  if(provider==='lever'&&['remote','hybrid','on-site'].includes(job.workplaceType))return job.workplaceType==='remote';
  const label=fold(location);
  if(/\b(?:not remote|no remote|hybrid|on[ -]?site|office[ -]based)\b/.test(label))return false;
  if(/\b(?:remote|home[ -]based)\b/.test(label))return true;
  return null;
}
function timestamp(value,now){
  if(typeof value!=='string'||value.length>64)return null;
  const parts=value.match(/^(\d{4})-(\d\d)-(\d\d)T(\d\d):(\d\d):(\d\d)(?:\.\d{1,9})?(?:Z|[+-]\d\d:\d\d)$/);
  if(!parts)return null;
  const [,year,month,day,hour,minute,second]=parts.map(Number);
  if(year<1970||month<1||month>12||day<1||day>new Date(Date.UTC(year,month,0)).getUTCDate()||hour>23||minute>59||second>59)return null;
  const date=Date.parse(value);return Number.isFinite(date)&&date>=0&&date<=now+60000?new Date(date).toISOString():null;
}
export function normalizeDiscoveryJob(raw,source,now=Date.now()){
  if(!raw||typeof raw!=='object'||Array.isArray(raw))return null;
  let id,title,location,country=null,summary='',publishedAt=null,updatedAt=null,url;
  if(source.provider==='lever'){
    if(typeof raw.id!=='string'||!UUID.test(raw.id))return null;id=raw.id.toLowerCase();title=plain(raw.text,250);
    const locations=[raw.categories?.location,...(Array.isArray(raw.categories?.allLocations)?raw.categories.allLocations.slice(0,20):[])].filter(x=>typeof x==='string');
    location=plain([...new Set(locations)].join(' · '),500);
    if(typeof raw.country==='string'&&countryCodes.has(raw.country.toUpperCase()))country=raw.country.toUpperCase();
    summary=plain(raw.descriptionPlain??raw.openingPlain,300);url=source.boardUrl+'/'+id;
  }else{
    if(!(Number.isSafeInteger(raw.id)&&raw.id>0||typeof raw.id==='string'&&/^[1-9]\d{0,19}$/.test(raw.id)))return null;
    // Prospect posts are open-ended talent pools, not a specific advertised vacancy.
    if(raw.internal_job_id===null)return null;
    id=String(raw.id);title=plain(raw.title,250);location=plain(raw.location?.name,500);
    publishedAt=timestamp(raw.first_published,now);updatedAt=timestamp(raw.updated_at,now);url=source.boardUrl+'/jobs/'+id;
  }
  if(!title)return null;
  return {id:source.id+':'+id,sourceId:source.id,sourceName:source.name,provider:source.provider,title,company:source.name,url,location,country,remote:remoteValue(raw,source.provider,location),summary,publishedAt,updatedAt};
}

function sourceError(code,message,retrySeconds=60){return new DiscoveryError(code,message,503,retrySeconds)}
function retrySeconds(header,now){
  if(typeof header!=='string')return 60;
  const milliseconds=/^\d+$/.test(header)?Number(header)*1000:Date.parse(header)-now;
  return Number.isFinite(milliseconds)&&milliseconds>0?Math.max(1,Math.ceil(milliseconds/1000)):60;
}
async function readJSON(response,signal){
  // A rejected response still owns a transport, including before a reader exists.
  // Cleanup must not delay or replace the original validation/timeout error.
  const rejectResponse=error=>{try{void response.body?.cancel().catch(()=>{})}catch{}throw error};
  if(!/^application\/json\b/i.test(response.headers.get('content-type')??''))rejectResponse(sourceError('source_response_invalid','The employer board returned an unexpected response.'));
  const length=Number(response.headers.get('content-length')??0);if(!Number.isFinite(length)||length>DISCOVERY_LIMITS.maxResponseBytes)rejectResponse(sourceError('source_response_large','This employer board exceeds the supported response size.'));
  const reader=response.body?.getReader();if(!reader)throw sourceError('source_response_invalid','The employer board returned no readable data.');
  let cancelled=false;
  const cancel=()=>{if(cancelled)return;cancelled=true;try{void reader.cancel().catch(()=>{})}catch{}};
  signal.addEventListener('abort',cancel,{once:true});
  let bytes=0;const chunks=[];
  const requireActive=()=>{if(signal.aborted){cancel();throw sourceError('source_timeout','The employer board did not respond in time.')}};
  try{
    for(;;){requireActive();let part;try{part=await reader.read()}catch{requireActive();throw sourceError('source_unavailable','The employer board could not be refreshed.')}const {done,value}=part;if(done)break;bytes+=value.byteLength;if(bytes>DISCOVERY_LIMITS.maxResponseBytes){cancel();throw sourceError('source_response_large','This employer board exceeds the supported response size.')}chunks.push(value)}
    requireActive();
    try{return JSON.parse(Buffer.concat(chunks).toString('utf8'))}catch{throw sourceError('source_response_invalid','The employer board returned unreadable job data.')}
  }finally{signal.removeEventListener('abort',cancel);reader.releaseLock()}
}

/** Injection is available only to executable tests; no request/environment can replace the upstream. */
export function createDiscoveryHandler({fetchImpl=fetch,clock=Date.now}={}){
  return async function handleDiscovery(request,env){
    const url=new URL(request.url);if(!url.pathname.startsWith('/api/discovery/'))return null;
    try{
      if(url.origin!==SERVICE_ORIGIN||request.headers.get('host')&&request.headers.get('host')!==url.host)throw new DiscoveryError('host_denied','Use the Career Finder HTTPS address.',403);
      if(request.headers.get('origin')&&request.headers.get('origin')!==SERVICE_ORIGIN||request.headers.get('sec-fetch-site')==='cross-site')throw new DiscoveryError('origin_denied','Open discovery from Career Finder.',403);
      if(request.method!=='GET')return json(405,{ok:false,error:{code:'method_not_allowed',message:'Discovery supports GET requests only.'}},{Allow:'GET'});
      if(url.pathname==='/api/discovery/sources'){
        if(url.search)invalid('The source catalog does not accept search parameters.');
        return json(200,{ok:true,version:1,defaultSources:DEFAULT_DISCOVERY_SOURCES,sources:DISCOVERY_SOURCES,limits:{maxSources:DISCOVERY_LIMITS.maxSources,pageSize:DISCOVERY_LIMITS.pageSize,maxJobsPerSource:DISCOVERY_LIMITS.maxJobsPerSource},notice:DISCOVERY_NOTICE});
      }
      if(url.pathname!=='/api/discovery/search')return json(404,{ok:false,error:{code:'not_found',message:'This discovery route does not exist.'}});
      const query=parseQuery(url);if(!env.DB)throw new DiscoveryError('discovery_unavailable','Public job discovery is temporarily unavailable.',503);
      const db=env.DB,now=()=>clock(),statement=(sql,...args)=>db.prepare(sql).bind(...args),first=(sql,...args)=>statement(sql,...args).first(),run=(sql,...args)=>statement(sql,...args).run();
      const minute=()=>Math.floor(now()/60000);
      async function budget(key,limit){
        const row=await first('INSERT INTO discovery_rates(key,window,count) VALUES(?,?,1) ON CONFLICT(key) DO UPDATE SET window=excluded.window,count=CASE WHEN discovery_rates.window=excluded.window THEN discovery_rates.count+1 ELSE 1 END RETURNING count',key,minute());
        if(row.count>limit)throw new DiscoveryError('discovery_rate_limited','Job discovery is busy. Wait briefly before searching again.',429,Math.max(1,Math.ceil((60000-now()%60000)/1000)));
      }
      await run('DELETE FROM discovery_rates WHERE window<?',minute()-10);
      const catalogIds=DISCOVERY_SOURCES.map(s=>s.id),customQuery=query.sources.some(s=>!catalogIds.includes(s.id));
      if(customQuery)await budget('requests:custom',DISCOVERY_LIMITS.customRequestsPerMinute);
      await budget('requests:global',DISCOVERY_LIMITS.requestsPerMinute);
      await run("INSERT OR IGNORE INTO meta(key,value) VALUES('discovery_rate_salt',?)",randomBytes(32).toString('hex'));
      const salt=(await first("SELECT value FROM meta WHERE key='discovery_rate_salt'")).value;
      const clientIP=request.headers.get('cf-connecting-ip'),client=createHmac('sha256',salt).update(Math.floor(now()/86400000)+'|'+(clientIP??'unidentified-client')).digest('hex');
      await budget('requests:'+client,clientIP?DISCOVERY_LIMITS.requestsPerClientMinute:DISCOVERY_LIMITS.unknownClientRequestsPerMinute);
      await run('DELETE FROM discovery_cache WHERE stale_until<=? AND lease_until<=? AND retry_at<=?',now(),now(),now());

      async function getJSON(address,deadline,source){
        // address is built below from a validated token and a fixed documented API host.
        if(!catalogIds.includes(source.id))await budget('upstream:custom',DISCOVERY_LIMITS.customUpstreamRequestsPerMinute);
        await budget('upstream:global',DISCOVERY_LIMITS.upstreamRequestsPerMinute);
        const remaining=Math.min(DISCOVERY_LIMITS.requestMilliseconds,deadline-now());if(remaining<=0)throw sourceError('source_timeout','The employer board did not respond in time.');
        const controller=new AbortController();let timer;
        const timeout=new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(sourceError('source_timeout','The employer board did not respond in time.'))},remaining)});
        const work=(async()=>{
          let response;try{response=await fetchImpl(address,{method:'GET',headers:{Accept:'application/json','User-Agent':'CareerFinder/0.4 (+https://career-finder-service.jazzy-drake-8323.chatgpt.site/support)'},redirect:'manual',signal:controller.signal})}catch{throw sourceError('source_unavailable','The employer board could not be reached.')}
          if(response.status!==200){void response.body?.cancel().catch(()=>{});if([404,410].includes(response.status))throw sourceError('board_missing','This employer board is unavailable or has moved.',600);if(response.status===429)throw sourceError('source_rate_limited','The employer board requested a pause. Try again later.',retrySeconds(response.headers.get('retry-after'),now()));if(response.status>=300&&response.status<400)throw sourceError('source_redirected','This employer board moved. Choose its current supported board URL.',600);throw sourceError('source_unavailable','The employer board could not be refreshed.')}
          return readJSON(response,controller.signal);
        })();
        try{return await Promise.race([work,timeout])}finally{clearTimeout(timer)}
      }
      async function retrieve(source){
        const deadline=now()+DISCOVERY_LIMITS.sourceMilliseconds,items=[];let limited=false,invalidRows=0,bytes=2,interruption=null,retryAt=0;
        const seen=new Set();
        function accept(rows){
          for(const raw of rows){
            const job=normalizeDiscoveryJob(raw,source,now());if(!job){if(raw?.internal_job_id!==null)invalidRows++;continue}if(seen.has(job.id))continue;
            const size=Buffer.byteLength(JSON.stringify(job))+1;if(items.length>=DISCOVERY_LIMITS.maxJobsPerSource||bytes+size>DISCOVERY_LIMITS.maxCacheBytes){limited=true;break}
            seen.add(job.id);items.push(job);bytes+=size;
          }
        }
        if(source.provider==='greenhouse'){
          const data=await getJSON(`https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(source.board)}/jobs`,deadline,source);
          if(!data||!Array.isArray(data.jobs)||!data.meta||!Number.isInteger(data.meta.total)||data.meta.total<0)throw sourceError('source_response_invalid','The employer board returned incomplete job data.');
          accept(data.jobs);if(data.meta.total>data.jobs.length||data.jobs.length>DISCOVERY_LIMITS.maxJobsPerSource)limited=true;
        }else{
          const host=source.region==='eu'?'https://api.eu.lever.co':'https://api.lever.co';
          for(let skip=0;skip<DISCOVERY_LIMITS.maxJobsPerSource;skip+=100){
            let rows;
            try{rows=await getJSON(`${host}/v0/postings/${encodeURIComponent(source.board)}?mode=json&limit=100&skip=${skip}`,deadline,source)}
            catch(error){
              // A later transient failure must not erase already validated pages.
              // Keep missing boards, redirects and malformed data on their existing failure path.
              if(!items.length||!(error instanceof DiscoveryError)||!['source_timeout','source_unavailable','source_rate_limited','discovery_rate_limited'].includes(error.code))throw error;
              interruption=error;retryAt=Math.min(8640000000000000,now()+Math.max(1,error.retrySeconds)*1000);break;
            }
            if(!Array.isArray(rows)||rows.length>100)throw sourceError('source_response_invalid','The employer board returned an unexpected job page.');
            accept(rows);if(rows.length<100)break;if(limited||skip+100>=DISCOVERY_LIMITS.maxJobsPerSource){limited=true;break}
          }
        }
        if(invalidRows&&!items.length)throw sourceError('source_response_invalid','The employer board returned no usable job records.');
        const error=interruption?{code:interruption.code,message:interruption.code==='discovery_rate_limited'?'The public fetch budget is busy. Try this board again shortly.':interruption.message}:invalidRows?{code:'source_incomplete',message:'Some employer records could not be read; only validated postings are shown.'}:null;
        // A transient interruption is partial via its error; limited still describes existing data caps.
        return {jobs:items,limited:limited||invalidRows>0,error,retryAt};
      }
      function view(source,row,state,error=null){
        let jobs=[];
        const usable=row?.checked_at&&row.stale_until>now()&&state!=='unavailable';
        if(usable){try{jobs=JSON.parse(row.jobs_json);if(!Array.isArray(jobs)||jobs.length>DISCOVERY_LIMITS.maxJobsPerSource)throw Error('invalid-cache')}catch{jobs=[];state='unavailable';error={code:'source_cache_invalid',message:'This source needs to be refreshed before its jobs can be shown.'}}}
        else if(state!=='unavailable')state='unavailable';
        const status={id:source.id,name:source.name,provider:source.provider,boardUrl:source.boardUrl,status:state,checkedAt:usable&&state!=='unavailable'?row.checked_at:null,availableCount:jobs.length,matchedCount:0,limited:Boolean(row?.limited),error};
        return {source:status,jobs:jobs.map(job=>({...job,checkedAt:row.checked_at,stale:state==='stale'}))};
      }
      async function sourceJobs(source){
        let row=await first('SELECT * FROM discovery_cache WHERE id=?',source.id);
        if(row?.checked_at&&row.expires_at>now())return view(source,row,'cached',row.error_code?{code:row.error_code,message:row.error_message}:null);
        if(row&&row.retry_at>now())return view(source,row,row.checked_at&&row.stale_until>now()?'stale':'unavailable',{code:row.error_code??'source_waiting',message:row.error_message??'This employer board requested a pause.'});
        if(!row){
          await run(`INSERT OR IGNORE INTO discovery_cache(id) SELECT ? WHERE (SELECT COUNT(*) FROM discovery_cache)<? AND (?=1 OR (SELECT COUNT(*) FROM discovery_cache WHERE id NOT IN (${catalogIds.map(()=>'?').join(',')}))<?)`,source.id,DISCOVERY_LIMITS.maxCachedSources,catalogIds.includes(source.id)?1:0,...catalogIds,DISCOVERY_LIMITS.maxCustomCachedSources);
          row=await first('SELECT * FROM discovery_cache WHERE id=?',source.id);
          if(!row)return view(source,null,'unavailable',{code:'source_capacity',message:'The public source cache is busy. Try this board again later.'});
        }
        const claim=randomUUID(),claimed=await run('UPDATE discovery_cache SET claim=?,lease_until=? WHERE id=? AND lease_until<=? AND retry_at<=? AND expires_at<=?',claim,now()+DISCOVERY_LIMITS.leaseMilliseconds,source.id,now(),now(),now());
        if(claimed.meta.changes!==1){
          const latest=await first('SELECT * FROM discovery_cache WHERE id=?',source.id);
          if(latest?.expires_at>now())return view(source,latest,'cached',latest.error_code?{code:latest.error_code,message:latest.error_message}:null);
          return view(source,latest,latest?.checked_at&&latest.stale_until>now()?'stale':'unavailable',{code:'source_refreshing',message:'This employer board is already being refreshed. Search again shortly.'});
        }
        try{
          await budget('refreshes:'+client,DISCOVERY_LIMITS.refreshesPerClientMinute);
          const result=await retrieve(source),observedAt=now(),checkedAt=new Date(observedAt).toISOString();
          const retryAt=result.retryAt;
          const expiresAt=retryAt?Math.min(observedAt+DISCOVERY_LIMITS.freshMilliseconds,retryAt):observedAt+DISCOVERY_LIMITS.freshMilliseconds;
          const saved=await run('UPDATE discovery_cache SET jobs_json=?,checked_at=?,expires_at=?,stale_until=?,retry_at=?,claim=NULL,lease_until=0,limited=?,error_code=?,error_message=? WHERE id=? AND claim=? AND lease_until>?',JSON.stringify(result.jobs),checkedAt,expiresAt,observedAt+DISCOVERY_LIMITS.staleMilliseconds,retryAt,result.limited?1:0,result.error?.code??null,result.error?.message??null,source.id,claim,now());
          if(saved.meta.changes!==1){const latest=await first('SELECT * FROM discovery_cache WHERE id=?',source.id);return view(source,latest,latest?.expires_at>now()?'cached':'stale',{code:'source_refreshing',message:'This employer board changed during refresh. Search again to check it.'})}
          const latest=await first('SELECT * FROM discovery_cache WHERE id=?',source.id);return view(source,latest,'fresh',result.error);
        }catch(error){
          const known=error instanceof DiscoveryError?error:sourceError('source_unavailable','The employer board could not be refreshed.');
          const message=known.code==='discovery_rate_limited'?'The public fetch budget is busy. Try this board again shortly.':known.message;
          const retryAt=Math.min(8640000000000000,now()+Math.max(1,known.retrySeconds)*1000);
          if(known.code==='board_missing')await run("UPDATE discovery_cache SET jobs_json='[]',checked_at=NULL,expires_at=0,stale_until=0,limited=0,retry_at=?,claim=NULL,lease_until=0,error_code=?,error_message=? WHERE id=? AND claim=?",retryAt,known.code,message,source.id,claim);
          else await run('UPDATE discovery_cache SET retry_at=?,claim=NULL,lease_until=0,error_code=?,error_message=? WHERE id=? AND claim=?',retryAt,known.code,message,source.id,claim);
          const latest=await first('SELECT * FROM discovery_cache WHERE id=?',source.id);return view(source,latest,latest?.checked_at&&latest.stale_until>now()?'stale':'unavailable',{code:known.code,message});
        }
      }
      const results=await Promise.all(query.sources.map(sourceJobs));
      const matchesKeywords=createDiscoveryKeywordMatcher(query.q),matched=results.map(result=>{
        const jobs=result.jobs.filter(job=>matchesKeywords(job.title+' '+job.company+' '+job.summary)&&(!query.location||fold(job.location).includes(query.location))&&(query.remote!=='remote'||job.remote===true)).sort((a,b)=>a.title.localeCompare(b.title,'en')||a.id.localeCompare(b.id,'en'));
        result.source.matchedCount=jobs.length;return jobs;
      });
      // Round-robin board results keep a large employer from hiding the other selected sources.
      const jobs=[];for(let i=0;matched.some(rows=>rows.length>i);i++)for(const rows of matched)if(rows[i])jobs.push(rows[i]);
      // A matching-rule change invalidates old offsets through the existing
      // discovery_changed recovery path, even while board metadata stays cached.
      const snapshot=sha256(JSON.stringify({matching:DISCOVERY_KEYWORD_MATCHING_VERSION,sources:results.map(result=>({id:result.source.id,checkedAt:result.source.checkedAt,rows:result.jobs.map(job=>job.id),content:sha256(JSON.stringify(result.jobs.map(job=>({...job,stale:undefined}))))}))}));
      if(query.page&&query.page.s!==snapshot)throw new DiscoveryError('discovery_changed','These employer results changed. Start a new search before loading another page.',409);
      const offset=query.page?.o??0,next=offset+DISCOVERY_LIMITS.pageSize,nextCursor=next<jobs.length?Buffer.from(JSON.stringify({v:1,o:next,q:query.queryHash,s:snapshot})).toString('base64url'):null;
      const sources=results.map(result=>result.source),status=sources.every(s=>s.status==='unavailable')?'unavailable':sources.some(s=>['stale','unavailable'].includes(s.status)||s.limited||s.error)?'partial':'complete';
      const limited=sources.some(s=>s.limited),notice=DISCOVERY_NOTICE+(limited?' One or more boards reached a job or data-size limit. Filters apply to the retained subset.':'');
      return json(200,{ok:true,version:1,generatedAt:new Date(now()).toISOString(),status,jobs:jobs.slice(offset,next),sources,nextCursor,totalMatches:jobs.length,limited,notice});
    }catch(error){
      const known=error instanceof DiscoveryError?error:new DiscoveryError('discovery_unavailable','Public job discovery is temporarily unavailable. Your saved applications are unchanged.',503);
      return json(known.status,{ok:false,error:{code:known.code,message:known.message}},known.status===429?{'Retry-After':String(known.retrySeconds||60)}:{});
    }
  };
}
export const handleDiscovery=createDiscoveryHandler();
