from pathlib import Path
import subprocess,hashlib,json,datetime,os,shutil,re
p=Path('/Users/saleh/Developer/career-finder-feed-continuation-20261117-4b851318da2d');base=Path('/Users/saleh/Developer/career-finder-feed-evidence-20261117-4b851318da2d/resume-20261118-0410/stage-filter-20261118T0220Z');r=base/'final-acceptance';r.mkdir(exist_ok=False)
node=Path('/Users/saleh/Developer/career-finder-feed-evidence-20261117-4b851318da2d/toolchain/node_modules/node/bin/node');env=os.environ.copy();env['PATH']=str(node.parent)+os.pathsep+env['PATH'];npm=Path(shutil.which('npm',path=env['PATH'])).resolve()
def sha(f):return hashlib.sha256(f.read_bytes()).hexdigest()
def now():return datetime.datetime.now(datetime.timezone.utc).isoformat()
test=p/'hosted/tests/phone-record-tools.mjs';assert sha(test)=='6c3eadd0837d08703836544b97b32d68fff574b3c894716c4348f3a3b0be6b09'
old=(base/'empty-recovery-regression.mjs.fragment').read_text().rstrip();new=(base/'empty-recovery-regression-v2.mjs.fragment').read_text().rstrip();s=test.read_text();assert s.count(old)==1;test.write_text(s.replace(old,new));assert sha(test)=='a383e178f53782529ec4ff35a111113a7e13a752ceea22a0e24b351039686015'
app=p/'hosted/app/phone/PhoneApp.tsx';fixed=app.read_bytes();assert sha(app)=='77b3f3bd43f7a7fab19b68807118fba41bb95409701d054ed8232bc139a7dcba'
receipt={'startedUTC':now(),'node':str(node),'nodeVersion':subprocess.check_output([str(node),'--version'],text=True).strip(),'npmCLI':str(npm),'npmVersion':subprocess.check_output([str(node),str(npm),'--version'],env=env,text=True).strip(),'reason':'Strengthen the zero-item regression to require actual rendered button labels; body copy itself contains the Clear wording. Preserve prior raw results.','steps':[]}
assert receipt['nodeVersion']=='v24.22.3'
def save():(r/'receipt.json').write_text(json.dumps(receipt,indent=2)+'\n')
def run(name,args,cwd=p/'hosted'):
 row={'name':name,'argv':args,'cwd':str(cwd),'startedUTC':now()};receipt['steps'].append(row);save()
 with (r/(name+'.stdout.log')).open('w') as out,(r/(name+'.stderr.log')).open('w') as err:v=subprocess.run(args,cwd=cwd,env=env,stdout=out,stderr=err,text=True)
 row.update({'exit':v.returncode,'finishedUTC':now(),'stdoutSHA256':sha(r/(name+'.stdout.log')),'stderrSHA256':sha(r/(name+'.stderr.log'))});save();print(json.dumps(row),flush=True);return v.returncode
def manifest():
 return {name:sha(p/name) for name in subprocess.check_output(['git','ls-files','--','hosted'],cwd=p,text=True).splitlines() if (p/name).is_file()}
reports=['hosted/tests/hosted-discovery-verification.json','hosted/tests/hosted-phone-verification.json','hosted/tests/hosted-verification.json']
try:
 bad=fixed.decode().replace('{savedEmpty.clear &&','{(jobs.length > 0 || records.length > 0) && savedEmpty.clear &&');assert bad!=fixed.decode();app.write_text(bad);assert sha(app)=='4e92296fa0ccc8650cfc8a45f39ccc3258d49018ec9fe7bdbba6446b775f8221'
 try:
  assert run('actual-button-red',[str(node),'--test','tests/phone-record-tools.mjs'])==1
  red=(r/'actual-button-red.stdout.log').read_text();assert 'An actual Clear button is required for en all/interview after the final record disappears' in red
  counts={a:int(b) for a,b in re.findall(r'(?m)^[#ℹ]\s+(tests|pass|fail)\s+(\d+)\s*$',red)};assert counts.get('pass')==42 and counts.get('fail')==1,counts;receipt['redCounts']=counts
 finally:
  assert sha(app)=='4e92296fa0ccc8650cfc8a45f39ccc3258d49018ec9fe7bdbba6446b775f8221','Unexpected product edit during isolated red run; refusing overwrite'
  app.write_bytes(fixed)
 before=manifest();(r/'hosted-source-before.json').write_text(json.dumps(before,indent=2)+'\n')
 reportBefore={}
 for name in reports:
  reportBefore[name]=json.loads((p/name).read_text());q=r/'generated-reports-before'/Path(name).name;q.parent.mkdir(exist_ok=True);shutil.copyfile(p/name,q)
 for name,args,cwd in [
  ('diff-check',['git','diff','--check'],p),
  ('typecheck',[str(node),str(npm),'run','typecheck'],p/'hosted'),
  ('lint',[str(node),str(npm),'run','lint'],p/'hosted'),
  ('test',[str(node),str(npm),'test'],p/'hosted'),
  ('build',[str(node),str(npm),'run','build'],p/'hosted')]:
  assert run(name,args,cwd)==0,name+' failed'
 after=manifest();(r/'hosted-source-after.json').write_text(json.dumps(after,indent=2)+'\n')
 changed=[name for name in sorted(set(before)|set(after)) if before.get(name)!=after.get(name)];assert set(changed)<=set(reports),changed
 reportChanges=[]
 for name in reports:
  a=reportBefore[name].copy();b=json.loads((p/name).read_text());oldTime=a.pop('observedAt');newTime=b.pop('observedAt');assert a==b,name
  q=r/'generated-reports-after'/Path(name).name;q.parent.mkdir(exist_ok=True);shutil.copyfile(p/name,q);reportChanges.append({'path':name,'oldObservedAt':oldTime,'newObservedAt':newTime,'allOtherFieldsEqual':True})
 expected={'hosted/app/phone/record-tools.ts':'7394ea75959f766053f4b6373a4c1687fa0e095c5cec7c0d887571ffb9908494','hosted/app/phone/PhoneApp.tsx':'77b3f3bd43f7a7fab19b68807118fba41bb95409701d054ed8232bc139a7dcba','hosted/app/phone/phone.css':'786f03f7e8e30f85ecc38917d999f0fce9f81a6879d997ff5738d7ea740df915','hosted/app/i18n/messages.ar.json':'d6c3da66dc63fc9f3b0a5bce4490e02da9af9c3ed459eaba3a77f80605c56c3b','hosted/tests/phone-record-tools.mjs':'a383e178f53782529ec4ff35a111113a7e13a752ceea22a0e24b351039686015','hosted/tests/phone-search-workflows.mjs':'87131e6186faf9169932c131b5f03d27909b5b6b27c08f0a0eed9b60a71b83a5'}
 for name,want in expected.items():assert sha(p/name)==want,(name,sha(p/name))
 receipt.update({'status':'passed','finishedUTC':now(),'implementationAndTestsStable':True,'generatedReportChanges':reportChanges,'correctedSourceHashes':expected,'gitStatus':subprocess.check_output(['git','status','--porcelain=v1'],cwd=p,text=True)});save()
 print(json.dumps({'status':'passed','receipt':str(r/'receipt.json'),'sourceStableExceptGeneratedReportTimestamps':True},indent=2),flush=True)
except BaseException as error:receipt.update({'status':'stopped','error':str(error),'stoppedUTC':now()});save();raise
