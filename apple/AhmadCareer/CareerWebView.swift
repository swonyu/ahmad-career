import SwiftUI
import WebKit
import UniformTypeIdentifiers

#if os(macOS)
typealias CareerWebViewRepresentable = NSViewRepresentable
#else
typealias CareerWebViewRepresentable = UIViewRepresentable
#endif

struct CareerWebView: CareerWebViewRepresentable {
    let reloadID: Int

    func makeCoordinator() -> Coordinator { Coordinator(reloadID: reloadID) }

    #if os(macOS)
    func makeNSView(context: Context) -> WKWebView { makeWebView(context: context) }
    func updateNSView(_ webView: WKWebView, context: Context) { update(webView, context: context) }
    static func dismantleNSView(_ webView: WKWebView, coordinator: Coordinator) { coordinator.stop(webView) }
    #else
    func makeUIView(context: Context) -> WKWebView { makeWebView(context: context) }
    func updateUIView(_ webView: WKWebView, context: Context) { update(webView, context: context) }
    static func dismantleUIView(_ webView: WKWebView, coordinator: Coordinator) { coordinator.stop(webView) }
    #endif

    private func makeWebView(context: Context) -> WKWebView {
        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = .default()
        configuration.userContentController.add(context.coordinator, name: "careerSearch")
        configuration.userContentController.add(context.coordinator, name: "careerBackup")
        let webView = WKWebView(frame: .zero, configuration: configuration)
        webView.navigationDelegate = context.coordinator
        webView.uiDelegate = context.coordinator
        webView.allowsBackForwardNavigationGestures = false
        context.coordinator.webView = webView
        if let index = Bundle.main.url(forResource: "index", withExtension: "html", subdirectory: "Web") {
            let root = index.deletingLastPathComponent()
            context.coordinator.webRoot = root
            webView.loadFileURL(index, allowingReadAccessTo: root)
        } else {
            webView.navigationDelegate = nil
            webView.loadHTMLString("<html><body style='font:18px system-ui;padding:40px'><h1>Workspace missing</h1><p>Add the Web folder to the app resources and rebuild.</p></body></html>", baseURL: nil)
        }
        return webView
    }

    private func update(_ webView: WKWebView, context: Context) {
        guard context.coordinator.reloadID != reloadID else { return }
        context.coordinator.reloadID = reloadID
        webView.reload()
    }

    @MainActor
    final class Coordinator: NSObject, WKNavigationDelegate, WKUIDelegate, WKScriptMessageHandler {
        weak var webView: WKWebView?
        var webRoot: URL?
        var reloadID: Int
        private var refreshTask: Task<Void, Never>?
        private let refreshProvider: @MainActor () async -> [String:Any]
        #if os(macOS)
        private var confirmation: (alert:NSAlert, reply:(Bool)->Void)?
        private var backupPanel:NSSavePanel?
        private var backupOpen:(panel:NSOpenPanel,reply:([URL]?)->Void)?
        private func finishConfirmation(_ accepted:Bool) {
            let pending=confirmation;confirmation=nil
            if let alert=pending?.alert,let parent=alert.window.sheetParent {parent.endSheet(alert.window)}
            pending?.reply(accepted)
        }
        func webView(_ webView:WKWebView,runOpenPanelWith parameters:WKOpenPanelParameters,initiatedByFrame frame:WKFrameInfo,completionHandler:@escaping([URL]?)->Void) {
            guard frame.isMainFrame,let root=webRoot,let url=frame.request.url,
                  CareerPolicy.navigation(url,webRoot:root,userInitiated:false) == .bundled,
                  let window=webView.window,backupOpen==nil else {completionHandler(nil);return}
            let panel=NSOpenPanel();panel.allowedContentTypes=[.json];panel.allowsMultipleSelection=false
            panel.canChooseDirectories=false;panel.canChooseFiles=true;panel.message="Choose a private workspace backup. You will review it before restoring anything."
            backupOpen=(panel,completionHandler)
            panel.beginSheetModal(for:window) { [weak self] response in
                let pending=self?.backupOpen;self?.backupOpen=nil
                pending?.reply(response == .OK ? pending?.panel.urls : nil)
            }
        }
        func webView(_ webView:WKWebView,runJavaScriptConfirmPanelWithMessage message:String,initiatedByFrame frame:WKFrameInfo,completionHandler:@escaping(Bool)->Void) {
            guard frame.isMainFrame,let root=webRoot,let url=frame.request.url,
                  CareerPolicy.navigation(url,webRoot:root,userInitiated:false) == .bundled,
                  let window=webView.window,confirmation==nil else {completionHandler(false);return}
            let alert=NSAlert();alert.messageText="Confirm workspace action";alert.informativeText=message
            alert.addButton(withTitle:"Continue");alert.addButton(withTitle:"Cancel")
            confirmation=(alert,completionHandler)
            alert.beginSheetModal(for:window) { [weak self] response in self?.finishConfirmation(response == .alertFirstButtonReturn) }
        }
        #endif

        init(reloadID: Int, refreshProvider: @escaping @MainActor () async -> [String:Any] = { await CareerFeed.refresh() }) { self.reloadID = reloadID; self.refreshProvider = refreshProvider }

        func stop(_ webView: WKWebView) {
            refreshTask?.cancel()
            #if os(macOS)
            finishConfirmation(false)
            backupPanel?.cancel(nil); backupPanel=nil
            let pending=backupOpen;backupOpen=nil;pending?.panel.cancel(nil);pending?.reply(nil)
            #endif
            webView.configuration.userContentController.removeScriptMessageHandler(forName: "careerSearch")
            webView.configuration.userContentController.removeScriptMessageHandler(forName: "careerBackup")
            webView.stopLoading()
        }

        func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
            guard ["careerSearch","careerBackup"].contains(message.name), message.frameInfo.isMainFrame,
                  let root = webRoot, let url = message.frameInfo.request.url,
                  CareerPolicy.navigation(url, webRoot: root, userInitiated: false) == .bundled else { return }
            if message.name == "careerBackup" { saveBackup(message.body); return }
            guard CareerPolicy.acceptsRefresh(message.body) else {return}
            guard refreshTask == nil else { return }
            refreshTask = Task { [weak self] in
                guard let self else {return}
                let payload = await self.refreshProvider()
                guard !Task.isCancelled else { return }
                self.deliver(payload)
                self.refreshTask = nil
            }
        }

        private func backupReply(_ payload:[String:Any]) {
            webView?.callAsyncJavaScript("if (typeof window.receiveBackupSave === 'function') window.receiveBackupSave(payload);", arguments:["payload":payload],in:nil,in:.page,completionHandler:nil)
        }
        private func saveBackup(_ body:Any) {
            guard let value=body as? [String:Any],Set(value.keys)==Set(["action","text"]),value["action"] as? String=="save",let text=value["text"] as? String,text.utf8.count<=4*1024*1024,
                  let data=text.data(using:.utf8),let envelope=(try? JSONSerialization.jsonObject(with:data)) as? [String:Any],envelope["format"] as? String=="saleh-career-workspace",envelope["schema"] as? Int==1 else {backupReply(["ok":false]);return}
            #if os(macOS)
            guard let window=webView?.window,backupPanel==nil else {backupReply(["ok":false]);return}
            let panel=NSSavePanel();panel.allowedContentTypes=[.json];panel.nameFieldStringValue="Saleh-Career-Finder-backup.json"
            panel.message="This backup includes private saved records. Choose a location you trust."
            backupPanel=panel
            panel.beginSheetModal(for:window) { [weak self] response in
                guard let self else {return};self.backupPanel=nil
                guard response == .OK,let url=panel.url else {self.backupReply(["cancelled":true]);return}
                do {try data.write(to:url,options:.atomic);self.backupReply(["ok":true])}
                catch {self.backupReply(["ok":false])}
            }
            #else
            backupReply(["ok":false])
            #endif
        }

        private func deliver(_ payload: [String: Any]) {
            // Structured arguments keep source text and URLs out of executable JavaScript.
            webView?.callAsyncJavaScript(
                "if (typeof window.receiveNativeJobs === 'function') { window.receiveNativeJobs(payload); }",
                arguments: ["payload": payload], in: nil, in: .page,
                completionHandler: nil
            )
        }

        func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction,
                     decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
            guard let root = webRoot, let url = navigationAction.request.url else {
                decisionHandler(.cancel)
                return
            }
            switch CareerPolicy.navigation(url, webRoot: root, userInitiated: navigationAction.navigationType == .linkActivated) {
            case .bundled:
                decisionHandler(.allow)
            case .external:
                openExternally(url)
                decisionHandler(.cancel)
            case .blocked:
                decisionHandler(.cancel)
            }
        }

        func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration,
                     for navigationAction: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
            // A target="_blank" link uses the same checked navigation policy.
            if navigationAction.targetFrame == nil, let root = webRoot, let url = navigationAction.request.url,
               CareerPolicy.navigation(url, webRoot: root, userInitiated: navigationAction.navigationType == .linkActivated) == .external {
                openExternally(url)
            }
            return nil
        }

        private func openExternally(_ url: URL) {
            #if os(macOS)
            NSWorkspace.shared.open(url)
            #else
            UIApplication.shared.open(url)
            #endif
        }
    }
}
