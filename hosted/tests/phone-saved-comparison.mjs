import assert from 'node:assert/strict';
import test, {after} from 'node:test';
import {mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {build} from 'esbuild';

const directory = await mkdtemp(join(tmpdir(), 'career-saved-comparison-'));
after(() => rm(directory, {recursive: true, force: true}));
await build({entryPoints: ['app/phone/saved-comparison.ts', 'app/phone/model.ts'], outdir: directory, bundle: true, platform: 'node', format: 'esm', outExtension: {'.js': '.mjs'}});
const comparison = await import(pathToFileURL(join(directory, 'saved-comparison.mjs')).href);
const model = await import(pathToFileURL(join(directory, 'model.mjs')).href);
const url = id => `https://jobs.lever.co/synthetic-comparison/10000000-0000-4000-8000-${String(id).padStart(12, '0')}`;
const job = (id, location) => ({id: String(id), title: 'Product Designer', company: 'Synthetic Studio', location, country: 'SA', url: url(id)});
const riyadh = {...job(201, 'Riyadh'), url: url(201) + '?utm_source=synthetic', sourceName: 'Synthetic employer board', checkedAt: '2026-11-21T18:00:00Z'};
const jeddah = {...job(202, 'Jeddah'), sourceName: 'Synthetic employer board', checkedAt: '2026-11-20T12:00:00Z'};
const record = (role, change = {}) => ({...model.blankRecord(role), ...change});
const records = [record(riyadh, {stage: 'interview', appliedElsewhere: true, appliedDate: '2026-11-21', followUpDate: '2026-11-24', manualResumeName: 'CV-A.pdf'}), record(jeddah, {followUpDate: '2026-11-26'})];

test('same title and employer retain distinct location, original link, stage and follow-up', () => {
  const before = JSON.stringify({jobs: [riyadh, jeddah], records});
  const rows = comparison.savedComparisonRows([riyadh, jeddah], records);
  assert.equal(rows.length, 2);
  assert.notEqual(rows[0].identity, rows[1].identity);
  assert.deepEqual(rows.map(row => [row.job.location, row.job.url, row.record.stage, row.record.followUpDate]), [
    ['Riyadh', riyadh.url, 'interview', '2026-11-24'], ['Jeddah', jeddah.url, 'saved', '2026-11-26'],
  ]);
  assert.equal(rows[0].record.manualResumeName, 'CV-A.pdf');
  assert.equal(JSON.stringify({jobs: [riyadh, jeddah], records}), before);
});

test('reordering never joins records by row index or title', () => {
  const rows = comparison.savedComparisonRows([jeddah, riyadh], [...records].reverse());
  assert.equal(rows[0].record.followUpDate, '2026-11-26');
  assert.equal(rows[1].record.stage, 'interview');
  const selected = [model.jobIdentity(riyadh.url), model.jobIdentity(jeddah.url)];
  assert.deepEqual(comparison.availableComparisonSelection(selected, rows), selected);
});

test('tracking and apply aliases cannot occupy both comparison columns', () => {
  const alias = {...riyadh, id: 'alias', url: url(201) + '/apply?source=another'};
  const rows = comparison.savedComparisonRows([riyadh, alias, jeddah], records);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].job.url, riyadh.url);
  assert.deepEqual(comparison.availableComparisonSelection([rows[0].identity, rows[0].identity, rows[1].identity], rows), rows.map(row => row.identity));
});

test('selection requires two distinct available postings and prunes removed postings without replacement', () => {
  const rows = comparison.savedComparisonRows([riyadh, jeddah, job(203, 'Dammam')], records);
  let selected = comparison.toggleComparisonSelection([], rows[0].identity, rows);
  selected = comparison.toggleComparisonSelection(selected, rows[1].identity, rows);
  assert.deepEqual(comparison.toggleComparisonSelection(selected, rows[2].identity, rows), selected);
  assert.deepEqual(comparison.toggleComparisonSelection(selected, url(999), rows), selected);
  assert.deepEqual(comparison.availableComparisonSelection(selected, rows.slice(1)), [rows[1].identity]);
  assert.deepEqual(comparison.toggleComparisonSelection(selected, rows[0].identity, rows), [rows[1].identity]);
});

test('legacy and manually saved records do not acquire invented source or check timestamps', () => {
  const old = record(job(301, 'Riyadh'));
  const rebuilt = comparison.jobFromRecord(old);
  assert.equal('sourceName' in rebuilt, false); assert.equal('checkedAt' in rebuilt, false);
  const [row] = comparison.savedComparisonRows([], [old]);
  assert.equal(row.bookmarked, false); assert.equal(row.job.url, old.identity);
  assert.equal(row.job.sourceName, undefined); assert.equal(row.job.checkedAt, undefined);
});

test('observed metadata survives record editing, serialization, restart and exact scope validation', () => {
  const original = records[0];
  const edited = model.updateRecord(original, {...original, note: 'Fictional interview note'});
  assert.equal(edited.checkedAt, original.checkedAt); assert.equal(edited.sourceName, original.sourceName);
  const snapshot = {...model.blankSnapshot('account:synthetic-a'), jobs: [riyadh, jeddah], records: [edited, records[1]]};
  const restored = model.parseSnapshot(JSON.parse(JSON.stringify(snapshot)), 'account:synthetic-a');
  const rows = comparison.savedComparisonRows(restored.jobs, restored.records);
  assert.equal(rows[0].job.checkedAt, '2026-11-21T18:00:00Z');
  assert.equal(rows[0].record.manualResumeName, 'CV-A.pdf');
  assert.equal(rows[1].record.followUpDate, '2026-11-26');
  assert.throws(() => model.parseSnapshot(snapshot, 'account:synthetic-b'));
});

test('removing a bookmark retains its observed context alongside the original private record', () => {
  const legacy = record(job(201, '')); const before = JSON.stringify(legacy);
  const retained = model.retainRecordJobContext(legacy, riyadh);
  assert.equal(retained.location, 'Riyadh'); assert.equal(retained.sourceName, riyadh.sourceName);
  assert.equal(retained.checkedAt, riyadh.checkedAt); assert.equal(retained.updatedAt, legacy.updatedAt);
  assert.equal(JSON.stringify(legacy), before);
  const [row] = comparison.savedComparisonRows([], [retained]);
  assert.equal(row.bookmarked, false); assert.equal(row.job.checkedAt, riyadh.checkedAt);
  assert.equal(row.job.url, model.jobIdentity(riyadh.url));
});

test('missing or older observations cannot erase a known check, source or location', () => {
  const known = records[0];
  const older = {...riyadh, checkedAt: '2026-11-19T18:00:00Z', sourceName: '', location: ''};
  const retained = model.retainRecordJobContext(known, older);
  assert.equal(retained.checkedAt, known.checkedAt); assert.equal(retained.sourceName, known.sourceName); assert.equal(retained.location, known.location);
  const newer = {...riyadh, checkedAt: '2026-11-22T18:00:00Z'};
  assert.equal(model.retainRecordJobContext(known, newer).checkedAt, newer.checkedAt);
  assert.throws(() => model.retainRecordJobContext(known, jeddah));
});

test('invalid imported observation metadata is rejected while old records remain readable', () => {
  assert.equal(model.recordSchema.safeParse({...records[0], checkedAt: 'not-a-date'}).success, false);
  assert.equal(model.recordSchema.safeParse({...records[0], sourceName: 'x'.repeat(151)}).success, false);
  const legacy = {...records[0]};
  delete legacy.sourceName; delete legacy.checkedAt;
  assert.equal(model.recordSchema.safeParse(legacy).success, true);
});
