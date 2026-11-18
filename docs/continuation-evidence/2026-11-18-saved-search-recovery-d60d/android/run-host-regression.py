from pathlib import Path
import json,subprocess,hashlib,datetime,sys,os,signal
r=Path('/Users/saleh/Developer/career-finder-saved-search-recovery-20261118-d60d62a70f26')
e=Path('/Users/saleh/Developer/career-finder-feed-evidence-20261117-4b851318da2d/resume-20261118-d60d62a70f26/native-saved-search-recovery/android')
h=e/'host-shared'
java=Path('/Library/Java/JavaVirtualMachines/temurin-25.jdk/Contents/Home/bin/java')
javac=java.with_name('javac')
lib=Path('/Users/saleh/Developer/dithar/.local/gradle/wrapper/dists/gradle-9.4.1-bin/arn2x92ynaizyzdaamcbpbhtj/gradle-9.4.1/lib')
old=Path('/Users/saleh/.gradle/wrapper/dists/gradle-8.14.3-all/10utluxaxniiv4wxiphsi49nj/gradle-8.14.3/lib')
compiler=[lib/x for x in ['kotlin-compiler-embeddable-2.3.0.jar','kotlin-stdlib-2.3.0.jar','kotlin-reflect-2.3.0.jar','kotlin-script-runtime-2.3.0.jar','kotlinx-coroutines-core-jvm-1.10.2.jar','annotations-24.0.1.jar']]+[old/'trove4j-1.0.20200330.jar']
runtime=[lib/'kotlin-stdlib-2.3.0.jar',lib/'kotlinx-coroutines-core-jvm-1.10.2.jar',lib/'annotations-24.0.1.jar',old/'junit-4.13.2.jar',old/'hamcrest-core-1.3.jar',e/'host-deps/json-20240303.jar']
for path in compiler+runtime:assert path.is_file(),path
proof={'compiler':'Kotlin 2.3.0 JVM (project Kotlin is 2.3.10; this is focused host evidence, not Android compilation)','java':str(java),'jvmTarget':'17','dependencies':{str(p):hashlib.sha256(p.read_bytes()).hexdigest() for p in set(compiler+runtime)}}
(e/'host-toolchain.json').write_text(json.dumps(proof,indent=2)+'\n')
results=[]
def run(name,args,timeout=120):
 out=e/(name+'.stdout.log');err=e/(name+'.stderr.log');assert not out.exists()
 entry={'name':name,'command':[str(a) for a in args],'startedAt':datetime.datetime.now(datetime.timezone.utc).isoformat()}
 print('START',name,flush=True)
 with out.open('w') as stdout,err.open('w') as stderr:
  child=subprocess.Popen(entry['command'],stdout=stdout,stderr=stderr,cwd=e,start_new_session=True)
  try:code=child.wait(timeout=timeout)
  except subprocess.TimeoutExpired:
   os.killpg(child.pid,signal.SIGTERM)
   try:code=child.wait(timeout=5)
   except subprocess.TimeoutExpired:os.killpg(child.pid,signal.SIGKILL);code=child.wait()
   entry['timedOut']=True
 entry.update({'exitCode':code,'finishedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'stdoutSHA256':hashlib.sha256(out.read_bytes()).hexdigest(),'stderrSHA256':hashlib.sha256(err.read_bytes()).hexdigest()});results.append(entry)
 (e/'host-results.json').write_text(json.dumps(results,indent=2)+'\n');print('END',name,'EXIT',code,flush=True)
 print(out.read_text()[-14000:],flush=True)
 if code:print(err.read_text()[-8000:],flush=True)
 return code
run('host-java-version',[java,'-version'])
run('host-kotlin-version',[java,'-Xmx512m','-cp',os.pathsep.join(map(str,compiler)),'org.jetbrains.kotlin.cli.jvm.K2JVMCompiler','-version'])
shared=[h/'ModelHelpers.kt',h/'PrivateStorePort.kt',h/'ServicePagesOrigin.kt',h/'HostMain.kt',h/'InstrumentationRegistry.kt']
for label in ['baseline','candidate']:
 work=e/label;work.mkdir(exist_ok=False);classes=work/'classes';classes.mkdir()
 source=(e/'baseline-Discovery.kt').read_bytes() if label=='baseline' else (r/'android/app/src/main/java/com/saleh/careerfinder/Discovery.kt').read_bytes()
 (work/'Discovery.kt').write_bytes(source)
 for filename,rel in [('DiscoverySnapshot.kt','android/app/src/main/java/com/saleh/careerfinder/DiscoverySnapshot.kt'),('DiscoveryPersistenceRegressionTest.kt','android/app/src/androidTest/java/com/saleh/careerfinder/DiscoveryPersistenceRegressionTest.kt'),('BoundaryPolicy.java','android/app/src/main/java/com/saleh/careerfinder/BoundaryPolicy.java')]:
  (work/filename).write_bytes((r/rel).read_bytes())
 sourceHashes={str(p.relative_to(e)):hashlib.sha256(p.read_bytes()).hexdigest() for p in [work/'Discovery.kt',work/'DiscoverySnapshot.kt',work/'DiscoveryPersistenceRegressionTest.kt',work/'BoundaryPolicy.java',*shared]}
 (e/(label+'-host-sources.json')).write_text(json.dumps(sourceHashes,indent=2)+'\n')
 assert run(label+'-java-compile',[javac,'--release','17','-d',classes,work/'BoundaryPolicy.java'])==0
 cp=os.pathsep.join(map(str,[classes,*runtime]))
 code=run(label+'-kotlin-compile',[java,'-Xmx512m','-cp',os.pathsep.join(map(str,compiler)),'org.jetbrains.kotlin.cli.jvm.K2JVMCompiler','-no-stdlib','-no-reflect','-jvm-target','17','-classpath',cp,'-d',classes,*shared,work/'Discovery.kt',work/'DiscoverySnapshot.kt',work/'DiscoveryPersistenceRegressionTest.kt'])
 if code:sys.exit(code)
 svc=classes/'META-INF/services/kotlinx.coroutines.internal.MainDispatcherFactory';svc.parent.mkdir(parents=True);svc.write_text('host.HostMainDispatcherFactory\n')
 code=run(label+'-tests',[java,'-Xmx512m','-Dcareer.host.assets='+str(r/'android/app/src/androidTest/assets'),'-cp',cp,'org.junit.runner.JUnitCore','com.saleh.careerfinder.DiscoveryPersistenceRegressionTest'],120)
 expected=1 if label=='baseline' else 0
 assert code==expected,(label,code,expected)
print('ANDROID SAME-HARNESS BASELINE RED / CANDIDATE GREEN COMPLETED',flush=True)
