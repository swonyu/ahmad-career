import assert from 'node:assert/strict';
import { productionRead } from './phone-read-test-helpers.mjs';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';

// Execute the actual initial-loading handler and render the actual Settings
// subtree. Public child components/icons are reduced to placeholders so this
// test isolates the visibility boundary; browser fixture covers mounted React.
const source=await readFile(new URL('../app/phone/PhoneApp.tsx',import.meta.url),'utf8');
const tree=ts.createSourceFile('PhoneApp.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
let settings,initialLoad,identityWarning;
function visit(node){
 if(ts.isJsxExpression(node)&&node.getText(tree).startsWith('{checkingIdentity && <section'))identityWarning=node.expression.getText(tree);
 if(ts.isJsxElement(node)&&node.openingElement.attributes.properties.some(prop=>ts.isJsxAttribute(prop)&&prop.name.text==='className'&&prop.initializer&&ts.isStringLiteral(prop.initializer)&&prop.initializer.text==='phone-settings-grid'))settings=node.getText(tree);
 if(ts.isFunctionDeclaration(node)&&node.name?.text==='start')initialLoad=node.getText(tree);
 ts.forEachChild(node,visit);
}
visit(tree);assert(settings);assert(initialLoad);assert(identityWarning);
const renderCode=ts.transpileModule('globalThis.renderSettings=()=><>{'+identityWarning+'}{'+settings+'}</>;',{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None,jsx:ts.JsxEmit.React}}).outputText;
const startCode=ts.transpileModule('globalThis.start='+initialLoad,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText;
function context(overrides={}){
 const account={id:'synthetic-settings-a',email:'private-synthetic-a@example.com',name:'Synthetic A'};
 const values={...productionRead,React,identityUnverified:{current:false},controller:new AbortController(),notice:null,recoveryURL:null,identityCheckRef:{current(){}},t:(source,values=[])=>source.replace(/\{(\d+)\}/g,(_,index)=>String(values[Number(index)]??"")),account,workspace:null,snapshot:null,loading:false,checkingIdentity:false,locked:false,busy:'',formChanged:false,olderDrafts:[],installPrompt:null,tab:'settings',epoch:{current:1},generation:1,cancelled:false,workspaceRef:{current:null},workspaceSchema:{parse:value=>value},window:{location:{reload(){}}},message:error=>error.message,...overrides};
 for(const name of ['UserRound','ChevronRight','ArrowRight','Download','RefreshCw','Trash2','HelpCircle','ArrowUpRight'])values[name]=()=>null;
 values.LanguageSettings=function PublicLanguage(){return React.createElement('div',null,'Public language');};
 values.ThemeSettings=function PublicAppearance(){return React.createElement('div',null,'Public appearance');};
 values.SignInOptions=function PublicSignIn(){return React.createElement('div',null,'Public sign-in');};
 values.ProviderConnections=function PrivateConnections(props){return React.createElement('div',{'data-private-connection':props.accountId},'Private connection controls');};
 values.SignOutButton=function PrivateSignOut(){return React.createElement('button',null,'Private sign-out');};
 values.setCheckingIdentity=value=>values.checkingIdentity=value;values.setLoading=value=>values.loading=value;values.setNotice=value=>values.notice=value;
 vm.createContext(values);vm.runInContext(renderCode,values);vm.runInContext(startCode,values);
 return values;
}
function markup(values){return renderToStaticMarkup(values.renderSettings());}

test('failed initial account check cannot reveal the earlier server-rendered email or account controls',async()=>{
 for(const status of [401,503]){
  const values=context({loading:true,phoneAPI:async()=>{const error=new Error('Synthetic current-account check failed');error.status=status;throw error;}});
  await values.start();assert.equal(values.loading,false);assert.match(values.notice.text,/Synthetic current-account check failed/);
  const html=markup(values);assert(!html.includes(values.account.email),'An unconfirmed server-rendered email must remain hidden');assert(!html.includes('data-private-connection'));assert(!html.includes('Private sign-out'));
  assert.match(html,/Public appearance/);assert.match(html,/Confirming your account/);assert.match(html,/Check account again/);assert.equal(values.identityUnverified.current,true);assert.equal(values.checkingIdentity,true);
 }
});
test('only the confirmed matching account may show private Settings',()=>{
 const account={id:'synthetic-settings-a',email:'private-synthetic-a@example.com',name:'Synthetic A'};
 for(const workspace of [null,{accountId:'synthetic-settings-b'}])assert(!markup(context({account,workspace})).includes(account.email));
 const html=markup(context({account,workspace:{accountId:account.id}}));assert(html.includes(account.email));assert(html.includes('data-private-connection="'+account.id+'"'));assert(html.includes('Private sign-out'));
});
test('loading, revalidation and locked Settings retain public appearance and hide private identity',()=>{
 for(const flag of ['loading','checkingIdentity','locked']){
  const values=context({workspace:{accountId:'synthetic-settings-a'},[flag]:true}),html=markup(values);
  assert(!html.includes(values.account.email));assert(!html.includes('data-private-connection'));assert(!html.includes('Private sign-out'));assert.match(html,/Public appearance/);
 }
 const guest=markup(context({account:null}));assert.match(guest,/Public sign-in/);assert(!guest.includes('private-synthetic'));assert(!guest.includes('data-private-connection'));
});
