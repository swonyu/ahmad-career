// Run from any directory with: node /path/to/career-site/state-check.mjs
// Executes the real application and event listeners in an isolated DOM/storage stub.
// No network requests, browser UI, application submissions, or production writes.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const scripts = ['core.js', 'data.js', 'app.js'].map(name => ({
  name,
  source: readFileSync(new URL(`./web/${name}`, import.meta.url), 'utf8'),
}));

function createApp(initialStorage = new Map(), options = {}) {
  const storage = options.shared ? initialStorage : new Map(initialStorage);
  const listeners = new Map();
  const elements = new Map();
  const toasts = [];
  const downloads = [];
  const failKeys = new Set();
  let writesFail = false;

  function element(selector) {
    if (elements.has(selector)) return elements.get(selector);
    const classes = new Set();
    let text = '';
    const node = {
      innerHTML: '', value: '', dataset: {}, open: false,
      classList: {
        add: value => classes.add(value),
        remove: value => classes.delete(value),
        contains: value => classes.has(value),
        toggle(value, force) {
          const add = force ?? !classes.has(value);
          if (add) classes.add(value); else classes.delete(value);
          return add;
        },
      },
      get textContent() { return text; },
      set textContent(value) {
        text = String(value);
        if (selector === '#toast') toasts.push(text);
      },
      setAttribute(name,value) { this[name]=String(value); },
      getAttribute(name) { return this[name]??null; },
      addEventListener() {},
      showModal() { this.open = true; },
      close() { this.open = false; },
      click() {}, select() {}, focus() {},
    };
    elements.set(selector, node);
    return node;
  }

  class TestURL extends URL {
    static createObjectURL(blob) { downloads.push(blob); return 'blob:state-check'; }
    static revokeObjectURL() {}
  }

  const context = vm.createContext({
    console, URL: TestURL, Blob, Intl, Date, AbortSignal,
    FormData: class { constructor(form) { this.values=form.values; } get(key) { return this.values[key]??null; } },
    confirm: () => false,
    setTimeout: () => 1, clearTimeout() {},
    scrollTo() {}, navigator: {locks: options.locks}, location: { protocol: 'https:' },
    fetch: options.fetch || (() => { throw new Error('Unexpected network request in state regression checks'); }),
    document: {
      body: element('body'),
      querySelector: element,
      querySelectorAll: () => [],
      createElement: tag => element(`created:${tag}`),
      addEventListener(type, callback) {
        if (!listeners.has(type)) listeners.set(type, []);
        listeners.get(type).push(callback);
      },
    },
    localStorage: {
      getItem: key => { const value=storage.get(key) ?? null; options.afterRead?.(key); return value; },
      setItem(key, value) {
        if (writesFail || failKeys.has(key)) throw new Error('Simulated storage quota failure');
        storage.set(key, String(value));
      },
    },
  });
  context.window = context;
  for (const { name, source } of scripts) {
    vm.runInContext(source, context, { filename: name });
    if(name==='data.js'&&options.bundle)vm.runInContext('globalThis.CAREER_DATA='+JSON.stringify(options.bundle),context);
  }
  const evaluate = source => vm.runInContext(source, context);
  return {
    storage, toasts, downloads, failKeys, evaluate,
    async dispatch(type, target) { for (const fn of listeners.get(type) || []) await fn({target, preventDefault(){}}); },
    failAllWrites() { writesFail = true; },
    json(source) { return JSON.parse(evaluate(`JSON.stringify(${source})`)); },
    receive(payload) { return context.receiveNativeJobs(payload); },
    changeStatus(id, value) {
      for (const callback of listeners.get('change') || []) {
        callback({ target: { id: '', dataset: { status: id }, value } });
      }
    },
    toggleSaved(id) { return evaluate(`toggleSaved(${JSON.stringify(id)})`); },
    async exportNotes() {
      evaluate('exportNotes()');
      assert.ok(downloads.length, 'Export must create a downloadable notes blob');
      return downloads.at(-1).text();
    },
  };
}

const role = {
  id: 'state-regression-healthcare-role',
  title: 'Healthcare Supply Chain Manager — regression fixture',
  company: 'Alcon', location: 'Riyadh, Saudi Arabia',
  url: 'https://alcon.wd5.myworkdayjobs.com/careers_alcon/job/Riyadh/regression-fixture',
  kind: 'live', summary: 'Synthetic fixture for local state checks only.',
  fit: 'Needs review', healthcare: true, leadership: true,
  posted: '2026-10-08', closes: null,
};
const oldTime = '2026-10-09T00:10:00.000Z';
const newTime = '2026-10-09T00:20:00.000Z';
const success = (jobs, checkedAt = oldTime) => ({
  checkedAt, jobs,
  sources: [{ name: 'Alcon', ok: true, count: jobs.length, scanned: jobs.length }],
});

function assertTracked(app, label) {
  assert.equal(app.json(`states[${JSON.stringify(role.id)}]`), 'Applied', `${label}: status retained`);
  assert.equal(app.json(`jobById(${JSON.stringify(role.id)}).title`), role.title, `${label}: snapshot retained`);
  assert.ok(app.evaluate('planPage()').includes(role.title), `${label}: visible in application plan`);
}

const cases = [];
const recordLocks={request:async(_key,fn)=>fn()};
async function check(name, run) {
  try { await run(); cases.push(name); console.log(`PASS ${name}`); }
  catch (error) { process.exitCode = 1; console.error(`FAIL ${name}: ${error.stack}`); }
}

await check('Full source outage preserves previous results, timestamp and persisted cache', () => {
  const app = createApp();
  app.receive(success([role]));
  const before = app.json('live');
  const storedBefore = app.storage.get('ahmad-live');
  app.receive({
    checkedAt: newTime, jobs: [],
    sources: [{ name: 'Alcon', ok: false, error: 'Simulated outage' }],
  });
  assert.deepEqual(app.json('live'), before);
  assert.equal(app.json('live.checkedAt'), oldTime);
  assert.equal(app.storage.get('ahmad-live'), storedBefore);
  assert.match(app.evaluate('livePage()'), /Previous successful search/);
  assert.match(app.evaluate('livePage()'), /Simulated outage/);
  assert.match(app.toasts.at(-1), /unavailable|could not finish/i);
});

await check('Empty source response also preserves the previous successful search', () => {
  const app = createApp();
  app.receive(success([role]));
  const before = app.json('live');
  app.receive({ checkedAt: newTime, jobs: [], sources: [] });
  assert.deepEqual(app.json('live'), before);
  assert.match(app.evaluate('liveError'), /unavailable/i);
});

await check('Unsaved tracked live role survives feed removal, reload and notes export', async () => {
  const app = createApp();
  app.receive(success([role]));
  app.changeStatus(role.id, 'Applied');
  assert.deepEqual(app.json('saved'), [], 'Tracking must not require a saved heart');
  app.receive(success([], newTime));
  assertTracked(app, 'After successful empty refresh');
  const reloaded = createApp(app.storage);
  assertTracked(reloaded, 'After reload of tracked snapshot');
  assert.deepEqual(reloaded.json('saved'), []);
  const notes = await reloaded.exportNotes();
  assert.ok(notes.includes(role.title), 'Export must include imported tracked title');
  assert.ok(notes.includes(role.url), 'Export must include imported tracked source URL');
  assert.match(notes, /Status: Applied/);
});

await check('Unsaving a tracked role retains its application record and export after reload', async () => {
  const app = createApp();
  app.receive(success([role]));
  app.changeStatus(role.id, 'Applied');
  app.toggleSaved(role.id);
  assert.ok(app.json('saved').includes(role.id));
  app.receive(success([], newTime));
  app.toggleSaved(role.id);
  assert.deepEqual(app.json('saved'), []);
  assertTracked(app, 'After unsaving');
  const reloaded = createApp(app.storage);
  assertTracked(reloaded, 'After unsave and reload');
  assert.ok((await reloaded.exportNotes()).includes(role.title));
});

await check('Failed saves and status writes never announce saved-on-device success', () => {
  for (const action of ['save', 'status']) {
    for (const failingKey of ['all', 'ahmad-workspace']) {
      const app = createApp();
      app.receive(success([role]));
      app.toasts.length = 0;
      if (failingKey === 'all') app.failAllWrites(); else app.failKeys.add(failingKey);
      if (action === 'save') app.toggleSaved(role.id); else app.changeStatus(role.id, 'Applied');
      assert.ok(app.toasts.length, `${action}/${failingKey}: storage failure must be disclosed`);
      assert.match(app.toasts.at(-1), /storage unavailable.*session/i, `${action}/${failingKey}: final feedback must be the failure`);
      assert.ok(!app.toasts.some(text => /saved on this device/i.test(text)), `${action}/${failingKey}: must not falsely claim persistence`);
      assert.equal(app.storage.get('ahmad-workspace'), undefined, `${action}/${failingKey}: failed first write must leave no partial workspace`);
      app.evaluate('render()');
      assert.match(app.evaluate("document.querySelector('.footer').textContent"), /storage unavailable.*session/i, 'Storage warning must survive rendering');
    }
  }
});

await check('A failed workspace mutation leaves the entire prior durable snapshot intact', () => {
  const otherRole = { ...role, id: 'state-regression-second-role', title: 'Supply Chain Manager — second regression fixture' };
  const actions = [
    ['save another role', app => app.toggleSaved(otherRole.id)],
    ['track another role', app => app.changeStatus(otherRole.id, 'Applied')],
    ['unsave existing role', app => app.toggleSaved(role.id)],
    ['change existing status', app => app.changeStatus(role.id, 'Interviewing')],
  ];
  for (const [label, mutate] of actions) {
    const app = createApp();
    app.receive(success([role, otherRole]));
    app.changeStatus(role.id, 'Applied');
    app.toggleSaved(role.id);
    const durableBefore = app.storage.get('ahmad-workspace');
    const expected = JSON.parse(durableBefore);
    assert.deepEqual(expected.saved, [role.id]);
    assert.equal(expected.states[role.id], 'Applied');
    assert.equal(expected.savedDetails[role.id].title, role.title);
    app.toasts.length = 0;
    app.failKeys.add('ahmad-workspace');
    mutate(app);
    assert.equal(app.storage.get('ahmad-workspace'), durableBefore, `${label}: durable snapshot must remain byte-for-byte unchanged`);
    assert.notDeepEqual(app.json('({saved, states, savedDetails})'), expected, `${label}: attempted change must remain usable in this session`);
    assert.ok(!app.toasts.some(text => /saved on this device|removed from saved opportunities/i.test(text)), `${label}: no false durable success`);
    assert.match(app.toasts.at(-1), /storage unavailable.*session/i);
    const reloaded = createApp(app.storage);
    assert.deepEqual(reloaded.json('({saved, states, savedDetails})'), expected, `${label}: reload must restore the complete prior durable snapshot`);
    assertTracked(reloaded, label);
  }
});

await check('Legacy tracking imports correctly and a successful write migrates it atomically', async () => {
  const app = createApp(new Map([
    ['ahmad-saved', JSON.stringify([role.id])],
    ['ahmad-states', JSON.stringify({ [role.id]: 'Applied' })],
    ['ahmad-saved-details', JSON.stringify({ [role.id]: role })],
  ]));
  assertTracked(app, 'Imported legacy record');
  assert.ok((await app.exportNotes()).includes(role.title));
  app.changeStatus(role.id, 'Interviewing');
  const migrated = JSON.parse(app.storage.get('ahmad-workspace'));
  assert.deepEqual(migrated.saved, [role.id]);
  assert.equal(migrated.states[role.id], 'Interviewing');
  assert.equal(migrated.savedDetails[role.id].title, role.title);
  const reloaded = createApp(app.storage);
  assert.deepEqual(reloaded.json('({saved, states, savedDetails})'), migrated, 'New workspace must take precedence over stale legacy keys');
  const notes = await reloaded.exportNotes();
  assert.ok(notes.includes(role.title));
  assert.match(notes, /Status: Interviewing/);
});



await check('Unreadable workspace is preserved and cannot be silently overwritten', () => {
  const broken = '{unreadable workspace';
  const app = createApp(new Map([['ahmad-workspace', broken]]));
  app.receive(success([role])); app.toggleSaved(role.id);
  assert.equal(app.storage.get('ahmad-workspace'), broken);
  assert.match(app.evaluate("document.querySelector('.footer').textContent"), /unreadable|could not be read|preserved/i);
});
await check('Malformed cached rows cannot crash navigation or overwrite the original workspace', () => {
  const broken = JSON.stringify({saved:['bad'], states:{bad:'Applied'}, savedDetails:{bad:null}});
  const app = createApp(new Map([['ahmad-workspace',broken], ['ahmad-live',JSON.stringify({checkedAt:oldTime,jobs:[null],sources:[null]})]]));
  app.evaluate('go("saved"); go("plan"); go("live")');
  assert.equal(app.storage.get('ahmad-workspace'), broken);
});
await check('New employer fields update a researched record without replacing its editorial evidence', () => {
  const app=createApp(); const original=app.json('D.jobs[0]');
  app.receive(success([{...original,kind:'live',rank:undefined,fit:'Needs review',summary:'Generic lead',closes:'2099-10-21'}]));
  const job=app.json(`jobById(${JSON.stringify(original.id)})`);
  assert.equal(job.closes,'2099-10-21'); assert.equal(job.rank,original.rank); assert.equal(job.fit,original.fit);
});
await check('Malformed live sources preserve the cache and do not throw',()=>{
  const app=createApp(); app.receive(success([role]));
  app.receive({checkedAt:newTime,jobs:[],sources:[null]});
  assert.equal(app.json('live.checkedAt'),oldTime); assert.ok(app.evaluate('liveError'));
});
await check('Cached facts are not overwritten by an older successful response',()=>{
  const app=createApp(); app.receive(success([role],newTime)); app.receive(success([],oldTime));
  assert.equal(app.json('live.checkedAt'),newTime); assert.equal(app.json('live.jobs.length'),1);
});
await check('Partially successful sources retain validated new jobs with a visible incomplete warning',()=>{
  const app=createApp(); app.receive({checkedAt:newTime,jobs:[role],sources:[{name:'Alcon',ok:false,count:1,error:'One detail failed'}]});
  assert.equal(app.json('live.jobs.length'),1); assert.match(app.evaluate('livePage()'),/incomplete/i);
});
await check('Unsaved profile input survives completion of a background search',async()=>{
  const app=createApp(); app.evaluate('go("profile")');
  await app.dispatch('input',{name:'achievements',value:'Unsaved achievement',closest:selector=>selector==='#profile-form'?{}:null});
  app.receive(success([role]));
  assert.ok(app.evaluate('profilePage()').includes('Unsaved achievement'));
});
await check('Filter and sort controls keep the active selection after a saved-state render',()=>{
  const app=createApp(); app.evaluate('filter="leadership";sort="deadline"');
  app.toggleSaved(app.json('D.jobs[0].id'));
  const toolbar=app.evaluate('toolbar()');
  assert.match(toolbar, /value="leadership" selected/);assert.match(toolbar,/value="deadline" selected/);
});
await check("Another tab’s saved roles are preserved when this tab next saves",()=>{
  const first=createApp(),second=createApp();
  const a=first.json('D.jobs[0].id'),b=second.json('D.jobs[1].id'); first.toggleSaved(a);
  second.storage.set('ahmad-workspace',first.storage.get('ahmad-workspace'));
  second.toggleSaved(b);
  const durable=JSON.parse(second.storage.get('ahmad-workspace'));
  assert.ok(durable.saved.includes(a)&&durable.saved.includes(b));
});
await check('Fresh tracked facts survive later disappearance from the bounded feed',()=>{
  const app=createApp(),original=app.json('D.jobs[0]');
  app.toggleSaved(original.id);
  app.receive(success([{...original,kind:'live',closes:'2099-10-21'}]));
  app.receive(success([],newTime));
  const restored=createApp(app.storage);
  assert.equal(restored.json(`jobById(${JSON.stringify(original.id)}).closes`),'2099-10-21');
});
await check('A nominal success containing only malformed jobs cannot erase prior valid results',()=>{
  const app=createApp(); app.receive(success([role])); app.receive(success([null],newTime));
  assert.equal(app.json('live.jobs.length'),1);assert.equal(app.json('live.checkedAt'),oldTime);
});
await check('Interleaved tabs serialize workspace mutations when Web Locks are available',async()=>{
  let queue=Promise.resolve();const locks={request(name,run){const next=queue.then(run);queue=next.catch(()=>{});return next}};
  let enabled=false,pending;const shared=new Map();
  const second=createApp(shared,{shared:true,locks}),b=second.json('D.jobs[1].id');
  const first=createApp(shared,{shared:true,locks,afterRead(key){if(enabled&&key==='ahmad-workspace'){enabled=false;pending=second.toggleSaved(b)}}});
  const a=first.json('D.jobs[0].id');enabled=true;
  await first.toggleSaved(a);await pending;
  const durable=JSON.parse(shared.get('ahmad-workspace'));
  assert.ok(durable.saved.includes(a)&&durable.saved.includes(b));
});


await check('Riyadh midnight display and sequential live positions', () => {
  const app = createApp();
  assert.match(app.evaluate("date('2026-10-08T21:23:00Z')"), /Oct 9, 2026/);
  app.evaluate("view='live'");
  assert.match(app.evaluate("row({...D.jobs[0],rank:8},2)"), /class="rank">03</);
  app.evaluate("view='shortlist'");
  assert.match(app.evaluate("row({...D.jobs[0],rank:8},2)"), /class="rank">08</);
});

await check('Profile and checklist changes merge independent fields across tabs',async()=>{
  const shared=new Map(),a=createApp(shared,{shared:true}),b=createApp(shared,{shared:true});
  for(const app of [a,b])app.evaluate('globalThis.FormData=class{constructor(form){this.values=form.values}get(k){return this.values[k]??""}}');
  await a.dispatch('submit',{id:'profile-form',values:{years:'10',degree:'Pharmacy',skills:'',achievements:''}});
  await b.dispatch('submit',{id:'profile-form',values:{years:'',degree:'',skills:'SAP',achievements:''}});
  const profile=JSON.parse(shared.get('ahmad-profile'));
  assert.equal(profile.years,10);assert.equal(profile.degree,'Pharmacy');assert.equal(profile.skills,'SAP');
  await a.dispatch('change',{id:'',dataset:{check:'profile'},checked:true});
  await b.dispatch('change',{id:'',dataset:{check:'cv'},checked:true});
  assert.deepEqual(JSON.parse(shared.get('ahmad-checklist')),{profile:true,cv:true});
});
await check('Conflicting profile edits require an explicit choice and preserve a declined draft',async()=>{
  const shared=new Map(),a=createApp(shared,{shared:true}),b=createApp(shared,{shared:true});
  for(const app of [a,b])app.evaluate('globalThis.FormData=class{constructor(form){this.values=form.values}get(k){return this.values[k]??""}};globalThis.confirm=()=>false');
  await a.dispatch('submit',{id:'profile-form',values:{degree:'Pharmacy'}});
  await b.dispatch('submit',{id:'profile-form',values:{degree:'Law'}});
  assert.equal(JSON.parse(shared.get('ahmad-profile')).degree,'Pharmacy');
  assert.equal(b.json('profileDraft.degree'),'Law');
  assert.match(b.toasts.at(-1),/another tab|draft/i);
});
await check('Failed workspace recovery cannot overwrite another tab and keeps pending work exportable',async()=>{
  for(const action of ['save','unsave','status']){
    const shared=new Map(),a=createApp(shared,{shared:true}),b=createApp(shared,{shared:true});
    const ids=a.json('D.jobs.slice(0,4).map(j=>j.id)');a.toggleSaved(ids[0]);
    a.failKeys.add('ahmad-workspace');
    if(action==='save')a.toggleSaved(ids[1]);else if(action==='unsave')a.toggleSaved(ids[0]);else a.changeStatus(ids[0],'Applied');
    const pending=a.json('({saved,states,savedDetails})');b.toggleSaved(ids[2]);
    const durable=shared.get('ahmad-workspace');a.failKeys.clear();a.toggleSaved(ids[3]);
    assert.equal(shared.get('ahmad-workspace'),durable,action+': preserve newer durable state');
    assert.deepEqual(a.json('({saved,states,savedDetails})'),pending,action+': preserve unsaved session');
    assert.match(a.toasts.at(-1),/another tab.*export.*reload/i);
    assert.ok((await a.exportNotes()).includes('AHMAD CAREER'));
  }
});

await check('A stale tab cannot regress the durable employer snapshot or tracked facts',()=>{
  const shared=new Map(),a=createApp(shared,{shared:true}),b=createApp(shared,{shared:true});
  a.receive(success([{...role,closes:'2099-10-31'}],newTime));a.toggleSaved(role.id);
  b.receive(success([{...role,closes:'2099-10-12'}],oldTime));
  const reloaded=createApp(shared);
  assert.equal(reloaded.json('live.checkedAt'),newTime);
  assert.equal(reloaded.json(`jobById(${JSON.stringify(role.id)}).closes`),'2099-10-31');
});

await check('Failed checklist recovery preserves a newer explicit choice in another tab',async()=>{
  const shared=new Map(),a=createApp(shared,{shared:true}),b=createApp(shared,{shared:true});
  a.failKeys.add('ahmad-checklist');await a.dispatch('change',{id:'',dataset:{check:'profile'},checked:true});
  await b.dispatch('change',{id:'',dataset:{check:'profile'},checked:false});
  const durable=shared.get('ahmad-checklist');a.failKeys.clear();
  await a.dispatch('change',{id:'',dataset:{check:'cv'},checked:true});
  assert.equal(shared.get('ahmad-checklist'),durable);
  assert.equal(a.json('checklist.profile'),true);
  assert.match(a.toasts.at(-1),/another tab.*export.*reload/i);
});

await check('Legacy live caches use their envelope date when merging a corrected research bundle',()=>{
  const original=createApp().json('D.jobs[0]');
  for(const [checkedAt,expectedTitle] of [['2026-10-08T00:00:00Z',original.title],[newTime,'Employer title from cache']]){
    const cached={...original,title:'Employer title from cache',closes:'2099-12-31',kind:'live'};
    delete cached.lastCheckedAt;delete cached.researchCheckedAt;
    const app=createApp(new Map([
      ['ahmad-live',JSON.stringify(success([cached],checkedAt))],
      ['ahmad-workspace',JSON.stringify({saved:[original.id],states:{[original.id]:'Applied'},savedDetails:{[original.id]:cached}})],
    ]));
    const current=app.json(`jobById(${JSON.stringify(original.id)})`);
    assert.equal(current.title,expectedTitle,'Only a newer observed cache may replace bundled facts');
    assert.equal(app.json('live.jobs[0].lastCheckedAt'),checkedAt);
    assert.equal(app.json(`states[${JSON.stringify(original.id)}]`),'Applied');
    assert.ok(app.json('saved').includes(original.id));
  }
});

await check('Corrected bundled facts win date-only ties while later live facts still update tracking',async()=>{
  const original=createApp().json('D.jobs.find(j=>C.riyadhCity(j.location)==="confirmed")');
  const stale={...original,title:'Old saved title',location:'Jeddah, Saudi Arabia',closes:'2099-12-31',lastCheckedAt:original.researchCheckedAt};
  for(const includeCache of [false,true]){
    const initial=new Map([
      ['ahmad-profile',JSON.stringify({preferredCity:'riyadh'})],
      ['ahmad-workspace',JSON.stringify({saved:[original.id],states:{[original.id]:'Applied'},savedDetails:{[original.id]:stale}})],
    ]);
    if(includeCache)initial.set('ahmad-live',JSON.stringify(success([stale],original.researchCheckedAt)));
    const app=createApp(initial),current=app.json(`jobById(${JSON.stringify(original.id)})`);
    for(const key of ['title','location','closes'])assert.equal(current[key],original[key],`${key}: bundled facts win a date-only tie`);
    assert.equal(app.json(`C.criteriaFor(jobById(${JSON.stringify(original.id)}),profile).included`),true);
    await app.receive(success([{...stale,title:'Later Supply Chain Manager'}],newTime));
    const restored=createApp(app.storage),updated=restored.json(`jobById(${JSON.stringify(original.id)})`);
    assert.equal(updated.title,'Later Supply Chain Manager');assert.equal(updated.location,stale.location);assert.equal(updated.closes,stale.closes);
    assert.equal(restored.json(`states[${JSON.stringify(original.id)}]`),'Applied');
    assert.ok(restored.json('saved').includes(original.id));
  }
});

await check('A refreshed archived role preserves dated editorial evidence and tracking',async()=>{
  const archived={...createApp().json('D.jobs[0]'),id:'jj-archived-regression',kind:'researched',rank:1,fit:'Archived fit assessment',summary:'Archived evidence summary',researchCheckedAt:'2026-10-01',lastCheckedAt:'2026-10-02T00:00:00Z'};
  const app=createApp(new Map([['ahmad-workspace',JSON.stringify({saved:[archived.id],states:{[archived.id]:'Applied'},savedDetails:{[archived.id]:archived}})]]));
  const fresh={...archived,title:'Updated Supply Chain Manager',closes:'2099-12-31',kind:'live',fit:'Needs review',summary:'Generic employer lead'};
  for(const key of ['rank','gaps','steps','researchCheckedAt','lastCheckedAt'])delete fresh[key];
  await app.receive(success([fresh],newTime));
  const reloaded=createApp(app.storage),current=reloaded.json(`jobById(${JSON.stringify(archived.id)})`);
  assert.equal(current.kind,'archived');assert.equal(current.rank,undefined);
  assert.equal(current.fit,archived.fit);assert.equal(current.summary,archived.summary);
  assert.deepEqual(current.gaps,archived.gaps);assert.deepEqual(current.steps,archived.steps);
  assert.equal(current.title,fresh.title);assert.equal(current.closes,fresh.closes);
  assert.equal(current.researchCheckedAt,archived.researchCheckedAt);assert.equal(current.lastCheckedAt,newTime);
  assert.equal(reloaded.json(`states[${JSON.stringify(archived.id)}]`),'Applied');
  assert.ok(reloaded.json('saved').includes(archived.id));
});

await check('A newer old-tab cache cannot reintroduce excluded employers after a search failure',async()=>{
  const app=createApp();await app.receive(success([role],oldTime));
  const excluded={...role,id:'qiddiya-REGRESSION',company:'Qiddiya',title:'Healthcare Procurement Manager',healthcare:true,url:'https://apply.workable.com/qiddiya-investment-company-1/j/REGRESSION/'};
  const nonHealthcare={...role,id:'non-healthcare-regression',healthcare:false};
  app.storage.set('ahmad-live',JSON.stringify(success([role,excluded,nonHealthcare],newTime)));
  await app.receive({error:'Synthetic outage'});
  assert.deepEqual(app.json('live.jobs.map(j=>j.id)'),[role.id]);
  assert.equal(app.json('live.checkedAt'),newTime);assert.match(app.evaluate('liveError'),/outage/i);
  app.evaluate('view="live";render()');
  assert.equal(app.evaluate('document.querySelector("#result-count").textContent'),'1 opportunity');
});


const criteriaProfile={preferredCity:'riyadh',minimumMonthlySAR:'10000',unknownSalary:'show'};
const submitProfile=(app,values)=>app.dispatch('submit',{id:'profile-form',values:{years:'',degree:'',skills:'',achievements:'',preferredCity:'',minimumMonthlySAR:'',unknownSalary:'show',...values}});

await check('Pre-criteria profiles migrate without losing profile, saved, status or checklist records',async()=>{
  const oldProfile={years:8,degree:'Pharmacy',skills:'SAP',achievements:'A verified outcome'};
  const initial=new Map([
    ['ahmad-profile',JSON.stringify(oldProfile)],
    ['ahmad-workspace',JSON.stringify({saved:[role.id],states:{[role.id]:'Applied'},savedDetails:{[role.id]:role}})],
    ['ahmad-checklist',JSON.stringify({cv:true})],
  ]);
  const app=createApp(initial);
  assert.deepEqual(app.json('profile'),oldProfile);
  assert.equal(app.evaluate('blockedKeys.has("profile")'),false);
  assert.match(app.evaluate('criteriaSummary()'),/Any Saudi city/);
  await submitProfile(app,{...oldProfile,...criteriaProfile});
  const restored=createApp(app.storage);
  assert.deepEqual(restored.json('({...profile,unknownSalary:profile.unknownSalary??"show"})'),{...oldProfile,...criteriaProfile});
  assertTracked(restored,'After criteria migration');
  assert.equal(restored.json('checklist.cv'),true);
  assert.ok(restored.json('saved').includes(role.id));
});

await check('Criteria form canonicalizes Arabic whole amounts and rejects invalid input without clamping',async()=>{
  const app=createApp();
  await submitProfile(app,{...criteriaProfile,minimumMonthlySAR:'١٠٬٠٠٠٫٠٠'});
  assert.equal(JSON.parse(app.storage.get('ahmad-profile')).minimumMonthlySAR,'10000');
  const durable=app.storage.get('ahmad-profile');
  for(const invalid of ['-1','1.50','1,00','1000001','1e4','Infinity']){
    app.toasts.length=0;
    await submitProfile(app,{...criteriaProfile,minimumMonthlySAR:invalid});
    assert.equal(app.storage.get('ahmad-profile'),durable,invalid);
    assert.equal(app.json('profileDraft.minimumMonthlySAR'),invalid);
    assert.match(app.toasts.at(-1),/whole.*SAR|monthly pay/i);
    assert.ok(!app.toasts.some(text=>/saved on this device/i.test(text)));
  }
  for(const invalid of [{preferredCity:'elsewhere'},{unknownSalary:'estimate'}]){
    await submitProfile(app,{...criteriaProfile,...invalid});
    assert.equal(app.storage.get('ahmad-profile'),durable);
  }
});

await check('Malformed stored criteria preserve original storage and cannot be overwritten',async()=>{
  for(const invalid of [{preferredCity:'jeddah'},{unknownSalary:'estimate'},{minimumMonthlySAR:'1e4'},{minimumMonthlySAR:10000},{minimumMonthlySAR:'010000'},{minimumMonthlySAR:'1000001'}]){
    const raw=JSON.stringify(invalid),app=createApp(new Map([['ahmad-profile',raw]]));
    assert.equal(app.evaluate('blockedKeys.has("profile")'),true);
    await submitProfile(app,criteriaProfile);
    assert.equal(app.storage.get('ahmad-profile'),raw);
  }
});

await check('Unsaved criteria survive renders and disabled salary policy preserves the draft',async()=>{
  const app=createApp();app.evaluate('go("profile")');
  for(const [name,value] of Object.entries(criteriaProfile))await app.dispatch('input',{name,value,closest:selector=>selector==='#profile-form'?{}:null});
  app.evaluate('render()');app.receive(success([role]));
  for(const [name,value] of Object.entries(criteriaProfile))assert.equal(app.json(`profileDraft.${name}`),value);
  assert.match(app.evaluate('profilePage()'),/name="preferredCity"/);
  assert.match(app.evaluate('profilePage()'),/name="minimumMonthlySAR"[^>]*value="10000"/);
  assert.doesNotMatch(app.evaluate('profilePage()'),/name="unknownSalary"[^>]*disabled/);
  app.evaluate('profileDraft.minimumMonthlySAR="";profileDraft.unknownSalary="hide";render()');
  assert.match(app.evaluate('profilePage()'),/name="unknownSalary"[^>]*disabled/);
  await submitProfile(app,{unknownSalary:null});
  assert.equal(app.json('profile.unknownSalary'),'hide','Disabled control must retain its dormant policy');
});

await check('Independent criteria and professional profile edits merge across tabs using legacy neutral defaults',async()=>{
  const shared=new Map([['ahmad-profile','{}']]),a=createApp(shared,{shared:true}),b=createApp(shared,{shared:true});
  await submitProfile(a,{preferredCity:'riyadh',unknownSalary:'hide'});
  await submitProfile(b,{minimumMonthlySAR:'10000',skills:'Verified scope'});
  const stored=JSON.parse(shared.get('ahmad-profile'));
  assert.equal(stored.preferredCity,'riyadh');assert.equal(stored.minimumMonthlySAR,'10000');
  assert.equal(stored.unknownSalary,'hide','A stale form showing the default must not reset a later policy');
  assert.equal(stored.skills,'Verified scope');
});

await check('Conflicting criteria preserve a declined draft and failed saves never report durable success',async()=>{
  const shared=new Map(),a=createApp(shared,{shared:true}),b=createApp(shared,{shared:true});
  await submitProfile(a,{minimumMonthlySAR:'10000'});
  await submitProfile(b,{minimumMonthlySAR:'20000'});
  assert.equal(JSON.parse(shared.get('ahmad-profile')).minimumMonthlySAR,'10000');
  assert.equal(b.json('profileDraft.minimumMonthlySAR'),'20000');
  const durable=shared.get('ahmad-profile');a.failKeys.add('ahmad-profile');a.toasts.length=0;
  await submitProfile(a,{...criteriaProfile,minimumMonthlySAR:'20000'});
  assert.equal(shared.get('ahmad-profile'),durable);
  assert.equal(a.json('profileDraft.minimumMonthlySAR'),'20000');
  assert.ok(!a.toasts.some(text=>/saved on this device/i.test(text)));
  assert.match(a.toasts.at(-1),/storage unavailable.*session/i);
});

await check('Preferences refine discovery only, preserve freshest saved history and stay out of notes',async()=>{
  const app=createApp(),otherCity={...role,location:'Jeddah, Saudi Arabia'};
  app.receive(success([otherCity]));app.toggleSaved(role.id);app.changeStatus(role.id,'Applied');
  await submitProfile(app,{...criteriaProfile,unknownSalary:'hide'});
  app.receive(success([{...otherCity,closes:'2099-12-31'}],newTime));
  app.evaluate('go("live")');
  assert.doesNotMatch(app.evaluate('document.querySelector("#job-list").innerHTML'),/regression fixture/);
  assert.equal(app.json('live.jobs.length'),1);
  assert.equal(app.json(`jobById(${JSON.stringify(role.id)}).closes`),'2099-12-31');
  app.evaluate('go("saved")');
  assert.match(app.evaluate('document.querySelector("#job-list").innerHTML'),/regression fixture/);
  assertTracked(app,'After stricter discovery criteria');
  const notes=await app.exportNotes(),draft=app.evaluate(`draft(jobById(${JSON.stringify(role.id)}))`);
  assert.ok(notes.includes(role.title));
  for(const output of [notes,draft])assert.doesNotMatch(output,/preferredCity|minimumMonthlySAR|unknownSalary|10000|10,000/);
});

await check('Unknown salary produces honest discovery labels and an explicit evidence-gap empty state',async()=>{
  const app=createApp();await submitProfile(app,criteriaProfile);app.evaluate('go("shortlist")');
  const list=app.evaluate('document.querySelector("#job-list").innerHTML');
  assert.match(list,/Salary unverified — confirm your minimum/);
  assert.match(list,/Confirm Riyadh assignment/);
  assert.match(app.evaluate('document.querySelector("#result-count").textContent'),/salary unverified/i);
  assert.match(app.evaluate('criteriaSummary()'),/Edit profile/);
  await submitProfile(app,{...criteriaProfile,unknownSalary:'hide'});app.evaluate('go("shortlist")');
  assert.match(app.evaluate('document.querySelector("#job-list").innerHTML'),/pay.*not verified|salary.*not verified/i);
  assert.match(app.evaluate('document.querySelector("#job-list").innerHTML'),/does not mean.*no vacancies/i);
  app.evaluate('filter="leadership";sort="deadline";render()');
  assert.match(app.evaluate('toolbar()'),/value="leadership" selected/);
  assert.match(app.evaluate('toolbar()'),/value="deadline" selected/);
});

await check('Navigation and both refresh transports retain local criteria without transmitting them',async()=>{
  const requests=[],app=createApp(new Map(),{fetch:async(url,options)=>{requests.push({url,options});return {ok:true,json:async()=>success([role])}}});
  await submitProfile(app,criteriaProfile);const durable=app.storage.get('ahmad-profile');
  app.evaluate('go("saved");go("salary");go("shortlist")');await app.evaluate('refresh()');
  assert.equal(app.storage.get('ahmad-profile'),durable);
  assert.equal(requests[0].url,'/api/live');
  assert.deepEqual(Object.keys(requests[0].options).sort(),['headers','signal']);
  assert.equal(requests[0].options.headers.Accept,'application/json');
  assert.doesNotMatch(JSON.stringify(requests),/preferredCity|minimumMonthlySAR|unknownSalary|10000/);
  app.evaluate('globalThis.nativeRequests=[];window.webkit={messageHandlers:{careerSearch:{postMessage:payload=>nativeRequests.push(payload)}}}');
  await app.evaluate('refresh()');assert.deepEqual(app.json('nativeRequests'),[{action:'refresh'}]);
  assert.equal(app.storage.get('ahmad-profile'),durable);
  const restored=createApp(app.storage);assert.deepEqual(restored.json('({...profile,unknownSalary:profile.unknownSalary??"show"})'),criteriaProfile);
});

await check('Partial search warning and original check time survive reload',()=>{
  const app=createApp(),payload=success([role]);
  payload.sources[0].detailErrors=1;payload.sources[0].error='One detail unavailable';
  app.receive(payload);
  const restored=createApp(app.storage);restored.evaluate('go("live")');
  assert.match(restored.evaluate('livePage()'),/Search coverage is incomplete/);
  assert.match(restored.json('coverageWarning'),/One detail unavailable/);
  assert.equal(restored.json('live.checkedAt'),payload.checkedAt);
});

await check('Corrected research remains durable after archival and a stale tab status edit',async()=>{
  const base=createApp().json('D'),a=structuredClone(base),b=structuredClone(base),c=structuredClone(base),id=base.jobs[0].id;
  a.jobs[0]={...a.jobs[0],title:'Superseded title',summary:'Superseded evidence',researchCheckedAt:'2020-01-01',closes:'2099-12-31'};
  b.jobs[0]={...b.jobs[0],title:'Corrected title',summary:'Corrected evidence',researchCheckedAt:'2026-10-09',closes:'2099-10-10'};
  c.jobs=c.jobs.filter(j=>j.id!==id);
  const shared=new Map(),old=createApp(shared,{shared:true,bundle:a});old.toggleSaved(id);old.changeStatus(id,'Applied');
  createApp(shared,{shared:true,bundle:b});
  assert.equal(JSON.parse(shared.get('ahmad-workspace')).savedDetails[id].title,'Corrected title','Bundle B must persist retained corrections without another user action');
  old.changeStatus(id,'Interviewing');
  const archived=createApp(shared,{shared:true,bundle:c}),job=archived.json(`jobById(${JSON.stringify(id)})`);
  assert.equal(job.title,'Corrected title');assert.equal(job.summary,'Corrected evidence');assert.equal(job.closes,'2099-10-10');assert.equal(job.kind,'archived');
  assert.equal(archived.json(`states[${JSON.stringify(id)}]`),'Interviewing');
  const notes=await archived.exportNotes();
  assert.match(notes,/Archived research/);assert.match(notes,/Research checked: 2026-10-09/);assert.match(notes,/Listed deadline: 2099-10-10/);
});
await check('Unsaving a removed live lead keeps an open detail actionable',async()=>{
  const app=createApp();app.receive(success([role]));app.toggleSaved(role.id);app.receive(success([],newTime));
  app.evaluate(`openJob(${JSON.stringify(role.id)})`);app.toggleSaved(role.id);
  assert.ok(app.evaluate(`Boolean(jobById(${JSON.stringify(role.id)}))`),'Open role snapshot must survive unsaving');
  app.changeStatus(role.id,'Applied');assertTracked(app,'After removing saved flag');
  assert.match(app.evaluate(`draft(jobById(${JSON.stringify(role.id)}))`),/Application preparation/);
  assert.ok((await app.exportNotes()).includes(role.title));
});

await check('Rejected-listing warning survives repeated reloads without inflation',()=>{
  const app=createApp();app.receive(success([role,{}]));assert.equal(app.json('live.invalidJobs'),1);
  const next=createApp(app.storage),again=createApp(next.storage);
  for(const instance of [next,again]){assert.equal(instance.json('live.invalidJobs'),1);assert.match(instance.evaluate('coverageWarning'),/1 malformed/);assert.equal(instance.json('live.checkedAt'),oldTime)}
});
await check('Saved theme exposes its current state and toggles accessibly',async()=>{
  for(const dark of [true,false]){
    const app=createApp(new Map([['ahmad-dark',JSON.stringify(dark)]]));
    assert.equal(app.evaluate(`$('[data-action="theme"]').getAttribute('aria-pressed')`),String(dark));
    await app.dispatch('click',{closest:()=>({dataset:{action:'theme'}})});
    assert.equal(app.evaluate(`$('[data-action="theme"]').getAttribute('aria-pressed')`),String(!dark));
    assert.match(app.evaluate('planPage()'),/id="check-profile"/);
  }
});
await check('A role opened during refresh remains actionable after the new batch omits it',async()=>{
  let resolve;const app=createApp(undefined,{fetch:()=>new Promise(r=>{resolve=r})});app.receive(success([role]));
  const pending=app.evaluate('refresh()');app.evaluate(`openJob(${JSON.stringify(role.id)})`);
  resolve({ok:true,json:async()=>success([],newTime)});await pending;
  assert.equal(app.evaluate(`jobById(${JSON.stringify(role.id)})?.title`),role.title);
  await app.dispatch('click',{closest:()=>({dataset:{draft:role.id}})});
  app.changeStatus(role.id,'Applied');assertTracked(app,'Opened during refresh');assert.ok((await app.exportNotes()).includes(role.title));
});
await check('Unknown status events cannot create orphan application records',()=>{
  const app=createApp();app.changeStatus('missing-role','Applied');assert.equal(app.evaluate('states["missing-role"]'),undefined);
});

await check('Notes capture current saved profile and checklist without requiring a storage event',async()=>{
  const shared=new Map(),a=createApp(shared,{shared:true}),b=createApp(shared,{shared:true});
  const before=a.json('({profile,profileDraft,profileBase,checklist,checklistPending})');
  await b.dispatch('submit',{id:'profile-form',values:{years:'12',degree:'Synthetic current degree',skills:'Synthetic current skills',achievements:'Synthetic current achievement'}});
  await b.dispatch('change',{id:'',dataset:{check:'profile'},checked:true});
  const durable=[...shared];
  const notes=await a.exportNotes();
  for(const text of ['Synthetic current degree','Synthetic current skills','Synthetic current achievement','[x] Confirm your professional record'])assert.ok(notes.includes(text),text);
  assert.match(a.evaluate('draft(D.jobs[0])'),/Synthetic current achievement/);
  assert.deepEqual(a.json('({profile,profileDraft,profileBase,checklist,checklistPending})'),before,'Note capture must not mutate the editing session');
  assert.deepEqual([...shared],durable,'Note capture must not write storage');
  await a.dispatch('input',{name:'degree',value:'Synthetic unsent draft',closest:selector=>selector==='#profile-form'?{}:null});
  assert.ok((await a.exportNotes()).includes('Synthetic current degree'));
  assert.ok(!(await a.exportNotes()).includes('Synthetic unsent draft'));
  assert.equal(a.json('profileDraft.degree'),'Synthetic unsent draft');
});
await check('Notes preserve failed saves and valid session data when newer storage is invalid or unreadable',async()=>{
  for(const failure of ['pending','malformed','invalid','unreadable']){
    const seed={years:8,degree:'Synthetic retained degree',skills:'Synthetic retained skills',achievements:'Synthetic retained achievement'};
    const a=createApp(new Map([['ahmad-profile',JSON.stringify(seed)],['ahmad-checklist',JSON.stringify({profile:true})]]));
    if(failure==='pending'){
      a.failKeys.add('ahmad-profile');a.failKeys.add('ahmad-checklist');
      await a.dispatch('submit',{id:'profile-form',values:{...seed,degree:'Synthetic failed degree',achievements:'Synthetic failed achievement'}});
      await a.dispatch('change',{id:'',dataset:{check:'cv'},checked:true});
      a.storage.set('ahmad-profile',JSON.stringify({...seed,degree:'Other tab degree',achievements:'Other tab achievement'}));
      a.storage.set('ahmad-checklist',JSON.stringify({profile:false,cv:false}));
    }else if(failure==='unreadable')a.evaluate('localStorage.getItem=()=>{throw Error("Synthetic read failure")}');
    else{a.storage.set('ahmad-profile',failure==='malformed'?'{':JSON.stringify({degree:3}));a.storage.set('ahmad-checklist',failure==='malformed'?'{':JSON.stringify({profile:'yes'}))}
    const before=a.json('({profile,profileDraft,profileBase,checklist,checklistPending})'),durable=[...a.storage];
    const notes=await a.exportNotes(),roleDraft=a.evaluate('draft(D.jobs[0])');
    assert.ok(notes.includes(failure==='pending'?'Synthetic failed degree':seed.degree),failure);
    assert.ok(roleDraft.includes(failure==='pending'?'Synthetic failed achievement':seed.achievements),failure);
    assert.ok(notes.includes('[x] Confirm your professional record'),failure);
    if(failure==='pending')assert.ok(notes.includes('[x] Build two CV versions'));
    else assert.equal(a.evaluate("blockedKeys.has('profile')&&blockedKeys.has('checklist')"),true);
    assert.deepEqual(a.json('({profile,profileDraft,profileBase,checklist,checklistPending})'),before);
    assert.deepEqual([...a.storage],durable);
  }
});


await check('Application metadata survives legacy workspace writes, status transitions and reload; preparation excludes receipts', async()=>{
 const shared=new Map(), app=createApp(shared,{shared:true,locks:recordLocks});
 const id=app.json('D.jobs[0].id'), literal=JSON.stringify(id);
 app.evaluate(`editApplicationRecord(${literal}); recordDrafts[${literal}].receiptNote='<img src=x> private receipt';`);
 assert.equal(await app.evaluate(`saveApplicationRecord(${literal})`),true);
 const legacy=createApp(shared,{shared:true}); await legacy.toggleSaved(id); legacy.changeStatus(id,'Applied');
 const reloaded=createApp(shared,{shared:true,locks:recordLocks});
 assert.equal(reloaded.json(`readApplicationRecord(${literal}).receiptNote`),'<img src=x> private receipt');
 assert.equal(reloaded.json(`readApplicationRecord(${literal}).appliedAt`),'');
 assert(!(reloaded.evaluate(`draft(jobById(${literal}))`)).includes('private receipt'));
 assert((await reloaded.exportNotes()).includes('private receipt'));
 reloaded.evaluate(`openJob(${literal})`);
 assert(reloaded.evaluate("$('#job-dialog').innerHTML").includes('&lt;img src=x&gt;'));
});
await check('Same-record conflicts and failed writes preserve drafts; metadata-only archived rows export',async()=>{
 const shared=new Map(),a=createApp(shared,{shared:true,locks:recordLocks});
 a.receive(success([role])); const id=JSON.stringify(role.id);
 a.evaluate(`editApplicationRecord(${id}); recordDrafts[${id}].receiptNote='first';`);
 const b=createApp(shared,{shared:true,locks:recordLocks});
 b.evaluate(`editApplicationRecord(${id}); recordDrafts[${id}].receiptNote='second';`);
 assert.equal(await a.evaluate(`saveApplicationRecord(${id})`),true);
 const before=shared.get('ahmad-application-record-v1:'+encodeURIComponent(role.id));
 assert.equal(await b.evaluate(`saveApplicationRecord(${id})`),false);
 assert.equal(shared.get('ahmad-application-record-v1:'+encodeURIComponent(role.id)),before);
 assert((await b.exportNotes()).includes('UNSAVED application record draft'));
 assert((await b.exportNotes()).includes('second'));
 a.receive(success([],newTime)); const reload=createApp(shared,{shared:true,locks:recordLocks});
 assert(reload.evaluate('planPage()').includes(role.title));
 assert((await reload.exportNotes()).includes('first'));
 const c=createApp(new Map(),{locks:recordLocks}),key=c.json('D.jobs[0].id'),j=JSON.stringify(key);
 c.evaluate(`editApplicationRecord(${j}); recordDrafts[${j}].receiptNote='quota draft';`);
 c.failKeys.add('ahmad-application-record-v1:'+encodeURIComponent(key));
 assert.equal(await c.evaluate(`saveApplicationRecord(${j})`),false);
 assert((await c.exportNotes()).includes('quota draft'));
});
await check('Unsupported metadata and no-lock environments never overwrite; status and checklist stay separate',async()=>{
 const app=createApp(new Map(),{locks:recordLocks}),id=app.json('D.jobs[0].id'),j=JSON.stringify(id),key='ahmad-application-record-v1:'+encodeURIComponent(id);
 app.storage.set(key,'{"schema":99}');app.evaluate(`editApplicationRecord(${j}); recordDrafts[${j}].receiptNote='preserved draft';`);
 assert.equal(await app.evaluate(`saveApplicationRecord(${j})`),false); assert.equal(app.storage.get(key),'{"schema":99}');
 app.changeStatus(id,'Applied');assert.equal(app.json(`states[${j}]`),'Applied');
 const unlocked=createApp();unlocked.evaluate(`editApplicationRecord(${j}); recordDrafts[${j}].receiptNote='unsupported save draft';`);
 assert.equal(await unlocked.evaluate(`saveApplicationRecord(${j})`),false);assert.equal(unlocked.storage.get(key),undefined);
 assert((await unlocked.exportNotes()).includes('unsupported save draft'));
});
await check('Old-tab receipt save retains newer employer facts resolved inside the workspace lock',async()=>{
 let queue=Promise.resolve();const locks={request(name,fn){if(name.endsWith('workspace')){const next=queue.then(fn);queue=next.catch(()=>{});return next}return Promise.resolve().then(fn)}};
 const shared=new Map(),a=createApp(shared,{shared:true,locks});await queue;
 await a.receive(success([role]));await queue;await a.toggleSaved(role.id);
 const id=JSON.stringify(role.id);a.evaluate(`editApplicationRecord(${id});recordDrafts[${id}].receiptNote='synthetic receipt'`);
 const b=createApp(shared,{shared:true,locks});await queue;
 await b.receive(success([{...role,title:'Updated Healthcare Supply Chain Manager',closes:'2026-10-10'}],newTime));await queue;
 const before=JSON.parse(shared.get('ahmad-workspace')).savedDetails[role.id];
 assert.equal(await a.evaluate(`saveApplicationRecord(${id})`),true);
 assert.deepEqual(JSON.parse(shared.get('ahmad-workspace')).savedDetails[role.id],before);
});

await check('A completed employer refresh redraws attention on an already open Plan',()=>{
 const app=createApp();app.receive(success([role]));app.toggleSaved(role.id);app.evaluate("go('plan')");
 app.receive(success([{...role,title:'Freshly updated Supply Chain Manager'}],newTime));
 assert(app.evaluate("$('#main').innerHTML").includes('Freshly updated Supply Chain Manager'));
});

await check('Profile saves preserve typing entered while waiting for the profile lock',async()=>{
 let release;const gate=new Promise(resolve=>release=resolve);
 const locks={request:(name,run)=>name==='ahmad-career-profile'?gate.then(run):Promise.resolve(run())};
 const app=createApp(new Map(),{locks});
 const pending=submitProfile(app,{achievements:'Submitted snapshot'});
 await app.dispatch('input',{name:'achievements',value:'Later unsaved typing',closest:s=>s==='#profile-form'?{}:null});
 release();await pending;
 assert.equal(JSON.parse(app.storage.get('ahmad-profile')).achievements,'Submitted snapshot');
 assert.equal(app.json('profileDraft.achievements'),'Later unsaved typing');
 assert.equal(app.json('profileBase.achievements'),'Submitted snapshot');
});

await check('Queued live retention keeps corrected facts even when a later batch omits the role',async()=>{
 let held=false,release;const gate=new Promise(resolve=>release=resolve);let queue=Promise.resolve();
 const locks={request(name,run){if(name==='ahmad-career-workspace'){const next=queue.then(()=>held?gate.then(run):run());queue=next.catch(()=>{});return next}return Promise.resolve(run())}};
 const app=createApp(new Map(),{locks});await queue;
 await app.receive(success([role]));await queue;await app.toggleSaved(role.id);
 held=true;const corrected={...role,title:'Corrected Supply Chain Manager',closes:'2099-10-10'};
 await app.receive(success([corrected],newTime));
 await app.receive(success([],'2026-10-09T00:30:00Z'));
 release();await queue;
 const reload=createApp(app.storage);
 assert.equal(reload.json(`jobById(${JSON.stringify(role.id)}).title`),corrected.title);
 assert.equal(reload.json(`jobById(${JSON.stringify(role.id)}).closes`),corrected.closes);
});
await check('Tracking export sees another tab workspace save before the storage event arrives',async()=>{
 const shared=new Map(),a=createApp(shared,{shared:true}),b=createApp(shared,{shared:true});
 const id=b.json('D.jobs[0].id');await b.toggleSaved(id);b.changeStatus(id,'Applied');
 const durable=[...shared],notes=await a.exportNotes();
 assert(notes.includes(b.json('D.jobs[0].title')));assert(notes.includes('Status: Applied'));
 assert.deepEqual([...shared],durable,'Export must not write storage');
});
await check('Accepted employer corrections redraw an open Saved or Shortlist view',()=>{
 for(const view of ['saved','shortlist']){
  const app=createApp();const job=view==='saved'?role:app.json('D.jobs[0]');
  app.receive(success([job]));app.toggleSaved(job.id);app.evaluate(`go('${view}')`);
  app.receive(success([{...job,title:'Corrected Healthcare Supply Chain Manager'}],new Date().toISOString()));
  assert.equal(app.json(`jobById(${JSON.stringify(job.id)}).title`),'Corrected Healthcare Supply Chain Manager','Refresh must be accepted before testing redraw');
  assert(app.evaluate("$('#job-list').innerHTML").includes('Corrected Healthcare Supply Chain Manager'),view);
 }
});

await check('Date sorts use instants and Saudi day boundaries with unknown dates last',()=>{
 const scenarios=[
  ['deadline','closes','2026-10-10T00:30:00+03:00','2026-10-09T23:00:00Z'],
  ['deadline','closes','2026-10-09T09:00:00+03:00','2026-10-09'],
  ['recent','posted','2026-10-09T21:00:00Z','2026-10-09T23:30:00+03:00'],
  ['recent','posted','2026-10-08T23:30:00Z','2026-10-09']
 ];
 for(const [sort,key,first,last] of scenarios){
  const app=createApp();const jobs=[{...role,id:'date-last',title:'Last Supply Chain Manager',[key]:last},{...role,id:'date-first',title:'First Supply Chain Manager',[key]:first},{...role,id:'date-unknown',title:'Unknown Supply Chain Manager',posted:'',closes:null}];
  app.evaluate(`D.jobs=${JSON.stringify(jobs)};go('shortlist');sort=${JSON.stringify(sort)};renderList()`);
  const html=app.evaluate("$('#job-list').innerHTML");
  assert(html.indexOf('First Supply Chain Manager')<html.indexOf('Last Supply Chain Manager'),key+first);
  assert(html.indexOf('Last Supply Chain Manager')<html.indexOf('Unknown Supply Chain Manager'),'unknown last');
 }
});
await check('Editorial action prose cannot contradict an accepted amended deadline',()=>{
 const app=createApp();const id='alcon-R-2026-49887',job=app.json(`jobById('${id}')`);
 app.receive(success([{...job,closes:'2099-10-10'}],new Date().toISOString()));
 app.evaluate(`openJob('${id}')`);
 const detail=app.evaluate("$('#job-dialog').innerHTML"),plan=app.evaluate('planPage()');
 assert(!detail.includes('The published deadline is 15 October 2026'));
 assert(!plan.includes('Roche: 12 Oct; Alcon: 15 Oct'));
 assert(!detail.includes('A current healthcare logistics opening'));
});

await check('Legacy date-only live checks compare at Saudi midnight for updates and durable-cache adoption',()=>{
 for(const fromStorage of [false,true]){
  const app=createApp();app.receive(success([role],'2026-10-09'));
  const newer=success([{...role,title:'Later Supply Chain Manager'}],'2026-10-08T23:00:00Z');
  if(fromStorage){app.storage.set('ahmad-live',JSON.stringify(newer));app.receive({error:'Synthetic outage'})}else app.receive(newer);
  assert.equal(app.json('live.checkedAt'),newer.checkedAt,String(fromStorage));
  assert.equal(app.json('live.jobs[0].title'),'Later Supply Chain Manager');
 }
});

await check('Fresh Riyadh discovery default survives unrelated saves while explicit and legacy city choices remain',()=>{
 const fresh=createApp();assert.equal(fresh.json('profile.preferredCity'),'riyadh');
 fresh.evaluate("saveProfile({...profileDraft,achievements:'Synthetic evidence'})");
 assert.equal(fresh.json('profile.preferredCity'),'riyadh');
 assert.equal(createApp(fresh.storage).json('profile.preferredCity'),'riyadh');
 for(const stored of [{preferredCity:''},{}]){const app=createApp(new Map([['ahmad-profile',JSON.stringify(stored)]]));assert.equal(app.json('profile.preferredCity??null'),stored.preferredCity??null)}
});
await check('Partial employer failure retains old eligible discovery evidence without refreshing it',()=>{
 const app=createApp(),old='2026-10-09T00:10:00Z',newer='2026-10-09T00:20:00Z';
 const alcon={...role,id:'partial-alcon',company:'Alcon'},roche={...role,id:'partial-roche',company:'Roche'};
 app.receive({checkedAt:old,jobs:[alcon,roche],sources:[{name:'Alcon',ok:true,count:1},{name:'Roche',ok:true,count:1}]});
 const partial={checkedAt:newer,jobs:[],sources:[{name:'Alcon',ok:false,count:0,error:'Synthetic outage'},{name:'Roche',ok:true,count:0}]};app.receive(partial);
 assert.deepEqual(app.json('live.jobs.map(j=>j.id)'),['partial-alcon']);assert.equal(app.json('live.jobs[0].lastCheckedAt'),old);
 assert(app.evaluate("row(live.jobs[0],0)").includes('Not refreshed'));
 const reload=createApp(app.storage);assert.equal(reload.json('live.jobs[0].lastCheckedAt'),old);
 reload.receive({...partial,checkedAt:'2026-10-09T00:30:00Z'});assert.equal(reload.json('live.jobs[0].lastCheckedAt'),old);
 reload.receive({checkedAt:'2026-10-09T00:40:00Z',jobs:[alcon],sources:[{name:'Alcon',ok:true,count:1}]});
 assert.equal(reload.json('live.jobs[0].lastCheckedAt'),'2026-10-09T00:40:00Z');assert(!reload.evaluate("row(live.jobs[0],0)").includes('Not refreshed'));
 reload.receive({checkedAt:'2026-10-09T00:50:00Z',jobs:[],sources:[{name:'Alcon',ok:true,count:0}]});assert.equal(reload.json('live.jobs.length'),0);
});

await check('Incomplete successful detail checks retain earlier jobs and observation dates',()=>{
 const app=createApp();app.receive(success([role],oldTime));
 app.receive({checkedAt:newTime,jobs:[],sources:[{name:'Alcon',ok:true,count:0,detailErrors:1,error:'One detail unavailable'}]});
 assert.equal(app.json('live.jobs[0].lastCheckedAt'),oldTime);assert(app.evaluate('unrefreshed(live.jobs[0])'));
 assert.equal(createApp(app.storage).json('live.jobs[0].lastCheckedAt'),oldTime);
});

await check('Exact successful employer exclusions survive partial failure without deleting tracked history',()=>{
 const app=createApp(),gone={...role,id:'excluded-role'},unknown={...role,id:'unknown-role'};
 app.receive(success([gone,unknown],oldTime));app.changeStatus('excluded-role','Applied');
 app.receive({checkedAt:newTime,jobs:[],sources:[{name:'Alcon',ok:true,count:0,detailErrors:1,excludedIds:[gone.id]}]});
 assert.deepEqual(app.json('live.jobs.map(j=>j.id)'),[unknown.id]);assert.equal(app.json('live.jobs[0].lastCheckedAt'),oldTime);
 assert.equal(app.json("states['excluded-role']"),'Applied');assert(app.json('retainedJobs().map(j=>j.id)').includes(gone.id));
 const reload=createApp(app.storage);assert.deepEqual(reload.json('live.jobs.map(j=>j.id)'),[unknown.id]);
 for(const excludedIds of [[''],[1],Array(21).fill('x'),['x'.repeat(257)],'bad'])assert.equal(app.evaluate(`C.normalizeLive(${JSON.stringify({checkedAt:newTime,jobs:[],sources:[{name:'Alcon',ok:true,count:0,excludedIds}]})})`),null);
});

if (!process.exitCode) console.log(`${cases.length} application-state regression groups passed.`);
