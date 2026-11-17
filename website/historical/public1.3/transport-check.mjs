import assert from 'node:assert/strict';
import {publicBoardSource,PUBLIC_SOURCES} from './feeds.mjs';
const source=PUBLIC_SOURCES[0],limit=8_000_000;
const bytes=s=>new TextEncoder().encode(s);
function stream(chunks,headers={}){
 let pulled=0,cancelled=false;
 const body=new ReadableStream({pull(controller){if(pulled<chunks.length)controller.enqueue(chunks[pulled++]);else controller.close()},cancel(){cancelled=true}},{highWaterMark:0});
 return {response:new Response(body,{headers}),get pulled(){return pulled},get cancelled(){return cancelled}};
}
let s=stream([bytes('{"jobs":[]}')]);assert.equal((await publicBoardSource(source,async()=>s.response)).source.ok,true);
s=stream([bytes('{"jobs":[]')]);await assert.rejects(publicBoardSource(source,async()=>s.response));
s=stream([new Uint8Array([0xff])]);await assert.rejects(publicBoardSource(source,async()=>s.response));assert.equal(s.cancelled,true);
s=stream([bytes('{"jobs":[]}')],{'content-length':String(limit+1)});await assert.rejects(publicBoardSource(source,async()=>s.response),/too large/);assert.equal(s.pulled,0);assert.equal(s.cancelled,true);
// Exactly the byte bound is valid; a following byte fails before JSON parsing.
const exact=bytes('{"jobs":[]}'+ ' '.repeat(limit-11));assert.equal(exact.byteLength,limit);
s=stream([exact]);assert.equal((await publicBoardSource(source,async()=>s.response)).source.ok,true);
s=stream([exact,bytes(' '),bytes('never read')]);await assert.rejects(publicBoardSource(source,async()=>s.response),/too large/);assert.equal(s.pulled,2);assert.equal(s.cancelled,true);
// Count bytes, not JavaScript UTF-16 length; handle multibyte boundaries split between chunks.
const encoded=bytes('{"jobs":[],"note":"أ"}'),point=encoded.indexOf(0xd8)+1;
s=stream([encoded.slice(0,point),encoded.slice(point)]);assert.equal((await publicBoardSource(source,async()=>s.response)).source.ok,true);
s=stream([bytes('{"jobs":[],"note":"'+'أ'.repeat(limit/2)+'"}')]);await assert.rejects(publicBoardSource(source,async()=>s.response),/too large/);assert.equal(s.cancelled,true);
s=stream([bytes('{"jobs":[]}')]);s.response={ok:false,status:403,body:s.response.body};await assert.rejects(publicBoardSource(source,async()=>s.response),/403/);assert.equal(s.pulled,0);
const broken=new Response(new ReadableStream({pull(controller){controller.error(new Error('interrupted'))}}));await assert.rejects(publicBoardSource(source,async()=>broken),/interrupted/);
console.log('PASS streamed employer response bounds, early cancellation, UTF-8, malformed and interrupted responses');
