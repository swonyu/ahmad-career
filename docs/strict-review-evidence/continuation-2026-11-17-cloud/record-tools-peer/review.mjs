// Independent, source-executing peer review. No browser, network, or production writes.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {createHash,webcrypto} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath,pathToFileURL} from 'node:url';
import vm from 'node:vm';

const root=process.argv[2]??fileURLToPath(new URL('../../../../hosted',import.meta.url));
const out=fileURLToPath(new URL('.',import.meta.url));
const require=createRequire(root+'/package.json');
const {build}=require('esbuild'),ts=require('typescript');
await mkdir(out,{recursive:true});
const paths=['app/phone/record-tools.ts','app/phone/PhoneApp.tsx','app/phone/model.ts','app/i18n/messages.ar.json'];
const source=Object.fromEntries(await Promise.all(paths.map(async path=>[path,await readFile(root+'/'+path,'utf8')])));
const sha=value=>createHash('sha256').update(value).digest('hex');
const hashes=Object.fromEntries(paths.map(path=>[path,sha(source[path])]));
await build({entryPoints:[root+'/app/phone/record-tools.ts'],outfile:out+'actual-tools.mjs',bundle:true,platform:'node',format:'esm',logLevel:'silent'});
const tools=await import(pathToFileURL(out+'actual-tools.mjs'));
const catalog=JSON.parse(source['app/i18n/messages.ar.json']);
const t=value=>catalog[value]??value;
const base=()=>({identity:'https://example.com/jobs/qa?id=1',title:'مهندس جودة Software QA',company:'Synthetic Employer',stage:'saved',appliedElsewhere:false,appliedDate:'',followUpDate:'2026-12-20',note:'SYNTHETIC PRIVATE NOTE',updatedAt:'2026-11-17T12:00:00.000Z'});
const passed=[];
async function group(name,fn){await fn();passed.push(name);process.stdout.write('PASS '+name+'\n');}

await group('CSV parses with Python stdlib, preserves quoted multiline text, and marks formula triggers',()=>{
 const dangerous=['=1+1','+SUM(1,2)','-1+1','@SUM(A1:A2)','\t=1','\r=1','\n=1',' \u200f\uFEFF=1',"'\"=1",'＝1','＋1','－1','＠1'];
 const ordinary=['Arabic ملاحظة','comma,semi;colon:quote"','Line one\r\nLine two','😀job','  Ordinary text'];
 const values=[...dangerous,...ordinary];
 const records=values.map((value,index)=>({...base(),identity:'https://example.com/jobs/'+index,title:value,company:'Employer, "Quoted"',note:value}));
 const before=JSON.stringify(records),csv=tools.applicationRecordsCSV(records,t);
 assert(csv.startsWith('\ufeff'));assert(csv.endsWith('\r\n'));assert.equal(JSON.stringify(records),before);
 const parsed=spawnSync('python',['-c','import csv,io,json,sys; print(json.dumps(list(csv.reader(io.StringIO(sys.stdin.read().removeprefix("\\ufeff"),newline=""))),ensure_ascii=False))'],{input:csv,encoding:'utf8'});
 assert.equal(parsed.status,0,parsed.stderr);const rows=JSON.parse(parsed.stdout);
 assert.equal(rows.length,1+values.length);assert(rows.every(row=>row.length===9));
 assert.deepEqual(rows[0],['Job title','Employer','Job link','Stage (self-entered)','Marked applied (self-entered)','Applied date (self-entered)','Follow-up date (self-entered)','Private note','Last edited (not application time)'].map(t));
 values.forEach((value,index)=>{const expected=index<dangerous.length?'Text: '+value:value;assert.equal(rows[index+1][0],expected);assert.equal(rows[index+1][7],expected);assert.equal(rows[index+1][1],'Employer, "Quoted"');});
});

await group('ICS physical UTF-8 folding, escaped TEXT, required properties, and privacy exclusions',async()=>{
 const title='مهندس، جودة;\\\n😀'.repeat(20),company='Synthetic, Employer; Branch: A';
 const record={...base(),title,company},before=JSON.stringify(record);
 const ics=await tools.followUpCalendar(record,t);assert.equal(JSON.stringify(record),before);
 assert(!/(^|[^\r])\n/.test(ics),'All lines use CRLF');
 const lines=ics.split('\r\n');assert(lines.every(line=>Buffer.byteLength(line,'utf8')<=75));
 assert(lines.some(line=>line.startsWith(' ')),'Multibyte fixture forces actual folding');
 assert(!ics.includes('\ufffd'),'No split UTF-8 replacement character');
 const unfolded=ics.replace(/\r\n[ \t]/g,'');
 const values=Object.fromEntries(unfolded.trim().split('\r\n').filter(line=>line.includes(':')).map(line=>{const index=line.indexOf(':');return[line.slice(0,index),line.slice(index+1)];}));
 assert.equal(values['DTSTART;VALUE=DATE'],'20261220');assert.equal(values.DURATION,'P1D');assert.match(values.DTSTAMP,/^\d{8}T\d{6}Z$/);assert.match(values.UID,/^career-finder-follow-up-[0-9a-f]{64}$/);
 const unescape=value=>value.replace(/\\([\\;,nN])/g,(_,c)=>c==='n'||c==='N'?'\n':c);
 assert.equal(unescape(values.SUMMARY),t('Follow up')+': '+title+' · '+company);
 assert.equal(values.URL,record.identity);assert.equal(values.CLASS,'PRIVATE');
 assert(!/SYNTHETIC PRIVATE NOTE|ATTENDEE|ORGANIZER|METHOD:|VALARM|EMAIL|profile|resume/.test(ics));
});

await group('ICS civil dates reject invalid boundaries and stable UID excludes private fields',async()=>{
 for(const date of ['1900-02-28','2000-02-29','9999-12-31'])assert((await tools.followUpCalendar({...base(),followUpDate:date})).includes('DTSTART;VALUE=DATE:'+date.replaceAll('-','')));
 for(const date of ['','1900-02-29','2100-02-29','2026-02-30','0000-01-01','10000-01-01','٢٠٢٦-١٢-٢٠'])await assert.rejects(tools.followUpCalendar({...base(),followUpDate:date}));
 const uid=value=>value.replace(/\r\n[ \t]/g,'').match(/^UID:(.+)$/m)?.[1];
 const first=uid(await tools.followUpCalendar(base()));
 assert.equal(uid(await tools.followUpCalendar({...base(),note:'A different private note',title:'Changed title',company:'Changed employer'})),first);
 assert.notEqual(uid(await tools.followUpCalendar({...base(),followUpDate:'2026-12-21'})),first);
 assert.notEqual(uid(await tools.followUpCalendar({...base(),identity:'https://example.com/jobs/qa?id=2'})),first);
});

await group('Arabic search compares accents and tatweel across fields without rewriting original data',()=>{
 const job={title:'مُهَنْدِس برمجيات Software',company:'شَرِكَة النُّور',location:'الرِّياض'},record={note:'متـابعة البريد غَدًا QA'};
 const before=JSON.stringify({job,record});
 for(const query of ['مهندس شركة الرياض','متابعة غدا','software qa','  النور  '])assert(tools.matchesSavedSearch(job,record,query),query);
 assert(!tools.matchesSavedSearch(job,record,'مهندس مفقود'));assert(tools.matchesSavedSearch(job,record,'  '));
 assert.equal(tools.savedSearchText('ا\u0654'),tools.savedSearchText('أ'),'Canonical composition retained');
 assert.notEqual(tools.savedSearchText('أ'),tools.savedSearchText('ا'),'Hamza is not erased');
 assert.notEqual(tools.savedSearchText('ة'),tools.savedSearchText('ه'));assert.notEqual(tools.savedSearchText('ى'),tools.savedSearchText('ي'));
 assert.equal(JSON.stringify({job,record}),before);
});

const tree=ts.createSourceFile('PhoneApp.tsx',source['app/phone/PhoneApp.tsx'],ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
function extract(name){const component=tree.statements.find(node=>ts.isFunctionDeclaration(node)&&node.name?.text==='PhoneApp');for(const node of component.body.statements){if(ts.isFunctionDeclaration(node)&&node.name?.text===name)return node.getText(tree);if(ts.isVariableStatement(node)){const declaration=node.declarationList.declarations.find(value=>value.name.getText(tree)===name);if(declaration?.initializer)return declaration.initializer.getText(tree);}}assert.fail(name);}
function install(name,context){const text='globalThis.'+name+' = '+extract(name);vm.runInContext(ts.transpileModule(text,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText,context);return context[name];}
function deferred(){let resolve;return{promise:new Promise(done=>resolve=done),resolve:()=>resolve()};}
function harness(){
 const record=base(),data={scope:'account:synthetic-a:workspace-a',records:[record]},gate=deferred(),downloads=[],notices=[];
 const context={account:{id:'synthetic-a'},epoch:{current:10},snapshotRef:{current:data},workspaceRef:{current:{accountId:'synthetic-a',workspaceId:'workspace-a'}},identityUnverified:{current:false},locked:false,checkingIdentity:false,storageProblem:'',t,same:(a,b)=>JSON.stringify(a)===JSON.stringify(b),civilDate:value=>/^\d{4}-\d{2}-\d{2}$/.test(value),applicationRecordsCSV:tools.applicationRecordsCSV,followUpCalendar:async value=>{await gate.promise;return tools.followUpCalendar(value,t);},run:(_label,action)=>action(context.epoch.current),download:(...values)=>downloads.push(values),setNotice:value=>notices.push(value)};
 vm.createContext(context);for(const name of ['assertCurrent','local','assertRecordExport','exportFollowUp','exportRecordsCSV'])install(name,context);
 return{record,data,gate,downloads,notices,context};
}
await group('Actual calendar handler blocks delayed download after identity, scope, snapshot, record, or epoch change',async()=>{
 const cases={
  identity:h=>{h.context.identityUnverified.current=true;},
  epoch:h=>{h.context.epoch.current++;},
  scope:h=>{h.context.snapshotRef.current={...h.data,scope:'account:synthetic-b:workspace-b'};},
  snapshot:h=>{h.context.snapshotRef.current={...h.data};},
  owner:h=>{h.context.workspaceRef.current={accountId:'synthetic-b',workspaceId:'workspace-b'};},
  record:h=>{h.record.followUpDate='2027-01-01';},
 };
 for(const [name,change] of Object.entries(cases)){const h=harness(),pending=h.context.exportFollowUp(h.record);change(h);h.gate.resolve();await assert.rejects(pending,undefined,name);assert.equal(h.downloads.length,0,name);assert.equal(h.notices.length,0,name);}
 const h=harness(),pending=h.context.exportFollowUp(h.record);h.gate.resolve();await pending;assert.equal(h.downloads.length,1);assert.equal(h.downloads[0][1],'Career-Finder-follow-up.ics');assert.equal(h.downloads[0][2],'text/calendar;charset=utf-8');
});

await group('Actual CSV handler rejects unconfirmed or mismatched current account and only exports captured records',async()=>{
 for(const change of [h=>{h.context.identityUnverified.current=true;},h=>{h.context.account={id:'synthetic-b'};},h=>{h.context.workspaceRef.current=null;},h=>{h.context.snapshotRef.current={scope:'guest',records:[h.record]};}]){const h=harness();change(h);await assert.rejects(h.context.exportRecordsCSV());assert.equal(h.downloads.length,0);}
 const h=harness();await h.context.exportRecordsCSV();assert.equal(h.downloads.length,1);assert.equal(h.downloads[0][1],'Career-Finder-application-records.csv');assert.equal(h.downloads[0][2],'text/csv;charset=utf-8');
 assert.equal(h.context.snapshotRef.current,h.data);assert.equal(h.data.records[0],h.record);
});

const finalHashes=Object.fromEntries(await Promise.all(paths.map(async path=>[path,sha(await readFile(root+'/'+path,'utf8'))])));
assert.deepEqual(finalHashes,hashes,'Candidate source changed during review; rerun against one stable snapshot');
const receipt={kind:'independent source-executing peer review',recordedAt:new Date().toISOString(),root,sourceHashes:hashes,passed,limits:['No browser access used after policy denial.','No real spreadsheet/calendar import was exercised.','Integration handlers run from actual AST with synthetic surrounding state, not a mounted React application.','No real accounts, applications, external network, or production writes.','Formula defense verified for listed import strings; not a universal resave guarantee.']};
await writeFile(out+'receipt.json',JSON.stringify(receipt,null,2)+'\n');
process.stdout.write(JSON.stringify({groups:passed.length,receipt:out+'receipt.json'})+'\n');
