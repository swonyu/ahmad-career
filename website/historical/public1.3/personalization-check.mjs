import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import './web/core.js';
import './web/data.js';
const C=globalThis.CareerCore,D=globalThis.CAREER_DATA;
assert.equal(D.profile.name,'Your name');
assert.equal(D.jobs.length,0,'Fresh generic workspace must not show Ahmad’s old vacancies');
assert.equal(D.profile.url,'');
assert.deepEqual(D.profile.facts,[]);


for(const title of ['Junior Python Developer','Graduate Software Engineer','AI Intern','Data Analyst','Swift Developer','Backend Developer','Machine Learning Engineer'])assert(C.relevance(title)>0,title);
for(const title of ['Supply Chain Manager','Pharmacist','Senior Python Developer','Lead Software Engineer','Principal Engineer','Sales Engineer','Staff Software Engineer'])assert.equal(C.relevance(title),0,title);
assert(C.relevance('Junior Software Developer')>C.relevance('Software Developer'));
const app=fs.readFileSync('web/app.js','utf8');
assert(/localStorage\.(getItem|setItem)\('ahmad-/.test(app));
assert(app.includes("localStorage.getItem('ahmad-'+key)"));
assert(!/30,000–45,000|30,000–50,000|Supply Chain Command Center|Regulatory KPI/.test(app));
const stub=new Map([['ahmad-workspace','{"saved":["untouched"]}']]);
const sandbox=vm.createContext({localStorage:{getItem:k=>stub.get(k)??null},JSON});
assert.equal(vm.runInContext("localStorage.getItem('ahmad-workspace')",sandbox),'{"saved":["untouched"]}');
assert.equal(stub.get('ahmad-workspace'),'{"saved":["untouched"]}');
for(const file of fs.readdirSync('web'))assert.deepEqual(fs.readFileSync('web/'+file),fs.readFileSync('../apple/AhmadCareer/Web/'+file),file+' Mac/web parity');
const project=fs.readFileSync('../apple/AhmadCareer.xcodeproj/project.pbxproj','utf8');
assert(project.includes('com.ahmadalayed.career'));
assert(!project.includes('com.salehalayed.careerfinder'));
assert(!fs.existsSync('.openai/hosting.json'),'No inherited active publishing binding');
console.log('Public distribution checks passed: generic profile, empty fresh workspace, software screening, legacy storage namespace, Mac/web parity and no deployment binding.');
