import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';

const source=await readFile(new URL('../app/phone/navigation-inset.ts',import.meta.url),'utf8');
const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const scope={exports:{}};vm.runInNewContext(code,scope);
const {observeNavigationInset}=scope.exports;
function style(){const values=new Map();return{getPropertyValue:name=>values.get(name)?.value??'',getPropertyPriority:name=>values.get(name)?.priority??'',setProperty(name,value,priority=''){values.set(name,{value,priority});},removeProperty(name){values.delete(name);}};}
function fixture({observer=true}={}){
 const viewport={style:style()},shell={style:style()},view=new EventTarget();let height=73,position='fixed',callback,disconnected=false;
 view.getComputedStyle=()=>({position});
 if(observer)view.ResizeObserver=class{constructor(fn){callback=fn;}observe(){}disconnect(){disconnected=true;}};
 const nav={ownerDocument:{documentElement:viewport,defaultView:view},parentElement:shell,getBoundingClientRect:()=>({height})};
 return{viewport,shell,nav,view,setLayout(nextHeight,nextPosition=position){height=nextHeight;position=nextPosition;},resizeObserver(){callback?.();},get disconnected(){return disconnected;}};
}

test('larger navigation and text reflow update both content spacing and viewport focus clearance',()=>{
 const f=fixture(),dispose=observeNavigationInset(f.nav);
 assert.equal(f.viewport.style.getPropertyValue('--phone-viewport-inset'),'73px');
 f.setLayout(109.59375);f.resizeObserver();
 assert.equal(f.viewport.style.getPropertyValue('--phone-viewport-inset'),'109.59375px');
 assert.equal(f.shell.style.getPropertyValue('--phone-nav-height'),'109.59375px');dispose();
});
test('desktop rail reserves no bottom inset and returning to mobile restores its measured height',()=>{
 const f=fixture(),dispose=observeNavigationInset(f.nav);
 f.setLayout(340,'sticky');f.view.dispatchEvent(new Event('resize'));
 assert.equal(f.viewport.style.getPropertyValue('--phone-viewport-inset'),'0px');
 f.setLayout(94,'fixed');f.view.dispatchEvent(new Event('resize'));
 assert.equal(f.viewport.style.getPropertyValue('--phone-viewport-inset'),'94px');dispose();
});
test('cleanup restores pre-existing inline values and priorities and ignores queued resize callbacks',()=>{
 const f=fixture();f.viewport.style.setProperty('--phone-viewport-inset','18px','important');f.shell.style.setProperty('--phone-nav-height','91px','important');
 const dispose=observeNavigationInset(f.nav);dispose();f.setLayout(180);f.resizeObserver();f.view.dispatchEvent(new Event('resize'));
 assert(f.disconnected);assert.equal(f.viewport.style.getPropertyValue('--phone-viewport-inset'),'18px');assert.equal(f.viewport.style.getPropertyPriority('--phone-viewport-inset'),'important');
 assert.equal(f.shell.style.getPropertyValue('--phone-nav-height'),'91px');assert.equal(f.shell.style.getPropertyPriority('--phone-nav-height'),'important');
});
test('resize fallback remains usable without ResizeObserver and clears owned styles on unmount',()=>{
 const f=fixture({observer:false}),dispose=observeNavigationInset(f.nav);
 f.setLayout(123);f.view.dispatchEvent(new Event('resize'));assert.equal(f.viewport.style.getPropertyValue('--phone-viewport-inset'),'123px');
 dispose();assert.equal(f.viewport.style.getPropertyValue('--phone-viewport-inset'),'');assert.equal(f.shell.style.getPropertyValue('--phone-nav-height'),'');
});
