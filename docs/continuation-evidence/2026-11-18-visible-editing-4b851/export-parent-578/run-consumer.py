from pathlib import Path
from datetime import datetime, timezone
import subprocess,json,hashlib,sys
D=Path('/Users/saleh/Developer/career-finder-feed-evidence-20261117-4b851318da2d/resume-20261118-0410/export-acceptance-578d99c-0521')
C=D/'consumer'
EXE='/Applications/LibreOffice.app/Contents/MacOS/soffice'
jobs=[]
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def processes():
 r=subprocess.run(['ps','-axo','pid=,comm='],capture_output=True,text=True,check=True)
 return [x.strip() for x in r.stdout.splitlines() if 'soffice' in x.lower() or 'libreoffice' in x.lower()]
before=processes()
assert not before, {'unexpectedConsumerProcess':before,'action':'No conversion started'}
version=subprocess.run([EXE,'--version'],capture_output=True,text=True,timeout=10).stdout.strip()
def run(name,inputs,conversion,options=None):
 out=C/name
 out.mkdir(exist_ok=False)
 profile=C/('profile-'+name)
 assert not profile.exists()
 args=[EXE,'-env:UserInstallation='+profile.as_uri(),'--headless','--nologo','--nodefault','--nofirststartwizard']
 if options is not None:args+=['--infilter=Text - txt - csv (StarCalc):'+options]
 args+=['--convert-to',conversion,'--outdir',str(out)]+[str(p) for p in inputs]
 started=datetime.now(timezone.utc).isoformat()
 r=subprocess.run(args,capture_output=True,text=True,timeout=35)
 (D/'receipts'/(name+'.stdout.log')).write_text(r.stdout)
 (D/'receipts'/(name+'.stderr.log')).write_text(r.stderr)
 files=[{'path':p.relative_to(D).as_posix(),'bytes':p.stat().st_size,'sha256':sha(p)} for p in sorted(out.iterdir()) if p.is_file()]
 item={'name':name,'startedAt':started,'completedAt':datetime.now(timezone.utc).isoformat(),'command':args,'exitCode':r.returncode,'stdout':r.stdout,'stderr':r.stderr,'files':files}
 jobs.append(item)
 (D/'consumer-invocations.json').write_text(json.dumps({'version':version,'processesBefore':before,'jobs':jobs},ensure_ascii=False,indent=2)+'\n')
 print(json.dumps({'name':name,'exitCode':r.returncode,'files':len(files)}),flush=True)
 assert r.returncode==0 and len(files)==len(inputs),item
 return [out/(p.stem+'.'+conversion.split(':')[0]) for p in inputs]
text_options='44,34,76,1,,1033,true,false,true,false,false,0,true,false,false'
inputs=[D/'originals'/('final-records-'+lang+'.csv') for lang in ['en','ar']]
imported=run('quoted-text-import',inputs,'fods',text_options)
ods=run('save-native-ods',imported,'ods')
reopened=run('reopen-native-ods',ods,'fods')
csv=run('save-csv-again',ods,'csv:Text - txt - csv (StarCalc):44,34,76,1,,1033,true,false,false,false,false,0,false,true,false')
reread=run('reimport-saved-csv',csv,'fods',text_options)
control=D/'reference/arithmetic-positive-control.csv'
control.write_bytes(b'Value\r\n=1+1\r\n')
run('formula-positive-control',[control],'fods','44,34,76,1,,1033,false,false,true,false,false,0,true')
after=processes()
receipt=json.loads((D/'consumer-invocations.json').read_text())
receipt.update({'completedAt':datetime.now(timezone.utc).isoformat(),'processesAfter':after,'scope':'Exact downloaded EN and AR CSVs in new isolated profiles; no GUI, Calendar or native app actions.','originalsUnchanged':all(sha(D/x['copy'])==x['sha256'] for x in json.loads((D/'source-manifest.json').read_text())['files'])})
(D/'consumer-invocations.json').write_text(json.dumps(receipt,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'completedInvocations':len(jobs),'version':version,'consumerProcessesAfter':after,'originalsUnchanged':receipt['originalsUnchanged']}),flush=True)

