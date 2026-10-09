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
  for (const { name, source } of scripts) vm.runInContext(source, context, { filename: name });
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

await check('Independent criteria and professional profile edits merge across tabs using neutral defaults',async()=>{
  const shared=new Map(),a=createApp(shared,{shared:true}),b=createApp(shared,{shared:true});
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

if (!process.exitCode) console.log(`\n${cases.length} application-state regression groups passed.`);
