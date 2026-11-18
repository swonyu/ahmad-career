from pathlib import Path
import subprocess,os,json,datetime,hashlib
root=Path(__file__).resolve().parent
observed=[]
for line in subprocess.check_output(["ps","-axo","pid,comm"],text=True).splitlines()[1:]:
 fields=line.strip().split(None,1)
 if len(fields)==2 and Path(fields[1]).name in {"swiftc","swift-frontend","xcodebuild","gradle"}:observed.append(line)
if observed: raise SystemExit("Competing compile observed; no compile started: "+str(observed))
compiler=subprocess.check_output(["xcrun","--sdk","macosx","--find","swiftc"],text=True).strip()
sdk=subprocess.check_output(["xcrun","--sdk","macosx","--show-sdk-path"],text=True).strip()
receipt={"startedUTC":datetime.datetime.now(datetime.timezone.utc).isoformat(),"compiler":compiler,"sdk":sdk,"compilerVersion":subprocess.check_output([compiler,"--version"],text=True),"steps":[]}
for variant in ["baseline","candidate"]:
 base=root/variant
 (base/"tmp").mkdir(exist_ok=True)
 env=os.environ.copy();env["TMPDIR"]=str(base/"tmp")+"/"
 command=[compiler,"-swift-version","5","-Onone","-sdk",sdk,"-module-cache-path",str(root/"module-cache"),str(base/"apple/AhmadCareer/MobileApplicationClient.swift"),str(base/"apple/AhmadCareer/MobileApplicationState.swift"),str(base/"apple/AhmadCareer/CareerDiscovery.swift"),str(base/"apple/Checks/DiscoveryCheck.swift"),"-o",str(base/"discovery-check")]
 for label,args in [("compile",command),("run",[str(base/"discovery-check"),str(base/"apple/Checks/Fixtures/discovery-search-v1.json")])]:
  started=datetime.datetime.now(datetime.timezone.utc).isoformat()
  process=subprocess.run(args,cwd=base,env=env,capture_output=True,text=True)
  (root/(variant+"-"+label+".stdout.log")).write_text(process.stdout)
  (root/(variant+"-"+label+".stderr.log")).write_text(process.stderr)
  receipt["steps"].append({"variant":variant,"step":label,"argv":args,"startedUTC":started,"finishedUTC":datetime.datetime.now(datetime.timezone.utc).isoformat(),"exit":process.returncode,"stdoutSHA256":hashlib.sha256(process.stdout.encode()).hexdigest(),"stderrSHA256":hashlib.sha256(process.stderr.encode()).hexdigest()})
  (root/"verification-receipt.json").write_text(json.dumps(receipt,indent=2)+"\n")
  print(variant,label,"exit",process.returncode,flush=True)
  print(process.stdout[-2500:],flush=True);print(process.stderr[-2500:],flush=True)
  if label=="compile" and process.returncode:raise SystemExit(process.returncode)
receipt["finishedUTC"]=datetime.datetime.now(datetime.timezone.utc).isoformat()
receipt["baselineRedCandidateGreen"] = receipt["steps"][1]["exit"]==1 and receipt["steps"][3]["exit"]==0
(root/"verification-receipt.json").write_text(json.dumps(receipt,indent=2)+"\n")
