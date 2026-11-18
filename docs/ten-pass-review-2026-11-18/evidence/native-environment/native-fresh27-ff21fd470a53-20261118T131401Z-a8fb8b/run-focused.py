#!/usr/bin/env python3
"""One authorized focused attempt; never full release acceptance."""
import collections
from datetime import datetime, timezone
import hashlib, json, os, platform, plistlib, re, signal, subprocess, sys, traceback
from pathlib import Path
OUT = Path(__file__).resolve().parent
OWNER = json.loads((OUT / "ownership.json").read_text())
ROOT, DERIVED = Path(OWNER["worktree"]), Path(OWNER["derivedData"])
DEVICE = "7CF7AF74-3951-4A20-A89E-6EFE745ADED2"
HEAD = "ff21fd470a53710a2811ba2e34e5e0ebbfa7916f"
TREE = "65991d4de50966da1de85c6dc8cc7355fbee0af3"
APPLE = "c8080a217d0348ea738677619be5a3586d6887a2"
METHODS = [
 "testAccessibilityTextKeepsCoreControlsReachable",
 "testDeviceLanguageUsesAnOrderedSupportedFallbackAndAllowsEnglishOverride",
 "testSearchEmptyAndFailurePreservesPreviousResults",
 "testLinkedInProfileDraftAndExternalSearchChoice",
 "testProfileReadinessAndSimpleConnectionSetup",
 "testPrivateApplicationRecordPersistsAndCorrectionIsExplicit",
 "testSettingsAppearanceSurvivesRelaunchAndKeepsProfileReachable"]
RESULT, RECEIPT = OUT / "FocusedNative.xcresult", OUT / "receipt.json"
if RECEIPT.exists():
 raise SystemExit("Existing receipt: this attempt cannot be rerun.")
R = {"schemaVersion":1,"owner":"root/recovery_review","candidate":HEAD,"tree":TREE,
 "appleTree":APPLE,"worktree":str(ROOT),"simulator":DEVICE,"derivedDataCache":str(DERIVED),
 "methods":METHODS,"runnerPID":os.getpid(),"steps":[],"fullReleaseAcceptance":False,
 "nativeResultReviewRequired":True,"state":"preflight"}
def utc():
 return datetime.now(timezone.utc).isoformat()
def save():
 R["updatedUTC"] = utc()
 temp = RECEIPT.with_suffix(".json.tmp")
 temp.write_text(json.dumps(R,indent=2,default=str)+"\n")
 temp.replace(RECEIPT)
def require(ok, text):
 if not ok:
  raise RuntimeError(text)
def readcmd(args):
 return subprocess.run(args,cwd=ROOT,text=True,stdout=subprocess.PIPE,
  stderr=subprocess.PIPE,timeout=20,check=True).stdout
def sha(path):
 h=hashlib.sha256()
 with path.open("rb") as f:
  for chunk in iter(lambda:f.read(1048576),b""):
   h.update(chunk)
 return h.hexdigest()
def event(kind, **data):
 print(json.dumps({"event":kind,"utc":utc(),**data}),flush=True)
def source():
 return {"head":readcmd(["git","rev-parse","HEAD"]).strip(),
  "tree":readcmd(["git","rev-parse","HEAD^{tree}"]).strip(),
  "appleTree":readcmd(["git","rev-parse","HEAD:apple"]).strip(),
  "status":readcmd(["git","status","--porcelain","--untracked-files=all"])}
def source_ok(s):
 return s=={"head":HEAD,"tree":TREE,"appleTree":APPLE,"status":""}
def members(group):
 result=[]
 for line in readcmd(["ps","-axo","pid=,pgid="]).splitlines():
  fields=line.split()
  if len(fields)==2 and int(fields[1])==group:
   try:
    if os.getsid(int(fields[0]))==group:
     result.append(int(fields[0]))
   except ProcessLookupError:
    pass
 return result
def step(name,args,bound,log,env=None,stderr=None):
 info={"name":name,"command":args,"startedUTC":utc(),"limitSeconds":bound,"stdout":str(log)}
 R["steps"].append(info)
 save()
 with log.open("wb") as out:
  err=stderr.open("wb") if stderr else None
  try:
   p=subprocess.Popen(args,cwd=ROOT,stdout=out,stderr=err if err else subprocess.STDOUT,
    env=env,start_new_session=True)
   info.update(pid=p.pid,pgid=p.pid)
   require(os.getpgid(p.pid)==p.pid and os.getsid(p.pid)==p.pid,"Subprocess session mismatch.")
   save()
   event("step_started",name=name,pid=p.pid,bound=bound)
   try:
    info["exit"]=p.wait(timeout=bound)
    info["timedOut"]=False
   except subprocess.TimeoutExpired:
    info["timedOut"]=True
    owned=members(p.pid)
    info["ownedMembersAtTimeout"]=owned
    if owned:
     os.killpg(p.pid,signal.SIGTERM)
    try:
     info["exit"]=p.wait(timeout=8)
    except subprocess.TimeoutExpired:
     owned=members(p.pid)
     if owned:
      os.killpg(p.pid,signal.SIGKILL)
     info["exit"]=p.wait(timeout=8)
    owned=members(p.pid)
    if owned:
     os.killpg(p.pid,signal.SIGKILL)
     info["remainingOwnedMembersKilled"]=owned
  finally:
   if err:
    err.close()
 info["finishedUTC"]=utc()
 info["logSHA256"]=sha(log)
 save()
 event("step_finished",name=name,exit=info.get("exit"),timedOut=info.get("timedOut",False))
 return info
boot_attempted=False
R["startedUTC"]=utc()
save()
try:
 require(OWNER["candidate"]==HEAD and OWNER["tree"]==TREE and
  OWNER["appleTree"]==APPLE and OWNER["simulator"]==DEVICE,"Ownership binding mismatch.")
 creation=json.loads((OUT/"creation.json").read_text())
 require(OWNER.get("createdSimulatorThisRun") is True and creation.get("exit")==0 and
  creation.get("stdout","").strip()==DEVICE and
  creation.get("runtime")=="com.apple.CoreSimulator.SimRuntime.iOS-27-0" and
  creation.get("deviceType")=="com.apple.CoreSimulator.SimDeviceType.iPhone-Air",
  "New owned device creation binding mismatch.")
 R["creationReceipt"]={"path":str(OUT/"creation.json"),"sha256":sha(OUT/"creation.json")}
 require(source_ok(source()),"Frozen source or cleanliness changed.")
 require(platform.machine()=="arm64","Unexpected architecture.")
 processes=readcmd(["ps","-axo","pid=,ppid=,comm="])
 (OUT/"processes-before.log").write_text(processes)
 competing=[s for s in processes.splitlines() if re.search(
  r"(?:^|/)(?:xcodebuild|swift-frontend|gradle|emulator|qemu-system-[^\s]+)\s*$",s)]
 require(not competing,"Competing native workload: "+ "; ".join(competing))
 inventory=json.loads(readcmd(["xcrun","simctl","list","devices","--json"]))
 (OUT/"devices-before.json").write_text(json.dumps(inventory,indent=2)+"\n")
 devices=[{"runtime":runtime,**d} for runtime,ds in inventory["devices"].items()
  for d in ds if d["udid"]==DEVICE]
 require(len(devices)==1 and devices[0].get("isAvailable") is True and
  devices[0].get("state")=="Shutdown" and devices[0].get("runtime")==OWNER["runtime"],
  "Owned simulator must be available and Shutdown on the recorded runtime.")
 prior_path=DERIVED.parent/"receipt.json"
 prior=json.loads(prior_path.read_text())
 require(prior.get("owner")=="ebb3eed5" and prior.get("simulator")==OWNER["priorSimulator"] and
  prior.get("createdSimulatorThisRun") is True and str(DERIVED) in prior.get("command",[]),
  "Cache/device ownership mismatch.")
 disk=os.statvfs(ROOT)
 free=disk.f_bavail*disk.f_frsize
 require(free>=4*1024**3,"Insufficient disk space.")
 R["preflight"]={"device":devices[0],"freeBytes":free,"competingNativeJobs":competing,
  "priorOwnershipReceipt":str(prior_path),"priorOwnershipReceiptSHA256":sha(prior_path),
  "xcodeVersion":readcmd(["xcodebuild","-version"]).strip(),
  "sdkVersion":readcmd(["xcrun","--sdk","iphonesimulator","--show-sdk-version"]).strip(),
  "cacheOnly":True}
 info=DERIVED/"info.plist"
 if info.exists():
  R["preflight"]["derivedInfoBefore"]=plistlib.loads(info.read_bytes())
 files=readcmd(["git","ls-files","-z","--","apple","localization"]).split("\0")
 manifest=[{"path":p,"bytes":(ROOT/p).stat().st_size,"sha256":sha(ROOT/p)}
  for p in files if p and (ROOT/p).is_file()]
 (OUT/"source-manifest.json").write_text(json.dumps(manifest,indent=2)+"\n")
 R["state"]="booting_owned_simulator"
 save()
 boot_attempted=True
 env={**os.environ,"CAREER_FOCUSED_DEVICE":DEVICE,"CAREER_FOCUSED_OUT":str(OUT)}
 boot_shell=r'''set -o pipefail
boot_results=(0 0)
xcrun simctl bootstatus "$CAREER_FOCUSED_DEVICE" -b 2>&1 | tee "$CAREER_FOCUSED_OUT/boot.log" || boot_results=("${PIPESTATUS[@]}")
inventory_result=0
xcrun simctl list devices --json > "$CAREER_FOCUSED_OUT/boot-devices.json" 2> "$CAREER_FOCUSED_OUT/boot-devices.stderr" || inventory_result=$?
python3 apple/Checks/verify-simulator-boot.py \
 --device "$CAREER_FOCUSED_DEVICE" --boot-log "$CAREER_FOCUSED_OUT/boot.log" \
 --inventory "$CAREER_FOCUSED_OUT/boot-devices.json" \
 --boot-exit "${boot_results[0]}" --log-exit "${boot_results[1]}" \
 --inventory-exit "$inventory_result" --output "$CAREER_FOCUSED_OUT/boot-verification.json"
'''
 boot=step("boot-readiness",["/bin/bash","-c",boot_shell],180,OUT/"boot-driver.log",env=env)
 verification=OUT/"boot-verification.json"
 require(boot["exit"]==0 and not boot["timedOut"] and verification.exists(),
  "Boot preparation failed or exceeded its bound.")
 proof=json.loads(verification.read_text())
 require(proof.get("passed") is True and proof.get("selectedDeviceID")==DEVICE,
  "Boot verifier did not accept the selected device.")
 R["bootVerification"]={"path":str(verification),"sha256":sha(verification),"passed":True}
 R["state"]="building_and_testing"
 save()
 command=["xcodebuild","-project","apple/AhmadCareer.xcodeproj","-scheme","CareerFinderAcceptance",
  "-configuration","Debug","-destination","platform=iOS Simulator,id="+DEVICE+",arch=arm64",
  "-derivedDataPath",str(DERIVED),"-resultBundlePath",str(RESULT),
  "-parallel-testing-enabled","NO","-maximum-concurrent-test-simulator-destinations","1",
  "ONLY_ACTIVE_ARCH=YES","CODE_SIGNING_ALLOWED=NO","CODE_SIGNING_REQUIRED=NO",
  *["-only-testing:CareerFinderUITests/CareerFinderUITests/"+m for m in METHODS],"test"]
 native=step("native-focused-test",command,1800,OUT/"native.log")
 text=(OUT/"native.log").read_text(errors="replace")
 started=re.findall(r"Test Case '-\[CareerFinderUITests\.CareerFinderUITests (test\w+)\]' started\.",text)
 completed=re.findall(r"Test Case '-\[CareerFinderUITests\.CareerFinderUITests (test\w+)\]' (passed|failed|skipped) \(([0-9.]+) seconds\)\.",text)
 raw_ok=(native["exit"]==0 and not native["timedOut"] and
  collections.Counter(started)==collections.Counter(METHODS) and
  collections.Counter(m for m,status,seconds in completed)==collections.Counter(METHODS) and
  all(status=="passed" for m,status,seconds in completed))
 R["rawCases"]={"started":started,
  "completed":[{"method":m,"result":status,"seconds":float(seconds)} for m,status,seconds in completed],
  "rawSelectedAcceptance":raw_ok,"scope":"Seven selected methods only; xcresult/visual review still required."}
 R["state"]="native_execution_finished"
 event("native_execution_finished",exit=native["exit"],rawSelectedAcceptance=raw_ok)
except Exception as error:
 R["state"]="stopped_with_failure"
 R["error"]={"type":type(error).__name__,"message":str(error)}
 (OUT/"runner-error.log").write_text(traceback.format_exc())
 event("attempt_failed",error=str(error))
finally:
 save()
 if RESULT.exists():
  exports=[
   ("export-attachments",["xcrun","xcresulttool","export","attachments","--path",str(RESULT),
    "--output-path",str(OUT/"attachments")],OUT/"export-attachments.log",None),
   ("xcresult-summary",["xcrun","xcresulttool","get","test-results","summary","--path",str(RESULT)],
    OUT/"xcresult-summary.json",OUT/"xcresult-summary.stderr"),
   ("xcresult-tests",["xcrun","xcresulttool","get","test-results","tests","--path",str(RESULT)],
    OUT/"xcresult-tests.json",OUT/"xcresult-tests.stderr")]
  for name,args,output,err in exports:
   try:
    step(name,args,60,output,stderr=err)
   except Exception as error:
    R.setdefault("retentionErrors",[]).append({"step":name,"error":str(error)})
    save()
 if boot_attempted:
  try:
   step("shutdown-owned-simulator",["xcrun","simctl","shutdown",DEVICE],30,OUT/"shutdown.log")
  except Exception as error:
   R["shutdownError"]=str(error)
 try:
  R["sourceAfter"]=source()
  R["sourceUnchanged"]=source_ok(R["sourceAfter"])
 except Exception as error:
  R["sourceUnchanged"]=False
  R["sourceCheckError"]=str(error)
 retained=[]
 for p in sorted(OUT.rglob("*")):
  if p.is_file() and p not in (RECEIPT,OUT/"retained-files.json") and ".xcresult" not in str(p):
   retained.append({"path":str(p.relative_to(OUT)),"bytes":p.stat().st_size,"sha256":sha(p)})
 (OUT/"retained-files.json").write_text(json.dumps(retained,indent=2)+"\n")
 R["retainedFilesSHA256"]=sha(OUT/"retained-files.json")
 R["finishedUTC"]=utc()
 if R.get("rawCases",{}).get("rawSelectedAcceptance") and R.get("sourceUnchanged"):
  R["state"]="finished_pending_result_and_visual_review"
 elif R["state"]!="stopped_with_failure":
  R["state"]="finished_with_failure_or_unconfirmed_result"
 save()
 event("runner_finished",state=R["state"],receipt=str(RECEIPT))
sys.exit(0 if R["state"]=="finished_pending_result_and_visual_review" else 1)
