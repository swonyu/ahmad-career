import AppKit
import WebKit

@main
enum WebRuntimeCheck {
    @MainActor static func main() {
        NSApplication.shared.setActivationPolicy(.prohibited)
        let root = URL(fileURLWithPath: CommandLine.arguments[1], isDirectory: true)
        let coordinator = CareerWebView.Coordinator(reloadID: 0)
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
                    if (document.querySelectorAll('#job-list .job-row').length !== 10) throw new Error('Bundled shortlist did not render');
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
                    if (!payload || payload.sources.length !== 7) throw new Error('Real app callback did not persist native payload');
                    const rows = document.querySelectorAll('#job-list .job-row').length;
                    if (!rows || rows !== payload.jobs.length) throw new Error('New lead rows did not render');
                    if (document.querySelectorAll('.source-row').length !== 7) throw new Error('Source coverage did not render');
                    if (document.querySelector('#view-name').textContent !== 'Live search') throw new Error('Wrong current view');
                    const firstTitle = document.querySelector('#job-list .job-title').textContent;
                    const cached = localStorage.getItem('ahmad-live');
                    window.receiveNativeJobs({checkedAt:new Date().toISOString(),jobs:[],sources:payload.sources.map(s=>({name:s.name,ok:false,error:'Integration-check failure'}))});
                    if (localStorage.getItem('ahmad-live') !== cached || document.querySelectorAll('#job-list .job-row').length !== rows) throw new Error('All-source failure lost cached results');
                    const liveOnly = payload.jobs.find(j => !globalThis.CAREER_DATA.jobs.some(c => c.id === j.id));
                    if (!liveOnly) throw new Error('No independent live lead available for persistence check');
                    Array.from(document.querySelectorAll('[data-save]')).find(b => b.dataset.save === liveOnly.id).click();
                    await new Promise(resolve => setTimeout(resolve, 150));
                    if (!JSON.parse(localStorage.getItem('ahmad-workspace'))?.saved.includes(liveOnly.id)) throw new Error('Save failed after awaiting mutation; locks=' + Boolean(navigator.locks) + '; notice=' + document.querySelector('#toast').textContent);
                    Array.from(document.querySelectorAll('[data-job]')).find(b => b.dataset.job === liveOnly.id).click();
                    const status = document.querySelector('[data-status]');
                    status.value = 'Preparing';
                    status.dispatchEvent(new Event('change',{bubbles:true}));
                    await new Promise(resolve => setTimeout(resolve, 150));
                    document.querySelector('[data-action="close"]').click();
                    const workspace = JSON.parse(localStorage.getItem('ahmad-workspace'));
                    if (!workspace.saved.includes(liveOnly.id) || workspace.states[liveOnly.id] !== 'Preparing' || workspace.savedDetails[liveOnly.id]?.id !== liveOnly.id) throw new Error('Atomic saved/tracked workspace missing data');
                    window.receiveNativeJobs({checkedAt:new Date().toISOString(),jobs:[],sources:payload.sources.map(s=>({...s,count:0}))});
                    document.querySelector('[data-view="saved"]').click();
                    if (!Array.from(document.querySelectorAll('[data-job]')).some(b=>b.dataset.job === liveOnly.id)) throw new Error('A refresh lost saved lead details');
                    document.querySelector('[data-view="plan"]').click();
                    document.querySelector('[data-action="export"]').click();
                    if (!document.querySelector('#job-dialog').open || !document.querySelector('#note-text').value.includes('AHMAD CAREER')) throw new Error('Native notes fallback did not open');
                    return {title:document.title, renderedLeads:rows, firstTitle, sources:payload.sources.length, searching:false, actualCallback:'unchanged', cachedResultsPreserved:true, atomicSavedTracking:'ok', savedLeadSurvivesRefresh:true, nativeNotes:'ok', localStorage:'ok'};
                    """, arguments: [:], in: nil, in: .page) { continuation.resume(with: $0) }
                    }
                    print("PASS: actual WKWebView file load, storage, native message, and callback: \(String(describing: result))")
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
