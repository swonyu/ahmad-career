from pathlib import Path
import hashlib, json, shutil, difflib, subprocess, datetime

HERE = Path(__file__).resolve().parent
REPO = Path('/Users/saleh/Developer/career-finder-feed-continuation-20261117-4b851318da2d')
NODE = Path('/Users/saleh/Developer/career-finder-feed-evidence-20261117-4b851318da2d/toolchain/node_modules/node/bin/node')
SOURCES = {
    '2.3.2': REPO / 'hosted/node_modules/picomatch',
    '4.0.4': REPO / 'hosted/node_modules/tinyglobby/node_modules/picomatch',
    '4.0.7': REPO / 'hosted/node_modules/vite/node_modules/picomatch',
}
EXPECTED_PARSE = {
    '2.3.2': '3a91656f440069aa8f8e15c9d695b9f6b2209df1eab2be8127c72cbcca45ff5f',
    '4.0.4': 'ce57c04e04994b83e2ca566170fa192e6fe19d710bea6da00ce2f76d01c0dea4',
    '4.0.7': '4e1e05447668aa1e94366c5516a2bcd8f5fff800cc92b1d0cd7d77703b8618c4',
}

def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

helper = r"""// Experimental partial remedy: simple non-capturing branches only.
// Quoted/escaped/complex syntax, captures and explicit opt-outs stay unchanged.
const isSimpleRepeatedStarBranch = branch => {
  const excluded = ['\\', '/', '"', "'", '?', '(', ')', '[', ']', '{', '}', '|', '!', '+', '@'];
  return branch.includes('*') &&
    !branch.includes('**') &&
    !excluded.some(character => branch.includes(character));
};

"""
collapse = """  if (!options.capture && !options.contains && !options.flags && !options.prepend && branches.length === 1 && isSimpleRepeatedStarBranch(branches[0])) {
    return { risky: false, collapse: true };
  }

"""
close = """    if (analysis.collapse === true && (token.type === 'plus' || token.type === 'star')) {
      token.close = token.type === 'plus' ? ')' : ')?';
    }

"""
manifest = {
    'createdAtUTC': datetime.datetime.now(datetime.timezone.utc).isoformat(),
    'repository': str(REPO),
    'repositoryHead': subprocess.check_output(['git', '-C', str(REPO), 'rev-parse', 'HEAD'], text=True).strip(),
    'packageLockSha256': sha(REPO / 'hosted/package-lock.json'),
    'nodeExecutable': str(NODE),
    'nodeVersion': subprocess.check_output([str(NODE), '--version'], text=True).strip(),
    'candidateScope': 'Only simple single-branch repeated stars, with captures and complex syntax unchanged. Partial remedy experiment, not production patch or full CVE remediation.',
    'upstreamReferences': [
        {'url': 'https://github.com/micromatch/picomatch/pull/237/files', 'commitFromObservedLink': '1bf0d04563cb9ce568cf36efc5f6b7187d9911d5'},
        {'url': 'https://github.com/micromatch/picomatch/pull/246/files', 'commitFromObservedLink': 'f03bec2c02e46f063fbfdc161aae1d0f854b2565'},
    ],
    'packages': [],
}
if manifest['nodeVersion'] != 'v24.22.3':
    raise SystemExit('Pinned Node mismatch')
for version, source in SOURCES.items():
    if sha(source / 'lib/parse.js') != EXPECTED_PARSE[version]:
        raise SystemExit('Installed parser changed before copying: ' + version)
    paths = [source / name for name in ['LICENSE', 'README.md', 'index.js', 'package.json', 'posix.js'] if (source / name).is_file()]
    paths += sorted((source / 'lib').glob('*.js'))
    if any(p.is_symlink() for p in paths):
        raise SystemExit('Refusing source symlink')
    item = {'version': version, 'installedPath': str(source), 'files': []}
    for variant in ['baseline', 'candidate']:
        target = HERE / variant / version
        if target.exists():
            raise SystemExit('Refusing to overwrite existing source copy: ' + str(target))
        target.mkdir(parents=True)
        for p in paths:
            relative = p.relative_to(source)
            copied = target / relative
            copied.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(p, copied)
    for p in paths:
        relative = p.relative_to(source).as_posix()
        item['files'].append({'relativePath': relative, 'installedSha256': sha(p), 'baselineSha256': sha(HERE / 'baseline' / version / relative)})
    parse_path = HERE / 'candidate' / version / 'lib/parse.js'
    original = parse_path.read_text()
    anchor = 'const analyzeRepeatedExtglob = (body, options) => {'
    if original.count(anchor) != 1:
        raise SystemExit('Unexpected parser analysis anchor')
    candidate = original.replace(anchor, helper + anchor, 1)
    start = candidate.index(anchor)
    end = candidate.index('\n};', start)
    analysis = candidate[start:end]
    tail = '  return { risky: false };'
    split = analysis.rfind(tail)
    if split < 0 or analysis[split:].strip() != tail.strip():
        raise SystemExit('Unexpected parser analysis tail')
    candidate = candidate[:start] + analysis[:split] + collapse + analysis[split:] + candidate[end:]
    close_anchor = "    let output = token.close + (opts.capture ? ')' : '');"
    if candidate.count(close_anchor) != 1:
        raise SystemExit('Unexpected extglob close anchor')
    candidate = candidate.replace(close_anchor, close + close_anchor, 1)
    parse_path.write_text(candidate)
    for f in item['files']:
        f['candidateSha256'] = sha(HERE / 'candidate' / version / f['relativePath'])
        if f['relativePath'] != 'lib/parse.js' and f['candidateSha256'] != f['baselineSha256']:
            raise SystemExit('Unexpected changed copied file')
    identity = json.loads((HERE / 'candidate' / version / 'package.json').read_text())
    if identity['name'] != 'picomatch' or identity['version'] != version:
        raise SystemExit('Package identity mismatch')
    diff = ''.join(difflib.unified_diff(original.splitlines(keepends=True), candidate.splitlines(keepends=True), fromfile='baseline/' + version + '/lib/parse.js', tofile='candidate/' + version + '/lib/parse.js'))
    (HERE / ('candidate-' + version + '.patch')).write_text(diff)
    item['patchSha256'] = sha(HERE / ('candidate-' + version + '.patch'))
    manifest['packages'].append(item)
(HERE / 'source-manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
print(json.dumps({'status': 'prepared', 'node': manifest['nodeVersion'], 'head': manifest['repositoryHead'], 'versions': list(SOURCES), 'sourceFilesCopied': sum(len(x['files']) for x in manifest['packages']), 'onlyCandidateChange': 'lib/parse.js', 'testsExecuted': False}, indent=2))
