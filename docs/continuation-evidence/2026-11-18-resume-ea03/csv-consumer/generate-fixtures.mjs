import { build } from '/Users/saleh/Developer/career-finder-resume-20261118-ea03ff43/hosted/node_modules/esbuild/lib/main.js';
import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
const sourceRoot='/Users/saleh/Developer/career-finder-owner-20261118-20698';
const output=path.dirname(new URL(import.meta.url).pathname);
const expectedHead='b78b83b09739fefe69a6c8b72d7d1a60a4feb22a';
const git=(...args)=>execFileSync('git',args,{cwd:sourceRoot,encoding:'utf8'}).trim();
if(git('rev-parse','HEAD')!==expectedHead)throw new Error('Current owner advanced; inspect before using newer source');
const entries=[['hosted/app/phone/record-tools.ts','tools'],['hosted/app/phone/model.ts','model'],['hosted/app/i18n/core.ts','i18n']];
const sourceBlobs={};
for(const [entry,name] of entries){
 const expected=git('rev-parse','HEAD:'+entry),actual=git('hash-object',entry);
 if(expected!==actual)throw new Error('Dirty source '+entry);
 sourceBlobs[entry]=actual;
 await build({entryPoints:[path.join(sourceRoot,entry)],outfile:path.join(output,name+'.mjs'),bundle:true,platform:'node',format:'esm',logLevel:'silent',nodePaths:['/Users/saleh/Developer/career-finder-resume-20261118-ea03ff43/hosted/node_modules']});
}
const tools=await import(pathToFileURL(path.join(output,'tools.mjs')));
const model=await import(pathToFileURL(path.join(output,'model.mjs')));
const i18n=await import(pathToFileURL(path.join(output,'i18n.mjs')));
const job={id:'synthetic-consumer-job',title:'مهندس, "أول"',company:'شركة الاختبار',location:'Riyadh',country:'SA',url:'https://employer.example/careers/consumer-review'};
const base={...model.blankRecord(job),updatedAt:'2026-11-18T19:00:00.000Z',followUpDate:'2026-11-24',note:'line one\nline two, "quoted"\r\nنص خاص',stage:'interview',appliedElsewhere:true,appliedDate:'2026-11-18',email:'SYNTHETIC_PROFILE_EMAIL',password:'SYNTHETIC_SECRET',resume:{dataBase64:'SYNTHETIC_CV'},scope:'SYNTHETIC_OTHER_SCOPE',accessToken:'SYNTHETIC_TOKEN'};
const dangerous=['=1+1','+SUM(1,2)','-1+2','@SUM(A1:A2)','\t=1','\r=1','\n=1','  =1','\ufeff=1','\u2066=1',"'=1",'"=1','＝1+1','＋1','－1','＠SUM(1)','\u3000＝1'];
const records=[base,...dangerous.map((value,index)=>({...base,title:value,company:value,note:value,identity:'https://employer.example/careers/formula-'+index}))];
const files=[];
for(const language of ['en','ar']){
 const text=tools.applicationRecordsCSV(records,key=>i18n.translate(key,language));
 const filename='career-finder-export-'+language+'.csv';
 await fs.writeFile(path.join(output,filename),text);
 files.push({filename,sha256:createHash('sha256').update(text).digest('hex'),base64:Buffer.from(text).toString('base64')});
}
if(git('rev-parse','HEAD')!==expectedHead)throw new Error('Source moved during export');
const payload={source:expectedHead,sourceBlobs,node:process.version,recordCount:records.length,columnCount:9,records,dangerous,files,scope:'Actual production export functions executed directly with synthetic fixtures. Browser download not tested by this generator.'};
await fs.writeFile(path.join(output,'fixture-transport.json'),JSON.stringify(payload,null,2)+'\n');
console.log(JSON.stringify({output,source:expectedHead,records:records.length,files:files.map(({filename,sha256})=>({filename,sha256}))}));
