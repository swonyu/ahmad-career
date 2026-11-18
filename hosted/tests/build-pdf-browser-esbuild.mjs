import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, readdir, realpath, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const args = process.argv.slice(2), flags = new Map();
if (args.length !== 6) throw Error('Usage: node tests/build-pdf-browser-esbuild.mjs --source-root /absolute/hosted --output-dir /absolute/test-only/dist --fixtures-dir /absolute/synthetic-upload-folder');
for (let i = 0; i < args.length; i += 2) {
  if (!['--source-root', '--output-dir', '--fixtures-dir'].includes(args[i]) || flags.has(args[i]) || !path.isAbsolute(args[i + 1])) throw Error('Three distinct absolute path arguments are required.');
  flags.set(args[i], args[i + 1]);
}
const sourceRoot = await realpath(flags.get('--source-root'));
const output = path.resolve(flags.get('--output-dir')), uploadFolder = path.resolve(flags.get('--fixtures-dir'));
const fixtureRoot = fileURLToPath(new URL('./fixtures/pdf-browser/', import.meta.url));
const inside = (parent, child) => { const relative = path.relative(parent, child); return relative === '' || relative !== '..' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative); };
for (const destination of [output, uploadFolder]) {
  const resolved = path.join(await realpath(path.dirname(destination)), path.basename(destination));
  if (inside(sourceRoot, resolved)) throw Error('Fixture output must stay outside the hosted source/deployment tree.');
}
if (inside(output, uploadFolder) || inside(uploadFolder, output)) throw Error('Upload fixtures and served output must use separate folders.');
const require = createRequire(path.join(sourceRoot, 'package.json'));
const { build } = await import(pathToFileURL(require.resolve('esbuild')).href);
const ts = require('typescript');
const digest = value => createHash('sha256').update(value).digest('hex');
const productionFiles = ['app/phone/PhoneApp.tsx', 'app/phone/pdf.ts', 'app/phone/pdf-validation.worker.ts', 'shared/pdf-readability.mjs', 'app/phone/model.ts'];
const sourceHashes = {};
for (const file of productionFiles) sourceHashes[file] = digest(await readFile(path.join(sourceRoot, file)));
const source = await readFile(path.join(sourceRoot, productionFiles[0]), 'utf8');
const tree = ts.createSourceFile('PhoneApp.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
function extract(name) {
  const found = [];
  const visit = node => {
    if (ts.isVariableDeclaration(node) && node.name.getText(tree) === name && node.initializer) found.push(node.initializer.getText(tree));
    if (ts.isFunctionDeclaration(node) && node.name?.text === name) found.push(node.getText(tree));
    ts.forEachChild(node, visit);
  };
  visit(tree); if (found.length !== 1) throw Error(`Expected exactly one current PhoneApp ${name}; refusing a mirrored handler.`); return found[0];
}
const readPDF = extract('readPDF'), assertCurrent = extract('assertCurrent');
const handlerHashes = { readPDF: digest(readPDF), assertCurrent: digest(assertCurrent) };
const fixtureDescriptions = JSON.parse(await readFile(path.join(fixtureRoot, 'pdf-fixtures.json'), 'utf8'));
const fixtures = [];
for (const description of fixtureDescriptions) {
  if (!/^[a-z-]+\.pdf$/.test(description.file)) throw Error('Unexpected synthetic fixture name.');
  const bytes = await readFile(path.join(fixtureRoot, description.file));
  fixtures.push({ ...description, bytes, sha256: digest(bytes), size: bytes.length });
}
const { assertReadablePDF } = await import(pathToFileURL(path.join(sourceRoot, 'server/pdf-readability.mjs')).href);
for (const fixture of fixtures) {
  let outcome;
  try { outcome = { code: 'valid', pageCount: (await assertReadablePDF(fixture.bytes)).pageCount }; }
  catch (error) { outcome = { code: error.code }; }
  if (outcome.code !== fixture.expected || fixture.pages && outcome.pageCount !== fixture.pages) throw Error('Synthetic fixture did not have the expected parser outcome: ' + fixture.file);
}
const prior = fixtures.find(value => value.file === 'valid.pdf');
const temp = await mkdtemp(path.join(tmpdir(), 'career-pdf-browser-'));
let outputOwned = false;
try {
  await mkdir(output); outputOwned = true; // Never empty or overwrite someone else's output.
  const files = ['index.html', 'App.template.ts.txt', 'style.css'];
  for (const file of files) await writeFile(path.join(temp, file === 'App.template.ts.txt' ? 'App.ts' : file), await readFile(path.join(fixtureRoot, file)));
  await writeFile(path.join(temp, 'fixture-data.json'), JSON.stringify({ sourceRoot, sourceHashes, handlerHashes, priorResume: { name: 'Earlier-valid.pdf', mime: 'application/pdf', size: prior.size, sha256: prior.sha256, dataBase64: prior.bytes.toString('base64') } }));
  await writeFile(path.join(temp, 'actual-handler.ts'), `// Extracted verbatim from the source hashes in source-manifest.json.\nexport function createActualReadPDF(context: any) {\nconst {run,epoch,identityUnverified,snapshotRef,pdfCheck,locked,readCheckedPDF,setProfile,setFormChanged,setNotice}=context;\n${assertCurrent}\nconst readPDF=${readPDF};\nreturn readPDF;\n}\n`);
  const bundledSource = new Set(), permitted = new Set(productionFiles.filter(file => file !== 'app/phone/PhoneApp.tsx').map(file => path.join(sourceRoot, file)));
  function audit(meta) {
    for (const input of Object.keys(meta.inputs)) {
      const clean = path.resolve(sourceRoot, input);
      if (inside(sourceRoot, clean) && !clean.includes(path.sep + 'node_modules' + path.sep)) {
        if (!permitted.has(clean)) throw Error('Unexpected production module in isolated PDF browser fixture: ' + clean);
        bundledSource.add(path.relative(sourceRoot, clean));
      }
    }
  }
  const worker = await build({ absWorkingDir: sourceRoot, entryPoints: [path.join(sourceRoot, 'app/phone/pdf-validation.worker.ts')], bundle: true, format: 'esm', platform: 'browser', write: false, metafile: true, target: 'es2022', sourcemap: false });
  audit(worker.metafile);
  const workerBytes = worker.outputFiles[0].contents, workerName = 'pdf-validation.worker-' + digest(workerBytes).slice(0, 20) + '.js';
  await writeFile(path.join(output, workerName), workerBytes, { flag: 'wx' });
  const compiled = await build({
    absWorkingDir: sourceRoot, entryPoints: [path.join(temp, 'App.ts')], outfile: path.join(output, 'app.js'),
    bundle: true, format: 'esm', platform: 'browser', write: false, metafile: true, target: 'es2022', sourcemap: false,
    define: { __CAREER_PDF_WORKER_URL__: JSON.stringify('./' + workerName) },
    plugins: [{ name: 'actual-production-pdf', setup(builder) {
      builder.onResolve({ filter: /^career-actual-pdf$/ }, () => ({ path: path.join(sourceRoot, 'app/phone/pdf.ts') }));
    } }],
  });
  audit(compiled.metafile);
  for (const file of compiled.outputFiles) {
    if (!inside(output, file.path)) throw Error('Fixture compiler escaped its owned output.');
    await writeFile(file.path, file.contents, { flag: 'wx' });
  }
  const html = (await readFile(path.join(fixtureRoot, 'index.html'), 'utf8')).replace('src="/App.ts"', 'src="./app.js"').replace('</head>', '<link rel="stylesheet" href="./app.css"></head>');
  await writeFile(path.join(output, 'index.html'), html, { flag: 'wx' });
  for (const file of productionFiles) if (digest(await readFile(path.join(sourceRoot, file))) !== sourceHashes[file]) throw Error('Production source changed during fixture compilation; rebuild against one snapshot.');
  async function filesUnder(directory, prefix = '') {
    const result = [];
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const name = prefix + entry.name;
      if (entry.isDirectory()) result.push(...await filesUnder(path.join(directory, entry.name), name + '/'));
      else if (entry.isFile()) result.push(name);
      else throw Error('Unexpected output symlink.');
    }
    return result;
  }
  const assets = await filesUnder(output), workers = assets.filter(file => /pdf-validation\.worker.*\.js$/.test(file));
  if (workers.length !== 1 || !bundledSource.has('app/phone/pdf-validation.worker.ts') || !bundledSource.has('shared/pdf-readability.mjs')) throw Error('Actual esbuild module worker/parser did not enter the build.');
  const fixtureHashes = {}; for (const file of [...files, 'pdf-fixtures.json', ...fixtures.map(value => value.file)]) fixtureHashes['tests/fixtures/pdf-browser/' + file] = digest(await readFile(path.join(fixtureRoot, file)));
  fixtureHashes['tests/build-pdf-browser-esbuild.mjs'] = digest(await readFile(fileURLToPath(import.meta.url)));
  const outputHashes = {}; for (const file of assets) outputHashes[file] = digest(await readFile(path.join(output, file)));
  const fixtureMetadata = fixtures.map(fixture => { const value = { ...fixture }; delete value.bytes; return value; });
  const manifest = { scope: 'Test-only synthetic memory state. Actual PDF client, browser module worker, shared bounded parser and extracted current PhoneApp readPDF/assertCurrent. Not a full React/vault/account/device acceptance.', sourceRoot, sourceHashes, handlerHashes, fixtureHashes, outputHashes, workerPaths: workers, bundledProductionModules: [...bundledSource].sort(), fixturePreflight: fixtureMetadata, productionRoutesAdded: 0, apiRequests: 0, externalRequests: 0, persistentStorageUsed: false, builder: 'esbuild replacement; original Vite fixture builder retained unchanged as historical evidence', browserAcceptance: 'pending actual file-picker checks' };
  await writeFile(path.join(output, 'source-manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  await mkdir(uploadFolder, { recursive: true });
  for (const fixture of fixtures) {
    const destination = path.join(uploadFolder, fixture.file);
    try { const current = await readFile(destination); if (digest(current) !== fixture.sha256) throw Error('Preserving an existing different upload fixture: ' + destination); }
    catch (error) { if (error.code !== 'ENOENT') throw error; await writeFile(destination, fixture.bytes, { flag: 'wx' }); }
  }
  console.log(JSON.stringify({ output, uploadFolder, workers, fixtures: fixtureMetadata, productionRoutesAdded: 0, sourceHashes }, null, 2));
} catch (error) { if (outputOwned) console.error('Incomplete fixture output preserved at: ' + output); throw error; }
finally { await rm(temp, { recursive: true, force: true }); }
