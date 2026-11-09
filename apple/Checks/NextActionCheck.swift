import Foundation
import CryptoKit

@main struct NextActionCheck {
    @MainActor static func main() throws {
        let research=URL(fileURLWithPath:CommandLine.arguments[1])
        let root=FileManager.default.temporaryDirectory.appendingPathComponent("career-next-action-check-"+UUID().uuidString)
        defer {try? FileManager.default.removeItem(at:root)}
        let url=root.appendingPathComponent("workspace.json")
        let store=NativeCareerStore(researchURL:research,storageURL:url)
        var job=store.research.jobs[0];job.id="next-only/../../safe";job.company="Planning test employer"
        let stamp="2026-11-09T00:00:00.000Z"
        func record(_ date:String="",_ note:String="Review portfolio",_ done:Bool=false)->NextActionRecord {NextActionRecord(jobId:job.id,dueOn:date,actionNote:note,completed:done,updatedAt:stamp)}
        for date in ["", "2024-02-29", "1900-01-01", "2099-12-31"] {precondition(record(date).valid(for:job.id))}
        for date in ["2026-02-29", "2026-11-31", "2026-1-01", "2026-11-09T00:00:00Z", "2026-11-09\n"] {precondition(!record(date).valid(for:job.id),date)}
        precondition(!record("2026-11-09"," \n").valid(for:job.id))
        precondition(!record("","",true).valid(for:job.id))
        precondition(record(""," \n").valid(for:job.id) && !record(""," \n").meaningful)
        precondition(record("",String(repeating:"🌷",count:500)).valid(for:job.id))
        precondition(!record("",String(repeating:"🌷",count:501)).valid(for:job.id))
        precondition(!record("",String(repeating:"e\u{301}",count:251)).valid(for:job.id))
        var invalid=record();invalid.updatedAt="2026-11-09T00:00:00Z";precondition(!invalid.valid(for:job.id))
        invalid=record();invalid.schema=2;precondition(!invalid.valid(for:job.id))
        invalid=record();precondition(!invalid.valid(for:"other"))
        let before=CareerFeed.isoDate("2026-12-31T20:59:59Z")!,after=CareerFeed.isoDate("2026-12-31T21:00:00Z")!
        precondition(record("2026-12-31").group(at:before)=="Today")
        precondition(record("2026-12-31").group(at:after)=="Overdue")
        precondition(record("2027-01-01").group(at:after)=="Today")
        precondition(record("2027-01-08").group(at:after)=="Next 7 days")
        precondition(record("2027-01-09").group(at:after)=="Upcoming")
        precondition(record().group(at:after)=="No due date")
        precondition(record("2026-12-31","Done",true).group(at:after)=="Completed")
        let leap=CareerFeed.isoDate("2024-02-28T21:00:00Z")!
        precondition(record("2024-03-07").group(at:leap)=="Next 7 days")
        precondition(record("2024-03-08").group(at:leap)=="Upcoming")
        store.editNextAction(job,dueOn:"2099-12-31",actionNote:"PRIVATE saved action",completed:false)
        precondition(store.saveNextAction(job))
        precondition(store.workspace.snapshots[job.id] != nil && store.recordJobs.contains{$0.id==job.id})
        precondition(!store.hasApplicationRecord(job) && store.applicationWarnings(for:job).isEmpty)
        precondition(store.applicationGroups.contains{$0.status=="Not started" && $0.jobs.contains{$0.id==job.id}})
        precondition(!store.note(for:job).contains("PRIVATE") && store.exportText().contains("PRIVATE saved action"))
        let restored=NativeCareerStore(researchURL:research,storageURL:url)
        precondition(restored.nextActions[job.id]?.actionNote=="PRIVATE saved action")
        restored.beginNextAction(job)
        store.editNextAction(job,dueOn:"2026-11-09",actionNote:"PRIVATE unsaved action",completed:false)
        store.reloadNextActions();store.beginNextAction(job)
        precondition(store.nextActionDrafts[job.id]?.actionNote=="PRIVATE unsaved action")
        precondition(store.exportText().contains("PRIVATE saved action") && store.exportText().contains("UNSAVED next-action draft") && store.exportText().contains("PRIVATE unsaved action"))
        restored.editNextAction(job,dueOn:"",actionNote:"Other window",completed:true)
        precondition(restored.saveNextAction(job))
        precondition(!store.saveNextAction(job) && store.nextActionDrafts[job.id]?.dirty==true)
        store.beginNextAction(job,discardDraft:true)
        precondition(store.nextActionDrafts[job.id]?.actionNote=="Other window" && store.nextActionDrafts[job.id]?.dirty==false)
        store.editNextAction(job,dueOn:"2026-11-09",actionNote:"Keep visible",completed:false);precondition(store.saveNextAction(job))
        store.setStatus("Closed / not pursuing",for:job)
        precondition(store.nextActionGroups(at:after).first?.title=="Overdue" && store.nextActionGroups(at:after).first?.jobs.first?.id==job.id)
        store.editNextAction(job,dueOn:"",actionNote:"",completed:false);precondition(store.saveNextAction(job))
        let file=url.appendingPathExtension("next-action-v1").appendingPathComponent(SHA256.hash(data:Data(job.id.utf8)).map{String(format:"%02x",$0)}.joined()+".json")
        precondition(FileManager.default.fileExists(atPath:file.path) && store.nextActionGroups(at:after).isEmpty)
        let receipt=ApplicationRecord(jobId:job.id,appliedAt:"",receiptNote:"Legacy receipt",updatedAt:stamp)
        let receiptData=try JSONEncoder().encode(receipt)
        let decodedReceipt=try JSONDecoder().decode(ApplicationRecord.self,from:receiptData)
        precondition(decodedReceipt==receipt)
        // Next-action writes never alter the independent legacy receipt bytes.
        let receiptFile=url.appendingPathExtension("application-records-v1").appendingPathComponent(file.lastPathComponent)
        try FileManager.default.createDirectory(at:receiptFile.deletingLastPathComponent(),withIntermediateDirectories:true)
        try receiptData.write(to:receiptFile)
        store.editNextAction(job,dueOn:"",actionNote:"Independent plan",completed:false)
        precondition(store.saveNextAction(job))
        let retainedReceipt=try Data(contentsOf:receiptFile);precondition(retainedReceipt==receiptData)
        // Invalid stored bytes must survive begin/reload/save, and a private draft remains exportable.
        for bad in [Data("not json".utf8),Data("{}".utf8),try JSONSerialization.data(withJSONObject:["schema":1,"jobId":job.id,"dueOn":"","actionNote":"x","completed":0,"updatedAt":stamp])] {
            try bad.write(to:file,options:.atomic)
            store.beginNextAction(job,discardDraft:true)
            store.editNextAction(job,dueOn:"",actionNote:"Recovery draft",completed:false)
            store.reloadNextActions()
            precondition(!store.saveNextAction(job) && store.nextActionErrors[job.id] != nil)
            let preserved=try Data(contentsOf:file);precondition(preserved==bad)
            precondition(store.exportText().contains("Recovery draft"))
            let corruptReload=NativeCareerStore(researchURL:research,storageURL:url)
            precondition(corruptReload.nextActionErrors[job.id] != nil && corruptReload.recordJobs.contains{$0.id==job.id})
            precondition(corruptReload.exportText().contains("Next-action notice:"))
        }
        // Draft-only jobs absent from the workspace are still exported exactly once.
        var transient=job;transient.id="draft-only";transient.title="Draft only sentinel"
        store.editNextAction(transient,dueOn:"",actionNote:"Unsaved transient plan",completed:false)
        store.editApplicationRecord(transient,appliedAt:"",receiptNote:"Unsaved receipt")
        let exported=store.exportText()
        precondition(exported.contains("Unsaved transient plan") && exported.components(separatedBy:"APPLICATION PREPARATION — Draft only sentinel").count==2)
        // A failed directory write leaves draft and original saved metadata intact.
        let blockedURL=root.appendingPathComponent("blocked.json")
        let blocked=NativeCareerStore(researchURL:research,storageURL:blockedURL)
        try Data("keep".utf8).write(to:blockedURL.appendingPathExtension("next-action-v1"))
        blocked.editNextAction(job,dueOn:"",actionNote:"Do not lose",completed:false)
        precondition(!blocked.saveNextAction(job) && blocked.nextActionDrafts[job.id]?.dirty==true)
        precondition(blocked.exportText().contains("Do not lose"))
        print("Next-action checks passed: validation, Unicode bounds, Riyadh rollover/leap/year boundaries, isolated storage/reload, snapshot retention, record-only advisories, closed/completed visibility, conflict/corruption/write-failure draft protection, clearing and private export separation.")
    }
}
