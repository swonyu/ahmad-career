// Local preference and arithmetic contract checks. No network or Apple resources used.
import assert from 'node:assert/strict';
import './web/core.js';
import {readFileSync} from 'node:fs';
// Execute the production app's local-only helper prelude without a DOM or any request.
const app=readFileSync(new URL('./web/app.js',import.meta.url),'utf8');
const C=new Function(app.slice(0,app.indexOf('const esc='))+'return P;')();
const job={id:'local-fixture',title:'Supply Chain Analyst',subtitle:'Planning',location:'Riyadh, Saudi Arabia'};
for(const old of [{},{preferredCity:''},{preferredCity:'riyadh',minimumMonthlySAR:'12000',unknownSalary:'hide'}]){
  const bytes=JSON.stringify(old),p=C.preferences(old);
  assert.equal(p.country,'SA');assert.equal(p.city,old.preferredCity==='riyadh'?'Riyadh':'');
  assert.equal(p.currency,'SAR');assert.equal(p.period,'monthly');assert.equal(p.zone,'Asia/Riyadh');
  assert.equal(C.criteriaFor(job,old).included,old.unknownSalary!=='hide');
  assert.equal(JSON.stringify(old),bytes,'Reading a legacy profile never rewrites it');
}
const fresh=C.freshProfile();
assert.equal(fresh.preferencesVersion,'2');assert.equal(C.preferences(fresh).country,'');assert.equal(C.preferences(fresh).city,'');assert.equal(C.preferences(fresh).currency,'');assert.equal(C.preferences(fresh).zone,C.deviceTimeZone());
assert.equal(C.preferenceError(fresh),null);
for(const update of [{preferencesVersion:'3'},{targetCountry:'USA'},{targetCountry:'ZZ'},{targetCountry:null},{targetCity:'a'.repeat(101)},{roleKeywords:'r'.repeat(201)},{planningCurrency:'$'},{planningPayPeriod:'weekly'},{displayTimeZone:'Mars/Olympus'},{displayTimeZone:null}])assert.ok(C.preferenceError({...fresh,...update}),JSON.stringify(update));
assert.equal(C.preferenceError({...fresh,targetCity:'東京',roleKeywords:'看護',planningCurrency:'JPY',displayTimeZone:'Asia/Tokyo'}),null);
assert.equal(C.countrySupported({...fresh,targetCountry:'US'}),false);
assert.equal(C.criteriaFor(job,{...fresh,targetCountry:'US'}).included,false);
assert.equal(C.criteriaFor(job,{...fresh,targetCountry:'SA',roleKeywords:'Supply Analyst'}).included,true);
assert.equal(C.criteriaFor(job,{...fresh,targetCountry:'SA',roleKeywords:'Nurse'}).included,false);
assert.equal(C.criteriaFor(job,{...fresh,roleKeywords:'['}).included,false,'Role text is not interpreted as a regular expression');
assert.equal(C.cityMatch('Jeddah, Saudi Arabia','Jeddah'),'text');
assert.equal(C.cityMatch('New Jeddahville, Saudi Arabia','Jeddah'),'outside');
assert.equal(C.cityMatch('C++ City, Saudi Arabia','C++ City'),'text','City metacharacters are literal');
assert.equal(C.cityMatch('Riyadh Region, Saudi Arabia','Riyadh'),'outside');
assert.equal(C.cityMatch('Riyadh / Jeddah','Riyadh'),'conditional');
const ny={...fresh,displayTimeZone:'America/New_York'},tokyo={...fresh,displayTimeZone:'Asia/Tokyo'};
assert.equal(C.displayDate('2026-11-01',ny,true,'en-GB'),C.displayDate('2026-11-01',tokyo,true,'en-GB'),'Published civil dates do not move with the display zone');
const midnight='2026-10-09T00:30:00Z';
assert.match(C.displayDate(midnight,ny,true,'en-GB'),/8 Oct 2026/);
assert.match(C.displayDate(midnight,tokyo,true,'en-GB'),/9 Oct 2026/);
const foldFirst=C.displayDate('2026-11-01T05:30:00Z',ny,true,'en-GB'),foldSecond=C.displayDate('2026-11-01T06:30:00Z',ny,true,'en-GB');
assert.match(foldFirst,/01:30.*GMT-4/);assert.match(foldSecond,/01:30.*GMT-5/);assert.notEqual(foldFirst,foldSecond,'Repeated DST clock times retain their UTC offset');
assert.equal(C.displayDate('2026-02-30',ny),'Not stated');
assert.deepEqual(C.packageTotals('١٬٢٠٠٫٥٠','300.25','1000','monthly'),{monthly:1500.75,annual:18009,includingBonus:19009});
assert.deepEqual(C.packageTotals('12000','600','1000','annual'),{monthly:1050,annual:12600,includingBonus:13600});
assert.deepEqual(C.packageTotals('','','','monthly'),{monthly:0,annual:0,includingBonus:0});
for(const bad of ['-1','1e3','NaN','Infinity','1,00','1000001','10.123'])assert.equal(C.packageTotals(bad,'0','0','monthly'),null,bad);
assert.equal(C.packageTotals('0','0','10000001','monthly'),null);
assert.equal(C.packageTotals('0','0','0','weekly'),null);
const legacyFloor={preferredCity:'riyadh',minimumMonthlySAR:'12000',unknownSalary:'hide'};
assert.deepEqual(C.criteriaFor(job,{...legacyFloor,planningCurrency:'USD',planningPayPeriod:'annual'}),C.criteriaFor(job,legacyFloor),'Planning units do not reinterpret a monthly SAR floor');
console.log('Local preference checks passed: legacy/fresh defaults, country/city/role filtering, schema validation, DST offsets, unchanged civil dates, independent units, strict arithmetic.');
