from pathlib import Path
from datetime import datetime, timezone
import hashlib, json, os, re, signal, stat, subprocess, sys, time

REPO = Path('/Users/saleh/Developer/career-finder-feed-continuation-20261117-4b851318da2d')
HOSTED = REPO / 'hosted'
OUT = Path('/Users/saleh/Developer/career-finder-feed-evidence-20261117-4b851318da2d/final-account-browser-followthrough-20261117/retest-inline-focus')
NODE = Path('/Users/saleh/Developer/career-finder-feed-evidence-20261117-4b851318da2d/toolchain/node_modules/node/bin/node')
NPM = Path('/opt/homebrew/bin/npm')
EXPECTED_HEAD = 'ca3d3411d8b5b36fa7093dff782f4a7b931261c7'
EXPECTED_BRANCH = 'continuation/feed-reliability-20261117-4b851'
EXPECTED = {
 'hosted/app/components/ProviderConnections.tsx': '03c766b5bfe7b04f30ca545e78dac63225a1b371f8ae35d96a1a80dfaf6047c8',
 'hosted/app/components/SignInOptions.tsx': 'fa9818300bdd6c0316befcd04c9fb53ec1aa02282f5acfdbeffb611ac0e731fc',
 'hosted/tests/account-recovery-lifecycle.mjs': '60a2fd94573de75046060e1b7f9e2be600d9875094c21705340191f90351df9b',
}
RECEIPTS = {
 'hosted/tests/hosted-verification.json',
 'hosted/tests/hosted-worker-verification.json',
 'hosted/tests/hosted-discovery-verification.json',
 'hosted/tests/hosted-phone-verification.json',
}
ENV = os.environ.copy()
ENV['PATH'] = str(NODE.parent) + os.pathsep + ENV.get('PATH', '')
manifest = {
 'schema_version': 1,
 'scope': 'Final sequential four-gate hosted retest of ca3d341 plus the three reviewed dirty files after the inline event-handler focus lint repair; fresh initial audit referenced only after dependency hashes match. Not browser/native/provider/store acceptance.',
 'repository': str(REPO),
 'hosted_cwd': str(HOSTED),
 'expected_head': EXPECTED_HEAD,
 'expected_branch': EXPECTED_BRANCH,
 'expected_reviewed_dirty_sha256': EXPECTED,
 'known_generated_receipts_excluded_only_from_source_digest': sorted(RECEIPTS),
 'stop_on_first_gate_failure': True,
 'review_disposition': 'No new source integration blocker found in final diff: synchronous focus only when the activated button owns focus; busy/verified guard before Confirm/Connect; async change signature/request logic unchanged from ca3; no lint suppression or policy weakening. Browser acceptance remains root-owned.',
 'source_manifest_scope': 'All git-tracked paths plus untracked non-ignored paths, preserving type and mode; only the four explicitly named generated verification receipts are excluded from the aggregate source digest. Git-ignored build/dependency/runtime files are not git source and are separately identified where relevant.',
 'guard_interval_seconds': 5,
 'gates': [],
 'preflight_observation': {
   'initial_run_evidence': str(OUT.parent/'manifest.json'),
   'node_on_default_path': 'The exact pinned v24.22.3 binary is used for gates; default-path Node is not used',
   'no_installation_or_configuration_changes': True,
 },
 'status': 'initializing',
}

def utc():
 return datetime.now(timezone.utc).isoformat(timespec='milliseconds').replace('+00:00','Z')

def sha(data):
 return hashlib.sha256(data).hexdigest()

def atomic_json(path, value):
 temp = path.with_name(path.name + '.tmp')
 temp.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n')
 os.replace(temp, path)

def save():
 manifest['updated_at'] = utc()
 atomic_json(OUT/'manifest.json', manifest)

def event(kind, **values):
 record = {'at': utc(), 'event': kind, **values}
 with (OUT/'events.jsonl').open('a') as f:
  f.write(json.dumps(record, ensure_ascii=False) + '\n')
 print(json.dumps(record, ensure_ascii=False), flush=True)

def git(*args, binary=False):
 result = subprocess.run(['git','--no-optional-locks','-C',str(REPO),*args], capture_output=True, check=True)
 return result.stdout if binary else result.stdout.decode().strip()

def status():
 fields = git('status','--porcelain=v1','-z','--untracked-files=all', binary=True).split(b'\0')
 rows=[]; i=0
 while i < len(fields):
  item=fields[i];i+=1
  if not item: continue
  text=item.decode()
  row={'status':text[:2], 'path':text[3:]}
  if 'R' in text[:2] or 'C' in text[:2]:
   row['original_path']=fields[i].decode();i+=1
  rows.append(row)
 return rows

def source_snapshot():
 names=set(p.decode() for p in git('ls-files','-z','--cached','--others','--exclude-standard',binary=True).split(b'\0') if p)
 records={}
 for rel in sorted(names):
  p=REPO/rel
  try:
   st=p.lstat()
   mode=stat.S_IMODE(st.st_mode)
   if p.is_symlink():
    content=os.readlink(p).encode()
    records[rel]={'type':'symlink','mode':mode,'sha256':sha(content)}
   elif p.is_file():
    data=p.read_bytes()
    records[rel]={'type':'file','mode':mode,'bytes':len(data),'sha256':sha(data)}
   else:
    records[rel]={'type':'other','mode':mode}
  except FileNotFoundError:
   records[rel]={'type':'missing'}
 source={k:v for k,v in records.items() if k not in RECEIPTS}
 source_digest=sha(json.dumps(source,sort_keys=True,separators=(',',':'),ensure_ascii=False).encode())
 git_dir=Path(git('rev-parse','--absolute-git-dir'))
 lock_candidates=[git_dir/'index.lock',git_dir/'HEAD.lock',git_dir/'config.lock',git_dir/'refs/heads'/ (EXPECTED_BRANCH+'.lock')]
 return {
  'observed_at':utc(),
  'head':git('rev-parse','HEAD'),
  'branch':git('branch','--show-current'),
  'dirty_status':status(),
  'present_git_writer_locks':[str(p) for p in lock_candidates if p.exists()],
  'source_path_count':len(source),
  'all_git_source_path_count_including_receipts':len(records),
  'source_sha256':source_digest,
  'installed_dependency_lock_sha256':sha((HOSTED/'node_modules/.package-lock.json').read_bytes()),
  'files':records,
 }

def changes(old,new):
 return [
  {'path':p,'before':old.get(p),'after':new.get(p)}
  for p in sorted(set(old)|set(new)) if old.get(p)!=new.get(p)
 ]

def guard(current, baseline):
 findings=[]
 if current['installed_dependency_lock_sha256'] != baseline['installed_dependency_lock_sha256']: findings.append({'kind':'installed_dependency_lock_changed','before':baseline['installed_dependency_lock_sha256'],'after':current['installed_dependency_lock_sha256']})
 if current['head'] != baseline['head']: findings.append({'kind':'HEAD_changed','before':baseline['head'],'after':current['head']})
 if current['branch'] != baseline['branch']: findings.append({'kind':'branch_changed','before':baseline['branch'],'after':current['branch']})
 if current['present_git_writer_locks']: findings.append({'kind':'unexpected_git_writer_lock','paths':current['present_git_writer_locks']})
 delta=[d for d in changes(baseline['files'],current['files']) if d['path'] not in RECEIPTS]
 if delta: findings.append({'kind':'implementation_or_test_source_changed','changes':delta})
 unexpected_status=[row for row in current['dirty_status'] if row['path'] not in EXPECTED and row['path'] not in RECEIPTS]
 if unexpected_status: findings.append({'kind':'unexpected_dirty_paths','paths':unexpected_status})
 for p,digest in EXPECTED.items():
  if current['files'].get(p,{}).get('sha256') != digest:
   findings.append({'kind':'reviewed_source_hash_mismatch','path':p,'expected':digest,'actual':current['files'].get(p,{}).get('sha256')})
 return findings

def archive_receipts(label):
 folder=OUT/label
 folder.mkdir(exist_ok=False)
 results={}
 for rel in sorted(RECEIPTS):
  p=REPO/rel
  if p.is_file():
   data=p.read_bytes()
   (folder/p.name).write_bytes(data)
   results[rel]={'sha256':sha(data),'bytes':len(data),'archived_as':str(folder/p.name)}
  else: results[rel]={'present':False}
 return results

def capture(label,args):
 result=subprocess.run(args,cwd=HOSTED,env=ENV,text=True,capture_output=True)
 record={'label':label,'command':args,'exit_code':result.returncode,'stdout':result.stdout.strip(),'stderr':result.stderr.strip()}
 with (OUT/'preflight.log').open('a') as f: f.write(json.dumps(record,ensure_ascii=False)+'\n')
 if result.returncode: raise RuntimeError('Runtime preflight failed: '+label)
 return record

def summarize(log_path, gate_name):
 text=log_path.read_text(errors='replace')
 summaries=[]
 for line in text.splitlines():
  compact=line.strip()
  if re.search(r'^(#|ℹ)\s*(tests|suites|pass|fail|cancelled|skipped|todo|duration_ms|duration)\b',compact):
   summaries.append(compact)
  elif compact.startswith('{') and compact.endswith('}'):
   try:
    item=json.loads(compact)
    if isinstance(item,dict) and any(k in item for k in ('result','status','checks','groups','actualWorkerdAuthRequests')):
     summaries.append(item)
   except ValueError: pass
 warnings=[line for line in text.splitlines() if re.search(r'\b(?:warning|warn|deprecated)\b',line,re.I)]
 result={'summary_records':summaries,'warning_lines':warnings,'log_sha256':sha(log_path.read_bytes()),'log_bytes':log_path.stat().st_size}
 if gate_name=='audit':
  try:
   parsed=json.loads(text)
   result['audit_report_version']=parsed.get('auditReportVersion')
   result['audit_metadata']=parsed.get('metadata')
   result['audit_error']=parsed.get('error')
   result['audit_advisories']=[
    {'package':name,'severity':value.get('severity'),'isDirect':value.get('isDirect'),'range':value.get('range'),'fixAvailable':value.get('fixAvailable')}
    for name,value in sorted(parsed.get('vulnerabilities',{}).items())
   ]
  except ValueError as error:
   result['audit_json_parse_error']=str(error)
 return result

manifest['started_at']=utc()
save()
try:
 if not (HOSTED/'node_modules').is_dir(): raise RuntimeError('Existing hosted dependencies missing; installation is forbidden')
 runtime={
  'node':capture('node',[str(NODE),'--version']),
  'npm':capture('npm',[str(NPM),'--version']),
  'audit_level':capture('audit_level',[str(NPM),'config','get','audit-level']),
  'omit':capture('omit',[str(NPM),'config','get','omit']),
  'audit_config':capture('audit_config',[str(NPM),'config','get','audit']),
  'node_path':str(NODE), 'npm_path':str(NPM), 'npm_realpath':str(NPM.resolve()),
  'path_prefix':str(NODE.parent),
  'package_sha256':sha((HOSTED/'package.json').read_bytes()),
  'package_lock_sha256':sha((HOSTED/'package-lock.json').read_bytes()),
 }
 if runtime['node']['stdout']!='v24.22.3': raise RuntimeError('Pinned Node version mismatch')
 if runtime['omit']['stdout']: raise RuntimeError('Nonempty existing npm omit config would not establish the requested full audit; no policy changed')
 installed_lock=HOSTED/'node_modules/.package-lock.json'
 runtime['installed_dependency_lock_sha256']=sha(installed_lock.read_bytes()) if installed_lock.is_file() else None
 profile=HOSTED/'.sites-runtime/execution-profile.json'
 runtime['checkout_runtime_profile']={'present':profile.exists(),'sha256':sha(profile.read_bytes()) if profile.exists() else None,'selection':json.loads(profile.read_text()).get('executionProfile') if profile.exists() else 'portable'}
 manifest['runtime']=runtime
 initial_path=OUT.parent/'manifest.json'
 initial=json.loads(initial_path.read_text())
 dependency_match={key:runtime[key]==initial['runtime'][key] for key in ['package_sha256','package_lock_sha256','installed_dependency_lock_sha256']}
 if not all(dependency_match.values()): raise RuntimeError('Dependency manifest/lock drift invalidates the requested initial-audit reuse; no audit or installation repeated')
 initial_audit=next(g for g in initial['gates'] if g['name']=='audit')
 audit_path=Path(initial_audit['log'])
 if sha(audit_path.read_bytes())!=initial_audit['log_sha256']: raise RuntimeError('Initial audit evidence hash changed')
 manifest['audit_reference']={'executed_in_this_retest':False,'initial_manifest':str(initial_path),'initial_manifest_sha256':sha(initial_path.read_bytes()),'audit_log':str(audit_path),'audit_log_sha256':initial_audit['log_sha256'],'initial_exit_code':initial_audit['exit_code'],'initial_finished_at':initial_audit['ended_at'],'audit_metadata':initial_audit['audit_metadata'],'dependency_inputs_byte_identical':dependency_match,'limit':'Verified package.json, package-lock.json and installed dependency-lock bytes; no recursive all-node_modules content baseline existed in the initial run. No dependency installation or mutation was performed by this lane.'}
 baseline=source_snapshot()
 atomic_json(OUT/'source-before.json',baseline)
 if baseline['head']!=EXPECTED_HEAD or baseline['branch']!=EXPECTED_BRANCH: raise RuntimeError('Unexpected checkout HEAD or branch')
 if {r['path'] for r in baseline['dirty_status'] if r['path'] not in RECEIPTS} != set(EXPECTED): raise RuntimeError('Initial implementation/test dirty path set differs from the exact three authorized paths')
 findings=guard(baseline,baseline)
 if findings:
  manifest['abort_findings']=findings
  raise RuntimeError('Source or writer preflight failed')
 manifest['baseline_source_sha256']=baseline['source_sha256']
 manifest['initial_dirty_status']=baseline['dirty_status']
 manifest['initial_source_snapshot']=str(OUT/'source-before.json')
 manifest['generated_receipts_before']=archive_receipts('generated-receipts-before')
 manifest['status']='running'
 save()
 event('preflight_passed',head=baseline['head'],source_sha256=baseline['source_sha256'],node=runtime['node']['stdout'],npm=runtime['npm']['stdout'],dirty_paths=[r['path'] for r in baseline['dirty_status']])
 gates=[
  ('typecheck',[str(NPM),'run','typecheck']),
  ('strict-lint',[str(NPM),'run','lint','--','--max-warnings=0']),
  ('complete-test-chain',[str(NPM),'test']),
  ('hosted-build',[str(NPM),'run','build']),
 ]
 aborted=False
 for number,(name,command) in enumerate(gates,1):
  pre=source_snapshot()
  findings=guard(pre,baseline)
  if findings:
   manifest['abort_findings']=findings;aborted=True
   event('aborted_before_gate',gate=name,findings=findings)
   break
  log_path=OUT/(str(number).zfill(2)+'-'+name+'.log')
  gate={'name':name,'command':command,'cwd':str(HOSTED),'started_at':utc(),'status':'running','log':str(log_path),'source_before_sha256':pre['source_sha256'],'source_guard_observations':0}
  manifest['gates'].append(gate);save()
  event('gate_started',gate=name,command=command,log=str(log_path))
  start=time.monotonic()
  with log_path.open('xb') as log:
   child=subprocess.Popen(command,cwd=HOSTED,env=ENV,stdout=log,stderr=subprocess.STDOUT,start_new_session=True)
   gate['owned_gate_pid']=child.pid
   save()
   next_guard=time.monotonic()+5
   while child.poll() is None:
    if time.monotonic()>=next_guard:
     observed=source_snapshot();gate['source_guard_observations']+=1
     findings=guard(observed,baseline)
     if findings:
      gate['abort_findings']=findings;aborted=True
      atomic_json(OUT/(str(number).zfill(2)+'-'+name+'-source-drift.json'),observed)
      event('source_drift_abort_owned_gate',gate=name,owned_pid=child.pid,findings=findings)
      os.killpg(child.pid,signal.SIGTERM)
      try: child.wait(timeout=5)
      except subprocess.TimeoutExpired:
       os.killpg(child.pid,signal.SIGKILL);child.wait()
      break
     next_guard=time.monotonic()+5
    time.sleep(0.25)
   exit_code=child.wait()
  after=source_snapshot()
  atomic_json(OUT/(str(number).zfill(2)+'-'+name+'-source-after.json'),after)
  findings=guard(after,baseline)
  if findings:
   aborted=True;gate['abort_findings']=findings
  gate.update({'ended_at':utc(),'duration_seconds':round(time.monotonic()-start,3),'exit_code':exit_code,'status':'aborted_source_drift' if aborted else ('passed' if exit_code==0 else 'failed'),'source_after_sha256':after['source_sha256'],'generated_receipt_changes':[d for d in changes(pre['files'],after['files']) if d['path'] in RECEIPTS],**summarize(log_path,name)})
  save()
  event('gate_finished',gate=name,status=gate['status'],exit_code=exit_code,duration_seconds=gate['duration_seconds'],summary_records=gate['summary_records'],warning_lines=gate['warning_lines'],audit_metadata=gate.get('audit_metadata'))
  if aborted: break
  if exit_code!=0:
   manifest['stopped_after_failed_gate']=name
   event('stopped_after_failed_gate',gate=name,exit_code=exit_code)
   break
 final=source_snapshot()
 atomic_json(OUT/'source-after.json',final)
 manifest['final_source_snapshot']=str(OUT/'source-after.json')
 manifest['final_source_sha256']=final['source_sha256']
 manifest['source_hashes_match']=final['source_sha256']==baseline['source_sha256']
 manifest['final_dirty_status']=final['dirty_status']
 manifest['exact_changed_path_set_since_before']=[d['path'] for d in changes(baseline['files'],final['files'])]
 manifest['implementation_or_test_source_changes']=[d for d in changes(baseline['files'],final['files']) if d['path'] not in RECEIPTS]
 manifest['generated_receipt_changes']=[d for d in changes(baseline['files'],final['files']) if d['path'] in RECEIPTS]
 manifest['generated_receipts_after']=archive_receipts('generated-receipts-after')
 manifest['status']='aborted_source_drift' if aborted else ('stopped_after_gate_failure' if any(g['exit_code'] for g in manifest['gates']) else 'completed_passed')
 manifest['completed_gate_count']=len(manifest['gates'])
 manifest['finished_at']=utc();save()
 event('verification_finished',status=manifest['status'],manifest=str(OUT/'manifest.json'),source_hashes_match=manifest['source_hashes_match'],changed_paths=manifest['exact_changed_path_set_since_before'],gates=[{'name':g['name'],'status':g['status'],'exit_code':g['exit_code']} for g in manifest['gates']])
 sys.exit(2 if aborted else 1 if manifest['status']=='stopped_after_gate_failure' else 0)
except Exception as error:
 manifest['status']='preflight_or_runner_failure'
 manifest['runner_error']={'type':type(error).__name__,'message':str(error)}
 manifest['finished_at']=utc();save()
 event('runner_failure',error_type=type(error).__name__,message=str(error),manifest=str(OUT/'manifest.json'))
 raise
