// Test-only workerd entry. This file is never imported by the production worker.
// The trusted-edge adapter models Sites stripping inbound identity headers and
// supplying its own identity. It does not verify that behavior on the live Site.
import {createHostedApplicationHandler,SERVICE_ORIGIN} from '../../server/applications.mjs';
import {makeAdapter} from '../../server/provider.mjs';
import {sha256} from '../../server/validation.mjs';

// A deterministic synthetic clock avoids workerd's epoch-valued module-start clock.
let time=Date.UTC(2026,0,1),providerGets=0,storageReads=0,storageWrites=0;
const posts=[];
const accounts={
  a:{id:'phone-synthetic-a',email:'a@example.com'},
  b:{id:'phone-synthetic-b',email:'b@example.com'},
  changedB:{id:'phone-synthetic-b',email:'changed-b@example.com'},
  unopened:{id:'phone-synthetic-unopened',email:'unopened@example.com'},
};
const postingId=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const config={version:1,connectors:[{provider:'lever',region:'global',site:'phone-fixture',apiKeyEnv:'CAREER_PHONE_FIXTURE_KEY',postings:Object.fromEntries([1,2,3,4,5,6,7,8].map(n=>[postingId(n),{
  revision:'phone-synthetic-v1',reviewedAt:new Date(time-1000).toISOString(),expiresAt:new Date(time+86400000).toISOString(),hasCustomQuestions:false,
  requiredFields:['name','email','resume','urls','consentStore','consentMarketing'],privacyPolicyUrl:'https://example.com/privacy',
}]))}]};
async function fixtureFetch(address,options={}){
  const url=new URL(address),id=url.pathname.split('/').at(-1);
  if(url.hostname!=='api.lever.co'||!url.pathname.startsWith('/v0/postings/phone-fixture/'))throw Error('Unexpected synthetic provider target');
  if(options.method!=='POST'){
    providerGets++;
    return Response.json({id,text:'Synthetic phone job '+id,categories:{location:'Remote'},country:'SA',descriptionPlain:'Synthetic phone application fixture'});
  }
  const form=options.body,pdf=new Uint8Array(await form.get('resume').arrayBuffer());
  posts.push({postingId:id,name:form.get('name'),email:form.get('email'),linkedin:form.get('urls[LinkedIn]'),portfolio:form.get('urls[Portfolio]'),consentStore:form.get('consent[store]'),consentMarketing:form.get('consent[marketing]'),resumeSHA256:sha256(pdf)});
  if(id===postingId(2))throw Error('Synthetic ambiguous provider transport');
  return Response.json({ok:true,applicationId:'synthetic-phone-'+id});
}
const handle=createHostedApplicationHandler({clock:()=>time,adapterFactory:env=>({...makeAdapter(env,{fetchImpl:fixtureFetch}),mode:'test'})});
const phoneRuntime = {
  async fetch(request,env,ctx){
    const url=new URL(request.url);
    if(url.pathname==='/__fixture/state')return Response.json({posts,providerGets,storageReads,storageWrites});
    time+=1500;
    const headers=new Headers(request.headers),actor=headers.get('x-fixture-actor'),disabled=headers.get('x-fixture-disable-provider')==='true';
    for(const name of [...headers.keys()])if(name.startsWith('oai-authenticated-user-')||name.startsWith('x-fixture-'))headers.delete(name);
    const identity=accounts[actor];
    if(identity){headers.set('oai-authenticated-user-id',identity.id);headers.set('oai-authenticated-user-email',identity.email)}
    headers.set('host',new URL(SERVICE_ORIGIN).host);
    const adapted=new Request(SERVICE_ORIGIN+url.pathname+url.search,new Request(request,{headers}));
    const observedBucket=new Proxy(env.BUCKET,{
      get(target,key){
        const value=target[key];if(typeof value!=='function')return value;
        return(...args)=>{
          if(['get','head','list'].includes(key))storageReads++;
          if(['put','delete'].includes(key))storageWrites++;
          return value.apply(target,args);
        };
      },
    });
    const bindings={...env,BUCKET:observedBucket,CAREER_CONNECTORS_JSON:JSON.stringify(config),...(disabled?{}:{CAREER_PHONE_FIXTURE_KEY:'synthetic-only-no-real-credential'})};
    return await handle(adapted,bindings,ctx)??Response.json({error:'fixture-route-not-found'},{status:404});
  },
};
export default phoneRuntime;
