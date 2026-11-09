// Portable saved-record backups. No network, inferred applications, or cache restoration.
const Backup = (() => {
 const maxBytes=4*1024*1024,maxItems=1000;
 const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
 const own=(o,k)=>Object.prototype.hasOwnProperty.call(o,k);
 const id=v=>typeof v==='string'&&v.trim()&&v.length<=256&&!['__proto__','constructor','prototype'].includes(v);
 const keys=(v,allowed)=>object(v)&&Object.keys(v).every(k=>allowed.includes(k));
 const statuses=['Not started','Preparing','Submission uncertain','Applied','Interviewing','Offer received','Closed / not pursuing'];
 const boundedMap=v=>object(v)&&Object.keys(v).length<=maxItems&&Object.keys(v).every(id);
 function validate(value,now=new Date()) {
  const C=globalThis.CareerCore;
  const fail=()=>{throw Error('This is not a supported, valid workspace backup. Nothing was changed.');};
  if(!keys(value,['format','schema','exportedAt','platform','workspace','profile','checklist','applicationRecords','nextActions'])||value.format!=='saleh-career-workspace'||value.schema!==1||!['web','native'].includes(value.platform))fail();
  const time=C.parsedDate(value.exportedAt);
  if(!time||time.dateOnly||time.time>now.getTime())fail();
  const w=value.workspace;
  if(!keys(w,['saved','states','savedDetails'])||!Array.isArray(w.saved)||w.saved.length>maxItems||new Set(w.saved).size!==w.saved.length||!w.saved.every(id)||!boundedMap(w.states)||!boundedMap(w.savedDetails))fail();
  const jobKeys=['id','title','company','location','url','posted','fit','summary','rank','relevance','subtitle','mode','postedKind','experienceLevel','employmentType','requirementNotes','closes','applyUrl','sourceUrl','gaps','steps','minYears','healthcare','leadership','kind','lastCheckedAt','researchCheckedAt'];
  for(const [key,job] of Object.entries(w.savedDetails)){
   if(!keys(job,jobKeys)||job.id!==key||!C.normalizeJob(job)||['applyUrl','sourceUrl'].some(k=>job[k]!=null&&C.safeJobURL(job[k])==='#'))fail();
  }
  if(w.saved.some(k=>!own(w.savedDetails,k))||Object.entries(w.states).some(([k,v])=>!own(w.savedDetails,k)||!statuses.includes(v)))fail();
  if(!keys(value.profile,['years','degree','skills','achievements','preferredCity','minimumMonthlySAR','unknownSalary']))fail();
  // Profile values are reference-only and never applied. The envelope byte bound
  // accommodates existing native grapheme-based limits without truncation.
  if(Object.values(value.profile).some(v=>typeof v!=='string'||/[\uD800-\uDFFF]/u.test(v)))fail();
  if(!boundedMap(value.checklist)||Object.keys(value.checklist).length>100||Object.keys(value.checklist).some(k=>k.length>=80)||Object.values(value.checklist).some(v=>typeof v!=='boolean'))fail();
  for(const [name,valid] of [['applicationRecords',C.validApplicationRecord],['nextActions',C.validNextAction]]){
   const rows=value[name];if(!Array.isArray(rows)||rows.length>maxItems||new Set(rows.map(r=>r?.jobId)).size!==rows.length)fail();
   if(rows.some(r=>!id(r?.jobId)||!own(w.savedDetails,r.jobId)||!valid(r,r.jobId,now)||C.parsedDate(r.updatedAt).time>now.getTime()))fail();
  }
  return value;
 }
 function parse(text,now=new Date()){
  if(typeof text!=='string'||text.length>maxBytes||new Blob([text]).size>maxBytes)throw Error('Backups are limited to 4 MiB. Nothing was changed.');
  let value;try{value=JSON.parse(text)}catch{throw Error('The backup is not valid JSON. Nothing was changed.');}
  return validate(value,now);
 }
 function validImported(w){
  const C=globalThis.CareerCore;
  return [['importedApplicationRecords',C.validApplicationRecord],['importedNextActions',C.validNextAction]].every(([key,valid])=>w[key]===undefined||boundedMap(w[key])&&Object.entries(w[key]).every(([k,v])=>own(w.savedDetails,k)&&valid(v,k)));
 }
 const portableJob=job=>Object.fromEntries(Object.entries(job).filter(([key])=>!['initials','status','salary'].includes(key)));
 return {maxBytes,maxItems,own,id,parse,validate,validImported,portableJob};
})();
let backupFileSequence=0;
let backupInput='',backupPreview=null,backupNotice='',backupExport='',backupWorking=false;
function backupsPage(){
 return `${intro('Keep a recoverable copy.','Private, portable saved records. Nothing is uploaded, sent or treated as a new application.','BACKUP & RESTORE')}<section class="card"><h2>Export saved records</h2><p>Includes saved roles, stages, receipt notes, next actions, your saved profile and checklist. Excludes unsaved drafts, live-search cache and search comparisons. Save drafts first if you want them included.</p><p class="notice">This JSON contains private information. Store it somewhere you trust. It is not encrypted. Web, Mac and iPhone records do not sync.</p><button class="primary" data-action="backup-export" ${backupWorking?'disabled':''}>Prepare backup</button> <button class="secondary" data-action="backup-recovery">Review last pre-restore copy</button>${backupExport?`<label class="field">Backup JSON<textarea id="backup-export-text" readonly style="min-height:140px">${esc(backupExport)}</textarea></label><div class="dialog-buttons"><button class="secondary" data-action="backup-copy">Copy backup</button><button class="secondary" data-action="backup-download">Save backup file</button></div>`:''}</section><section class="card" style="margin-top:20px"><h2>Restore missing records</h2><p>Paste a backup or choose a JSON file (maximum 4 MiB), then review. Existing values always win. Close other tabs and older app versions before restoring. Do not downgrade after restoring imported receipts or tasks; older builds do not understand them. Profile and checklist are included for reference only and are never restored. Import does not verify whether an application was submitted or a role is still open.</p><label class="field">Choose backup file<input id="backup-file" type="file" accept=".json,application/json"></label><label class="field">Backup JSON<textarea id="backup-input" style="min-height:160px" placeholder="Paste your saved backup here">${esc(backupInput)}</textarea></label><button class="secondary" data-action="backup-preview" ${backupWorking?'disabled':''}>Review restore</button><div id="backup-preview-panel">${backupPreview?backupPreviewHTML():''}</div><p id="backup-notice" role="status" aria-live="polite">${esc(backupNotice)}</p></section>`;
}
function backupPreviewHTML(){const p=backupPreview;return `<div class="highlight-note"><h3>Restore preview</h3><p>Backup exported ${esc(date(p.data.exportedAt))} from ${esc(p.data.platform)}.</p><ul><li>${p.count.jobs} missing role records</li><li>${p.count.saved} additional saved roles</li><li>${p.count.states} missing stages</li><li>${p.count.receipts} missing application records</li><li>${p.count.actions} missing next actions</li><li>${p.count.conflicts} differing existing values preserved</li></ul><p>All ${Object.keys(p.data.profile).length} profile fields and ${Object.keys(p.data.checklist).length} checklist entries are skipped. No existing role, stage, receipt or task will be overwritten. A local pre-restore recovery copy is saved before applying.</p><button class="primary" data-action="backup-apply" ${backupWorking||!p.changed?'disabled':''}>Confirm restore of missing records</button><button class="text-button" data-action="backup-cancel">Cancel preview</button></div>`}
function currentBackupState(){
 if(blockedKeys.size||failedKeys.size||!storageOK)throw Error('Resolve unreadable or unsaved storage first. Your existing data is preserved.');
 const raw=localStorage.getItem('ahmad-workspace'),w=raw===null?{saved:[...saved],states:{...states},savedDetails:{...savedDetails}}:JSON.parse(raw);
 if(!validWorkspace(w))throw Error('Existing saved records could not be read. Nothing was changed.');
 const profileRaw=localStorage.getItem('ahmad-profile'),p=profileRaw===null?defaultProfile:JSON.parse(profileRaw);
 const checklistRaw=localStorage.getItem('ahmad-checklist'),c=checklistRaw===null?{}:JSON.parse(checklistRaw);
 if(!validProfile(p)||!validChecklist(c))throw Error('The saved profile or checklist is unreadable. Nothing was changed.');
 const applicationRecords=[],nextActions=[],signature=[raw,profileRaw,checklistRaw];
 for(let i=0;i<localStorage.length;i++){const key=localStorage.key(i);for(const prefix of ['ahmad-application-record-v1:','ahmad-next-action-v1:'])if(key?.startsWith(prefix)){const jobId=decodeURIComponent(key.slice(prefix.length));if(!Backup.own(w.savedDetails,jobId)||prefix+encodeURIComponent(jobId)!==key)throw Error('An orphaned saved receipt or task needs recovery before backup. Nothing was changed.');}}
 // Retained jobs are the canonical record index. Normal saving retains a job before its sidecar.
 for(const jobId of Object.keys(w.savedDetails).sort()){
  for(const [rows,key,fallback,valid] of [[applicationRecords,recordKey(jobId),w.importedApplicationRecords, C.validApplicationRecord],[nextActions,actionKey(jobId),w.importedNextActions,C.validNextAction]]){
   const raw=localStorage.getItem('ahmad-'+key);signature.push(key,raw);const value=raw===null?(fallback?.[jobId]??null):JSON.parse(raw);
   if(raw!==null||value!==null){if(!valid(value,jobId))throw Error('A saved receipt or task is unreadable. Nothing was changed.');rows.push(value)}
  }
 }
 return {w,raw,signature:JSON.stringify(signature),data:{format:'saleh-career-workspace',schema:1,exportedAt:new Date().toISOString(),platform:'web',workspace:{saved:[...w.saved],states:{...w.states},savedDetails:Object.fromEntries(Object.entries(w.savedDetails).map(([id,job])=>[id,Backup.portableJob(job)]))},profile:Object.fromEntries(profileFields.filter(k=>p[k]!=null).map(k=>[k,String(p[k])])),checklist:{...c},applicationRecords,nextActions}};
}
function buildRestorePreview(data,current){
 Backup.parse(JSON.stringify(current.data,null,2));
 const w=current.w,next={...w,saved:[...w.saved],states:{...w.states},savedDetails:{...w.savedDetails},importedApplicationRecords:{...(w.importedApplicationRecords||{})},importedNextActions:{...(w.importedNextActions||{})}};
 const count={jobs:0,saved:0,states:0,receipts:0,actions:0,conflicts:0};
 for(const [id,job] of Object.entries(data.workspace.savedDetails))if(!Backup.own(next.savedDetails,id)){next.savedDetails[id]=C.normalizeJob(job);count.jobs++}else if(JSON.stringify(next.savedDetails[id])!==JSON.stringify(job))count.conflicts++;
 for(const id of data.workspace.saved)if(!next.saved.includes(id)){next.saved.push(id);count.saved++}
 for(const [id,value] of Object.entries(data.workspace.states))if(!Backup.own(next.states,id)){next.states[id]=value;count.states++}else if(next.states[id]!==value)count.conflicts++;
 const extraSignature=[];
 for(const [rows,map,key,valid,label] of [[data.applicationRecords,next.importedApplicationRecords,recordKey,C.validApplicationRecord,'receipts'],[data.nextActions,next.importedNextActions,actionKey,C.validNextAction,'actions']])for(const value of rows){
  const raw=localStorage.getItem('ahmad-'+key(value.jobId));extraSignature.push(key(value.jobId),raw);
  const existing=raw===null?(map[value.jobId]??null):JSON.parse(raw);
  if((raw!==null||existing!==null)&&!valid(existing,value.jobId))throw Error('An existing receipt or task is unreadable. Nothing was changed.');
  if(existing===null){map[value.jobId]=value;count[label]++}else if(JSON.stringify(existing)!==JSON.stringify(value))count.conflicts++;
 }
 if(Object.keys(next.savedDetails).length>Backup.maxItems||next.saved.length>Backup.maxItems)throw Error('The combined workspace would exceed 1,000 retained roles. Nothing was changed.');
 const merged={...current.data,workspace:{saved:next.saved,states:next.states,savedDetails:Object.fromEntries(Object.entries(next.savedDetails).map(([id,job])=>[id,Backup.portableJob(job)]))},applicationRecords:[],nextActions:[]};
 for(const name of ['applicationRecords','nextActions']){const rows=new Map(current.data[name].map(r=>[r.jobId,r]));for(const row of data[name])if(!rows.has(row.jobId))rows.set(row.jobId,row);merged[name]=[...rows.values()];}
 Backup.parse(JSON.stringify(merged,null,2));
 const changed=count.jobs+count.saved+count.states+count.receipts+count.actions>0;
 return {data,next,count,changed,signature:current.signature+'|'+JSON.stringify(extraSignature)};
}
function backupDraftsPending(){return Object.values(recordDrafts).some(recordDirty)||Object.values(actionDrafts).some(d=>actionDirty(d)||d.saving)||profileFields.some(k=>profileValue(profileDraft,k)!==profileValue(profileBase,k))||Object.keys(checklistPending).length>0}
function backupResult(message){backupNotice=message;if(view==='backups')render();else toast(message)}
function prepareRecoveryBackup(){try{const raw=localStorage.getItem('ahmad-pre-restore-v1');if(!raw)throw Error('No pre-restore copy is available yet.');const text=JSON.stringify(JSON.parse(raw).backup,null,2);Backup.parse(text);backupExport=text;backupResult('Last pre-restore copy prepared for saving. This is an older snapshot, not an undo action.')}catch(e){backupResult(e.message||'The recovery copy could not be read.')}}
async function prepareBackup(){try{const current=currentBackupState();const text=JSON.stringify(current.data,null,2);Backup.parse(text);backupExport=text;backupResult('Backup prepared from saved records only. Private information is included; nothing has been uploaded.')}catch(e){backupResult(e.message||'Backup could not be prepared. Nothing was changed.')}}
function previewBackup(){backupPreview=null;try{if(backupDraftsPending())throw Error('Save or discard your unsaved profile, receipt and task drafts before restoring.');const data=Backup.parse(backupInput);backupPreview=buildRestorePreview(data,currentBackupState());backupResult(backupPreview.changed?'Review the additions, then confirm below.':'No missing records to restore. Existing records are preserved.')}catch(e){backupResult(e.message||'Backup could not be reviewed. Nothing was changed.')}}
async function withBackupLocks(keys,fn,index=0){return index===keys.length?fn():navigator.locks.request('ahmad-career-'+keys[index],()=>withBackupLocks(keys,fn,index+1))}
async function applyBackup(){
 if(backupWorking||!backupPreview?.changed)return false;
 if(!navigator.locks?.request){backupResult('Safe restore is unavailable in this browser. Your existing records are unchanged.');return false}
 const preview=backupPreview;backupWorking=true;
 try{
  const keys=[...new Set([...preview.data.applicationRecords.map(r=>recordKey(r.jobId)),...preview.data.nextActions.map(r=>actionKey(r.jobId))])].sort();keys.push('workspace','profile','checklist');
  return await withBackupLocks(keys,()=>{
   if(backupPreview!==preview)throw Error('Restore canceled or the input changed. Review it again before restoring.');
   if(backupDraftsPending())throw Error('A draft changed. Save or discard it, then review the backup again.');
   Backup.validate(preview.data);const current=currentBackupState(),fresh=buildRestorePreview(preview.data,current);
   if(fresh.signature!==preview.signature)throw Error('Saved records changed after this preview. Review the backup again before restoring.');
   const text=JSON.stringify(fresh.next);if(new Blob([text]).size>Backup.maxBytes)throw Error('The combined workspace exceeds 4 MiB. Nothing was changed.');
   // A recovery copy precedes the only record-changing write. localStorage setItem is atomic.
   localStorage.setItem('ahmad-pre-restore-v1',JSON.stringify({savedAt:new Date().toISOString(),backup:current.data}));
   localStorage.setItem('ahmad-workspace',text);
   applyWorkspace(fresh.next);workspaceBase=text;backupPreview=null;
   backupResult('Missing records restored. Existing values, profile and checklist were preserved. No applications or messages were sent.');return true;
  });
 }catch(e){backupResult(e.message||'Restore could not be saved. Existing records are unchanged.');return false}
 finally{backupWorking=false;if(view==='backups')render()}
}
async function saveBackupFile(){if(!backupExport)return;try{Backup.parse(backupExport);if(window.webkit?.messageHandlers?.careerBackup){window.webkit.messageHandlers.careerBackup.postMessage({action:'save',text:backupExport});return}const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([backupExport],{type:'application/json;charset=utf-8'}));a.download='Saleh-Career-Finder-backup-'+new Date().toISOString().slice(0,10)+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);backupResult('Backup download requested. Check that the file was saved.')}catch(e){backupResult(e.message||'The file could not be saved. You can still copy the backup.')}}
async function copyBackup(){try{await navigator.clipboard.writeText(backupExport);backupResult('Private backup copied. Store it somewhere you trust.')}catch{$('#backup-export-text')?.focus?.();$('#backup-export-text')?.select?.();backupResult('Select and copy the backup text manually.')}}
async function readBackupFile(file){const sequence=++backupFileSequence;backupPreview=null;if(!file)return;if(file.size>Backup.maxBytes){backupResult('Backups are limited to 4 MiB. Nothing was changed.');return}try{const text=await file.text();if(sequence!==backupFileSequence)return;Backup.parse(text);backupInput=text;backupResult('File loaded for review. Nothing has been restored.')}catch(e){backupResult(e.message||'The file could not be read. Nothing was changed.')}}
window.receiveBackupSave=function(payload){backupResult(payload?.ok?'Backup file saved. Keep it private.':payload?.cancelled?'Save canceled. Your prepared backup is still available.':'The file could not be saved. Copy the backup text instead.')};
