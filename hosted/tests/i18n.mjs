import assert from 'node:assert/strict';
import test, {after} from 'node:test';
import {readFile,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {build} from 'esbuild';

const directory=await mkdtemp(join(tmpdir(),'career-languages-'));
// Finish every asynchronous fixture before registering tests or teardown.
// Otherwise Node can begin cleanup while a later top-level build is writing.
let core, catalog, render;
try {
 await build({entryPoints:['app/i18n/core.ts'],outfile:join(directory,'core.mjs'),bundle:true,platform:'node',format:'esm'});
 await build({entryPoints:['app/i18n/LocaleProvider.tsx'],outfile:join(directory,'locale.mjs'),bundle:true,platform:'node',format:'esm',jsx:'automatic'});
 await build({stdin:{contents:`import React from 'react';import{renderToStaticMarkup}from'react-dom/server';import LocaleProvider from './app/i18n/LocaleProvider';import LanguageSettings from './app/components/LanguageSettings';export function render(language){return renderToStaticMarkup(<LocaleProvider initialLanguage={language} initialPreference={language}><LanguageSettings/></LocaleProvider>)}`,resolveDir:process.cwd(),loader:'tsx'},outfile:join(directory,'render.cjs'),bundle:true,platform:'node',format:'cjs',jsx:'automatic'});
 core=await import(pathToFileURL(join(directory,'core.mjs')).href);
 catalog=JSON.parse(await readFile('app/i18n/messages.ar.json','utf8'));
 ({render}=await import(pathToFileURL(join(directory,'render.cjs')).href));
} catch (error) {
 await rm(directory,{recursive:true,force:true});
 throw error;
}
after(()=>rm(directory,{recursive:true,force:true}));
const unisolate=value=>value.replace(/[\u2068\u2069]/g,'');

test('language negotiation respects the dedicated preference, weighted device languages, and unsupported-language fallback',()=>{
 assert.equal(core.requestLanguage('session=private; career_finder_language=ar','en-US'),'ar');
 assert.equal(core.requestLanguage('career_finder_language=en','ar-SA'),'en');
 assert.equal(core.requestLanguage('career_finder_language=system','fr;q=1,ar-SA;q=.9,en;q=.8'),'ar');
 assert.equal(core.requestLanguage('session=ar','ar;q=0,en;q=.6'),'en');
 assert.equal(core.requestLanguage('career_finder_language=not-a-language','fr,de'),'en');
 assert.equal(core.preferredLanguage(['fr','ar-EG','en']),'ar');
 assert.equal(core.parsePreference('ar-SA'),'system');
});

test('every Arabic entry is nonempty and preserves the exact placeholder multiset',()=>{
 assert(Object.keys(catalog).length>1200);
 for(const [key,value] of Object.entries(catalog)){
  assert.equal(typeof value,'string',key);assert(value.trim(),key);
  assert.deepEqual((value.match(/\{\d+\}/g)||[]).sort(),(key.match(/\{\d+\}/g)||[]).sort(),key);
 }
});

test('unknown and prototype-looking keys remain safe, while specific templates preserve inserted data byte-for-byte',()=>{
 for(const value of ['constructor','toString','__proto__','A new untranslated message'])assert.equal(core.translate(value,'ar'),value);
 const text='A  B\n{0}';
 assert.equal(unisolate(core.translate('{0} copied.','ar',[text])),catalog['{0} copied.'].replace('{0}',text));
 assert.equal(unisolate(core.translate('A  B\nC copied.','ar')),catalog['{0} copied.'].replace('{0}','A  B\nC'));
 const exact='Connect {0} to this Career Finder account';
 assert.equal(unisolate(core.translate('Connect Google to this Career Finder account','ar')),catalog[exact].replace('{0}','Google'));
 const oversized='x'.repeat(17000)+' copied.';assert.equal(core.translate(oversized,'ar'),oversized);
 assert.equal(core.translate('Use {0}','en',['person@example.com']),'Use person@example.com');
});

test('Arabic counts have zero, one, dual, few, many forms and display Gregorian dates',()=>{
 assert.equal(core.savedJobsLabel(0,'ar'),'لا توجد وظائف محفوظة');
 assert.equal(core.savedJobsLabel(1,'ar'),'وظيفة محفوظة واحدة');
 assert.equal(core.savedJobsLabel(2,'ar'),'وظيفتان محفوظتان');
 assert.match(core.savedJobsLabel(3,'ar'),/٣ وظائف/);assert.match(core.savedJobsLabel(11,'ar'),/١١ وظيفة/);
 assert.equal(core.savedJobsLabel(1,'en'),'1 saved job');assert.equal(core.savedJobsLabel(2,'en'),'2 saved jobs');
 for(const [count,label] of [[0,'لا توجد وظائف'],[1,'وظيفة واحدة'],[2,'وظيفتان'],[3,'٣ وظائف'],[10,'١٠ وظائف'],[11,'١١ وظيفة'],[99,'٩٩ وظيفة'],[100,'١٠٠ وظيفة'],[102,'١٠٢ وظيفة']]) assert.equal(core.jobsLabel(count,'ar'),label);
 assert.equal(core.jobsLabel(1,'en'),'1 job');assert.equal(core.jobsLabel(2,'en'),'2 jobs');
 assert.match(core.formatDateTime('2026-11-17T12:00:00Z','ar'),/٢٠٢٦/);
 assert.equal(core.formatDateTime('invalid','ar'),catalog['Date unavailable']);
});

let moduleVersion=0;
async function fixture({denyWrite=false}={}){
 const values=new Map(),writes=[],window=new EventTarget(),document={cookie:'',documentElement:{lang:'en',dir:'ltr'}};
 window.localStorage={getItem:key=>values.get(key)??null,setItem(key,value){if(denyWrite)throw Error('Synthetic denied storage');values.set(key,value);writes.push([key,value]);}};
 const saved={window:globalThis.window,document:globalThis.document,navigator:Object.getOwnPropertyDescriptor(globalThis,'navigator')};
 globalThis.window=window;globalThis.document=document;Object.defineProperty(globalThis,'navigator',{value:{languages:['ar-SA','en'],language:'ar-SA'},configurable:true});
 const localeModule=await import(pathToFileURL(join(directory,'locale.mjs')).href+'?case='+moduleVersion++);
 return{module:localeModule,values,writes,window,document,restore(){globalThis.window=saved.window;globalThis.document=saved.document;if(saved.navigator)Object.defineProperty(globalThis,'navigator',saved.navigator);else delete globalThis.navigator;}};
}
test('language persistence writes only the independent preference and cookie, including cross-tab clearing',async()=>{
 const f=await fixture();try{
  assert.equal(f.module.getLanguage(),'ar');let events=0;const dispose=f.module.subscribeLanguage(()=>events++);
  assert.equal(f.module.setLanguagePreference('en'),true);assert.equal(f.document.documentElement.lang,'en');assert.equal(f.document.documentElement.dir,'ltr');
  assert.deepEqual(f.writes,[[core.LANGUAGE_KEY,'en']]);assert.match(f.document.cookie,/^career_finder_language=en;/);
  const unrelated=new Event('storage');Object.defineProperties(unrelated,{key:{value:'account-cache'},newValue:{value:'ar'}});f.window.dispatchEvent(unrelated);assert.equal(f.module.getLanguage(),'en');
  const clear=new Event('storage');Object.defineProperties(clear,{key:{value:null},newValue:{value:null}});f.window.dispatchEvent(clear);
  assert.equal(f.module.getLanguage(),'ar');assert.equal(f.document.documentElement.dir,'rtl');assert.match(f.document.cookie,/^career_finder_language=system;/);assert(events>=2);dispose();
 }finally{f.restore();}
});
test('blocked storage still changes this visit without claiming persistence',async()=>{
 const f=await fixture({denyWrite:true});try{assert.equal(f.module.setLanguagePreference('en'),false);assert.equal(f.module.getLanguage(),'en');assert.equal(f.document.documentElement.dir,'ltr');assert.equal(f.writes.length,0);}finally{f.restore();}
});

test('the actual language control renders Arabic or English on the server with the correct selected preference',()=>{
 const ar=render('ar'),en=render('en');assert.match(ar,/اللغة/);assert.match(en,/Language/);
 assert.match(ar,/value="ar"[^>]*checked=""|checked=""[^>]*value="ar"/);
 assert.match(en,/value="en"[^>]*checked=""|checked=""[^>]*value="en"/);
 assert.match(ar,/lang="en"[^>]*>English/);assert.match(en,/lang="ar" dir="rtl"[^>]*>العربية/);
});
