import {build} from 'esbuild';
import {createHash} from 'node:crypto';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const sourceRoot=fileURLToPath(new URL('../',import.meta.url));
const args=process.argv.slice(2);
if(args.length!==2||args[0]!=='--output-dir'||!path.isAbsolute(args[1]))throw Error('Usage: node tests/build-provider-browser.mjs --output-dir /absolute/test-only/output');
const output=path.resolve(args[1]),relative=path.relative(sourceRoot,output);
if(relative===''||(!relative.startsWith('..'+path.sep)&&relative!=='..')&&!path.isAbsolute(relative))throw Error('The test harness output must be outside the hosted source tree so it cannot be deployed.');
const fixture=path.join(sourceRoot,'tests/fixtures/provider-browser');
const files=['app/components/ProviderConnections.tsx','app/components/provider-auth.ts','app/components/provider-change.ts','app/components/SessionRecovery.tsx','app/components/GoogleSignInArtwork.tsx','tests/fixtures/provider-browser/App.tsx','tests/fixtures/provider-browser/api.ts','tests/fixtures/provider-browser/Image.tsx','tests/build-provider-browser.mjs'];
const compiled=await build({entryPoints:[path.join(fixture,'App.tsx')],bundle:true,format:'iife',platform:'browser',write:false,metafile:true,define:{'process.env.NODE_ENV':'"development"'},plugins:[{name:'synthetic-provider-http',setup(builder){
 builder.onResolve({filter:/^next\/image$/},()=>({path:path.join(fixture,'Image.tsx')}));
 builder.onResolve({filter:/^\.\/?(?:components\/)?api$/},args=>{if(args.importer.startsWith(path.join(sourceRoot,'app/components/')))return{path:path.join(fixture,'api.ts')}});
}}]});
if(Object.keys(compiled.metafile.inputs).some(name=>name.endsWith('app/components/api.ts')))throw Error('Real HTTP adapter entered the synthetic bundle; refusing to write it.');
const bundle=compiled.outputFiles[0].text;
const style='body{font:18px system-ui;max-width:900px;margin:30px auto;padding:20px;color:#17222c}button{font:inherit;padding:12px;margin:8px;border-radius:8px;border:1px solid #627184;cursor:pointer}button:disabled{opacity:.5}.card{border:1px solid #8191a3;border-radius:12px;padding:24px}.provider-row{border-top:1px solid #cad3df;margin-top:20px}.alert{padding:15px;background:#eef4ff}.error{background:#fff0ef}pre{background:#edf0f3;padding:15px;white-space:pre-wrap;overflow-wrap:anywhere}.google-sign-in-button svg{max-width:200px}';
const html=`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; connect-src 'none'; base-uri 'none'; form-action 'none'"><title>Career Finder synthetic provider lifecycle test</title><style>${style}</style></head><body><div id="root"></div><script>${bundle.replaceAll('</script','<\\/script')}</script></body></html>`;
await mkdir(output,{recursive:true});
await writeFile(path.join(output,'index.html'),html);
const sourceHashes={};for(const name of files)sourceHashes[name]=createHash('sha256').update(await readFile(path.join(sourceRoot,name))).digest('hex');
await writeFile(path.join(output,'source-manifest.json'),JSON.stringify({scope:'Local synthetic HTTP; actual ProviderConnections and useAuthStatus; React StrictMode. No live-provider acceptance.',sourceHashes,htmlSHA256:createHash('sha256').update(html).digest('hex')},null,2)+'\n');
console.log(JSON.stringify({output,files:['index.html','source-manifest.json'],productionRoutesAdded:0,liveAccountsUsed:0}));
