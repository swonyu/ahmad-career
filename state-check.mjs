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
    console, URL: TestURL, Blob, Intl, Date,
    setTimeout: () => 1, clearTimeout() {},
    scrollTo() {}, navigator: {locks: options.locks}, location: { protocol: 'https:' },
    fetch() { throw new Error('Unexpected network request in state regression checks'); },
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
    receive(payload) { context.receiveNativeJobs(payload); },
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
const oldTime = '2026-10-08T08:00:00.000Z';
const newTime = '2026-10-08T09:00:00.000Z';
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

if (!process.exitCode) console.log(`\n${cases.length} application-state regression groups passed.`);
