import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import ts from 'typescript';
import { build } from 'esbuild';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const directory = await mkdtemp(join(tmpdir(), 'career-record-tools-'));
after(() => rm(directory, { recursive: true, force: true }));
await Promise.all([
  ['app/phone/record-tools.ts', 'tools.mjs'], ['app/phone/model.ts', 'model.mjs'], ['app/i18n/core.ts', 'i18n.mjs'],
].map(([entry, filename]) => build({ entryPoints: [entry], outfile: join(directory, filename), bundle: true, platform: 'node', format: 'esm', logLevel: 'silent' })));
const tools = await import(pathToFileURL(join(directory, 'tools.mjs')).href);
const model = await import(pathToFileURL(join(directory, 'model.mjs')).href);
const i18n = await import(pathToFileURL(join(directory, 'i18n.mjs')).href);
const t = language => (key, values) => i18n.translate(key, language, values);
const job = Object.freeze({ id: 'synthetic-job', title: 'Software Engineer', company: 'Synthetic Employer', location: 'Riyadh', country: 'SA', url: 'https://employer.example/careers/123' });
const record = values => ({ ...model.blankRecord(job), updatedAt: '2026-11-17T18:00:00.000Z', followUpDate: '2026-11-24', note: 'SYNTHETIC_PRIVATE_NOTE', ...values });
const defer = () => { let resolve; return { promise: new Promise(done => resolve = done), resolve: value => resolve(value) }; };

// Parse the generated CSV independently, including quoted separators and line breaks.
function parseCSV(value) {
  assert.equal(value[0], '\ufeff');
  const rows = [], fields = [];
  let field = '', quoted = false;
  for (let offset = 1; offset < value.length; offset++) {
    const c = value[offset];
    if (c === '"') {
      if (quoted && value[offset + 1] === '"') { field += '"'; offset++; }
      else quoted = !quoted;
    } else if (!quoted && c === ',') { fields.push(field); field = ''; }
    else if (!quoted && c === '\r') {
      assert.equal(value[++offset], '\n');
      fields.push(field); rows.push([...fields]); fields.length = 0; field = '';
    } else field += c;
  }
  assert.equal(quoted, false); assert.equal(field, ''); assert.equal(fields.length, 0);
  return rows;
}
function calendarLines(value) {
  assert(value.endsWith('\r\n'));
  for (const line of value.slice(0, -2).split('\r\n')) {
    assert(Buffer.byteLength(line, 'utf8') <= 75, 'RFC 5545 physical line exceeds 75 octets');
    assert.equal(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.from(line)), line);
  }
  return value.replace(/\r\n[ \t]/g, '').split('\r\n').filter(Boolean);
}
function property(lines, name) { return lines.find(line => line.startsWith(name + ':'))?.slice(name.length + 1); }
function decodedText(value) { return value.replace(/\\([nN,;\\])/g, (_, c) => c === 'n' || c === 'N' ? '\n' : c); }

test('Saved search finds every term across visible metadata and the active saved note', () => {
  const note = Object.freeze(record({ note: 'Contact Noor about the referral' }));
  const before = JSON.stringify({ job, note });
  assert(tools.matchesSavedSearch(job, note, 'engineer NOOR riyadh'));
  assert(tools.matchesSavedSearch(job, note, 'referral'));
  assert(tools.matchesSavedSearch(job, note, '  \n '));
  assert(!tools.matchesSavedSearch(job, note, 'engineer Jeddah'));
  assert(!tools.matchesSavedSearch(job, undefined, 'referral'));
  assert(!tools.matchesSavedSearch(job, note, job.id));
  assert(!tools.matchesSavedSearch(job, note, 'employer.example'));
  assert.equal(JSON.stringify({ job, note }), before);
});

test('Saved comparison removes only the agreed Arabic vowel marks and tatweel while preserving distinct letters', () => {
  const role = Object.freeze({ ...job, title: 'مُهَنْدِس بَرْمَجَة', company: 'الشـركة', location: 'الرِّيَاض' });
  assert(tools.matchesSavedSearch(role, { note: 'هٰذا موعد مُتابَعَة' }, 'مهندس الشركة الرياض متابعة هذا'));
  assert.equal(tools.savedSearchText('ÉCOLE'), 'école');
  assert.equal(tools.savedSearchText('e\u0301'), 'é');
  for (const [a, b] of [['أحمد', 'احمد'], ['إدارة', 'ادارة'], ['آفاق', 'افاق'], ['مدرسة', 'مدرسه'], ['فتى', 'فتي'], ['س\u0653', 'س'], ['س\u0654', 'س'], ['س\u0655', 'س']]) {
    assert.notEqual(tools.savedSearchText(a), tools.savedSearchText(b), `${a} and ${b} must stay distinct`);
  }
});

test('CSV is UTF-8 BOM, quoted CRLF data with original Arabic, quotes and multiline notes', () => {
  const input = Object.freeze(record({ title: 'مهندس, "أول"', company: 'شركة الاختبار', note: 'line one\nline two, "quoted"\r\nنص خاص', stage: 'interview', appliedElsewhere: true, appliedDate: '2026-11-17' }));
  const before = JSON.stringify(input), csv = tools.applicationRecordsCSV([input]), rows = parseCSV(csv);
  assert.equal(rows.length, 2); assert.equal(rows[0].length, 9); assert.equal(rows[1].length, 9);
  assert.deepEqual(rows[1], [input.title, input.company, input.identity, 'Interview', 'Yes', input.appliedDate, input.followUpDate, input.note, input.updatedAt]);
  assert.match(rows[0][3], /self-entered/); assert.match(rows[0][8], /not application time/);
  assert.equal(JSON.stringify(input), before);
});

test('CSV visibly neutralizes formula-like text including compatibility characters and leading controls', () => {
  const dangerous = ['=1+1', '+SUM(1,2)', '-1+2', '@SUM(A1:A2)', '\t=1', '\r=1', '\n=1', '  =1', '\ufeff=1', '\u2066=1', "'=1", '"=1', '＝1+1', '＋1', '－1', '＠SUM(1)', '\u3000＝1'];
  for (const value of dangerous) {
    const row = parseCSV(tools.applicationRecordsCSV([record({ title: value, company: value, note: value })]))[1];
    for (const index of [0, 1, 7]) assert.equal(row[index], 'Text: ' + value, `Unsafe spreadsheet value ${JSON.stringify(value)}`);
  }
  for (const value of ['Ordinary text', 'شركة الاختبار', 'two\nlines', 'prefix =1', 'comma, quote"']) {
    assert.equal(parseCSV(tools.applicationRecordsCSV([record({ note: value })]))[1][7], value);
  }
});

test('CSV selects only record fields and translates app labels without translating private content', () => {
  const input = Object.freeze({ ...record({ title: 'Saved', company: 'Interview', note: 'Closed' }), email: 'SYNTHETIC_PROFILE_EMAIL', password: 'SYNTHETIC_SECRET', resume: { dataBase64: 'SYNTHETIC_CV' }, scope: 'SYNTHETIC_OTHER_SCOPE', accessToken: 'SYNTHETIC_TOKEN' });
  const csv = tools.applicationRecordsCSV([input], t('ar')), rows = parseCSV(csv);
  assert(rows[0].every(value => /[\u0600-\u06ff]/u.test(value)));
  assert.equal(rows[1][0], 'Saved'); assert.equal(rows[1][1], 'Interview'); assert.equal(rows[1][7], 'Closed');
  assert.equal(rows[1][3], t('ar')('Saved')); assert.equal(rows[1][4], t('ar')('No'));
  for (const secret of ['SYNTHETIC_PROFILE_EMAIL', 'SYNTHETIC_SECRET', 'SYNTHETIC_CV', 'SYNTHETIC_OTHER_SCOPE', 'SYNTHETIC_TOKEN']) assert(!csv.includes(secret));
});

test('calendar uses civil DATE and one day even on leap days and the maximum supported year', async () => {
  for (const day of ['1900-01-01', '2000-02-29', '2026-03-08', '2026-11-01', '9999-12-31']) {
    const lines = calendarLines(await tools.followUpCalendar(record({ followUpDate: day })));
    assert.equal(property(lines, 'DTSTART;VALUE=DATE'), day.replaceAll('-', ''));
    assert.equal(property(lines, 'DURATION'), 'P1D');
    assert.equal(property(lines, 'DTEND'), undefined); assert(!lines.some(line => /TZID|VTIMEZONE/.test(line)));
    assert.match(property(lines, 'DTSTAMP'), /^\d{8}T\d{6}Z$/);
    assert.equal(lines.filter(line => line === 'BEGIN:VEVENT').length, 1);
    assert.equal(lines.at(-1), 'END:VCALENDAR');
  }
  for (const day of ['', '2026-02-29', '1900-02-29', '2026-13-01', '2026-11-31', '2026-1-01', '1899-12-31', '10000-01-01', '2026-11-24T00:00:00Z']) {
    await assert.rejects(tools.followUpCalendar(record({ followUpDate: day })), /valid follow-up date/);
  }
});

test('calendar escapes injected properties and folds long Arabic and emoji by UTF-8 octets', async () => {
  const input = record({ title: 'مهندس 🧭 '.repeat(35) + '\nBEGIN:VEVENT\r\nATTENDEE:mailto:injected@example.com', company: 'Comma, semicolon; backslash\\ شركة', note: 'SYNTHETIC_NOTE_NOT_FOR_CALENDAR' });
  const value = await tools.followUpCalendar(input, t('ar')), lines = calendarLines(value);
  assert(value.includes('\r\n '), 'Expected actual RFC folding');
  assert.equal(lines.filter(line => line === 'BEGIN:VEVENT').length, 1);
  assert(!lines.some(line => line.startsWith('ATTENDEE:')));
  assert.equal(decodedText(property(lines, 'SUMMARY')), t('ar')('Follow up') + ': ' + input.title.replace(/\r\n|\r/g, '\n') + ' · ' + input.company);
  assert(!value.includes(input.note));
  assert.equal(property(lines, 'URL'), input.identity);
});

test('calendar UID is stable for the public job and date without private fields or provider state', async () => {
  const first = calendarLines(await tools.followUpCalendar(record({ email: 'SYNTHETIC_EMAIL', scope: 'SYNTHETIC_ACCOUNT', accessToken: 'SYNTHETIC_TOKEN' })));
  const changedPrivate = calendarLines(await tools.followUpCalendar(record({ title: 'Different title', company: 'Different employer caption', note: 'Different private note' }), t('ar')));
  const changedDate = calendarLines(await tools.followUpCalendar(record({ followUpDate: '2026-11-25' })));
  const changedJob = calendarLines(await tools.followUpCalendar(record({ identity: 'https://employer.example/careers/124' })));
  assert.match(property(first, 'UID'), /^career-finder-follow-up-[a-f0-9]{64}$/);
  assert.equal(property(first, 'UID'), property(changedPrivate, 'UID'));
  assert.notEqual(property(first, 'UID'), property(changedDate, 'UID'));
  assert.notEqual(property(first, 'UID'), property(changedJob, 'UID'));
  for (const line of first) assert(!/SYNTHETIC_(?:EMAIL|ACCOUNT|TOKEN|PRIVATE_NOTE)|^(?:METHOD|ATTENDEE|ORGANIZER|BEGIN:VALARM)/.test(line));
});

// Execute actual UI handlers, stubbing only surrounding state/transport. This
// exercises the same generation and account fences as a browser click.
const source = await readFile(new URL('../app/phone/PhoneApp.tsx', import.meta.url), 'utf8');
const tree = ts.createSourceFile('PhoneApp.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
function extract(name) {
  const component = tree.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'PhoneApp');
  for (const node of component.body.statements) {
    if (ts.isFunctionDeclaration(node) && node.name?.text === name) return node.getText(tree);
    if (ts.isVariableStatement(node)) {
      const declaration = node.declarationList.declarations.find(value => value.name.getText(tree) === name);
      if (declaration?.initializer) return declaration.initializer.getText(tree);
    }
  }
  assert.fail(`Actual production declaration ${name} must exist`);
}
function install(name, context) {
  const js = ts.transpileModule('globalThis.' + name + ' = ' + extract(name), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText;
  vm.runInNewContext(js, context); return context[name];
}
function exportHarness({ signedIn = false, calendar = tools.followUpCalendar } = {}) {
  const account = signedIn ? { id: 'synthetic+owner-a', email: 'SYNTHETIC_PROFILE_EMAIL' } : null;
  const workspace = account ? { accountId: account.id, workspaceId: '00000000-0000-4000-8000-000000000001' } : null;
  const scope = account ? `account:${encodeURIComponent(account.id)}:${workspace.workspaceId}` : 'guest';
  const saved = { ...model.blankSnapshot(scope), records: [record()], profile: { ...model.blankProfile(), firstName: 'SYNTHETIC_PROFILE_NAME' } };
  const downloads = [], notices = [];
  const context = { account, snapshotRef: { current: saved }, workspaceRef: { current: workspace }, epoch: { current: 7 }, identityUnverified: { current: false }, locked: false, checkingIdentity: false, storageProblem: '', same: (a, b) => JSON.stringify(a) === JSON.stringify(b), civilDate: model.civilDate, applicationRecordsCSV: tools.applicationRecordsCSV, followUpCalendar: calendar, t: t('en'), run: (_label, action) => action(context.epoch.current), download: (value, filename, mime) => downloads.push({ value, filename, mime }), setNotice: value => notices.push(value), phoneAPI: () => { throw Error('Exports must not call a remote service'); } };
  for (const name of ['assertCurrent', 'local', 'assertRecordExport', 'exportRecordsCSV', 'exportFollowUp']) install(name, context);
  return { context, saved, downloads, notices };
}

test('record locations are optional for legacy snapshots and bounded for new records', () => {
  const fresh = record(), legacy = { ...fresh }; delete legacy.location;
  assert.equal(fresh.location, job.location);
  assert.equal(model.recordSchema.parse(legacy).location, undefined);
  const snapshot = { ...model.blankSnapshot('guest'), records: [legacy] };
  assert.equal(model.parseSnapshot(JSON.parse(JSON.stringify(snapshot)), 'guest').records[0].location, undefined);
  for (const location of ['x'.repeat(501), 'Riyadh\u0000', 123, null]) assert.throws(() => model.recordSchema.parse({ ...legacy, location }));
  const recovered = model.parseSnapshot({ ...snapshot, records: [{ ...legacy, location: 'الرياض · Riyadh' }] }, 'guest');
  assert.equal(recovered.records[0].location, 'الرياض · Riyadh');
});

test('removing a bookmark retains its latest nonblank location for current, legacy and re-bookmarked records', async () => {
  const scenarios = [
    { name: 'current record', previousLocation: 'Riyadh', bookmarkLocation: 'Riyadh', expected: 'Riyadh' },
    { name: 'legacy record', previousLocation: undefined, bookmarkLocation: 'Riyadh', expected: 'Riyadh' },
    { name: 're-bookmarked empty location', previousLocation: '', bookmarkLocation: 'Riyadh', expected: 'Riyadh' },
    { name: 're-bookmarked changed location', previousLocation: 'Jeddah', bookmarkLocation: 'الرياض · Riyadh', expected: 'الرياض · Riyadh' },
    { name: 'blank bookmark preserves prior location', previousLocation: 'Jeddah', bookmarkLocation: '', expected: 'Jeddah' },
    { name: 'whitespace bookmark preserves prior location', previousLocation: 'Jeddah', bookmarkLocation: '   ', expected: 'Jeddah' },
    { name: 'missing legacy location remains unknown', previousLocation: undefined, bookmarkLocation: '', expected: undefined },
  ];
  for (const scenario of scenarios) {
    const h = exportHarness({ signedIn: true }), scope = h.saved.scope;
    h.saved.jobs = [{ ...job, location: scenario.bookmarkLocation }];
    if (scenario.previousLocation === undefined) delete h.saved.records[0].location;
    else h.saved.records[0].location = scenario.previousLocation;
    const before = JSON.stringify(h.saved), previous = { ...h.saved.records[0] };
    let persisted = null, selected = [previous.identity];
    Object.assign(h.context, {
      // A stale open dialog must not override the latest saved bookmark metadata.
      dialog: { kind: 'remove', job, scope }, jobIdentity: model.jobIdentity,
      persist: async (value, generation) => { h.context.assertCurrent(generation, value.scope); persisted = model.parseSnapshot(value, scope); },
      setSelected: update => { selected = update(selected); }, setDialog: () => {},
    });
    install('removeBookmark', h.context); await h.context.removeBookmark();
    assert.equal(JSON.stringify(h.saved), before, 'removal must not mutate the original snapshot');
    assert.equal(persisted.jobs.length, 0); assert.equal(persisted.records.length, 1); assert.equal(selected.length, 0);
    const expected = scenario.expected === undefined ? previous : { ...previous, location: scenario.expected };
    assert.deepEqual(persisted.records[0], expected, scenario.name);
    Object.assign(h.context, { jobs: persisted.jobs, records: persisted.records });
    const retainedJobs = install('recordJobs', h.context);
    assert.equal(retainedJobs.length, 1);
    assert.equal(retainedJobs[0].location, scenario.expected ?? '', scenario.name);
    if (scenario.expected) assert(tools.matchesSavedSearch(retainedJobs[0], persisted.records[0], scenario.expected), scenario.name);
    assert(tools.matchesSavedSearch(retainedJobs[0], persisted.records[0], 'SYNTHETIC_PRIVATE_NOTE'));
    assert.equal(model.parseSnapshot(JSON.parse(JSON.stringify(persisted)), scope).records[0].location, scenario.expected);
  }
});

test('bookmark metadata preservation fails with account mismatch or rejected persistence', async () => {
  for (const problem of ['scope', 'storage']) {
    const h = exportHarness({ signedIn: true }); h.saved.jobs = [job]; delete h.saved.records[0].location;
    const before = JSON.stringify(h.saved); let persistCalls = 0, closed = false;
    Object.assign(h.context, {
      dialog: { kind: 'remove', job, scope: problem === 'scope' ? 'account:another-owner' : h.saved.scope },
      jobIdentity: model.jobIdentity,
      persist: async () => { persistCalls++; throw Error('Synthetic storage failure'); },
      setSelected: () => { assert.fail('Selection must stay after failed removal'); }, setDialog: () => { closed = true; },
    });
    install('removeBookmark', h.context); await assert.rejects(h.context.removeBookmark());
    assert.equal(persistCalls, problem === 'scope' ? 0 : 1); assert.equal(closed, false);
    assert.equal(JSON.stringify(h.saved), before); assert.equal(h.notices.length, 0);
  }
});

test('actual CSV action exports only the current guest or confirmed account records', async () => {
  for (const signedIn of [false, true]) {
    const h = exportHarness({ signedIn }), before = JSON.stringify(h.saved);
    h.context.olderDrafts = [{ scope: 'account:synthetic-other:old', note: 'OTHER_ACCOUNT_NOTE' }];
    h.context.quarantine = { current: { privateMarker: 'QUARANTINED_PRIVATE_DRAFT' } };
    await h.context.exportRecordsCSV();
    assert.equal(h.downloads.length, 1); assert.equal(h.downloads[0].mime, 'text/csv;charset=utf-8');
    assert(h.downloads[0].value.includes('SYNTHETIC_PRIVATE_NOTE'));
    for (const marker of ['SYNTHETIC_PROFILE_NAME', 'SYNTHETIC_PROFILE_EMAIL', 'OTHER_ACCOUNT_NOTE', 'QUARANTINED_PRIVATE_DRAFT']) assert(!h.downloads[0].value.includes(marker));
    assert.equal(JSON.stringify(h.saved), before);
  }
});

test('actual record exports fail closed before reading unconfirmed, locked, wrong-owner or earlier-workspace data', async t => {
  const changes = {
    identity: h => h.context.identityUnverified.current = true,
    checking: h => h.context.checkingIdentity = true,
    locked: h => h.context.locked = true,
    owner: h => h.context.workspaceRef.current.accountId = 'synthetic-owner-b',
    missingOwner: h => h.context.workspaceRef.current = null,
    olderWorkspace: h => h.context.workspaceRef.current.workspaceId = '00000000-0000-4000-8000-000000000002',
    earlierScope: h => h.saved.scope += ':earlier',
  };
  for (const [name, change] of Object.entries(changes)) await t.test(name, async () => {
    const h = exportHarness({ signedIn: true }); change(h);
    await assert.rejects(h.context.exportRecordsCSV());
    await assert.rejects(h.context.exportFollowUp(h.saved.records[0]));
    assert.equal(h.downloads.length, 0);
  });
});

test('actual calendar action rechecks identity, generation, workspace and record after asynchronous hashing', async t => {
  const changes = {
    revalidation: h => h.context.identityUnverified.current = true,
    generation: h => h.context.epoch.current++,
    owner: h => h.context.workspaceRef.current.accountId = 'synthetic-owner-b',
    workspace: h => h.context.workspaceRef.current.workspaceId = '00000000-0000-4000-8000-000000000002',
    snapshot: h => h.context.snapshotRef.current = { ...h.saved },
    date: h => h.saved.records[0].followUpDate = '2026-11-26',
    removal: h => h.saved.records = [],
  };
  for (const [name, change] of Object.entries(changes)) await t.test(name, async () => {
    const gate = defer(), entered = defer();
    const h = exportHarness({ signedIn: true, calendar: async (...args) => { const value = await tools.followUpCalendar(...args); entered.resolve(); await gate.promise; return value; } });
    const originalProfile = JSON.stringify(h.saved.profile), pending = h.context.exportFollowUp(h.saved.records[0]);
    await entered.promise; change(h); gate.resolve(); await assert.rejects(pending);
    assert.equal(h.downloads.length, 0); assert.equal(h.notices.length, 0);
    assert.equal(JSON.stringify(h.saved.profile), originalProfile);
  });
});

test('actual calendar action accepts a saved record and rejects unsaved editor copies or missing dates', async () => {
  const h = exportHarness({ signedIn: true }), before = JSON.stringify(h.saved);
  await assert.rejects(h.context.exportFollowUp({ ...h.saved.records[0] }));
  assert.equal(h.downloads.length, 0);
  await h.context.exportFollowUp(h.saved.records[0]);
  assert.equal(h.downloads.length, 1); assert.equal(h.downloads[0].mime, 'text/calendar;charset=utf-8');
  assert.equal(property(calendarLines(h.downloads[0].value), 'DTSTART;VALUE=DATE'), '20261124');
  assert.match(h.notices[0].text, /alerts depend on your calendar/);
  assert.equal(JSON.stringify(h.saved), before);
  const empty = exportHarness(); empty.saved.records[0].followUpDate = '';
  await assert.rejects(empty.context.exportFollowUp(empty.saved.records[0])); assert.equal(empty.downloads.length, 0);
});

test('actual Saved selector searches active notes and keeps the existing applied/follow-up filters', () => {
  const current = record({ note: 'call recruiter' }), other = { ...job, id: 'other', url: 'https://employer.example/careers/other', title: 'Designer' };
  const context = { jobs: [job, other], recordJobs: [], recordsByID: new Map([[current.identity, current]]), savedQuery: 'engineer recruiter', savedFilter: 'all', matchesSavedSearch: tools.matchesSavedSearch, jobIdentity: model.jobIdentity };
  const select = () => install('shownJobs', context);
  assert.deepEqual(Array.from(select(), value => value.id), [job.id]);
  context.savedFilter = 'applied'; assert.equal(select().length, 0);
  context.savedFilter = 'followups'; assert.deepEqual(Array.from(select(), value => value.id), [job.id]);
  current.stage = 'closed'; assert.equal(select().length, 0);
  context.savedFilter = 'all'; context.savedQuery = 'unrelated earlier draft'; assert.equal(select().length, 0);
});

test('new controls stay inside existing disclosures and require a saved valid follow-up day', () => {
  const nodes = [];
  function visit(node) {
    if (ts.isJsxElement(node) && node.openingElement.tagName.getText(tree) === 'details' && /Spreadsheet export|Calendar reminder/.test(node.getText(tree))) nodes.push(node);
    ts.forEachChild(node, visit);
  }
  visit(tree); assert.equal(nodes.length, 2);
  const require = createRequire(import.meta.url);
  for (const node of nodes) {
    const calendar = node.getText(tree).includes('Calendar reminder');
    assert(ts.isBinaryExpression(node.parent), 'Disclosure must have a visibility condition');
    const expression = node.parent.getText(tree);
    const compiled = ts.transpileModule('exports.render = () => (' + expression + ');', { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
    for (const available of [false, true]) {
      const context = { exports: {}, require, t: t('ar'), snapshot: { records: available ? [record()] : [] }, detailRecord: available ? record() : undefined, civilDate: model.civilDate, cannotSave: false, Download: () => null, exportRecordsCSV: () => {}, exportFollowUp: () => {} };
      vm.runInNewContext(compiled, context);
      const html = renderToStaticMarkup(React.createElement(context.exports.render));
      if (!available) assert.equal(html, '');
      else {
        assert.match(html, /^<details /); assert(!/<details[^>]*\bopen(?:\s|=|>)/.test(html));
        assert.match(html, /<summary>[^<]*[\u0600-\u06ff]/u);
        assert(html.includes(calendar ? '.ics' : 'CSV'));
      }
    }
  }
});
