import assert from 'node:assert/strict';
import test, {after} from 'node:test';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {build} from 'esbuild';

const directory=await mkdtemp(join(tmpdir(),'career-provider-connections-'));
after(()=>rm(directory,{recursive:true,force:true}));
await build({entryPoints:['app/components/provider-change.ts'],outfile:join(directory,'change.mjs'),bundle:true,platform:'node',format:'esm'});
await build({entryPoints:['app/components/provider-auth.ts'],outfile:join(directory,'auth.mjs'),bundle:true,platform:'node',format:'esm'});
const {captureDisconnect,matchesDisconnect,createProviderChanges}=await import(pathToFileURL(join(directory,'change.mjs')).href);
const {authStatusSchema}=await import(pathToFileURL(join(directory,'auth.mjs')).href);
const connectionA='a'.repeat(64),connectionB='b'.repeat(64);
const googleURL='https://accounts.google.com/o/oauth2/v2/auth?state=synthetic';
const view=()=>({accountId:'synthetic-owner-a',revision:1,verified:true,connections:{google:null,linkedin:connectionA}});
function fixture(){
 let current=view(),revision=current.revision,visible=true;const calls=[];
 const controller=createProviderChanges(current,(path,options)=>new Promise((resolve,reject)=>calls.push({path,options,resolve,reject})),{currentRevision:()=>revision,visible:()=>visible});
 return {controller,calls,get current(){return current},set current(value){current=value;revision=value.revision;controller.update(value)},revalidate(){revision++},hide(){visible=false},show(){visible=true}};
}

test('verified connect returns only the official provider authorization URL and expected account',async()=>{
 const f=fixture(),pending=f.controller.change('google');
 assert.equal(f.calls.length,1);assert.deepEqual(f.calls[0].options.body,{provider:'google',expectedAccountId:'synthetic-owner-a'});
 f.calls[0].resolve({ok:true,authorizationUrl:googleURL});assert.deepEqual(await pending,{kind:'connect',authorizationUrl:googleURL});
 assert.equal(f.controller.busyProvider(),null);
});
test('pending connect is aborted and its already completed reply ignored after card unmount',async()=>{
 const f=fixture(),pending=f.controller.change('google');f.controller.close();
 assert.equal(f.calls[0].options.signal.aborted,true);f.calls[0].resolve({ok:true,authorizationUrl:googleURL});
 assert.equal(await pending,null);assert.equal(await f.controller.change('google'),null);
});
test('pending disconnect is not confirmed after card unmount',async()=>{
 const f=fixture(),target=captureDisconnect(f.current,'linkedin'),pending=f.controller.change('linkedin',target);f.controller.close();
 f.calls[0].resolve({ok:true});assert.equal(await pending,null);
});
test('a synchronous identity recheck suppresses a late reply before React rerenders',async()=>{
 const f=fixture(),pending=f.controller.change('google');f.revalidate();
 f.calls[0].resolve({ok:true,authorizationUrl:googleURL});assert.equal(await pending,null);
});
test('hidden page cannot navigate or present a successful mutation',async()=>{
 for(const provider of ['google','linkedin']){
  const f=fixture(),pending=f.controller.change(provider,provider==='linkedin'?captureDisconnect(f.current,provider):undefined);f.hide();
  f.calls[0].resolve({ok:true,authorizationUrl:googleURL});assert.equal(await pending,null);
 }
});
test('account switch cancels earlier work and preserves the new account view',async()=>{
 const f=fixture(),pending=f.controller.change('google');f.current={...view(),accountId:'synthetic-owner-b',revision:2};
 assert.equal(f.calls[0].options.signal.aborted,true);f.calls[0].resolve({ok:true,authorizationUrl:googleURL});assert.equal(await pending,null);
 assert.equal(f.current.accountId,'synthetic-owner-b');
});
test('disconnect sends the exact connection and revision captured by its confirmation',async()=>{
 const f=fixture(),target=captureDisconnect(f.current,'linkedin'),pending=f.controller.change('linkedin',target);
 assert.deepEqual(f.calls[0].options.body,{provider:'linkedin',expectedAccountId:'synthetic-owner-a',expectedConnectionId:connectionA});
 f.calls[0].resolve({ok:true});assert.deepEqual(await pending,{kind:'disconnect'});
});
test('relink in the same account cannot reuse a confirmation for the former connection',async()=>{
 const f=fixture(),target=captureDisconnect(f.current,'linkedin');
 f.current={...view(),connections:{google:null,linkedin:connectionB}};
 assert.equal(matchesDisconnect(f.current,target),false);
 await assert.rejects(f.controller.change('linkedin',target),/connection changed/);assert.equal(f.calls.length,0);
});
test('identity refresh invalidates even a same-account same-connection confirmation',async()=>{
 const f=fixture(),target=captureDisconnect(f.current,'linkedin');f.current={...view(),revision:2};
 assert.equal(matchesDisconnect(f.current,target),false);
 await assert.rejects(f.controller.change('linkedin',target),/connection changed/);assert.equal(f.calls.length,0);
});
test('a relink observed while disconnect is in flight cannot produce success for its replacement',async()=>{
 const f=fixture(),target=captureDisconnect(f.current,'linkedin'),pending=f.controller.change('linkedin',target);
 f.current={...view(),connections:{google:null,linkedin:connectionB}};f.calls[0].resolve({ok:true});assert.equal(await pending,null);
});
test('double activation cannot send a second request before React updates its busy state',async()=>{
 const f=fixture(),first=f.controller.change('google'),second=await f.controller.change('google');assert.equal(second,null);assert.equal(f.calls.length,1);
 f.calls[0].resolve({ok:true,authorizationUrl:googleURL});assert.equal((await first).kind,'connect');
});
test('effect cleanup and setup replay cannot revive the earlier request or disable the new card',async()=>{
 const f=fixture(),old=f.controller.change('google');f.controller.close();f.controller.open();
 const next=f.controller.change('google');assert.equal(f.calls.length,2);
 f.calls[0].resolve({ok:true,authorizationUrl:googleURL});assert.equal(await old,null);assert.equal(f.controller.busyProvider(),'google');
 f.calls[1].resolve({ok:true,authorizationUrl:googleURL});assert.equal((await next).kind,'connect');
});
test('current failures remain errors, obsolete failures are suppressed, and invalid destinations never navigate',async()=>{
 const f=fixture(),first=f.controller.change('google');f.calls[0].reject(Error('synthetic unavailable'));
 await assert.rejects(first,/synthetic unavailable/);
 const second=f.controller.change('google');f.controller.close();f.calls[1].reject(Error('obsolete error'));assert.equal(await second,null);
 f.controller.open();const third=f.controller.change('google');f.calls[2].resolve({ok:true,authorizationUrl:'https://evil.example/'});await assert.rejects(third,/could not be verified/);
});
test('unverified, missing or mismatched disconnect targets never send a mutation',async()=>{
 const f=fixture();assert.throws(()=>captureDisconnect({...view(),verified:false},'linkedin'),/current connection/);assert.throws(()=>captureDisconnect(view(),'google'),/current connection/);
 await assert.rejects(f.controller.change('google',captureDisconnect(view(),'linkedin')),/connection changed/);
 f.current={...view(),verified:false};await assert.rejects(f.controller.change('google'),/Confirm this account/);assert.equal(f.calls.length,0);
});
test('connected-provider responses require an opaque generation without treating it as a credential',()=>{
 const disconnected={configured:true,connected:false},connected={configured:true,connected:true,connectionId:connectionA};
 const account={id:'synthetic-owner-a',email:'a@example.com',displayName:'Synthetic A',method:'chatgpt'};
 assert.equal(authStatusSchema.parse({ok:true,account,providers:{google:disconnected,linkedin:connected}}).providers.linkedin.connectionId,connectionA);
 for(const connectionId of [undefined,'','a'.repeat(63),'A'.repeat(64),'bearer synthetic'])assert.throws(()=>authStatusSchema.parse({ok:true,account,providers:{google:disconnected,linkedin:{...connected,connectionId}}}));
 assert.doesNotThrow(()=>authStatusSchema.parse({ok:true,account:null,providers:{google:disconnected,linkedin:disconnected}}));
});
