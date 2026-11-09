import AppKit
import WebKit

@main
enum WebRuntimeCheck {
    @MainActor static func main() {
        NSApplication.shared.setActivationPolicy(.prohibited)
        let root = URL(fileURLWithPath: CommandLine.arguments[1], isDirectory: true)
        // Deterministic, isolated browser UI integration. Live fetches are separate opt-in checks.
        guard CommandLine.arguments.count>2,
              let data=try? Data(contentsOf:URL(fileURLWithPath:CommandLine.arguments[2])),
              var payload=(try? JSONSerialization.jsonObject(with:data)) as? [String:Any] else {fatalError("Provide an offline native refresh fixture")}
        payload["checkedAt"]=ISO8601DateFormatter().string(from:Date().addingTimeInterval(-300))
        let fixture=payload
        let coordinator = CareerWebView.Coordinator(reloadID: 0,refreshProvider:{fixture})
        coordinator.webRoot = root
        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = .nonPersistent()
        configuration.userContentController.add(coordinator, name: "careerSearch")
        let view = WKWebView(frame: NSRect(x: 0, y: 0, width: 1200, height: 800), configuration: configuration)
        coordinator.webView = view
        view.navigationDelegate = coordinator
        view.uiDelegate = coordinator
        var observation: NSKeyValueObservation?
        observation = view.observe(\.isLoading, options: [.new]) { webView, _ in
            guard !webView.isLoading, webView.url?.isFileURL == true else { return }
            Task { @MainActor in
                observation?.invalidate()
                do {
                    let result: Any = try await withCheckedThrowingContinuation { continuation in
                    webView.callAsyncJavaScript("""
                    if (!document.title || !document.body.innerText.trim()) throw new Error('Empty bundled page');
                    localStorage.setItem('__nativeSmoke', 'ok');
                    if (localStorage.getItem('__nativeSmoke') !== 'ok') throw new Error('Local storage failed');
                    localStorage.removeItem('__nativeSmoke');
                    if (document.querySelectorAll('#job-list .job-row').length !== globalThis.CAREER_DATA.jobs.filter(j=>CareerCore.criteriaFor(j,{preferredCity:'riyadh'}).included).length) throw new Error('Bundled shortlist did not render');
                    const button = document.querySelector('#sidebar .new-search');
                    button.click();
                    if (!button.disabled || !button.textContent.includes('Searching')) throw new Error('Real button did not enter searching state');
                    await new Promise((resolve, reject) => {
                      const timer = setInterval(() => {
                        if (!document.querySelector('#sidebar .new-search').disabled) { clearInterval(timer); clearTimeout(timeout); resolve(); }
                      }, 100);
                      const timeout = setTimeout(() => { clearInterval(timer); reject(new Error('Real UI remained searching')); }, 90000);
                    });
                    const payload = JSON.parse(localStorage.getItem('ahmad-live'));
                    if (!payload || payload.sources.length !== \(CareerFeed.activeSourceNames.count)) throw new Error('Real app callback did not persist native payload');
                    const rows = document.querySelectorAll('#job-list .job-row').length;
                    const visibleJobs=payload.jobs.filter(j=>CareerCore.criteriaFor(j,{preferredCity:'riyadh'}).included);
                    if (!rows || rows !== visibleJobs.length) throw new Error('New lead rows did not render');
                    if (document.querySelectorAll('.source-row').length !== \(CareerFeed.activeSourceNames.count)) throw new Error('Source coverage did not render');
                    if (document.querySelector('#view-name').textContent !== 'Live search') throw new Error('Wrong current view');
                    const changeSelect=(selector,value)=>{const select=document.querySelector(selector);if(!select)throw new Error('Missing filter '+selector);select.value=String(value);select.dispatchEvent(new Event('change',{bubbles:true}));};
                    const rowIDs=()=>Array.from(document.querySelectorAll('#job-list .job-row .job-title[data-job]')).map(b=>b.dataset.job);
                    const selectedCompany=visibleJobs[0].company;
                    changeSelect('#company-filter',selectedCompany);
                    const companyIDs=visibleJobs.filter(j=>j.company===selectedCompany).map(j=>j.id).sort();
                    if(JSON.stringify(rowIDs().sort())!==JSON.stringify(companyIDs))throw new Error('Employer filter did not select exact company');
                    changeSelect('#age-window',7);
                    const recentIDs=visibleJobs.filter(j=>j.company===selectedCompany&&CareerCore.discoveryMatches(j,{days:7})).map(j=>j.id).sort();
                    if(JSON.stringify(rowIDs().sort())!==JSON.stringify(recentIDs))throw new Error('Employer date filter did not compose with company');
                    document.querySelector('[data-action="reset-discovery"]').click();
                    if(document.querySelector('#company-filter').value!==''||document.querySelector('#age-window').value!=='0'||document.querySelectorAll('#job-list .job-row').length!==rows)throw new Error('Discovery reset failed');
                    const evidenceJob=visibleJobs.find(j=>j.requirementNotes?.length);
                    if(!evidenceJob)throw new Error('Expected the seventh-board fixture to contain employer excerpts');
                    Array.from(document.querySelectorAll('[data-job]')).find(b=>b.dataset.job===evidenceJob.id).click();
                    const evidence=document.querySelector('#job-dialog .evidence-panel');
                    if(!evidence||!evidence.textContent.includes(evidenceJob.requirementNotes[0])||!evidence.textContent.includes('not a complete requirements assessment'))throw new Error('Employer evidence or limitation did not render');
                    if(!document.querySelector('#job-dialog').textContent.includes('Last published'))throw new Error('Last-publication date label was lost');
                    document.querySelector('[data-action="close"]').click();
                    const firstTitle = document.querySelector('#job-list .job-title').textContent;
                    const cached = localStorage.getItem('ahmad-live');
                    await window.receiveNativeJobs({checkedAt:new Date(Date.parse(payload.checkedAt)+60000).toISOString(),jobs:[],sources:payload.sources.map(s=>({name:s.name,ok:false,error:'Integration-check failure'}))});
                    if (localStorage.getItem('ahmad-live') !== cached || document.querySelectorAll('#job-list .job-row').length !== rows) throw new Error('All-source failure lost cached results');
                    const liveOnly = visibleJobs.find(j => !globalThis.CAREER_DATA.jobs.some(c => c.id === j.id)) || visibleJobs[0];
                    if (!liveOnly) throw new Error('No live lead available for the live integration persistence check');
                    Array.from(document.querySelectorAll('[data-save]')).find(b => b.dataset.save === liveOnly.id).click();
                    await new Promise(resolve => setTimeout(resolve, 150));
                    if (!JSON.parse(localStorage.getItem('ahmad-workspace'))?.saved.includes(liveOnly.id)) throw new Error('Save failed after awaiting mutation; locks=' + Boolean(navigator.locks) + '; notice=' + document.querySelector('#toast').textContent);
                    Array.from(document.querySelectorAll('[data-job]')).find(b => b.dataset.job === liveOnly.id).click();
                    const status = document.querySelector('[data-status]');
                    status.value = 'Submission uncertain';
                    status.dispatchEvent(new Event('change',{bubbles:true}));
                    await new Promise(resolve => setTimeout(resolve, 150));
                    document.querySelector('[data-action="close"]').click();
                    const workspace = JSON.parse(localStorage.getItem('ahmad-workspace'));
                    if (!workspace.saved.includes(liveOnly.id) || workspace.states[liveOnly.id] !== 'Submission uncertain' || workspace.savedDetails[liveOnly.id]?.id !== liveOnly.id) throw new Error('Atomic saved/tracked workspace missing data');
                    document.querySelector('#sidebar [data-view="applications"]').click();
                    if(document.querySelector('#view-name').textContent!=='Applications')throw new Error('Applications navigation failed');
                    const group=document.querySelector('.application-group');
                    if(!group||group.querySelector('h2').textContent!=='Submission uncertain'||group.querySelectorAll('.job-row').length!==1)throw new Error('Uncertain application group/count failed');
                    const metrics=Array.from(document.querySelectorAll('.metric-grid strong')).map(e=>e.textContent);
                    if(JSON.stringify(metrics)!==JSON.stringify(['1','1','0']))throw new Error('Uncertain submission was counted as confirmed success');
                    Array.from(group.querySelectorAll('[data-job]')).find(b=>b.dataset.job===liveOnly.id).click();
                    if(!document.querySelector('#job-dialog').textContent.includes('Submission is uncertain. Check the employer account or receipt before trying again.'))throw new Error('Exact-role uncertain advisory missing');
                    const actionNote=document.querySelector('#action-note'),actionDate=document.querySelector('#action-date');
                    actionNote.value='PRIVATE follow-up: review my project evidence';actionNote.dispatchEvent(new Event('input',{bubbles:true}));
                    actionDate.value=CareerCore.saudiDay(new Date());actionDate.dispatchEvent(new Event('input',{bubbles:true}));
                    document.querySelector('#next-action-form').requestSubmit();
                    await new Promise(resolve=>setTimeout(resolve,150));
                    const actionKey='ahmad-next-action-v1:'+encodeURIComponent(liveOnly.id);
                    let action=JSON.parse(localStorage.getItem(actionKey));
                    if(action?.actionNote!==actionNote.value||action.dueOn!==actionDate.value||action.completed)throw new Error('Real next-action form did not persist');
                    document.querySelector('#action-completion').click();await new Promise(resolve=>setTimeout(resolve,150));
                    if(!JSON.parse(localStorage.getItem(actionKey)).completed)throw new Error('Real next-action completion failed');
                    document.querySelector('#action-completion').click();await new Promise(resolve=>setTimeout(resolve,150));
                    if(JSON.parse(localStorage.getItem(actionKey)).completed)throw new Error('Real next-action reopen failed');
                    actionNote.value='UNSAVED private next action';actionNote.dispatchEvent(new Event('input',{bubbles:true}));actionNote.focus();
                    const actionStatus=document.querySelector('[data-status]');actionStatus.value='Submission uncertain';actionStatus.dispatchEvent(new Event('change',{bubbles:true}));
                    await new Promise(resolve=>setTimeout(resolve,150));
                    if(document.querySelector('#action-note')!==actionNote||actionNote.value!=='UNSAVED private next action'||document.activeElement!==actionNote)throw new Error('Status change lost next-action draft or focus');
                    if(draft(jobById(liveOnly.id)).includes('PRIVATE follow-up')||draft(jobById(liveOnly.id)).includes('UNSAVED private next action'))throw new Error('Private planning leaked into preparation draft');
                    actionNote.value=action.actionNote;actionNote.dispatchEvent(new Event('input',{bubbles:true}));
                    localStorage.setItem('__nativeActionExpected',JSON.stringify({id:liveOnly.id,value:JSON.parse(localStorage.getItem(actionKey))}));

                    document.querySelector('[data-action="close"]').click();
                    document.querySelector('#sidebar [data-view="live"]').click();
                    const hide=document.querySelector('#hide-tracked');hide.checked=true;hide.dispatchEvent(new Event('change',{bubbles:true}));
                    if(rowIDs().includes(liveOnly.id)||rowIDs().length!==rows-1)throw new Error('Hide tracked filter failed');
                    document.querySelector('[data-action="reset-discovery"]').click();
                    if(rowIDs().length!==rows||document.querySelector('#hide-tracked').checked)throw new Error('Tracked filter reset failed');
                    await window.receiveNativeJobs({checkedAt:new Date(Date.parse(payload.checkedAt)+120000).toISOString(),jobs:[],sources:payload.sources.map(s=>({...s,count:0}))});
                    document.querySelector('[data-view="saved"]').click();
                    if (!Array.from(document.querySelectorAll('[data-job]')).some(b=>b.dataset.job === liveOnly.id)) throw new Error('A refresh lost saved lead details');
                    document.querySelector('[data-view="plan"]').click();
                    document.querySelector('[data-action="export"]').click();
                    if (!document.querySelector('#job-dialog').open || !document.querySelector('#note-text').value.includes('SALEH CAREER FINDER')) throw new Error('Native notes fallback did not open');
                    if(!document.querySelector('#note-text').value.includes('PRIVATE follow-up: review my project evidence'))throw new Error('Tracking export omitted saved next action');
                    document.querySelector('[data-action="close"]').click();
                    document.querySelector('#sidebar [data-view="live"]').click();
                    const previous=JSON.parse(localStorage.getItem('ahmad-live'));
                    const synthetic={...visibleJobs[0],id:'native-runtime-comparison-added',title:'Junior Python Developer',location:'Riyadh, Saudi Arabia',posted:'',closes:null,rank:null,kind:'live',lastCheckedAt:undefined};
                    const nextStamp=new Date(Date.parse(previous.checkedAt)+60000).toISOString();
                    await window.receiveNativeJobs({checkedAt:nextStamp,jobs:[...previous.jobs,synthetic],sources:previous.sources});
                    const compared=JSON.parse(localStorage.getItem('ahmad-live')),comparison=compared.searchComparison;
                    if(comparison?.schema!==1||comparison.previousCheckedAt!==previous.checkedAt||comparison.checkedAt!==nextStamp||JSON.stringify(comparison.addedIds)!==JSON.stringify([synthetic.id]))throw new Error('Exact later comparison metadata was not persisted');
                    const summary=Array.from(document.querySelectorAll('section.card')).find(section=>section.querySelector('h2')?.textContent==='1 listing added to results');
                    if(!summary||!summary.textContent.includes(comparisonDate(previous.checkedAt))||!summary.textContent.includes(comparisonDate(nextStamp)))throw new Error('Comparison summary omitted true dates');
                    const added=document.querySelector('#added-only');added.checked=true;added.dispatchEvent(new Event('change',{bubbles:true}));
                    if(JSON.stringify(rowIDs())!==JSON.stringify([synthetic.id])||!document.querySelector('#job-list').textContent.includes('Added in this comparison'))throw new Error('Added-only filter or card label failed');
                    changeSelect('#company-filter',synthetic.company);
                    if(JSON.stringify(rowIDs())!==JSON.stringify([synthetic.id]))throw new Error('Added-only and employer filter did not compose');
                    changeSelect('#age-window',7);
                    if(rowIDs().length!==0)throw new Error('Added-only and date filter did not compose for undated role');
                    document.querySelector('[data-action="reset-discovery"]').click();
                    if(document.querySelector('#added-only').checked||!rowIDs().includes(synthetic.id))throw new Error('Comparison filter reset failed');
                    localStorage.setItem('__nativeComparisonExpected',JSON.stringify({comparison,jobId:synthetic.id,savedId:liveOnly.id}));
                    document.querySelector('#sidebar [data-view="backups"]').click();
                    if(!document.querySelector('#main').textContent.includes('Restore missing records'))throw new Error('Backup page missing');
                    await prepareBackup();
                    if(!backupExport||!document.querySelector('#backup-export-text').value.includes('saleh-career-workspace'))throw new Error('Backup export UI failed');
                    const backup=Backup.parse(backupExport);
                    const backupSynthetic={...backup.workspace.savedDetails[liveOnly.id],id:'backup-runtime-only'};
                    backup.workspace.saved.push(backupSynthetic.id);backup.workspace.savedDetails[backupSynthetic.id]=backupSynthetic;
                    backup.workspace.states[backupSynthetic.id]='Preparing';
                    const backupField=document.querySelector('#backup-input');backupField.value=JSON.stringify(backup);backupField.dispatchEvent(new Event('input',{bubbles:true}));
                    document.querySelector('[data-action="backup-preview"]').click();
                    if(!backupPreview||backupPreview.count.jobs!==1||saved.includes(backupSynthetic.id))throw new Error('Backup preview mutated or lost additions');
                    if(!await applyBackup()||!saved.includes(backupSynthetic.id))throw new Error('Backup restore failed');
                    if(!localStorage.getItem('ahmad-pre-restore-v1'))throw new Error('Backup recovery copy missing');
                    previewBackup();if(backupPreview?.changed)throw new Error('Backup repeated import was not idempotent');
                    document.querySelector('[data-action="backup-cancel"]').click();
                    if(backupPreview!==null)throw new Error('Backup cancel failed');
                    return {title:document.title, renderedLeads:rows, firstTitle, sources:payload.sources.length, searching:false, actualCallback:'unchanged', cachedResultsPreserved:true, atomicSavedTracking:'ok', applicationGroups:'ok', uncertainAdvisory:'ok', companyAgeFilters:'ok', filterReset:'ok', employerEvidence:'ok', savedLeadSurvivesRefresh:true, nativeNotes:'ok', backupRestore:'ok', nextActions:'ok', privateDraftFocus:'ok', localStorage:'ok'};
                    """, arguments: [:], in: nil, in: .page) { continuation.resume(with: $0) }
                    }
                    print("PASS: actual WKWebView file load, storage, native message, and callback: \(String(describing: result))")
                    let reloaded:Any = try await withCheckedThrowingContinuation { continuation in
                        var reloadObservation:NSKeyValueObservation?
                        reloadObservation=webView.observe(\.isLoading,options:[.new]) { reloadedView,_ in
                            guard !reloadedView.isLoading,reloadedView.url?.isFileURL==true else {return}
                            reloadObservation?.invalidate();reloadObservation=nil
                            reloadedView.callAsyncJavaScript("""
                            const expected=JSON.parse(localStorage.getItem('__nativeComparisonExpected'));
                            if(!expected)throw new Error('Reload expectation missing');
                            const persisted=JSON.parse(localStorage.getItem('ahmad-live'));
                            if(JSON.stringify(persisted.searchComparison)!==JSON.stringify(expected.comparison))throw new Error('Reload changed comparison history');
                            document.querySelector('#sidebar [data-view="live"]').click();
                            const section=Array.from(document.querySelectorAll('section.card')).find(s=>s.querySelector('h2')?.textContent==='1 listing added to results');
                            if(!section||!section.textContent.includes(comparisonDate(expected.comparison.previousCheckedAt))||!section.textContent.includes(comparisonDate(expected.comparison.checkedAt)))throw new Error('Reload lost dated summary');
                            const toggle=document.querySelector('#added-only');toggle.checked=true;toggle.dispatchEvent(new Event('change',{bubbles:true}));
                            const ids=Array.from(document.querySelectorAll('#job-list .job-title[data-job]')).map(b=>b.dataset.job);
                            if(JSON.stringify(ids)!==JSON.stringify([expected.jobId]))throw new Error('Reload lost exact added-only filter');
                            const workspace=JSON.parse(localStorage.getItem('ahmad-workspace'));
                            if(!workspace.saved.includes(expected.savedId)||workspace.states[expected.savedId]!=='Submission uncertain')throw new Error('Comparison changed saved or application history');
                            const actionExpected=JSON.parse(localStorage.getItem('__nativeActionExpected'));
                            if(JSON.stringify(JSON.parse(localStorage.getItem('ahmad-next-action-v1:'+encodeURIComponent(actionExpected.id))))!==JSON.stringify(actionExpected.value))throw new Error('Reload changed next-action record');
                            document.querySelector('#sidebar [data-view="applications"]').click();
                            if(!document.querySelector('.next-actions')?.textContent.includes(actionExpected.value.actionNote)||!document.querySelector('.next-actions')?.textContent.includes('Today'))throw new Error('Reload did not show saved next action in due list');
                            localStorage.removeItem('__nativeActionExpected');
                            localStorage.removeItem('__nativeComparisonExpected');
                            return {actualPageReload:'ok',datedSummary:'ok',addedOnlyFilter:'ok',savedHistory:'ok',nextActionReload:'ok',comparison:expected.comparison};
                            """,arguments:[:],in:nil,in:.page) {continuation.resume(with:$0)}
                        }
                        webView.reload()
                    }
                    print("PASS: actual WKWebView reload retains search comparison, dates and added-only filter: \(String(describing:reloaded))")
                    exit(0)
                } catch {
                    print("FAIL: \(error)")
                    exit(1)
                }
            }
        }
        view.loadFileURL(root.appendingPathComponent("index.html"), allowingReadAccessTo: root)
        DispatchQueue.main.asyncAfter(deadline: .now() + 100) { print("FAIL: WKWebView runtime timeout"); exit(1) }
        NSApplication.shared.run()
        withExtendedLifetime((view, coordinator, observation)) {}
    }
}
