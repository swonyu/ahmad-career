import Foundation

@main struct NativeLiveCheck {
    @MainActor static func main() async throws {
        let folder=FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer {try? FileManager.default.removeItem(at:folder)}
        let store=NativeCareerStore(researchURL:URL(fileURLWithPath:CommandLine.arguments[1]),storageURL:folder.appendingPathComponent("state.json"))
        let start=Date()
        await store.refresh()
        guard let result=store.workspace.live else {fatalError(store.searchError ?? "No live response")}
        precondition(!store.isSearching && store.storageError==nil)
        precondition(result.sources.count==CareerFeed.sources.count && result.sources.contains(where:{$0.ok}))
        precondition(result.jobs.allSatisfy{$0.isSaudi && !$0.isExpired && $0.applicationURL != nil})
        let restored=NativeCareerStore(researchURL:URL(fileURLWithPath:CommandLine.arguments[1]),storageURL:folder.appendingPathComponent("state.json"))
        precondition(restored.liveJobs.count==result.jobs.count)
        print("Native live flow passed: \(result.jobs.count) valid Saudi leads, \(result.sources.filter{$0.ok}.count)/\(CareerFeed.sources.count) sources, \(Int(Date().timeIntervalSince(start))) seconds; loading finished and cache reloaded.")
        if let notice=store.searchError {print("Coverage notice: \(notice)")}
    }
}
