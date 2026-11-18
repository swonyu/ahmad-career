import pathlib, subprocess, json, os, hashlib, datetime, shutil
root=pathlib.Path('/Users/saleh/Developer/career-finder-feed-continuation-20261117-4b851318da2d')
e=pathlib.Path('/Users/saleh/Developer/career-finder-feed-evidence-20261117-4b851318da2d/resume-20261118-0136')
bin_dir=pathlib.Path('/Users/saleh/Developer/career-finder-feed-evidence-20261117-4b851318da2d/toolchain/node_modules/node/bin')
env=os.environ.copy();env['PATH']=str(bin_dir)+os.pathsep+env.get('PATH','')
hosted=root/'hosted'
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
versions={name:subprocess.check_output([name,'--version'],env=env,text=True).strip() for name in ['node','npm']}
assert versions=={'node':'v24.22.3','npm':'11.20.0'},versions
tracked=['app/phone/PhoneApp.tsx','tests/phone-record-tools.mjs','package.json','package-lock.json']
before={name:sha(hosted/name) for name in tracked}
assert before['app/phone/PhoneApp.tsx']=='5b1f3db0063b062f21209870274b83a3def83cb6bb056c987fd7dac0653e6352'
assert before['tests/phone-record-tools.mjs']=='15ef941aae32725a097e4a88d8d245eb5611738cd41c216eddbd65118c0319a6'
gates=[('typecheck',['npm','run','typecheck']),('lint',['npm','run','lint','--','--max-warnings=0']),('test',['npm','test']),('build',['npm','run','build']),('audit',['npm','audit','--audit-level=high','--json'])]
receipt={'startedUTC':datetime.datetime.now(datetime.timezone.utc).isoformat(),'baseCommit':subprocess.check_output(['git','rev-parse','HEAD'],cwd=root,text=True).strip(),'versions':versions,'inputHashes':before,'gates':[]}
for name,args in gates:
    start=datetime.datetime.now(datetime.timezone.utc).isoformat()
    try:
        result=subprocess.run(args,cwd=hosted,env=env,capture_output=True,text=True,timeout=300)
        stdout,stderr,code=result.stdout,result.stderr,result.returncode
    except subprocess.TimeoutExpired as exc:
        stdout=exc.stdout.decode() if isinstance(exc.stdout,bytes) else exc.stdout or ''
        stderr=exc.stderr.decode() if isinstance(exc.stderr,bytes) else exc.stderr or ''
        code='timeout'
    (e/('download-cleanup-full-'+name+'.log')).write_text(stdout+stderr)
    item={'gate':name,'command':args,'startedUTC':start,'completedUTC':datetime.datetime.now(datetime.timezone.utc).isoformat(),'exit':code,'log':'download-cleanup-full-'+name+'.log'}
    if name=='audit':
        try:item['auditMetadata']=json.loads(stdout).get('metadata')
        except json.JSONDecodeError:item['auditMetadata']=None
    receipt['gates'].append(item)
    (e/'download-cleanup-full-gates.json').write_text(json.dumps(receipt,indent=2)+'\n')
    print(json.dumps(item),flush=True)
receipt['completedUTC']=datetime.datetime.now(datetime.timezone.utc).isoformat()
receipt['finalHashes']={name:sha(hosted/name) for name in tracked}
receipt['inputsUnchangedDuringGates']=receipt['finalHashes']==before
receipt['gitStatus']=subprocess.check_output(['git','status','--porcelain=v1'],cwd=root,text=True)
(e/'download-cleanup-full-gates.json').write_text(json.dumps(receipt,indent=2)+'\n')
print(json.dumps({'completedUTC':receipt['completedUTC'],'inputsUnchangedDuringGates':receipt['inputsUnchangedDuringGates'],'gates':[(g['gate'],g['exit']) for g in receipt['gates']],'gitStatus':receipt['gitStatus']}),flush=True)
