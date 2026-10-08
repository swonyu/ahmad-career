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

function createApp(initialStorage = new Map()) {
  const storage = new Map(initialStorage);
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
    scrollTo() {}, navigator: {}, location: { protocol: 'https:' },
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
      getItem: key => storage.get(key) ?? null,
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
    failAllWrites() { writesFail = true; },
    json(source) { return JSON.parse(evaluate(`JSON.stringify(${source})`)); },
    receive(payload) { context.receiveNativeJobs(payload); },
    changeStatus(id, value) {
      for (const callback of listeners.get('change') || []) {
        callback({ target: { id: '', dataset: { status: id }, value } });
      }
    },
    toggleSaved(id) { evaluate(`toggleSaved(${JSON.stringify(id)})`); },
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
  url: 'https://careers.alcon.com/regression-fixture',
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
  await run();
  cases.push(name);
  console.log(`PASS ${name}`);
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
  assert.match(app.toasts.at(-1), /unavailable/i);
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
  const otherRole = { ...role, id: 'state-regression-second-role', title: 'Second regression fixture' };
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

console.log(`\n${cases.length} application-state regression groups passed.`);
