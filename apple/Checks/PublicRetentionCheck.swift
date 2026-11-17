import Foundation

@main struct PublicRetentionCheck {
    @MainActor static func main() throws {
        let root=FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer {try? FileManager.default.removeItem(at:root)}
        let research=URL(fileURLWithPath:CommandLine.arguments[1]),fixtures=try JSONSerialization.jsonObject(with:Data(contentsOf:URL(fileURLWithPath:CommandLine.arguments[2]))) as! [[String:Any]]
        let source=CareerFeed.publicSources[4],data=fixtures[4]["data"] as! [String:Any],row=(data["jobs"] as! [[String:Any]])[0]
        let old=ISO8601DateFormatter().string(from:Date().addingTimeInterval(-120)),new=ISO8601DateFormatter().string(from:Date().addingTimeInterval(-60))
        let mutations:[[String:Any]]=[["isListed":false],["title":"Senior Software Engineer"],["address":["postalAddress":["addressCountry":"US"]]],["publishedAt":"2099-01-01T00:00:00Z"]]
        for (i,mutation) in mutations.enumerated() {
            let storage=root.appendingPathComponent("state\(i).json"),store=NativeCareerStore(researchURL:research,storageURL:storage)
            let first=try CareerFeed.parsePublicBoard(data,source:source)
            var unknown=first.jobs[0];unknown["id"]="leantech-22222222-2222-4222-8222-222222222222";unknown["url"]="https://jobs.ashbyhq.com/LeanTech/22222222-2222-4222-8222-222222222222"
            store.acceptLive(["checkedAt":old,"jobs":first.jobs+[unknown],"sources":[first.status]])
            let job=store.liveJobs.first{$0.id==first.jobs[0]["id"] as? String}!
            store.toggleSaved(job);store.setStatus("Applied",for:job)
            let changed=row.merging(mutation){_,new in new}
            let next=try CareerFeed.parsePublicBoard(["jobs":[changed,[:]]],source:source)
            precondition(next.status["excludedIds"] as? [String]==[job.id])
            store.acceptLive(["checkedAt":new,"jobs":next.jobs,"sources":[next.status]])
            precondition(store.liveJobs.map(\.id)==[unknown["id"] as! String])
            precondition(store.liveJobs[0].lastCheckedAt==old && store.isUnrefreshed(store.liveJobs[0]))
            precondition(store.isSaved(job) && store.status(for:job)=="Applied" && store.trackedJobs.contains{$0.id==job.id})
            let reload=NativeCareerStore(researchURL:research,storageURL:storage)
            precondition(reload.liveJobs.map(\.id)==store.liveJobs.map(\.id) && reload.isSaved(job) && reload.status(for:job)=="Applied")
            let mixed=try CareerFeed.parsePublicBoard(["jobs":[changed,row,[:]]],source:source)
            precondition(mixed.jobs.count==1 && (mixed.status["excludedIds"] as? [String])?.isEmpty==true)
        }
        let rows=(0..<40).map{index -> [String:Any] in var changed=row;changed["id"]=String(format:"00000000-0000-4000-8000-%012d",index);changed["isListed"]=false;return changed}
        let result=try CareerFeed.parsePublicBoard(["jobs":rows],source:source)
        let store=NativeCareerStore(researchURL:research,storageURL:root.appendingPathComponent("many.json"))
        store.acceptLive(["checkedAt":new,"jobs":result.jobs,"sources":[result.status]])
        precondition(store.workspace.live?.sources.first?.excludedIds?.count==40)
        var tabuk=row;tabuk["location"]="Tabuk"
        let geography=try CareerFeed.parsePublicBoard(["jobs":[tabuk]],source:source)
        store.acceptLive(["checkedAt":ISO8601DateFormatter().string(from:Date()),"jobs":geography.jobs,"sources":[geography.status]])
        precondition(store.liveJobs.count==1 && store.liveJobs[0].location=="Tabuk, Saudi Arabia")
        var anyCity=NativeProfile();anyCity.preferredCity="";precondition(anyCity.includesInDiscovery(store.liveJobs[0]))
        anyCity.preferredCity="riyadh";precondition(!anyCity.includesInDiscovery(store.liveJobs[0]))
        print("Public parser→store checks passed: unlisted/senior/foreign/future exclusions override partial failure, included duplicate wins, unknown evidence remains dated, saved/status history survives reload, and 40 exact exclusions are accepted.")
    }
}
