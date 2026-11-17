import Foundation

@main struct SearchChangesCheck {
    @MainActor static func main() throws {
        let root=FileManager.default.temporaryDirectory.appendingPathComponent("career-search-changes-"+UUID().uuidString)
        defer {try? FileManager.default.removeItem(at:root)}
        try FileManager.default.createDirectory(at:root,withIntermediateDirectories:true)
        let research=URL(fileURLWithPath:CommandLine.arguments[1]),storage=root.appendingPathComponent("workspace.json")
        let store=NativeCareerStore(researchURL:research,storageURL:storage)
        let now=CareerFeed.isoDate("2026-11-09T12:00:00Z")!
        func stamp(_ minute:Int)->String {String(format:"2026-11-09T10:%02d:00Z",minute)}
        func job(_ id:String,_ company:String="Mozn")->CareerJob {
            var result=store.research.jobs[0]
            result.id=id;result.title="Junior Software Engineer";result.company=company;result.location="Riyadh, Saudi Arabia"
            result.url="https://apply.workable.com/mozn-ai/j/TEST123/";result.applyUrl=nil;result.sourceUrl=nil
            result.posted="2026-11-01";result.closes=nil;result.kind="live";result.rank=nil;result.researchCheckedAt=nil
            return result
        }
        func payload(_ minute:Int,_ jobs:[CareerJob],_ sources:[[String:Any]] = [["name":"Mozn","ok":true,"count":1]])throws->[String:Any] {
            ["checkedAt":stamp(minute),"jobs":try jobs.map{try JSONSerialization.jsonObject(with:JSONEncoder().encode($0))},"sources":sources]
        }
        let a=job("exact-A"),b=job("exact-a"),c=job("exact-A-extra")
        precondition(store.searchComparison==nil && store.searchChangeSummary.contains("baseline"))
        store.acceptLive(try payload(0,[a,a]),now:now)
        precondition(store.liveJobs.count==1 && store.searchComparison?.previousCheckedAt==nil && store.searchComparison?.addedIds==[])
        precondition(!store.isAddedToLatestResults(a))
        let baselineJSON=try JSONSerialization.jsonObject(with:JSONEncoder().encode(store.searchComparison!)) as! [String:Any]
        precondition(baselineJSON["previousCheckedAt"] is NSNull && baselineJSON["schema"] as? Int==1)
        var republished=a;republished.posted="2026-11-08";republished.postedKind="last-published"
        store.acceptLive(try payload(1,[republished,b,b]),now:now)
        precondition(store.searchComparison?.addedIds==[b.id] && store.searchComparison?.previousCheckedAt==stamp(0))
        precondition(store.isAddedToLatestResults(b) && !store.isAddedToLatestResults(a))
        store.toggleSaved(a);store.setStatus("Applied",for:a)
        let profile=store.workspace.profile,statuses=store.workspace.statuses
        let successful=try Data(contentsOf:storage),comparison=store.searchComparison
        // Neither duplicate timestamps, older responses nor total failures replace successful evidence.
        for response in [try payload(0,[c]),try payload(1,[c]),try payload(2,[c],[["name":"Mozn","ok":false,"count":0,"error":"Offline"]])] {
            store.acceptLive(response,now:now)
            let after=try Data(contentsOf:storage)
            precondition(store.searchComparison==comparison && store.workspace.live?.checkedAt==stamp(1) && after==successful && (store.searchError != nil || store.searchNotice != nil))
        }
        store.acceptLive(try payload(1,[c]),now:now)
        precondition(store.searchError==nil && store.searchNotice != nil)
        store.acceptLive(try payload(1,[c],[["name":"Mozn","ok":false,"count":0,"error":"Offline"]]),now:now)
        precondition(store.searchError != nil && store.searchNotice==nil)
        store.acceptLive(try payload(2,[c],[["name":"Mozn","ok":true,"count":1,"limited":true,"excludedIds":[a.id]]]),now:now)
        precondition(Set(store.liveJobs.map(\.id))==Set([b.id,c.id]))
        precondition(store.liveJobs.first{$0.id==b.id}?.lastCheckedAt==stamp(1) && store.isUnrefreshed(b))
        precondition(store.searchComparison?.addedIds==[c.id] && store.searchError?.contains("incomplete")==true)
        precondition(store.isSaved(a) && store.status(for:a)=="Applied" && store.current(a).lastCheckedAt==stamp(1))
        let reload=NativeCareerStore(researchURL:research,storageURL:storage)
        precondition(reload.searchComparison==store.searchComparison && reload.isUnrefreshed(b) && reload.storageError==nil)
        // Returning roles are additions to this list, never first-ever discoveries.
        store.acceptLive(try payload(3,[a,b,c]),now:now)
        precondition(store.searchComparison?.addedIds==[a.id])
        store.acceptLive(try payload(4,[]),now:now)
        precondition(store.liveJobs.isEmpty && store.searchComparison?.addedIds==[] && store.searchComparison?.previousCheckedAt==stamp(3))
        store.acceptLive(try payload(5,[a]),now:now)
        precondition(store.searchComparison?.addedIds==[a.id] && store.workspace.profile==profile && store.workspace.statuses==statuses)
        // Failed, partial, and bounded boards retain original observation dates; exact exclusions win.
        let d=job("other-source","Lucidya")
        store.acceptLive(try payload(6,[a,d],[["name":"Mozn","ok":true,"count":1],["name":"Lucidya","ok":true,"count":1]]),now:now)
        store.acceptLive(try payload(7,[c],[["name":"Mozn","ok":true,"count":1,"detailErrors":1],["name":"Lucidya","ok":false,"count":0]]),now:now)
        precondition(store.liveJobs.count==3 && store.searchComparison?.addedIds==[c.id])
        precondition(store.liveJobs.filter{$0.id != c.id}.allSatisfy{$0.lastCheckedAt==stamp(6) && store.isUnrefreshed($0)})
        // Non-Boolean limited flags are malformed, not truthy coverage declarations.
        let beforeMalformed=try Data(contentsOf:storage)
        for limited:Any in ["true",1,[],[:]] {
            store.acceptLive(try payload(8,[b],[["name":"Mozn","ok":true,"count":1,"limited":limited]]),now:now)
            let after=try Data(contentsOf:storage)
            precondition(after==beforeMalformed && store.searchError != nil)
        }
        // Capacity overflow must not silently discard retained evidence.
        let many=(0..<1000).map{job("capacity-\($0)")}
        store.acceptLive(try payload(8,many,[["name":"Mozn","ok":true,"count":1000,"limited":true],["name":"Lucidya","ok":false,"count":0]]),now:now)
        let afterOverflow=try Data(contentsOf:storage)
        precondition(afterOverflow==beforeMalformed && store.searchError?.contains("capacity")==true)
        // Optional comparison corruption must never block otherwise valid workspace data.
        let original=try JSONSerialization.jsonObject(with:beforeMalformed) as! [String:Any]
        let good:[String:Any]=["schema":1,"previousCheckedAt":stamp(6),"checkedAt":stamp(7),"addedIds":[c.id]]
        let mutations:[[String:Any]]=[["schema":2],["schema":true],["previousCheckedAt":stamp(7)],["previousCheckedAt":"not a date"],["checkedAt":stamp(8)],["addedIds":["unknown"]],["addedIds":[c.id,c.id]],["addedIds":[1]],["previousCheckedAt":NSNull()]]
        var invalid:[Any]=["broken",true,[],NSNull()]
        invalid += mutations.map{good.merging($0){_,new in new}}
        var missing=good;missing.removeValue(forKey:"previousCheckedAt");invalid.append(missing)
        for (index,metadata) in invalid.enumerated() {
            var document=original,live=document["live"] as! [String:Any];live["searchComparison"]=metadata;document["live"]=live
            let url=root.appendingPathComponent("bad-\(index).json")
            try JSONSerialization.data(withJSONObject:document).write(to:url)
            let restored=NativeCareerStore(researchURL:research,storageURL:url)
            precondition(restored.searchComparison==nil && restored.storageError==nil && restored.isSaved(a) && restored.status(for:a)=="Applied")
            restored.setChecklist("comparison-check",done:true)
            precondition(restored.storageError==nil && restored.workspace.completed.contains("comparison-check"))
        }
        var legacy=original,legacyLive=legacy["live"] as! [String:Any];legacyLive.removeValue(forKey:"searchComparison");legacy["live"]=legacyLive
        let legacyURL=root.appendingPathComponent("legacy.json")
        try JSONSerialization.data(withJSONObject:legacy).write(to:legacyURL)
        let legacyStore=NativeCareerStore(researchURL:research,storageURL:legacyURL)
        precondition(legacyStore.searchComparison==nil && legacyStore.storageError==nil)
        legacyStore.acceptLive(try payload(8,[a,b]),now:now)
        precondition(legacyStore.searchComparison?.previousCheckedAt==stamp(7) && legacyStore.searchComparison?.addedIds==[b.id])
        // Incoming comparison claims are untrusted and recomputed from local evidence.
        var incoming=try payload(9,[a,b]);incoming["searchComparison"]=["schema":1,"previousCheckedAt":stamp(0),"checkedAt":stamp(9),"addedIds":[a.id,b.id]]
        legacyStore.acceptLive(incoming,now:now)
        precondition(legacyStore.searchComparison?.addedIds==[] && legacyStore.searchComparison?.previousCheckedAt==stamp(8))
        print("Native search-change checks passed: baseline, exact IDs/duplicates, republishing/returning roles, empty success, stale/equal/all-source failure, bounded and partial retention, exact exclusions/history, capacity, legacy reload, malformed optional metadata isolation, and untrusted comparison claims.")
    }
}
