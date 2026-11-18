from pathlib import Path
from datetime import datetime, timezone
import subprocess, json, hashlib
D=Path('/Users/saleh/Developer/career-finder-feed-evidence-20261117-4b851318da2d/resume-export-consumer-20261118')
C=D/'consumer'
EXE='/opt/homebrew/bin/soffice'
jobs=[]
langs=['en','ar']
def sha(p): return hashlib.sha256(p.read_bytes()).hexdigest()
def run(name, inputs, conversion, options=None):
    out=C/name
    out.mkdir(exist_ok=True)
    profile=(C/('profile-'+name)).as_uri()
    args=[EXE,'-env:UserInstallation='+profile,'--headless','--nologo','--nodefault','--nofirststartwizard']
    if options is not None: args+=['--infilter=Text - txt - csv (StarCalc):'+options]
    args+=['--convert-to',conversion,'--outdir',str(out)]+[str(x) for x in inputs]
    r=subprocess.run(args,capture_output=True,text=True,timeout=35)
    (D/'receipts'/ (name+'.stdout.log')).write_text(r.stdout)
    (D/'receipts'/ (name+'.stderr.log')).write_text(r.stderr)
    files=[{'name':p.relative_to(D).as_posix(),'bytes':p.stat().st_size,'sha256':sha(p)} for p in sorted(out.iterdir()) if p.is_file()]
    record={'name':name,'command':args,'exit':r.returncode,'stdout':r.stdout,'stderr':r.stderr,'files':files}
    jobs.append(record)
    (D/'consumer-invocations.json').write_text(json.dumps({'at':datetime.now(timezone.utc).isoformat(),'jobs':jobs},indent=2)+'\n')
    print(json.dumps({'name':name,'exit':r.returncode,'files':files,'stderr':r.stderr}),flush=True)
    assert r.returncode==0 and len(files)==len(inputs), record
    return [out/(p.stem+'.'+conversion.split(':')[0]) for p in inputs]
inputs=[D/'generated'/('career-records-'+l+'.csv') for l in langs]
default=run('default-import',inputs,'fods')
formulas=run('formula-enabled-import',inputs,'fods','44,34,76,1,,1033,false,false,true,false,false,0,true')
text=run('quoted-text-import',inputs,'fods','44,34,76,1,,1033,true,false,true,false,false,0,true,false,false')
control=run('formula-positive-control',[D/'generated/positive-control.csv'],'fods','44,34,76,1,,1033,false,false,true,false,false,0,true')
ods=run('save-native-ods',text,'ods')
reopened=run('reopen-native-ods',ods,'fods')
csv=run('save-csv-again',ods,'csv:Text - txt - csv (StarCalc):44,34,76,1,,1033,true,false,false,false,false,0,false,true,false')
reread=run('reimport-saved-csv',csv,'fods','44,34,76,1,,1033,true,false,true,false,false,0,true,false,false')
print(json.dumps({'completed':len(jobs),'scope':'Actual headless LibreOffice consumer only; no GUI/browser/personal calendar actions.'}),flush=True)
