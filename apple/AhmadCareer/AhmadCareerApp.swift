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
                            reloadID += 1
                        } label: {
                            Label("Reload workspace", systemImage: "arrow.clockwise")
                        }
                        .help("Reload the bundled workspace. Saved jobs stay on this device.")
                    }
                }
        }
        #if os(macOS)
        .frame(minWidth: 760, minHeight: 560)
        #endif
    }
}
