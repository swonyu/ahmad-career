from pathlib import Path
import datetime, hashlib, json, signal, subprocess, sys, time, traceback

HERE = Path(__file__).resolve().parent
MANIFEST = json.loads((HERE / 'source-manifest.json').read_text())
NODE = MANIFEST['nodeExecutable']
VERSIONS = [p['version'] for p in MANIFEST['packages']]
RECORDS = []
STARTED = time.monotonic()
DEADLINE_BUDGET = 30.0
ALLOCATED = 0.0
SUMMARY = {
    'startedAtUTC': datetime.datetime.now(datetime.timezone.utc).isoformat(),
    'repositoryHead': MANIFEST['repositoryHead'],
    'node': MANIFEST['nodeVersion'],
    'candidateScope': MANIFEST['candidateScope'],
    'runStatus': 'starting',
    'remediationComplete': False,
    'projectTestsRun': False,
    'auditRun': False,
    'nativeOrCIRun': False,
    'records': RECORDS,
}
if (HERE / 'results.json').exists() or (HERE / 'process-records.jsonl').exists():
    raise SystemExit('Refusing to overwrite a previous experimental run')

def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

def run(label, args, timeout):
    global ALLOCATED
    remaining = DEADLINE_BUDGET - (time.monotonic() - STARTED)
    if remaining < timeout + 0.5 or ALLOCATED + timeout + 0.5 > DEADLINE_BUDGET:
        raise RuntimeError('Total external-deadline budget exhausted before ' + label)
    ALLOCATED += timeout
    argv = [NODE] + args
    begin = time.monotonic()
    p = subprocess.Popen(argv, cwd=str(HERE), stdin=subprocess.DEVNULL, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, start_new_session=True)
    record = {'label': label, 'argv': argv, 'cwd': str(HERE), 'pid': p.pid, 'timeoutSeconds': timeout, 'timedOut': False, 'termination': None}
    try:
        try:
            out, err = p.communicate(timeout=timeout)
        except subprocess.TimeoutExpired:
            record['timedOut'] = True
            p.terminate()
            record['termination'] = 'SIGTERM'
            try:
                out, err = p.communicate(timeout=0.25)
            except subprocess.TimeoutExpired:
                p.kill()
                record['termination'] = 'SIGKILL-after-SIGTERM'
                out, err = p.communicate(timeout=0.5)
    finally:
        if p.poll() is None:
            p.kill()
            p.wait(timeout=0.5)
        record['exitCode'] = p.returncode
        record['terminationVerifiedByWait'] = p.poll() is not None
        record['elapsedSeconds'] = time.monotonic() - begin
    record['stdout'] = out
    record['stderr'] = err
    try:
        record['result'] = json.loads(out.strip()) if out.strip() else None
    except json.JSONDecodeError:
        record['result'] = None
    RECORDS.append(record)
    with (HERE / 'process-records.jsonl').open('a') as handle:
        handle.write(json.dumps(record) + '\n')
    print(json.dumps({k: record[k] for k in ['label', 'pid', 'exitCode', 'timedOut', 'termination', 'terminationVerifiedByWait', 'elapsedSeconds']}), flush=True)
    return record

def require_pass(record, phase):
    if record['timedOut'] or record['exitCode'] != 0 or (phase != 'syntax' and (record['result'] or {}).get('status') != 'pass'):
        SUMMARY['runStatus'] = 'rejected-' + phase
        SUMMARY['failureRecord'] = record['label']
        raise RuntimeError('Stop immediately after ' + phase + ' failure: ' + record['label'])

exit_code = 0
try:
    require_pass(run('syntax-probe', ['--check', str(HERE / 'probe.cjs')], 0.75), 'syntax')
    for version in VERSIONS:
        require_pass(run('syntax-candidate-' + version, ['--check', str(HERE / 'candidate' / version / 'lib/parse.js')], 0.75), 'syntax')
    for version in VERSIONS:
        record = run('semantics-' + version, [str(HERE / 'probe.cjs'), 'semantics', version], 2.0)
        require_pass(record, 'compatibility')
    SUMMARY['runStatus'] = 'short-semantics-passed'
    for version in VERSIONS:
        record = run('baseline-leading-star-' + version, [str(HERE / 'probe.cjs'), 'probe', version, 'baseline', 'simple-leading-star'], 0.75)
        if not record['timedOut']:
            require_pass(record, 'baseline-probe')
    for version in VERSIONS:
        for case in ['simple-leading-star', 'simple-optional-star', 'simple-suffix', 'literal-prefix']:
            record = run('candidate-' + version + '-' + case, [str(HERE / 'probe.cjs'), 'probe', version, 'candidate', case], 0.75)
            require_pass(record, 'covered-probe')
    residual = run('candidate-2.3.2-capture-residual', [str(HERE / 'probe.cjs'), 'probe', '2.3.2', 'candidate', 'capture-residual'], 0.75)
    if not residual['timedOut']:
        require_pass(residual, 'residual-observation')
    SUMMARY['runStatus'] = 'covered-probes-completed-with-unresolved-scope'
    SUMMARY['captureResidualTimedOutOnVersion2.3.2'] = residual['timedOut']
except Exception as error:
    exit_code = 1
    SUMMARY['error'] = str(error)
    SUMMARY['traceback'] = traceback.format_exc()
    if SUMMARY['runStatus'] in ['starting', 'short-semantics-passed']:
        SUMMARY['runStatus'] = 'harness-or-budget-failure'
finally:
    checks = []
    for package in MANIFEST['packages']:
        for item in package['files']:
            original = Path(package['installedPath']) / item['relativePath']
            baseline = HERE / 'baseline' / package['version'] / item['relativePath']
            candidate = HERE / 'candidate' / package['version'] / item['relativePath']
            checks.append({
                'version': package['version'],
                'relativePath': item['relativePath'],
                'installedUnchanged': digest(original) == item['installedSha256'],
                'baselineUnchanged': digest(baseline) == item['baselineSha256'],
                'candidateUnchangedDuringTests': digest(candidate) == item['candidateSha256'],
            })
    SUMMARY['sourceIntegrity'] = checks
    SUMMARY['installedSourcesUnchanged'] = all(x['installedUnchanged'] for x in checks)
    SUMMARY['copiedSourcesUnchangedDuringTests'] = all(x['baselineUnchanged'] and x['candidateUnchangedDuringTests'] for x in checks)
    SUMMARY['packageLockUnchanged'] = digest(Path(MANIFEST['repository']) / 'hosted/package-lock.json') == MANIFEST['packageLockSha256']
    SUMMARY['totalElapsedSeconds'] = time.monotonic() - STARTED
    SUMMARY['allocatedExternalDeadlineSeconds'] = ALLOCATED
    SUMMARY['maximumBudgetSeconds'] = DEADLINE_BUDGET
    SUMMARY['experimentExitCode'] = exit_code
    SUMMARY['finishedAtUTC'] = datetime.datetime.now(datetime.timezone.utc).isoformat()
    (HERE / 'results.json').write_text(json.dumps(SUMMARY, indent=2) + '\n')
    print(json.dumps({k: SUMMARY[k] for k in ['runStatus', 'experimentExitCode', 'totalElapsedSeconds', 'allocatedExternalDeadlineSeconds', 'installedSourcesUnchanged', 'copiedSourcesUnchangedDuringTests', 'packageLockUnchanged', 'remediationComplete']}), flush=True)
sys.exit(exit_code)
