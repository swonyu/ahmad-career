from pathlib import Path
import subprocess, hashlib, json, datetime, os, io, tarfile, re, shutil

p = Path('/Users/saleh/Developer/career-finder-feed-continuation-20261117-4b851318da2d')
e = Path('/Users/saleh/Developer/career-finder-feed-evidence-20261117-4b851318da2d/resume-20261118-0410/keep-visibility-20261118T0535Z')
r = e / 'pinned-gates'
r.mkdir(exist_ok=False)
node = Path('/Users/saleh/Developer/career-finder-feed-evidence-20261117-4b851318da2d/toolchain/node_modules/node/bin/node')
npm = Path('/opt/homebrew/lib/node_modules/npm/bin/npm-cli.js')
env = os.environ.copy()
env['PATH'] = str(node.parent) + os.pathsep + env['PATH']
sha = lambda f: hashlib.sha256(f.read_bytes()).hexdigest()
now = lambda: datetime.datetime.now(datetime.timezone.utc).isoformat()
receipt = {'startedUTC': now(), 'scope': 'Root-owned hosted Keep editing visible focus; no native or dependency edit/build', 'steps': []}

def save():
    (r / 'receipt.json').write_text(json.dumps(receipt, indent=2) + '\n')

def run(name, args, cwd=p):
    row = {'name': name, 'argv': args, 'cwd': str(cwd), 'startedUTC': now()}
    receipt['steps'].append(row)
    save()
    with (r / (name + '.stdout.log')).open('w') as out, (r / (name + '.stderr.log')).open('w') as err:
        q = subprocess.run(args, cwd=cwd, env=env, stdout=out, stderr=err, text=True)
    row.update({'exit': q.returncode, 'finishedUTC': now(), 'stdoutSHA256': sha(r / (name + '.stdout.log')), 'stderrSHA256': sha(r / (name + '.stderr.log'))})
    save()
    print(json.dumps(row), flush=True)
    return q.returncode

def output(args):
    return subprocess.check_output(args, cwd=p, env=env, text=True).strip()

def manifest():
    return {n: sha(p / n) for n in output(['git', 'ls-files', '--', 'hosted']).splitlines() if (p / n).is_file()}

lock = e / 'root-hosted-gates.lock'
lock_text = json.dumps({'pid': os.getpid(), 'startedUTC': receipt['startedUTC'], 'owner': '4b851318da2d'})
fd = os.open(lock, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
os.write(fd, lock_text.encode())
os.close(fd)
try:
    envelope = json.loads((e / 'patch-and-source-receipt.json').read_text())
    patch = e / 'keep-editing-visibility.patch'
    assert sha(patch) == '05488c32dab09136a62b1d20938ec2c7a1eae27c0cb2a91c44630a98406219ea'
    base = 'cad85c495bc03853cc2258d093e79d8d1fb52ae3'
    assert output(['git', 'rev-parse', 'HEAD']) == envelope['base_commit'] == base
    assert output(['git', 'status', '--porcelain=v1']) == '', 'Unexpected existing edits; do not apply'
    git_lock = Path(output(['git', 'rev-parse', '--path-format=absolute', '--git-path', 'index.lock']))
    assert not git_lock.exists(), str(git_lock)
    for row in envelope['files']:
        assert sha(p / row['path']) == row['before_sha256'], row['path']
    receipt.update({'parent': base, 'node': str(node), 'nodeVersion': output([str(node), '--version']), 'npmCLI': str(npm), 'npmVersion': output([str(node), str(npm), '--version']), 'resolvedGitIndexLock': str(git_lock), 'before': manifest()})
    save()
    assert receipt['nodeVersion'] == 'v24.22.3' and receipt['npmVersion'] == '11.20.0'
    assert run('apply-check', ['git', 'apply', '--check', str(patch)]) == 0
    isolated = r / 'original-with-regressions'
    isolated.mkdir()
    archive = subprocess.check_output(['git', 'archive', '--format=tar', 'HEAD', 'hosted'], cwd=p)
    (r / 'original-hosted.tar').write_bytes(archive)
    with tarfile.open(fileobj=io.BytesIO(archive)) as tf:
        for item in tf:
            relative = Path(item.name)
            assert not relative.is_absolute() and '..' not in relative.parts and (item.isdir() or item.isfile()), item.name
            target = isolated / relative
            if item.isdir():
                target.mkdir(parents=True, exist_ok=True)
            else:
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_bytes(tf.extractfile(item).read())
    (isolated / 'hosted/node_modules').symlink_to(p / 'hosted/node_modules', target_is_directory=True)
    assert run('red-test-hunks', ['git', 'apply', '--include=hosted/tests/*', str(patch)], isolated) == 0
    for row in envelope['files']:
        if not row['path'].startswith('hosted/tests/'):
            assert sha(isolated / row['path']) == row['before_sha256'], row['path']
    assert run('original-keep-regression', [str(node), '--test', '--test-name-pattern=actual (Keep editing|discard entry)', 'tests/phone-recovery-isolation.mjs'], isolated / 'hosted') == 1
    red = (r / 'original-keep-regression.stdout.log').read_text()
    counts = {a: int(b) for a, b in re.findall(r'(?m)^[#ℹ]\s+(tests|pass|fail|skipped)\s+(\d+)\s*$', red)}
    assert counts.get('pass') == 7 and counts.get('fail') == 3, counts
    assert 'Keep recovery must allow the open dialog to scroll its focused control into view' in red
    assert not any(x in red for x in ['ReferenceError:', 'SyntaxError:', 'ERR_MODULE_NOT_FOUND'])
    receipt['redCounts'] = counts
    receipt['baselineFailureIsActualHandlerAssertion'] = True
    save()
    assert output(['git', 'status', '--porcelain=v1']) == '' and not git_lock.exists()
    for row in envelope['files']:
        assert sha(p / row['path']) == row['before_sha256'], row['path']
    assert run('apply', ['git', 'apply', str(patch)]) == 0
    for row in envelope['files']:
        assert sha(p / row['path']) == row['after_sha256'], row['path']
    receipt['candidateBefore'] = manifest()
    save()
    reports = ['hosted/tests/hosted-discovery-verification.json', 'hosted/tests/hosted-phone-verification.json', 'hosted/tests/hosted-verification.json']
    before_reports = {n: json.loads((p / n).read_text()) for n in reports}
    for n in reports:
        dest = r / 'generated-reports-before' / Path(n).name
        dest.parent.mkdir(exist_ok=True)
        shutil.copyfile(p / n, dest)
    for name, args, cwd in [
        ('diff-check', ['git', 'diff', '--check'], p),
        ('focus-and-record-regression', [str(node), '--test', 'tests/phone-recovery-isolation.mjs', 'tests/phone-record-tools.mjs'], p / 'hosted'),
        ('typecheck', [str(node), str(npm), 'run', 'typecheck'], p / 'hosted'),
        ('lint', [str(node), str(npm), 'run', 'lint'], p / 'hosted'),
        ('test', [str(node), str(npm), 'test'], p / 'hosted'),
        ('build', [str(node), str(npm), 'run', 'build'], p / 'hosted'),
    ]:
        assert run(name, args, cwd) == 0, name + ' failed'
    after = manifest()
    changed = [n for n in sorted(set(receipt['candidateBefore']) | set(after)) if receipt['candidateBefore'].get(n) != after.get(n)]
    assert set(changed) <= set(reports), changed
    changes = []
    for n in reports:
        a = before_reports[n].copy()
        b = json.loads((p / n).read_text())
        old_time, new_time = a.pop('observedAt'), b.pop('observedAt')
        assert a == b, n
        dest = r / 'generated-reports-after' / Path(n).name
        dest.parent.mkdir(exist_ok=True)
        shutil.copyfile(p / n, dest)
        changes.append({'path': n, 'oldObservedAt': old_time, 'newObservedAt': new_time, 'allOtherFieldsEqual': True})
    for row in envelope['files']:
        assert sha(p / row['path']) == row['after_sha256'], row['path']
    assert output(['git', 'rev-parse', 'HEAD']) == base
    receipt.update({'status': 'passed', 'finishedUTC': now(), 'candidateAfter': after, 'implementationAndTestsStable': True, 'generatedReportChanges': changes, 'gitStatus': output(['git', 'status', '--porcelain=v1'])})
    save()
    print(json.dumps({'status': 'passed', 'receipt': str(r / 'receipt.json'), 'redCounts': counts}), flush=True)
except BaseException as error:
    receipt.update({'status': 'stopped', 'error': str(error), 'stoppedUTC': now()})
    save()
    raise
finally:
    if lock.exists() and lock.read_text() == lock_text:
        lock.unlink()
