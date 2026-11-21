import {build} from 'esbuild';
import postcss from 'postcss';
import tailwind from '@tailwindcss/postcss';
import {readFile, mkdir, writeFile, copyFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fidelity, accounts, postings, searchSequencePostings, searchSequenceEpoch} from './fixtures/journey-browser/data.mjs';

const args = process.argv.slice(2);
if (args.length !== 4 || args[0] !== '--source-root' || args[2] !== '--output-dir' || !path.isAbsolute(args[1]) || !path.isAbsolute(args[3])) throw Error('Usage: node tests/build-journey-browser.mjs --source-root /absolute/hosted --output-dir /absolute/external/output');
const sourceRoot = path.resolve(args[1]), output = path.resolve(args[3]), relative = path.relative(sourceRoot, output);
if (!relative.startsWith('..' + path.sep)) throw Error('Output must be outside the production source tree');
await mkdir(output, {recursive: false});
const digest = value => createHash('sha256').update(value).digest('hex');
const storageNames = {vault: 'career-finder-synthetic-journey-vault', safety: 'career-finder-synthetic-journey-safety', appearance: 'career-finder:test:journey:appearance:v1', language: 'career-finder:test:journey:language:v1', languageCookie: 'career_finder_test_journey_language'};
const productionNames = ['career-finder-phone-vault', 'career-finder-phone-safety', 'career-finder:appearance:v1', 'career-finder:language:v1', 'career_finder_language'];
const isolation = new Map([
  [path.join(sourceRoot, 'app/phone/vault.ts'), [[productionNames[0], storageNames.vault]]],
  [path.join(sourceRoot, 'app/phone/safety.ts'), [[productionNames[1], storageNames.safety]]],
  [path.join(sourceRoot, 'app/components/appearance.ts'), [[productionNames[2], storageNames.appearance]]],
  [path.join(sourceRoot, 'app/i18n/core.ts'), [[productionNames[3], storageNames.language], [productionNames[4], storageNames.languageCookie]]],
]);
const worker = await build({entryPoints: [path.join(sourceRoot, 'app/phone/pdf-validation.worker.ts')], bundle: true, format: 'esm', platform: 'browser', target: 'es2022', write: false});
const workerBytes = worker.outputFiles[0].contents, workerName = `pdf-worker-${digest(workerBytes).slice(0, 20)}.js`;
await writeFile(path.join(output, workerName), workerBytes);
const compiled = await build({entryPoints: [path.join(sourceRoot, 'tests/fixtures/journey-browser/browser.tsx')], absWorkingDir: sourceRoot, bundle: true, format: 'esm', platform: 'browser', target: 'es2022', write: false, metafile: true,
  define: {'process.env.NODE_ENV': '"development"', __CAREER_PDF_WORKER_URL__: JSON.stringify('./' + workerName)},
  plugins: [{name: 'isolated-synthetic-journey', setup(builder) {
    builder.onResolve({filter: /^next\/image$/}, () => ({path: 'image', namespace: 'journey-fixture'}));
    builder.onLoad({filter: /.*/, namespace: 'journey-fixture'}, () => ({contents: "import React from 'react';export default function Image({unoptimized,...props}){return <img {...props}/>}", loader: 'tsx', resolveDir: sourceRoot}));
    builder.onLoad({filter: /\.(?:ts|tsx)$/}, async args => {
      const replacements = isolation.get(args.path); if (!replacements) return;
      let contents = await readFile(args.path, 'utf8');
      for (const [oldName, newName] of replacements) {if (!contents.includes(oldName)) throw Error('Missing storage namespace assertion'); contents = contents.replaceAll(oldName, newName);}
      return {contents, loader: 'ts', resolveDir: path.dirname(args.path)};
    });
  }}],
});
const bundle = compiled.outputFiles[0].text;
if (productionNames.some(name => bundle.includes(name))) throw Error('Production storage entered the fixture');
for (const file of ['app/phone/api.ts', 'app/components/api.ts', 'app/phone/pdf.ts', 'app/account/page.tsx', 'app/account/AccountPanel.tsx', 'app/components/SiteFrame.tsx', 'app/components/ProviderConnections.tsx', 'app/components/SignOutButton.tsx']) if (!Object.keys(compiled.metafile.inputs).includes(file)) throw Error('Actual browser validation module was omitted: ' + file);
await writeFile(path.join(output, 'app.js'), bundle);
const css = await postcss([tailwind({base: sourceRoot})]).process(await readFile(path.join(sourceRoot, 'app/globals.css'), 'utf8'), {from: path.join(sourceRoot, 'app/globals.css')});
await writeFile(path.join(output, 'app.css'), css.css + '\n' + await readFile(path.join(sourceRoot, 'app/phone/phone.css'), 'utf8') + '\n' + await readFile(path.join(sourceRoot, 'app/i18n/i18n.css'), 'utf8'));
await writeFile(path.join(output, 'theme-init.js'), (await readFile(path.join(sourceRoot, 'public/theme-init.js'), 'utf8')).replaceAll(productionNames[2], storageNames.appearance));
await copyFile(path.join(sourceRoot, 'public/phone-icon-192.png'), path.join(output, 'phone-icon-192.png'));
for (const [directory, files] of Object.entries({fonts: ['noto-sans-arabic-arabic.woff2', 'noto-sans-arabic-latin.woff2'], brand: ['google-signin-icon.png', 'google-sans-medium.ttf']})) {
  await mkdir(path.join(output, directory));
  for (const file of files) await copyFile(path.join(sourceRoot, 'public', directory, file), path.join(output, directory, file));
}
await mkdir(path.join(output, 'fixture-pdfs'));
for (const [source, name] of [['valid.pdf', 'Synthetic-Journey-CV.pdf'], ['malformed.pdf', 'Synthetic-Malformed-CV.pdf'], ['encrypted.pdf', 'Synthetic-Protected-CV.pdf']]) await copyFile(path.join(sourceRoot, 'tests/fixtures/pdf-browser', source), path.join(output, 'fixture-pdfs', name));
const csp = "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; worker-src 'self'; frame-src 'self'; base-uri 'none'; form-action 'none'";
await writeFile(path.join(output, 'frame.html'), `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="${csp}"><title>Career Finder — SYNTHETIC journey fixture</title><script src="theme-init.js"></script><link rel="stylesheet" href="app.css"></head><body data-synthetic-fixture="career-journey"><div id="root"></div><script type="module" src="app.js"></script></body></html>`);
await copyFile(path.join(sourceRoot, 'tests/fixtures/journey-browser/controls.js'), path.join(output, 'controls.js'));
await writeFile(path.join(output, 'index.html'), `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="${csp}"><title>Synthetic Career Finder journey review</title><style>body{margin:0;background:#e5e7ef;color:#172035;font:15px system-ui}header{padding:16px 24px;background:white;border-bottom:1px solid #b6bfd3}h1{font-size:20px;margin:0 0 8px}p{max-width:100ch;line-height:1.5}button,select,a.download{display:inline-block;font:inherit;min-height:44px;box-sizing:border-box;padding:10px 12px;border:1px solid #7d88a3;border-radius:7px;background:white;color:#172035;margin:4px}button{cursor:pointer}button:focus-visible,select:focus-visible,a:focus-visible{outline:3px solid #5b50ce;outline-offset:3px}.viewport{overflow:auto;padding:24px}iframe{display:block;margin:auto;border:0;outline:1px solid #7d88a3;width:390px;height:844px;background:white}details{background:white;margin:20px;padding:15px}pre{white-space:pre-wrap;overflow-wrap:anywhere}label{display:inline-block;margin:4px}</style></head><body><header><h1>Career Finder · SYNTHETIC local journey</h1><p>Fictional jobs, applicants and test receipts. Real app, PDF validation, encrypted vault and isolated hosted handlers. The fixture simulates account identity and the capability envelope; no real employer, OAuth provider or production service is contacted. Direct-frame screenshots must retain this provenance in their evidence receipt.</p><p><a class="download" download href="fixture-pdfs/Synthetic-Journey-CV.pdf">Download synthetic CV</a><a class="download" download href="fixture-pdfs/Synthetic-Malformed-CV.pdf">Malformed PDF</a><a class="download" download href="fixture-pdfs/Synthetic-Protected-CV.pdf">Protected PDF</a></p><label>Page view <select id="view"><option value="phone">Phone app</option><option value="account">Account (read only)</option></select></label><label>Page account <select id="actor"><option value="guest">Blank guest</option><option value="a">Synthetic Alex A</option><option value="b">Synthetic Sam B</option></select></label><button id="load">Open selected page</button><button data-control="actor" data-value="a">Return A responses</button><button data-control="actor" data-value="b">Return B responses</button><button data-control="hold-recheck">Hold recheck</button><button data-control="release-recheck">Release recheck</button><br><button data-width="320">320 px</button><button data-width="390">390 px</button><button data-width="768">768 px</button><button data-width="1200">1200 px</button><button data-language="en">English</button><button data-language="ar">العربية</button><button data-font="100">Text 100%</button><button data-font="200">Text 200%</button><br><button data-control="board" data-value="open">Open board</button><button data-control="board" data-value="closed">Close Toronto design job</button><button data-control="board" data-value="empty">Empty board</button><button data-control="board" data-value="unavailable">Unreachable board</button><button data-control="sequence" data-value="journey">Original six jobs</button><button data-control="sequence" data-value="ab">Search A/B</button><button data-control="sequence" data-value="bc">Search B/C</button><button data-control="sequence" data-value="cb">Reordered C/B</button><button data-control="offline">Offline</button><button data-control="online">Online</button><button data-control="lose-next-mutation-response">Lose next mutation response</button><button id="measure">Measure</button><p>Default test outcomes: Amman designer = test receipt; Toronto designer = closable; nurse = uncertain; accountant = 10-second cooldown, then test receipt; teacher = rejected; remote engineer = test receipt. External links are blocked. No action is automatic. The Account view uses the real page and read handlers; sign-in, downloads and account changes are blocked in this fixture.</p></header><main class="viewport"><iframe src="frame.html?actor=guest#search" title="Synthetic Career Finder test viewport"></iframe></main><details open><summary>Synthetic fixture evidence</summary><pre id="evidence">Waiting for app…</pre></details><script src="controls.js"></script></body></html>`);
const hashes = {};
for (const input of Object.keys(compiled.metafile.inputs)) if (/^(?:app|server|shared|tests\/fixtures\/journey-browser)\//.test(input)) hashes[input] = digest(await readFile(path.join(sourceRoot, input)));
for (const name of ['app/globals.css', 'app/phone/phone.css', 'app/i18n/i18n.css', 'app/i18n/messages.ar.json', 'app/phone/pdf-validation.worker.ts', 'shared/pdf-readability.mjs', 'public/theme-init.js']) hashes[name] = digest(await readFile(path.join(sourceRoot, name)));
const sourceHead = execFileSync('git', ['rev-parse', 'HEAD'], {cwd: sourceRoot, encoding: 'utf8'}).trim();
await writeFile(path.join(output, 'source-manifest.json'), JSON.stringify({scope: 'Synthetic journey fixture; not live provider acceptance', builtAt: new Date().toISOString(), sourceRoot, sourceHead, sourceHashes: hashes, storageNames, accounts, postingIds: postings.map(value => value.id), searchSequence: {postingIds: searchSequencePostings.map(value => value.id), discoveryTime: new Date(searchSequenceEpoch).toISOString(), applicationRequirements: "not configured for search-only roles"}, fidelity, accountView: {component: 'app/account/page.tsx', fixedPageIdentity: true, allowedReads: ['/api/account', '/api/auth/status'], mutationsAndNavigation: 'denied'}, realHTTPValidatorsIncluded: true, productionRoutesAdded: 0, capabilityEnvelope: 'liveEnabled=true only in fixture response; actual handler/attempts remain mode=test', bundleSHA256: digest(bundle), workerSHA256: digest(workerBytes)}, null, 2) + '\n');
console.log(JSON.stringify({output, sourceHead, storageNames, fidelity}));
