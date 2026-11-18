import fs from 'node:fs/promises';
const mime={html:'text/html; charset=utf-8',js:'text/javascript; charset=utf-8',css:'text/css; charset=utf-8',svg:'image/svg+xml',webmanifest:'application/manifest+json'};
const assets={};for(const name of await fs.readdir('web')){const ext=name.split('.').pop();if(!mime[ext])continue;assets['/'+name]={type:mime[ext],body:await fs.readFile('web/'+name,'utf8')}}
let feeds=await fs.readFile('feeds.mjs','utf8');feeds=feeds.replace("import './web/core.js';",await fs.readFile('web/core.js','utf8')).replaceAll('export ','');
const server=`const ASSETS=${JSON.stringify(assets)};
${feeds}
let searchPending=null,searchSnapshot=null;
// ponytail: coalescing and cooldown are per Worker instance; shared storage is only needed for a measured cross-instance load problem.
async function sharedSearch(){
 if(searchSnapshot&&searchSnapshot.expires>Date.now())return searchSnapshot.data;
 if(searchPending)return searchPending;
 searchPending=(async()=>{
  const data=await getLiveJobs();
  const complete=data.sources.length>0&&data.sources.every(s=>s.ok&&!s.limited&&!s.error&&!s.detailErrors&&!s.queryErrors);
  const ttl=complete?300:30;
  searchSnapshot={data,expires:Date.now()+ttl*1000};
  return data;
 })();
 try{return await searchPending}finally{searchPending=null}
}
export default {async fetch(request,env,ctx){
 const url=new URL(request.url);
 if(request.method!=='GET'&&request.method!=='HEAD')return new Response('Method not allowed',{status:405,headers:{Allow:'GET, HEAD'}});
 if(url.pathname==='/api/live'){
  if(request.method==='HEAD')return new Response(null,{status:200});
  const data=await sharedSearch();
  return Response.json(data,{headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
 }
 const asset=ASSETS[url.pathname==='/'?'/index.html':url.pathname];
 if(!asset)return new Response('Not found',{status:404});
 return new Response(request.method==='HEAD'?null:asset.body,{headers:{'Content-Type':asset.type,'Cache-Control':'no-cache','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'"}})
}};\n`;
await fs.mkdir('dist/server',{recursive:true});await fs.mkdir('dist/.openai',{recursive:true});await fs.writeFile('dist/server/index.js',server);console.log('Built dependency-free Worker and '+Object.keys(assets).length+' bundled assets.');
