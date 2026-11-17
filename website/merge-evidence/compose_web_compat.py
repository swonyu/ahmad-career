#!/usr/bin/env python3
"""Reproduce the first isolated web resolution from pinned Git objects.

No index, checkout, commit, merge, fetch, build or network operation.
Subsequent reviewed corrections are documented by the final diff/receipt.
"""
from pathlib import Path
import hashlib
import json
import re
import subprocess
import zipfile

ROOT = Path(__file__).resolve().parents[2]
BASE = 'b613ab5a08c757f375591733d3c54e9d27f4cb23'
LEGACY = 'd12fb82566ce8d3ebb4eded77506f4f01e303450'

def source(rev, path):
    return subprocess.check_output(['git', 'show', rev + ':' + path], cwd=ROOT).decode()

def write(path, text):
    assert path.startswith(('website/', 'apple/AhmadCareer/Web/'))
    dest = ROOT / path
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_text(text)

def part(text, start, end):
    a = text.index(start)
    return text[a:text.index(end, a)]

def replace_once(text, before, after):
    assert text.count(before) == 1, (before[:120], text.count(before))
    return text.replace(before, after, 1)

def line(text, prefix):
    found = [x for x in text.splitlines(keepends=True) if x.startswith(prefix)]
    assert len(found) == 1, prefix
    return found[0]

evidence = ROOT / 'website/merge-evidence'
snapshot = evidence / 'pre-resolution-owned-paths.zip'
if not snapshot.exists():
    names = subprocess.check_output(['git', 'diff', '--name-only', BASE, '--', 'website', 'apple/AhmadCareer/Web'], cwd=ROOT, text=True).splitlines()
    pins = {}
    with zipfile.ZipFile(snapshot, 'w', zipfile.ZIP_DEFLATED) as archive:
        for name in names:
            path = ROOT / name
            if path.is_file():
                data = path.read_bytes()
                archive.writestr(name, data)
                pins[name] = {'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest()}
            else:
                pins[name] = {'absent': True}
    write('website/merge-evidence/pre-resolution-manifest.json', json.dumps({'base': BASE, 'merging': LEGACY, 'files': pins}, indent=2) + '\n')

# Retain the old tests and their exact source/fixtures as historical, independently
# runnable evidence. These are not proof of the new application's current gates.
history = 'website/historical/public1.3/'
for name in subprocess.check_output(['git', 'ls-tree', '-r', '--name-only', LEGACY, '--', 'website'], cwd=ROOT, text=True).splitlines():
    if name.endswith(('.mjs', '.js', '.json', '.html', '.css', '.svg', '.webmanifest')):
        write(history + name.removeprefix('website/'), source(LEGACY, name))

old = source(LEGACY, 'website/web/app.js')
app = source(BASE, 'website/web/app.js')
app = replace_once(app, line(app, 'const statusValues='), line(old, 'const statusValues='))
app = replace_once(app, line(app, 'let saved='), line(old, 'let saved='))
app = replace_once(app, line(app, 'function applyWorkspace('), line(old, 'function applyWorkspace('))
app = replace_once(app, line(app, 'function persistWorkspace('), line(old, 'function persistWorkspace('))
app = replace_once(app, line(app, 'function validWorkspace('), '''function validWorkspace(w){
 const fields=['saved','states','savedDetails','importedApplicationRecords','importedNextActions'];
 return record(w)&&Object.keys(w).every(k=>fields.includes(k))&&Array.isArray(w.saved)&&w.saved.every(Backup.id)&&record(w.states)&&Object.keys(w.states).every(Backup.id)&&Object.values(w.states).every(x=>statusValues.includes(x))&&record(w.savedDetails)&&Object.entries(w.savedDetails).every(([id,j])=>Backup.id(id)&&C.normalizeJob(j)&&j.id===id&&['applyUrl','sourceUrl'].every(k=>j[k]==null||C.safeJobURL(j[k])!=='#'))&&Backup.validImported(w);
}
''')
app = replace_once(app, 'const validProfile=p=>record(p)&&', 'const validProfile=p=>record(p)&&Object.keys(p).every(k=>profileFields.includes(k))&&')
app = replace_once(app, line(app, 'function readApplicationRecord('), part(old, 'let importedCacheRaw', 'function recordDirty('))
app = replace_once(app, part(app, 'async function saveApplicationRecord(', 'function meaningfulRecord('), part(old, 'async function saveApplicationRecord(', 'function meaningfulRecord('))
app = replace_once(app, line(app, 'function retainedJobs('), line(old, 'function retainedJobs('))
app = replace_once(app, line(app, 'function attentionSection('), line(old, 'function attentionSection('))
app = replace_once(app, "plan:'Application plan'};", "plan:'Application plan',applications:'Application records',backups:'Backup & restore'};\nlet applicationFilter='all';")
app = replace_once(app, 'function render(){\n', part(old, 'let dayRolloverTimer=', 'function render(){') + 'function render(){\n scheduleDayRollover();\n')
app = replace_once(app, 'plan:planPage};', 'plan:planPage,applications:applicationsPage,backups:backupsPage};')
extras = part(old, 'function applicationAdvisory(', 'function discoveryOverview(').replace('${comparisonBar()}', '')
extras += part(old, 'function evidenceSection(', 'function applicationAdvisory(')
app = replace_once(app, 'function savedPage(){', extras + 'function savedPage(){')
app = replace_once(app, 'Website, iPhone and Mac progress do not sync.</p>${toolbar()}', 'Website, iPhone and Mac progress do not sync.</p><div class="dialog-buttons"><button class="secondary" data-view="applications">Review application records</button><button class="secondary" data-view="backups">Backup &amp; restore</button></div>${toolbar()}')
app = replace_once(app, "'YOUR APPLICATION PLAN')}${attentionSection()}", "'YOUR APPLICATION PLAN')}${nextActionsSection()}${attentionSection()}")
app = replace_once(app, "${['Not started','Preparing','Applied','Interviewing','Offer received','Closed / not pursuing'].map", '${statusValues.map')
app = replace_once(app, '${recordEditor(j)}<div class="dialog-buttons">', '${recordEditor(j)}${actionEditor(j)}<div id="application-advisory">${applicationAdvisory(j)}</div><div class="dialog-buttons">')
app = replace_once(app, '<h3>What to establish first</h3>', '${j.requirementNotes?.length||j.employmentType||j.experienceLevel?`<details><summary>Preserved employer evidence</summary>${evidenceSection(j)}</details>`:\'\'}<h3>What to establish first</h3>')
app = replace_once(app, '${recordText(j.id)}\\n${j.summary}', '${recordText(j.id)}${actionText(j.id)}\\n${j.summary}')
app = replace_once(app, 'profile, receipt notes and any unsaved record drafts.', 'profile, receipt notes, private next actions and any unsaved record drafts.')
app = replace_once(app, "case'close':$('#job-dialog').close();break;", "case'close':closeRoleDialog();break;")
app = replace_once(app, "e.target.close()}});", "closeRoleDialog()}});")
app = replace_once(app, "document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&view==='plan'&&!$('#job-dialog').open)render()});", "document.addEventListener('visibilitychange',resumeDayGroups);\nwindow.addEventListener?.('pageshow',resumeDayGroups);")
app = replace_once(app, "document.addEventListener('submit',e=>{", "document.addEventListener('submit',e=>{if(e.target.id==='next-action-form'){e.preventDefault();return saveNextAction(e.target.dataset.record)}")
events = '''// Contextual recovery and private tasks reuse the existing saved-role navigation.
document.addEventListener('input',e=>{
 if(e.target.id==='backup-input'){backupInput=e.target.value;backupFileSequence++;backupPreview=null;const preview=$('#backup-preview-panel');if(preview)preview.innerHTML='';const notice=$('#backup-notice');if(notice)notice.textContent='Input changed. Review again before restoring.';return}
 captureActionInput(e.target);if(e.target.id==='application-search'){query=e.target.value;render()}
});
document.addEventListener('change',e=>{
 if(e.target.id==='backup-file')return readBackupFile(e.target.files?.[0]);
 captureActionInput(e.target);if(e.target.id==='application-filter'){applicationFilter=e.target.value;render()}
});
document.addEventListener('click',e=>{
 const b=e.target.closest?.('[data-action]');if(!b)return;const id=b.dataset.record;
 switch(b.dataset.action){
 case'backup-export':return prepareBackup();case'backup-recovery':return prepareRecoveryBackup();case'backup-preview':return previewBackup();case'backup-apply':return applyBackup();
 case'backup-cancel':backupPreview=null;backupResult('Restore preview cancelled. Nothing was changed.');break;
 case'backup-copy':return copyBackup();case'backup-download':return downloadBackup();
 case'reload-action':if(!actionDrafts[id]?.saving&&(!actionDirty(actionDrafts[id])||confirm('Discard this unsaved next action and reload the saved value?'))){delete actionDrafts[id];openJob(id)}break;
 case'complete-action':return saveNextAction(id,!actionDrafts[id]?.base?.completed);
 }
});
$('#job-dialog').addEventListener('cancel',e=>{e.preventDefault();closeRoleDialog()});
window.addEventListener?.('beforeunload',e=>{if(Object.values(actionDrafts).some(d=>actionDirty(d)||d.saving)){e.preventDefault();e.returnValue=''}});
window.addEventListener?.('storage',e=>{
 if(e.key?.startsWith('ahmad-next-action-v1:')){
  if(dialogJob&&$('#job-dialog').open){const id=dialogJob.id,d=actionDrafts[id];if(d&&!actionDirty(d)&&!d.saving){editNextAction(id);const form=$('#next-action-form');if(form?.dataset.record===id){$('#action-date').value=actionDrafts[id].dueOn;$('#action-note').value=actionDrafts[id].actionNote;updateActionEditor(id);updateActionCompletion(id)}}}
  if(['plan','applications'].includes(view)&&!$('#job-dialog').open)render();
 }
 if(e.key==='ahmad-workspace'||e.key?.startsWith('ahmad-application-record-v1:')){updateDialogApplication();if(view==='applications'&&!$('#job-dialog').open)render()}
});
'''
app = replace_once(app, 'workspaceAction(retainKnownJobs);\nrender();', events + 'workspaceAction(retainKnownJobs);\nrender();')
write('website/web/app.js', app)

# Retain bounded legacy metadata/parsers for saved-record compatibility, while
# the production feed selector and title relevance retain the current scope.
core = source(LEGACY, 'website/web/core.js')
current_core = source(BASE, 'website/web/core.js')
core = replace_once(core, part(core, '  function relevance(', '  function plainEmployerText('), part(current_core, '  function relevance(', '  const safeURL='))
core = replace_once(core, ".filter(j=>j.company!=='Qiddiya'&&relevance(j.title)>0)", ".filter(j=>j.company!=='Qiddiya'&&j.healthcare!==false)")
write('website/web/core.js', core)

feeds = source(BASE, 'website/feeds.mjs')
old_feeds = source(LEGACY, 'website/feeds.mjs')
feeds = replace_once(feeds, part(feeds, 'async function jsonFetch(', 'function detailPath('), part(old_feeds, 'async function jsonFetch(', 'function detailPath('))
feeds = replace_once(feeds, 'const {isSaudi,relevance,safeJobURL,', 'const {isSaudi,relevance,safeJobURL,requirementNotes,employerMode,employmentLabel,')
legacy_relevance = part(source(LEGACY, 'website/web/core.js'), '  function relevance(', '  function plainEmployerText(').strip().replace('function relevance(', 'function legacyTechnologyRelevance(', 1)
public_adapters = part(old_feeds, '// Public, read-only employer boards.', 'export async function getLiveJobs(')
public_adapters = re.sub(r'\brelevance\(', 'legacyTechnologyRelevance(', public_adapters)
feeds = replace_once(feeds, 'export async function getLiveJobs(', '// Historical read-only adapters are retained for compatibility and fixture checks.\n// They are not enabled by the production six-source selector below.\n'+legacy_relevance+'\n'+public_adapters+'export async function getLiveJobs(')
write('website/feeds.mjs', feeds)

# Restore current neutral presentation, deployment targets and current checks.
for name in ['web/data.js','web/icon.svg','web/index.html','web/manifest.webmanifest','README.txt','check.mjs','feed-check.mjs','server-check.mjs','state-check.mjs','build.mjs','dev.mjs','.openai/hosting.json']:
    write('website/'+name, source(BASE, 'website/'+name))
index = (ROOT/'website/web/index.html').read_text().replace('<script src="app.js">', '<script src="backup.js"></script><script src="app.js">')
write('website/web/index.html', index)
state = (ROOT/'website/state-check.mjs').read_text()
state = replace_once(state, "['core.js', 'data.js', 'app.js']", "['core.js', 'data.js', 'backup.js', 'app.js']")
state = replace_once(state, 'function createApp(initialStorage', 'export function createApp(initialStorage')
state = replace_once(state, 'Blob, Intl: appIntl, Date, AbortSignal,', 'Blob, Intl: appIntl, Date: options.Date || Date, AbortSignal,')
state = replace_once(state, '    localStorage: {\n', '    localStorage: {\n      get length(){return storage.size;}, key:index=>[...storage.keys()][index]??null,\n')
write('website/state-check.mjs', state)

backup = source(LEGACY, 'website/web/backup.js')
backup = replace_once(backup, "value.schema!==1", "![1,2].includes(value.schema)")
backup = replace_once(backup, "if(!keys(value.profile,['years','degree','skills','achievements','preferredCity','minimumMonthlySAR','unknownSalary']))fail();", '''const legacyProfileFields=['years','degree','skills','achievements','preferredCity','minimumMonthlySAR','unknownSalary'];
  const preferenceFields=['preferencesVersion','targetCountry','targetCity','roleKeywords','planningCurrency','planningPayPeriod','displayTimeZone'];
  if(!keys(value.profile,value.schema===1?legacyProfileFields:[...legacyProfileFields,...preferenceFields]))fail();
  if(value.schema===2&&globalThis.CareerPreferenceValidation&&!globalThis.CareerPreferenceValidation(value.profile))fail();''')
backup = replace_once(backup, "data:{format:'saleh-career-workspace',schema:1,", "data:{format:'saleh-career-workspace',schema:profileFields.some(k=>!['years','degree','skills','achievements','preferredCity','minimumMonthlySAR','unknownSalary'].includes(k)&&p[k]!=null)?2:1,")
backup = backup.replace('Web, Mac and iPhone records do not sync.', 'This local legacy workspace does not sync with phone or signed-in application workspaces. Import never grants permission to submit an application.')
write('website/web/backup.js', backup)
app = (ROOT/'website/web/app.js').read_text()
app = replace_once(app, 'const defaultProfile=P.freshProfile();', 'globalThis.CareerPreferenceValidation=p=>!P.preferenceError(p);\nconst defaultProfile=P.freshProfile();')
write('website/web/app.js', app)

package = json.loads(source(BASE, 'website/package.json'))
package['scripts']['test'] += ' && node followup-check.mjs && node backup-check.mjs && node legacy-compatibility-check.mjs'
package['scripts']['test:legacy-history'] = 'cd historical/public1.3 && node check.mjs && node record-check.mjs && node feed-check.mjs && node followup-check.mjs && node backup-check.mjs && node role-review-check.mjs && node personalization-check.mjs'
write('website/package.json', json.dumps(package, indent=2) + '\n')

# No new primary navigation item. Both bundled copies remain exact mirrors.
for name in ['app.js','core.js','backup.js','data.js','icon.svg','index.html','manifest.webmanifest','style.css']:
    write('apple/AhmadCareer/Web/'+name, (ROOT/'website/web'/name).read_text())
print('Prepared web conflict resolution. No checks run by this script.')
