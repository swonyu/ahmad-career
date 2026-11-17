import assert from 'node:assert/strict';
import test,{after} from 'node:test';
import {readFile,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import vm from 'node:vm';
import {build} from 'esbuild';

const directory=await mkdtemp(join(tmpdir(),'career-web-experience-'));
after(()=>rm(directory,{recursive:true,force:true}));
await build({entryPoints:['app/components/appearance.ts'],outfile:join(directory,'appearance.mjs'),bundle:true,platform:'node',format:'esm'});
const earlyTheme=await readFile('public/theme-init.js','utf8');
const key='career-finder:appearance:v1';
let version=0;
async function themeFixture({saved=null,denyRead=false,denyWrite=false}={}) {
  const stored=new Map(saved===null?[]:[[key,saved]]),writes=[],window=new EventTarget(),document={documentElement:{dataset:{}}};
  window.localStorage={getItem(name){if(denyRead)throw Error('Storage unavailable');return stored.get(name)??null;},setItem(name,value){if(denyWrite)throw Error('Storage unavailable');writes.push([name,value]);stored.set(name,value);}};
  const module=await import(pathToFileURL(join(directory,'appearance.mjs')).href+'?fixture='+version++);
  const before={window:globalThis.window,document:globalThis.document};globalThis.window=window;globalThis.document=document;
  return{module,window,document,stored,writes,restore(){globalThis.window=before.window;globalThis.document=before.document;}};
}

test('early theme initialization applies only recognized preferences and follows the device when storage is unavailable',()=>{
  for(const [stored,expected] of [['dark','dark'],['light','light'],['system',undefined],['invalid-value',undefined],[null,undefined]]){
    const document={documentElement:{dataset:{theme:'stale'}}};
    vm.runInNewContext(earlyTheme,{document,localStorage:{getItem:name=>{assert.equal(name,key);return stored;}}});
    assert.equal(document.documentElement.dataset.theme,expected);
    assert.equal(document.documentElement.dataset.appearance,expected??'system');
  }
  const document={documentElement:{dataset:{}}};
  vm.runInNewContext(earlyTheme,{document,localStorage:{getItem(){throw Error('Blocked')}}});
  assert.equal(document.documentElement.dataset.appearance,'system');assert.equal(document.documentElement.dataset.theme,undefined);
});

test('appearance is immediately applied, persisted independently of accounts and cleared to System without forcing a color',async()=>{
  const f=await themeFixture();try{
    let updates=0;const dispose=f.module.subscribeAppearance(()=>updates++);
    assert.equal(f.module.getAppearance(),'system');
    assert.equal(f.module.setAppearance('dark'),true);assert.equal(f.document.documentElement.dataset.theme,'dark');assert.equal(f.stored.get(key),'dark');
    assert.equal(f.module.setAppearance('light'),true);assert.equal(f.document.documentElement.dataset.theme,'light');
    assert.equal(f.module.setAppearance('system'),true);assert.equal(f.document.documentElement.dataset.theme,undefined);
    assert.deepEqual(f.writes.map(([name])=>name),[key,key,key]);assert(updates>=4);dispose();
  }finally{f.restore();}
});

test('blocked persistence retains the chosen theme for this visit and reports that it was not saved',async()=>{
  const f=await themeFixture({denyRead:true,denyWrite:true});try{
    assert.equal(f.module.setAppearance('dark'),false);assert.equal(f.module.getAppearance(),'dark');assert.equal(f.document.documentElement.dataset.theme,'dark');assert.equal(f.writes.length,0);
  }finally{f.restore();}
});

test('another tab changing or clearing appearance updates this page; unrelated storage never changes it',async()=>{
  const f=await themeFixture({saved:'dark'});try{
    let updates=0;const dispose=f.module.subscribeAppearance(()=>updates++);
    f.module.setAppearance('light');const previous=updates;
    const unrelated=new Event('storage');Object.defineProperty(unrelated,'key',{value:'unrelated'});f.window.dispatchEvent(unrelated);assert.equal(updates,previous);
    f.stored.set(key,'dark');const changed=new Event('storage');Object.defineProperty(changed,'key',{value:key});f.window.dispatchEvent(changed);
    assert.equal(f.module.getAppearance(),'dark');assert.equal(f.document.documentElement.dataset.theme,'dark');
    f.stored.clear();const cleared=new Event('storage');Object.defineProperty(cleared,'key',{value:null});f.window.dispatchEvent(cleared);
    assert.equal(f.module.getAppearance(),'system');assert.equal(f.document.documentElement.dataset.theme,undefined);dispose();
  }finally{f.restore();}
});

// Render the actual sign-in component with React's real server renderer. Only
// status transport and the standalone image adapter are substituted at build
// time. No network, account login, provider consent or navigation is performed.
await build({stdin:{contents:`import React from 'react';import{renderToStaticMarkup}from'react-dom/server';import SignInOptions from './app/components/SignInOptions';export function render(status){globalThis.__careerSignInFixture=status;return renderToStaticMarkup(React.createElement(SignInOptions,{destination:'phone'}));}`,resolveDir:process.cwd(),loader:'tsx'},outfile:join(directory,'signin.cjs'),bundle:true,platform:'node',format:'cjs',plugins:[{name:'synthetic-signin-status',setup(builder){
  builder.onResolve({filter:/^\.\/provider-auth$/},()=>({path:'synthetic-status',namespace:'fixture'}));
  builder.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:`export function useAuthStatus(){return{...globalThis.__careerSignInFixture,refresh:()=>Promise.resolve()}};export function internalAuthRedirect(){throw Error('No navigation in renderer fixture')}`,loader:'js'}));
  builder.onResolve({filter:/^next\/image$/},()=>({path:'synthetic-image',namespace:'image'}));
  builder.onLoad({filter:/.*/,namespace:'image'},()=>({contents:`import React from 'react';export default function Image({unoptimized,...props}){return React.createElement('img',props)}`,loader:'jsx',resolveDir:process.cwd()}));
}}]});
const {render}=await import(pathToFileURL(join(directory,'signin.cjs')).href);
const state=providers=>({status:{providers},checking:false,error:null,errorCode:null});
const link=(html,provider)=>new RegExp('<a[^>]+href="/auth/'+provider+'/start\\?return_to=%2Fphone"').test(html);

test('configured Google and supported LinkedIn expose their own real start routes',()=>{
  const html=render(state({google:{configured:true,signInSupported:true},linkedin:{configured:true,signInSupported:true}}));
  assert(link(html,'google'));assert(link(html,'linkedin'));assert.match(html,/href="\/signin-with-chatgpt\?return_to=%2Fphone"/);
});
test('missing configuration and an older link-only backend cannot expose a fake direct-provider login',()=>{
  for(const linkedin of [{configured:false,signInSupported:true},{configured:true},{configured:true,signInSupported:false}]){
    const html=render(state({google:{configured:false},linkedin}));assert(!link(html,'google'));assert(!link(html,'linkedin'));assert.match(html,/Awaiting service setup/);assert.match(html,/disabled=""/);
  }
});
test('unconfirmed or failed provider status keeps provider choices disabled and offers an honest retry',()=>{
  for(const fixture of [{status:null,checking:true,error:null},{status:null,checking:false,error:'Synthetic unavailable'}]){
    const html=render(fixture);assert(!link(html,'google'));assert(!link(html,'linkedin'));assert.match(html,/Continue with ChatGPT/);
    assert.match(html,fixture.checking?/Checking availability/:/Availability could not be confirmed/);
  }
});

function luminance(hex){return hex.slice(1).match(/../g).map(part=>parseInt(part,16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((sum,v,index)=>sum+v*[.2126,.7152,.0722][index],0);}
function contrast(a,b){const [lighter,darker]=[luminance(a),luminance(b)].sort((a,b)=>b-a);return(lighter+.05)/(darker+.05);}
test('both actual palettes retain normal-text, action-text and input-boundary contrast',async()=>{
  const css=await readFile('app/globals.css','utf8');
  for(const selector of [':root',':root[data-theme="dark"]']){
    const rule=css.slice(css.indexOf(selector+'{')+selector.length+1).split('}')[0];const tokens=Object.fromEntries([...rule.matchAll(/(--[a-z-]+):(#[a-f0-9]{6})/g)].map(([,name,value])=>[name,value]));
    for(const [foreground,background] of [['--ink','--bg'],['--ink','--surface'],['--muted','--surface'],['--accent','--surface'],['--accent-ink','--accent'],['--danger','--danger-bg'],['--danger-ink','--danger']])assert(contrast(tokens[foreground],tokens[background])>=4.5,`${selector} ${foreground}/${background}`);
    assert(contrast(tokens['--field-border'],tokens['--surface'])>=3,`${selector} input boundary`);
  }
});
