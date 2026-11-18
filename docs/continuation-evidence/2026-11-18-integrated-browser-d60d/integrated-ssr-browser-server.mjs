import { createRequire } from "node:module";
import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
const root="/Users/saleh/Developer/career-finder-hosted-integrated-20261118-d60d62a70f26/hosted";
const combined="/Users/saleh/Developer/career-finder-integrated-20261118-d60d62a70f26/hosted";
const evidence="/Users/saleh/Developer/career-finder-feed-evidence-20261117-4b851318da2d/resume-20261118-d60d62a70f26";
const require=createRequire(path.join(root,"package.json"));
const {Miniflare,convertV4MiniflareOptions}=require("miniflare");
const {configureToolEnvironment}=await import("file://"+path.join(root,"scripts/tool-environment.mjs"));
configureToolEnvironment(root);
const hash=b=>createHash("sha256").update(b).digest("hex");
const manifest=JSON.parse(await readFile(path.join(root,"dist/build-manifest.json"),"utf8"));
if(manifest.preview!==false)throw Error("Expected production build");
for(const [f,h] of Object.entries(manifest.sourceHashes)){
 if(hash(await readFile(path.join(root,f)))!==h || hash(await readFile(path.join(combined,f)))!==h)throw Error("Source differs from built production: "+f);
}
const worker=await readFile(path.join(root,"dist/server/index.js"));
if(hash(worker)!==manifest.server.sha256)throw Error("Worker differs");
let outbound=0;
const mf=new Miniflare(convertV4MiniflareOptions({
 host:"127.0.0.1",port:4184,modules:true,scriptPath:path.join(root,"dist/server/index.js"),cf:false,
 compatibilityDate:"2026-05-15",compatibilityFlags:["nodejs_compat"],
 d1Databases:["DB"],r2Buckets:["BUCKET"],
 outboundService:async()=>{outbound++;throw Error("Local synthetic acceptance forbids outbound network");}
}));
await mf.ready;
const receipt={atUTC:new Date().toISOString(),pid:process.pid,node:process.version,url:"http://127.0.0.1:4184/phone",sourceRoot:root,combinedRoot:combined,sourceInputs:Object.keys(manifest.sourceHashes).length,server:manifest.server,production:true,outboundPolicy:"blocked",identity:"anonymous synthetic guest",persistentServerStorage:false};
await writeFile(path.join(evidence,"integrated-ssr-browser-server.json"),JSON.stringify(receipt,null,2)+"\n");
console.log(JSON.stringify(receipt));
async function close(){await mf.dispose();console.log(JSON.stringify({closed:true,outboundAttempts:outbound}));process.exit(0);}
process.once("SIGTERM",close);process.once("SIGINT",close);
