#!/usr/bin/env python3
"""One authorized compile-only attempt; no device boot or test execution."""
import collections
from datetime import datetime, timezone
import hashlib, json, os, platform, plistlib, re, signal, subprocess, sys, traceback
from pathlib import Path
OUT = Path(__file__).resolve().parent
OWNER = json.loads((OUT / "ownership.json").read_text())
ROOT, DERIVED = Path(OWNER["worktree"]), Path(OWNER["derivedData"])
DEVICE = "51B42BE5-3356-4937-8993-5C4E22E80D8D"
HEAD = "87c3849bba6e1f03914a7a16943cd50a9b4f6f49"
TREE = "26d7678aabebe2654d000c7cf857c410f968538b"
APPLE = "d84317b2553e6d61ad5996d160f82fdd0b868cf9"
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
 "appleTree":APPLE,"worktree":str(ROOT),"derivedDataCache":str(DERIVED),
 "selectedUIJourneysNotExecuted":METHODS,"nativeMethodsRun":0,"runnerPID":os.getpid(),"steps":[],"fullReleaseAcceptance":False,
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
R["startedUTC"]=utc()
R["scope"]="compile_only_generic_arm64_ios_simulator"
R["buildLimitSeconds"]=900
save()
try:
 require(OWNER["candidate"]==HEAD and OWNER["tree"]==TREE and OWNER["appleTree"]==APPLE,
  "Ownership source mismatch.")
 require(source_ok(source()),"Frozen source or cleanliness changed.")
 require(platform.machine()=="arm64","Unexpected host architecture.")
 processes=readcmd(["ps","-axo","pid=,ppid=,comm="])
 (OUT/"processes-before.log").write_text(processes)
 competing=[s for s in processes.splitlines() if re.search(
  r"(?:^|/)(?:xcodebuild|swift-frontend|gradle|emulator|qemu-system-[^\s]+)\s*$",s)]
 require(not competing,"Competing native workload: "+"; ".join(competing))
 require(OWNER.get("createdFreshDerivedData") is True and DERIVED==OUT/"derived" and
  DERIVED.is_dir() and not any(DERIVED.iterdir()),"Fresh owned DerivedData must be empty.")
 R["derivedDataOwnership"]={"path":str(DERIVED),"createdFreshThisRun":True,"initiallyEmpty":True}
 inventory=json.loads(readcmd(["xcrun","simctl","list","devices","--json"]))
 owned={"51B42BE5-3356-4937-8993-5C4E22E80D8D","DD40DE53-211D-41C7-8B9E-58BB5D347528","7CF7AF74-3951-4A20-A89E-6EFE745ADED2"}
 selected=[{"runtime":runtime,**d} for runtime,ds in inventory["devices"].items()
  for d in ds if d["udid"] in owned]
 require(len(selected)==3 and all(d["state"]=="Shutdown" for d in selected),
  "All owned probe devices must be Shutdown.")
 (OUT/"owned-devices-before.json").write_text(json.dumps(selected,indent=2)+"\n")
 disk=os.statvfs(ROOT)
 R["freeBytesBefore"]=disk.f_bavail*disk.f_frsize
 require(R["freeBytesBefore"]>=4*1024**3,"Insufficient disk.")
 files=readcmd(["git","ls-files","-z","--","apple","localization"]).split("\0")
 manifest=[{"path":p,"bytes":(ROOT/p).stat().st_size,"sha256":sha(ROOT/p)}
  for p in files if p and (ROOT/p).is_file()]
 (OUT/"source-manifest.json").write_text(json.dumps(manifest,indent=2)+"\n")
 args=["xcodebuild","-project","apple/AhmadCareer.xcodeproj","-scheme","CareerFinderAcceptance",
  "-configuration","Debug","-sdk","iphonesimulator","-destination","generic/platform=iOS Simulator",
  "-derivedDataPath",str(DERIVED),"ARCHS=arm64","ONLY_ACTIVE_ARCH=YES",
  "CODE_SIGNING_ALLOWED=NO","CODE_SIGNING_REQUIRED=NO"]
 R["state"]="checking_generic_build_settings"
 save()
 settings_step=step("show-build-settings",args+["-showBuildSettings","-json","build-for-testing"],60,
  OUT/"build-settings.json",stderr=OUT/"build-settings.stderr")
 require(settings_step["exit"]==0 and not settings_step["timedOut"],"Build settings command failed.")
 settings=json.loads((OUT/"build-settings.json").read_text())
 require({s.get("target") for s in settings}=={"AhmadCareer","CareerFinderUITests"},
  "Unexpected target set in scheme build settings.")
 checked=[]
 for target in settings:
  b=target["buildSettings"]
  require(b.get("PLATFORM_NAME")=="iphonesimulator" and b.get("ARCHS","").split()==["arm64"]
   and b.get("CONFIGURATION")=="Debug","Unexpected target platform/architecture/configuration.")
  checked.append({"target":target["target"],**{k:b.get(k) for k in
   ["PLATFORM_NAME","ARCHS","CONFIGURATION","SDKROOT","SDK_VERSION","SUPPORTED_PLATFORMS",
    "PRODUCT_BUNDLE_IDENTIFIER","IPHONEOS_DEPLOYMENT_TARGET","SWIFT_VERSION"]}})
 R["verifiedBuildSettings"]=checked
 R["state"]="building_for_testing_without_execution"
 save()
 result=OUT/"CompileOnly.xcresult"
 build=step("compile-only-build-for-testing",args+["-resultBundlePath",str(result),"build-for-testing"],
  900,OUT/"build.log")
 text=(OUT/"build.log").read_text(errors="replace")
 errors=[line for line in text.splitlines() if re.search(r"\berror:",line)]
 R["compilerErrors"]=errors[:60]
 R["testCaseEvents"]=len(re.findall(r"Test Case .* (?:started|passed|failed)",text))
 R["buildSucceeded"]=(build["exit"]==0 and not build["timedOut"] and
  "** TEST BUILD SUCCEEDED **" in text and R["testCaseEvents"]==0)
 R["resultBundleExists"]=result.exists()
 R["xctestrunProducts"]=[{"path":str(p),"bytes":p.stat().st_size,"sha256":sha(p)}
  for p in (DERIVED/"Build/Products").glob("*.xctestrun")]
 R["state"]="compile_passed" if R["buildSucceeded"] else "compile_failed_or_unconfirmed"
 event("compile_finished",exit=build["exit"],buildSucceeded=R["buildSucceeded"],errors=errors[:6])
except Exception as error:
 R["state"]="stopped_with_failure"
 R["error"]={"type":type(error).__name__,"message":str(error)}
 (OUT/"runner-error.log").write_text(traceback.format_exc())
 event("attempt_failed",error=str(error))
finally:
 try:
  R["sourceAfter"]=source()
  R["sourceUnchanged"]=source_ok(R["sourceAfter"])
  inventory=json.loads(readcmd(["xcrun","simctl","list","devices","--json"]))
  after=[{"runtime":runtime,"udid":d["udid"],"state":d["state"]}
   for runtime,ds in inventory["devices"].items() for d in ds if d["udid"] in owned]
  R["ownedDevicesAfter"]=after
  R["allOwnedDevicesRemainShutdown"]=len(after)==3 and all(d["state"]=="Shutdown" for d in after)
 except Exception as error:
  R["sourceOrDeviceCheckError"]=str(error)
  R["sourceUnchanged"]=False
 if R["state"]=="compile_passed" and (not R.get("sourceUnchanged") or not R.get("allOwnedDevicesRemainShutdown")):
  R["state"]="compile_result_requires_source_or_device_review"
 files=[{"path":p.name,"bytes":p.stat().st_size,"sha256":sha(p)}
  for p in sorted(OUT.iterdir()) if p.is_file() and p not in (RECEIPT,OUT/"retained-files.json")]
 (OUT/"retained-files.json").write_text(json.dumps(files,indent=2)+"\n")
 R["retainedFilesSHA256"]=sha(OUT/"retained-files.json")
 R["finishedUTC"]=utc()
 save()
 event("runner_finished",state=R["state"],receipt=str(RECEIPT))
sys.exit(0 if R["state"]=="compile_passed" else 1)
