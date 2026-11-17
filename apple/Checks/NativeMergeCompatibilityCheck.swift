import Foundation
import CryptoKit

/// Regression coverage for actual storage formats that diverged across published branches.
/// This never connects an account, contacts an employer or writes outside disposable paths.
@main struct NativeMergeCompatibilityCheck {
    @MainActor static func main() throws {
        let fm=FileManager.default
        let root=fm.temporaryDirectory.appendingPathComponent("career-merge-compatibility-"+UUID().uuidString)
        defer {try? fm.removeItem(at:root)}
        try fm.createDirectory(at:root,withIntermediateDirectories:true)
        let research=URL(fileURLWithPath:CommandLine.arguments[1])
        func store(_ url:URL)->NativeCareerStore {NativeCareerStore(researchURL:research,storageURL:url)}
        let seed=store(root.appendingPathComponent("seed.json"))
        precondition(seed.workspace.profile==NativeProfile.fresh())
        var job=seed.research.jobs[0];job.id="import-only-preservation"
        job.postedKind="published";job.experienceLevel="Graduate";job.employmentType="Full-time"
        job.requirementNotes=["Equivalent project experience is accepted."]
        let stamp=ApplicationRecord.timestamp(Date().addingTimeInterval(-60))
        let receipt=ApplicationRecord(jobId:job.id,appliedAt:"",receiptNote:"Legacy imported-only receipt",updatedAt:stamp)
        let action=NextActionRecord(jobId:job.id,dueOn:"2099-12-31",actionNote:"Legacy imported-only next action",completed:false,updatedAt:stamp)
        var original=NativeWorkspace()
        original.snapshots[job.id]=job
        original.statuses[job.id]="Submission uncertain"
        original.importedApplicationRecords=[job.id:receipt]
        original.importedNextActions=[job.id:action]
        let url=root.appendingPathComponent("imported.json")
        let originalData=try JSONEncoder().encode(original)
        try originalData.write(to:url)
        let editor=store(url)
        precondition(editor.applicationRecords[job.id]==receipt && editor.nextActions[job.id]==action)
        precondition(editor.recordJobs.contains{$0.id==job.id})
        editor.setChecklist("cv",done:true)
        let reopened=store(url)
        precondition(reopened.storageError==nil)
        precondition(reopened.workspace.importedApplicationRecords?[job.id]==receipt)
        precondition(reopened.workspace.importedNextActions?[job.id]==action)
        precondition(reopened.applicationRecords[job.id]==receipt && reopened.nextActions[job.id]==action)
        precondition(reopened.current(job).requirementNotes==job.requirementNotes)
        precondition(reopened.current(job).employmentType==job.employmentType)
        precondition(reopened.status(for:job)=="Submission uncertain")
        precondition(reopened.exportText().contains(receipt.receiptNote) && reopened.exportText().contains(action.actionNote))

        // v2 preferences roundtrip in schema2. Restore keeps the receiving profile and account-independent scope.
        var profile=NativeProfile.fresh();profile.targetCountry="GB";profile.targetCity="London";profile.planningCurrency="GBP";profile.displayTimeZone="Europe/London"
        reopened.updateProfile(profile)
        let exported=try reopened.privateBackupData()
        let envelope=try NativeCareerStore.decodeBackup(exported)
        precondition(envelope.schema==2 && envelope.profile["targetCountry"]=="GB" && envelope.profile["planningCurrency"]=="GBP")
        let target=store(root.appendingPathComponent("target.json"))
        try target.applyBackup(target.previewBackup(exported))
        precondition(target.workspace.profile==NativeProfile.fresh())
        precondition(target.applicationRecords[job.id]==receipt && target.nextActions[job.id]==action)
        precondition(target.workspace.completed.isEmpty)
        let roundtrip=try NativeCareerStore.decodeBackup(target.privateBackupData())
        precondition(roundtrip.applicationRecords.contains(receipt) && roundtrip.nextActions.contains(action))

        // Empty sidecars are deliberate tombstones and must never resurrect an imported value.
        target.editApplicationRecord(job,appliedAt:"",receiptNote:"")
        target.editNextAction(job,dueOn:"",actionNote:"",completed:false)
        precondition(target.saveApplicationRecord(job) && target.saveNextAction(job))
        let cleared=store(root.appendingPathComponent("target.json"))
        precondition(cleared.applicationRecords[job.id]?.meaningful==false && cleared.nextActions[job.id]?.meaningful==false)
        let repeated=try cleared.previewBackup(exported)
        try cleared.applyBackup(repeated)
        let clearedAgain=store(root.appendingPathComponent("target.json"))
        precondition(clearedAgain.applicationRecords[job.id]?.receiptNote=="" && clearedAgain.nextActions[job.id]?.actionNote=="")

        // An external write must not be overwritten by a stale in-memory store.
        let stale=store(url)
        var later=try JSONSerialization.jsonObject(with:Data(contentsOf:url)) as! [String:Any]
        later["futureWorkspaceField"]=["mustSurvive":true]
        let external=try JSONSerialization.data(withJSONObject:later,options:[.sortedKeys])
        try external.write(to:url,options:.atomic)
        stale.setChecklist("external-overwrite",done:true)
        let afterStale=try Data(contentsOf:url);precondition(afterStale==external)
        precondition(stale.storageError != nil)

        // Unknown data present at cold load is also fail-closed, including nested values.
        for kind in ["top","profile","job","receipt","action","live"] {
            var raw=try JSONSerialization.jsonObject(with:originalData) as! [String:Any]
            switch kind {
            case "top":raw["futureWorkspaceField"]=true
            case "profile":var value=raw["profile"] as! [String:Any];value["futurePreference"]=true;raw["profile"]=value
            case "job":var rows=raw["snapshots"] as! [String:[String:Any]];rows[job.id]?["futureMetadata"]=true;raw["snapshots"]=rows
            case "receipt":var rows=raw["importedApplicationRecords"] as! [String:[String:Any]];rows[job.id]?["futureReceipt"]=true;raw["importedApplicationRecords"]=rows
            case "action":var rows=raw["importedNextActions"] as! [String:[String:Any]];rows[job.id]?["futureAction"]=true;raw["importedNextActions"]=rows
            default:raw["live"]=["checkedAt":stamp,"jobs":[],"sources":[],"futureEvidence":true]
            }
            let unknownURL=root.appendingPathComponent("unknown-"+kind+".json")
            let bytes=try JSONSerialization.data(withJSONObject:raw)
            try bytes.write(to:unknownURL)
            let unknown=store(unknownURL)
            unknown.setStatus("Applied",for:job)
            precondition(unknown.storageError != nil)
            let afterUnknown=try Data(contentsOf:unknownURL);precondition(afterUnknown==bytes)
            precondition(unknown.workspace.importedApplicationRecords?[job.id]?.receiptNote==receipt.receiptNote)
        }
        // No credential-bearing or connected-account file is created by compatibility restore.
        let names=try fm.subpathsOfDirectory(atPath:root.path)
        precondition(!names.contains{ $0.contains("connection") || $0.contains("phone-workspace") || $0.contains("credentials") })
        print("PASS: imported-only receipt/task roundtrip, metadata, uncertain status, schema2 preferences, additive profile isolation, sidecar tombstones, stale writes and six unknown-field cold-load protections")
    }
}
