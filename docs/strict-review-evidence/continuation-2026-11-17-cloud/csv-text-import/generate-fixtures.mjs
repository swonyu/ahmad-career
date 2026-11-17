// Offline interoperability fixture. This executes the production serializer.
// It does not open an account, dispatch a download, or contact an employer.
import { createRequire } from 'node:module';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';

const root = resolve(process.argv[2] ?? process.cwd());
const output = dirname(fileURLToPath(import.meta.url));
const require = createRequire(pathToFileURL(join(root, 'hosted/package.json')));
const { build } = require('esbuild');
const temp = await mkdtemp(join(tmpdir(), 'career-csv-engine-'));
try {
  const entries = [['app/phone/record-tools.ts', 'tools'], ['app/phone/model.ts', 'model'], ['app/i18n/core.ts', 'i18n']];
  await Promise.all(entries.map(([entry, name]) => build({
    absWorkingDir: join(root, 'hosted'), entryPoints: [entry], outfile: join(temp, name + '.mjs'),
    bundle: true, platform: 'node', format: 'esm', logLevel: 'silent',
  })));
  const tools = await import(pathToFileURL(join(temp, 'tools.mjs')).href);
  const model = await import(pathToFileURL(join(temp, 'model.mjs')).href);
  const i18n = await import(pathToFileURL(join(temp, 'i18n.mjs')).href);
  const samples = ['000123', '123456789012345678901', '1E10', '2026-11-17', 'مختلط / Mixed 00123', '=1+1'];
  const records = samples.map((value, index) => {
    const job = { id: 'csv-synthetic-' + index, title: value, company: value, location: 'الرياض / Riyadh', country: 'SA', url: 'https://example.org/career-finder-csv/' + index };
    return { ...model.blankRecord(job), note: value, stage: index % 2 ? 'interview' : 'saved', appliedElsewhere: index % 2 === 1, appliedDate: index % 2 ? '2026-11-17' : '', followUpDate: '2026-11-21', updatedAt: '2026-11-17T14:00:00.000Z' };
  });
  const files = [];
  for (const language of ['en', 'ar']) {
    const csv = tools.applicationRecordsCSV(records, key => i18n.translate(key, language));
    const name = 'career-records-' + language + '.csv';
    await writeFile(join(output, name), csv);
    files.push({ name, language, bytes: Buffer.byteLength(csv), sha256: createHash('sha256').update(csv).digest('hex') });
  }
  const sourceHashes = {};
  for (const path of ['hosted/app/phone/record-tools.ts', 'hosted/app/phone/model.ts', 'hosted/app/i18n/core.ts', 'hosted/app/i18n/messages.ar.json']) {
    sourceHashes[path] = createHash('sha256').update(await readFile(join(root, path))).digest('hex');
  }
  const receipt = { generatedAt: new Date().toISOString(), unchangedExporterSourceCommit: '880e878f6f528d903c42951f10a8b216094c889c', catalogState: 'working follow-up; exact source hashes below', syntheticRecords: records.length, sampleValues: samples, columns: 9, sourceHashes, files, scope: 'Exact product CSV generation only. Engine import, browser saving and calendar import are separate checks.' };
  await writeFile(join(output, 'fixture-generation.json'), JSON.stringify(receipt, null, 2) + '\n');
  console.log(JSON.stringify({ records: records.length, files }));
} finally { await rm(temp, { recursive: true, force: true }); }
