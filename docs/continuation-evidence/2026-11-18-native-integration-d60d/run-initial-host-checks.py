from pathlib import Path
import subprocess, tempfile, json, hashlib, datetime, sys
ROOT = Path('/Users/saleh/Developer/career-finder-native-integrated-20261118-d60d62a70f26')
OUT = Path('/Users/saleh/Developer/career-finder-feed-evidence-20261117-4b851318da2d/resume-20261118-d60d62a70f26/native-integration-host-checks')
OUT.mkdir(exist_ok=True)
def capture(args):
    return subprocess.run(args, cwd=ROOT, capture_output=True, text=True, check=True).stdout.strip()
compiler = capture(['xcrun', '--sdk', 'macosx', '--find', 'swiftc'])
sdk = capture(['xcrun', '--sdk', 'macosx', '--show-sdk-path'])
report = {'started_at': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'root': str(ROOT), 'head_before_merge_commit': capture(['git', 'rev-parse', 'HEAD']), 'merge_head': capture(['git', 'rev-parse', 'MERGE_HEAD']), 'checks': [], 'kind': 'focused host checks only; no Xcode/Gradle/native app build or device acceptance'}
def record():
    (OUT / 'verification.json').write_text(json.dumps(report, indent=2) + '\n')
def run(name, args):
    print('START ' + name, flush=True)
    start = datetime.datetime.now(datetime.timezone.utc)
    q = subprocess.run(args, cwd=ROOT, capture_output=True, text=True)
    (OUT / (name + '.stdout.log')).write_text(q.stdout)
    (OUT / (name + '.stderr.log')).write_text(q.stderr)
    entry = {'name': name, 'command': args, 'exit_code': q.returncode, 'started_at': start.isoformat(), 'finished_at': datetime.datetime.now(datetime.timezone.utc).isoformat()}
    report['checks'].append(entry)
    record()
    print('RESULT ' + name + ' exit=' + str(q.returncode), flush=True)
    if q.stdout: print(q.stdout[-3000:], flush=True)
    if q.returncode and q.stderr: print(q.stderr[-6000:], flush=True)
    return q.returncode == 0
files = capture(['git', 'ls-files', 'apple/AhmadCareer', 'apple/Checks', 'apple/UITests', 'android/app/src/main', 'android/checks', 'localization', 'scripts/generate-native-localization.py', 'scripts/test-native-localization.py']).splitlines()
report['source_sha256'] = {n: hashlib.sha256((ROOT / n).read_bytes()).hexdigest() for n in files if (ROOT / n).is_file()}
record()
with tempfile.TemporaryDirectory(prefix='career-native-integration-host-') as tmp:
    temp = Path(tmp)
    common = [compiler, '-swift-version', '5', '-Onone', '-sdk', sdk, '-module-cache-path', str(temp / 'module-cache')]
    app = 'apple/AhmadCareer/'
    checks = 'apple/Checks/'
    suites = [
        ('discovery', [app+'MobileApplicationClient.swift', app+'MobileApplicationState.swift', app+'CareerDiscovery.swift', checks+'DiscoveryCheck.swift'], [checks+'Fixtures/discovery-search-v1.json'], []),
        ('recovery', [app+'MobileApplicationClient.swift', app+'MobileApplicationState.swift', app+'NativeApplicationsStore.swift', checks+'NativeRecoveryCheck.swift'], [], []),
        ('lifecycle', [app+'MobileApplicationClient.swift', checks+'SyntheticPDF.swift', app+'MobileApplicationState.swift', app+'NativeApplicationsStore.swift', checks+'MobileLifecycleCheck.swift'], ['android/app/src/androidTest/assets/phone-workspace-v1.json'], []),
        ('saved-search-localization', [app+'MobileApplicationClient.swift', app+'NativeLocalization.swift', checks+'SavedSearchCheck.swift'], ['android/app/src/androidTest/assets/native-saved-search-v1.json'], []),
        ('acceptance-fixture', [app+'MobileApplicationClient.swift', app+'MobileApplicationState.swift', app+'NativeApplicationsStore.swift', app+'CareerFeed.swift', app+'NativeCareerStore.swift', app+'CareerDiscovery.swift', app+'CareerAppEnvironment.swift', checks+'SyntheticPDF.swift', checks+'AcceptanceFixtureCheck.swift'], [], ['-D', 'DEBUG']),
    ]
    for name, sources, args, flags in suites:
        executable = temp / name
        if run(name+'-compile', common+flags+sources+['-o', str(executable)]):
            run(name+'-run', [str(executable)]+args)
    run('swift-ui-syntax', [compiler, '-frontend', '-parse', '-swift-version', '5', '-sdk', sdk, app+'NativeApplicationsViews.swift', app+'NativeDiscoveryViews.swift', app+'NativeCareerViews.swift', 'apple/UITests/CareerFinderUITests.swift'])
    run('android-policy', ['bash', 'android/checks/run-policy-checks.sh'])
    run('localization-current', ['python3', 'scripts/generate-native-localization.py', '--check'])
    run('localization-contract', ['python3', 'scripts/test-native-localization.py'])
    run('product-diff-whitespace', ['git', 'diff', '--cached', '--check', '--', 'apple', 'android', 'localization'])
report['finished_at'] = datetime.datetime.now(datetime.timezone.utc).isoformat()
report['passed'] = all(x['exit_code'] == 0 for x in report['checks'])
record()
print('FINAL ' + json.dumps({'passed': report['passed'], 'checks': len(report['checks']), 'evidence': str(OUT)}), flush=True)
sys.exit(0 if report['passed'] else 1)
