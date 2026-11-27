import assert from 'node:assert/strict';
import { productionRead } from './phone-read-test-helpers.mjs';
import test from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';

const read = path => fs.readFileSync(new URL('../'+path, import.meta.url), 'utf8');
const catalog = JSON.parse(read('app/i18n/messages.ar.json'));
const core={exports:{},Intl,require:name=>{assert.equal(name,'./messages.ar.json');return catalog;}};
vm.runInNewContext(ts.transpileModule(read('app/i18n/core.ts'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,esModuleInterop:true}}).outputText,core);
const translate = language => (text,values=[])=>core.exports.translate(text,language,values);
const source = read('app/phone/PhoneApp.tsx');
const tree = ts.createSourceFile('PhoneApp.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
function nodes(root,predicate){const found=[];function visit(node){if(predicate(node))found.push(node);ts.forEachChild(node,visit);}visit(root);return found;}
function compile(code,context){vm.runInNewContext(ts.transpileModule(code,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None,jsx:ts.JsxEmit.React}}).outputText,context);return context;}
function declaration(path,name){const code=read(path),ast=ts.createSourceFile(path,code,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);const node=nodes(ast,node=>ts.isFunctionDeclaration(node)&&node.name?.text===name)[0];assert(node);return node.getText(ast).replace(/^export /,'');}
const icon = ()=>null;
function fixture(language='en',overrides={}){
  let completeNotice;
  const noticePromise=new Promise(resolve=>{completeNotice=resolve;});
  const ctx={...productionRead,React,t:translate(language),language,useI18n:()=>({language,t:translate(language)}),formatNumber:value=>new Intl.NumberFormat(language).format(value),ListChecks:icon,FileText:icon,ArrowRight:icon,Copy:icon,profile:{firstName:'Maya',lastName:'Faris',email:'maya@example.invalid',phone:'',linkedin:'',website:'',resume:null},account:null,workspace:null,jobs:[],records:[],checkingIdentity:false,locked:false,tab:'apply',noticePromise,setSavedQuery:value=>ctx.query=value,setSavedFilter:value=>ctx.view=value,setSavedStage:value=>ctx.stage=value,navigate:value=>ctx.destination=value,SignInOptions:()=>React.createElement('div',null,'Optional sign-in'),useState:initial=>[initial,value=>{ctx.notice=value;completeNotice(value);}],...overrides};
  compile(declaration('app/phone/ApplicationGuide.tsx','ApplicationGuide')+';globalThis.ApplicationGuide=ApplicationGuide;',ctx);
  return ctx;
}
const apply=nodes(tree,node=>ts.isJsxExpression(node)&&node.getText(tree).startsWith('{!checkingIdentity && !locked && tab === "apply"'))[0];assert(apply);
function appView(ctx){compile('globalThis.result=('+apply.expression.getText(tree)+');',ctx);return ctx.result;}
function descendants(node){if(!node||typeof node!=='object')return[];return[node,...React.Children.toArray(node.props?.children).flatMap(descendants)];}

test('the actual guest Apply route offers manual work before optional sign-in and resets stale Saved filters',()=>{
  for(const recordKind of ['none','bookmark','record']){
    const hasJobs=recordKind!=='none';
    const ctx=fixture('en',{jobs:recordKind==='bookmark'?[{id:'synthetic-job'}]:[],records:recordKind==='record'?[{identity:'https://example.com/job'}]:[],query:'old search',view:'followups',stage:'closed'});
    const view=appView(ctx),guide=descendants(view).find(node=>node.type===ctx.ApplicationGuide);assert(guide);
    const html=renderToStaticMarkup(view);assert(html.indexOf('Apply on the employer')<html.indexOf('Optional sign-in'));assert(!html.includes('Auto Apply unavailable'));
    guide.props.onJobs();assert.equal(ctx.destination,hasJobs?'saved':'search');assert.equal(ctx.query,'');assert.equal(ctx.view,'all');assert.equal(ctx.stage,'all');
    guide.props.onProfile();assert.equal(ctx.destination,'profile');
  }
});

test('guest guidance is localized, retains a real CV filename and does not label it as a submitted application',()=>{
  const ctx=fixture('ar');ctx.profile.resume={name:'Maya-CV-2026.pdf'};
  const html=renderToStaticMarkup(appView(ctx));
  for(const text of ['التقديم على موقع جهة العمل','مراجعة الملف الشخصي والسيرة الذاتية','Maya-CV-2026.pdf','لا يُعد تأكيدًا من جهة العمل'])assert(html.includes(text),text);
  assert(!html.includes('Check your CV'));assert(!html.includes('Submission confirmed'));
});

test('account revalidation and lock keep the complete Apply subtree, including CV metadata, hidden',()=>{
  for(const flag of ['checkingIdentity','locked']){
    const ctx=fixture('en',{[flag]:true});ctx.profile.resume={name:'private-synthetic.pdf'};
    assert.equal(renderToStaticMarkup(appView(ctx)),'');
  }
});

test('saved profile role shortcuts change only the explicit keyword field and never start a search',()=>{
  const expression=nodes(tree,node=>ts.isVariableDeclaration(node)&&node.name.getText(tree)==='savedRoleSuggestions')[0].initializer.getText(tree);
  const shortcut=nodes(tree,node=>ts.isJsxElement(node)&&node.openingElement.attributes.properties.some(p=>ts.isJsxAttribute(p)&&p.name.text==='className'&&p.initializer?.text==='phone-profile-search'))[0].getText(tree);
  const ctx=fixture('ar',{snapshot:{profile:{targetRoles:['  Analyst  ','Analyst','ممرّض','Designer','Sales','']}},filters:{query:'old',location:'Riyadh',remoteOnly:true,sources:['lever:global:synthetic']},setFilters:value=>ctx.changed=value});
  ctx.filterDraftRef = {current:ctx.filters}; ctx.snapshotRef = {current:ctx.snapshot};
  compile(declaration('app/phone/PhoneApp.tsx','editFilter')+';globalThis.savedRoleSuggestions='+expression+';globalThis.shortcut=('+shortcut+');',ctx);
  assert.deepEqual(Array.from(ctx.savedRoleSuggestions),['Analyst','ممرّض','Designer']);
  const buttons=descendants(ctx.shortcut).filter(node=>node.type==='button');assert.equal(buttons.length,3);
  buttons[1].props.onClick();assert.equal(ctx.changed.query,'ممرّض');assert.equal(ctx.changed.location,'Riyadh');assert.equal(ctx.changed.remoteOnly,true);assert.equal(ctx.changed.sources,ctx.filters.sources);
});

test('contact reuse exposes only chosen contact fields and copies the exact chosen value',async()=>{
  const writes=[];const ctx=fixture('en',{navigator:{clipboard:{writeText:async value=>{writes.push(value);}}}});
  ctx.profile={...ctx.profile,phone:'+966 50 123 4567',resume:{name:'private.pdf',dataBase64:'PRIVATE_PDF_BYTES'},targetRoles:['Private target']};
  compile(declaration('app/phone/ProfileReuse.tsx','ProfileReuse')+';globalThis.reuse=ProfileReuse({profile});',ctx);
  const html=renderToStaticMarkup(ctx.reuse);assert(!html.includes('PRIVATE_PDF_BYTES'));assert(!html.includes('Private target'));assert(!html.includes('private.pdf'));
  const button=descendants(ctx.reuse).find(node=>node.type==='button'&&node.props['aria-label']==='Copy Email');assert(button);button.props.onClick();await ctx.noticePromise;
  assert.deepEqual(writes,['maya@example.invalid']);assert.match(ctx.notice,/Copied/);
});

test('clipboard denial leaves selectable details available with a recovery message',async()=>{
  const ctx=fixture('ar',{navigator:{clipboard:{writeText:async()=>{throw Error('Synthetic denied');}}}});
  compile(declaration('app/phone/ProfileReuse.tsx','ProfileReuse')+';globalThis.reuse=ProfileReuse({profile});',ctx);
  const button=descendants(ctx.reuse).find(node=>node.type==='button');button.props.onClick();await ctx.noticePromise;
  assert.match(ctx.notice,/Copy is unavailable/);assert(renderToStaticMarkup(ctx.reuse).includes('maya@example.invalid'));assert.equal(ctx.profile.email,'maya@example.invalid');
});

test('job link accessible names retain the visible label, exact title and exact destination in both languages',()=>{
  for(const language of ['en','ar']){
    const ctx=fixture(language,{ArrowUpRight:icon,Bookmark:icon});
    ctx.job={title:'محلل / Analyst',company:'Synthetic employer',url:'https://example.com/careers/analyst?source=qa',location:'',sourceName:'Example board'};
    compile(declaration('app/phone/components.tsx','JobCard')+';globalThis.card=JobCard({job,saved:false,onDetails:()=>{}});',ctx);
    const anchor=descendants(ctx.card).find(node=>node.type==='a');assert(anchor);
    const visible=React.Children.toArray(anchor.props.children).filter(value=>typeof value==='string').join('').trim();
    assert(visible);assert(anchor.props['aria-label'].includes(visible));assert(anchor.props['aria-label'].includes(ctx.job.title));assert.equal(anchor.props.href,ctx.job.url);
    assert.equal(anchor.props.rel,'noopener noreferrer');
  }
});

// Exercise the real correction handler and edit function. The DOM port models
// removal of the focused confirmation button, as observed in the live browser.
function correctionFocusFixture(){
  const code=read('app/phone/components.tsx'),ast=ts.createSourceFile('components.tsx',code,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
  const component=nodes(ast,node=>ts.isFunctionDeclaration(node)&&node.name?.text==='RecordEditor')[0];
  const initializer=name=>nodes(component,node=>ts.isVariableDeclaration(node)&&node.name.getText(ast)===name)[0].initializer.getText(ast);
  const frames=[],focusCalls=[];
  const body={isConnected:true},html={isConnected:true},other={isConnected:true};
  const document={body,documentElement:html,activeElement:null,focused:true,hasFocus(){return this.focused;}};
  const dialog={open:true},form={isConnected:true,closest(selector){assert.equal(selector,'dialog');return dialog;},contains(node){return node.ownerForm===form;}};
  const field={isConnected:true,ownerForm:form,disabled:false,hidden:false,matches(selector){assert.equal(selector,':disabled');return this.disabled;},closest(selector){assert.equal(selector,'[hidden], [inert]');return this.hidden?form:null;},focus(options){focusCalls.push(options);document.activeElement=this;}};
  const button={isConnected:true,form,ownerDocument:document};document.activeElement=button;
  const record=Object.freeze({stage:'applied',note:'Saved note',followUpDate:'2026-11-30',appliedElsewhere:true});
  const ctx={record,draft:{...record,stage:'saved',note:'Unfinished note متابعة'},stageInput:{current:field},requestAnimationFrame:callback=>frames.push(callback),setDraft:value=>ctx.draft=value,onDraftChange:value=>ctx.reported=value,setConfirmClear:value=>ctx.confirm=value};
  compile('globalThis.edit='+initializer('edit')+';globalThis.keepAppliedRecord='+initializer('keepAppliedRecord')+';',ctx);
  const activate=()=>{ctx.keepAppliedRecord(button);button.isConnected=false;document.activeElement=body;};
  const flush=()=>{assert.equal(frames.length,1);frames.shift()();};
  return {document,body,html,other,dialog,form,field,button,record,ctx,focusCalls,activate,flush};
}

test('cancelling an applied-mark correction restores Stage after removal and preserves other draft fields',()=>{
  const h=correctionFocusFixture();h.activate();assert.equal(h.document.activeElement,h.body);assert.equal(h.focusCalls.length,0);
  assert.equal(h.ctx.draft.stage,'applied');assert.equal(h.ctx.draft.note,'Unfinished note متابعة');assert.equal(h.ctx.draft.followUpDate,'2026-11-30');assert.equal(h.ctx.draft.appliedElsewhere,true);assert.equal(h.ctx.confirm,false);
  h.flush();assert.equal(h.document.activeElement,h.field);assert.equal(h.focusCalls[0].preventScroll,false);assert.equal(h.record.note,'Saved note');
});

test('correction focus recovery leaves another chosen control, an inactive window and closed or replaced editors alone',()=>{
  for(const mode of ['other-focus','inactive','closed','removed-form','removed-field','moved-field','disabled','hidden']){
    const h=correctionFocusFixture();h.activate();
    if(mode==='other-focus')h.document.activeElement=h.other;
    if(mode==='inactive')h.document.focused=false;
    if(mode==='closed')h.dialog.open=false;
    if(mode==='removed-form')h.form.isConnected=false;
    if(mode==='removed-field')h.field.isConnected=false;
    if(mode==='moved-field')h.field.ownerForm={};
    if(mode==='disabled')h.field.disabled=true;
    if(mode==='hidden')h.field.hidden=true;
    const before=h.document.activeElement;h.flush();assert.equal(h.document.activeElement,before,mode);assert.equal(h.focusCalls.length,0,mode);
  }
});
