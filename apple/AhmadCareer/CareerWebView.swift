import SwiftUI
import WebKit

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
        private func finishConfirmation(_ accepted:Bool) {
            let pending=confirmation;confirmation=nil
            if let alert=pending?.alert,let parent=alert.window.sheetParent {parent.endSheet(alert.window)}
            pending?.reply(accepted)
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
            #endif
            webView.configuration.userContentController.removeScriptMessageHandler(forName: "careerSearch")
            webView.stopLoading()
        }

        func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
            guard message.name == "careerSearch", message.frameInfo.isMainFrame,
                  let root = webRoot, let url = message.frameInfo.request.url,
                  CareerPolicy.navigation(url, webRoot: root, userInitiated: false) == .bundled,
                  CareerPolicy.acceptsRefresh(message.body) else { return }
            guard refreshTask == nil else { return }
            refreshTask = Task { [weak self] in
                guard let self else {return}
                let payload = await self.refreshProvider()
                guard !Task.isCancelled else { return }
                self.deliver(payload)
                self.refreshTask = nil
            }
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
