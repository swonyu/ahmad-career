import SwiftUI

@main
struct AhmadCareerApp: App {
    #if os(iOS)
    @StateObject private var nativeStore = NativeCareerStore()
    #endif
    var body: some Scene {
        WindowGroup("Ahmad Career") {
            #if os(iOS)
            NativeCareerRoot().environmentObject(nativeStore)
            #else
            CareerWorkspace()
            #endif
        }
        #if os(macOS)
        .defaultSize(width: 1240, height: 850)
        #endif
    }
}

private struct CareerWorkspace: View {
    @State private var reloadID = 0
    @State private var confirmReload = false

    var body: some View {
        NavigationStack {
            CareerWebView(reloadID: reloadID)
                .navigationTitle("Ahmad Career")
                #if os(iOS)
                .navigationBarTitleDisplayMode(.inline)
                #endif
                .toolbar {
                    ToolbarItem(placement: .automatic) {
                        Button {
                            confirmReload = true
                        } label: {
                            Label("Reload workspace", systemImage: "arrow.clockwise")
                        }
                        .help("Reload the bundled workspace after saving or exporting unsaved work.")
                    }
                }
        }
        .confirmationDialog("Reload the workspace?",isPresented:$confirmReload,titleVisibility:.visible) {
            Button("Discard unsaved work and reload",role:.destructive) {reloadID += 1}
            Button("Keep working",role:.cancel) {}
        } message: {
            Text("Unsaved drafts and changes that failed to save will be lost. Save or export your notes first. Saved records stay on this device.")
        }
        #if os(macOS)
        .frame(minWidth: 760, minHeight: 560)
        #endif
    }
}
