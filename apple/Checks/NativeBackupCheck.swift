import Foundation
import CryptoKit
@main struct NativeBackupCheck {
    @MainActor static func main()throws {
        let fm=FileManager.default,root=fm.temporaryDirectory.appendingPathComponent("career-backup-"+UUID().uuidString)
        defer {try? fm.removeItem(at:root)}
        let research=URL(fileURLWithPath:CommandLine.arguments[1])
        func store(_ name:String)->NativeCareerStore {NativeCareerStore(researchURL:research,storageURL:root.appendingPathComponent(name+"/workspace.json"))}
        func rejects(_ action:()throws->Void) {do {try action();preconditionFailure("Expected rejection")} catch {}}
        let source=store("source"),target=store("target")
        let empty=try source.privateBackupData();let decodedEmpty=try NativeCareerStore.decodeBackup(empty);precondition(decodedEmpty.workspace.saved.isEmpty)
        var job=source.research.jobs[0];job.id="backup-test"
        source.toggleSaved(job);source.setStatus("Preparing",for:job)
        source.updateProfile(NativeProfile(years:"2",degree:"Synthetic test coursework",skills:"Synthetic Swift",achievements:"Synthetic sample",preferredCity:"riyadh"))
        source.setChecklist("profile",done:true)
        source.editApplicationRecord(job,appliedAt:"",receiptNote:"Saved receipt");precondition(source.saveApplicationRecord(job))
        source.editNextAction(job,dueOn:"",actionNote:"Saved action",completed:false);precondition(source.saveNextAction(job))
        source.editNextAction(job,dueOn:"",actionNote:"UNSAVED SECRET",completed:true)
        let data=try source.privateBackupData();precondition(!String(decoding:data,as:UTF8.self).contains("UNSAVED SECRET"))
        if CommandLine.arguments.count>2 {try data.write(to:URL(fileURLWithPath:CommandLine.arguments[2]))}
        let unicode=store("unicode");unicode.updateProfile(NativeProfile(degree:String(repeating:"💻",count:200),skills:String(repeating:"💻",count:2000),achievements:String(repeating:"💻",count:4000)))
        _=try unicode.privateBackupData()
        let preview=try target.previewBackup(data);precondition(preview.additions==5)
        try target.applyBackup(preview)
        precondition(target.workspace.saved.contains(job.id) && target.applicationRecords[job.id]?.receiptNote=="Saved receipt" && target.nextActions[job.id]?.actionNote=="Saved action")
        let reopened=store("target");precondition(reopened.nextActions[job.id]?.actionNote=="Saved action")
        let repeated=try reopened.previewBackup(data);precondition(repeated.additions==0 && repeated.conflicts==5)
        try reopened.applyBackup(repeated)
        reopened.editNextAction(job,dueOn:"",actionNote:"",completed:false);precondition(reopened.saveNextAction(job))
        precondition(store("target").nextActions[job.id]?.actionNote=="")
        let stale=try reopened.previewBackup(data);reopened.setStatus("Applied",for:job)
        rejects {try reopened.applyBackup(stale)}
        precondition(reopened.status(for:job)=="Applied")
        let external=try reopened.previewBackup(data)
        let other=store("target");other.setStatus("Interviewing",for:job)
        rejects {try reopened.applyBackup(external)}
        rejects {_=try reopened.previewBackup(data)}
        var raw=try JSONSerialization.jsonObject(with:data) as! [String:Any]
        func rejectRaw() {rejects {_=try NativeCareerStore.decodeBackup(JSONSerialization.data(withJSONObject:raw))}}
        raw["schema"]=2;rejectRaw();raw["schema"]=1
        raw["exportedAt"]="2999-01-01T00:00:00Z";rejectRaw();raw["exportedAt"]=ApplicationRecord.timestamp(Date())
        raw["extra"]=true;rejectRaw();raw.removeValue(forKey:"extra")
        var w=raw["workspace"] as! [String:Any];let oldW=w
        w["states"]=[job.id:"invalid"];raw["workspace"]=w;rejectRaw()
        w=oldW;w["saved"]=[job.id,job.id];raw["workspace"]=w;rejectRaw()
        w=oldW;w["saved"]=["missing"];raw["workspace"]=w;rejectRaw()
        w=oldW;var rows=w["savedDetails"] as! [String:[String:Any]];rows[job.id]?["url"]="javascript:alert(1)";w["savedDetails"]=rows;raw["workspace"]=w;rejectRaw();raw["workspace"]=oldW
        raw["nextActions"]=[["schema":1]];rejectRaw()
        rejects {_=try NativeCareerStore.decodeBackup(Data(repeating:32,count:NativeCareerStore.backupLimit+1))}
        // A regular file at the destination directory blocks staging without touching any user files.
        try Data("blocked".utf8).write(to:root.appendingPathComponent("blocked"))
        let blocked=NativeCareerStore(researchURL:research,storageURL:root.appendingPathComponent("blocked/workspace.json"))
        let blockedPreview=try blocked.previewBackup(data)
        rejects {try blocked.applyBackup(blockedPreview)}
        precondition(blocked.workspace.saved.isEmpty && blocked.applicationRecords.isEmpty)
        let recoveries=try fm.contentsOfDirectory(atPath:root.appendingPathComponent("target").path).filter{$0.contains("before-restore-")}
        precondition(!recoveries.isEmpty)
        var full=NativeWorkspace()
        for index in 0..<1000 {var retained=job;retained.id="existing-\(index)";full.snapshots[retained.id]=retained}
        let fullURL=root.appendingPathComponent("full/workspace.json")
        try fm.createDirectory(at:fullURL.deletingLastPathComponent(),withIntermediateDirectories:true)
        try JSONEncoder().encode(full).write(to:fullURL)
        let fullStore=NativeCareerStore(researchURL:research,storageURL:fullURL)
        rejects {_=try fullStore.previewBackup(data)}
        precondition(fullStore.workspace.snapshots.count==1000)
        let prior=store("external-restore");prior.toggleSaved(job)
        let staleEditor=store("external-restore"),restorer=store("external-restore")
        staleEditor.editApplicationRecord(job,appliedAt:"",receiptNote:"STALE RECEIPT")
        staleEditor.editNextAction(job,dueOn:"",actionNote:"STALE ACTION",completed:false)
        try restorer.applyBackup(restorer.previewBackup(data))
        precondition(!staleEditor.saveApplicationRecord(job))
        precondition(!staleEditor.saveNextAction(job))
        let intact=store("external-restore")
        precondition(intact.applicationRecords[job.id]?.receiptNote=="Saved receipt")
        precondition(intact.nextActions[job.id]?.actionNote=="Saved action")
        let orphanURL=root.appendingPathComponent("source/workspace.json.application-records-v1/orphan.json")
        try Data("{}".utf8).write(to:orphanURL)
        rejects {_=try source.privateBackupData()}
        if CommandLine.arguments.count>3 {
            let webData=try Data(contentsOf:URL(fileURLWithPath:CommandLine.arguments[3]))
            let web=try NativeCareerStore.decodeBackup(webData)
            let cross=store("cross-web");let crossPreview=try cross.previewBackup(webData);try cross.applyBackup(crossPreview)
            precondition(cross.workspace.saved==Set(web.workspace.saved))
            for r in web.applicationRecords {let value=cross.applicationRecords[r.jobId];precondition(value==r)}
            for r in web.nextActions {let value=cross.nextActions[r.jobId];precondition(value==r)}
        }
        print("Native backup checks passed: empty, saved-only roundtrip, additive conflicts, sidecar tombstones, stale memory/disk, invalid input, oversize, recovery copy and write failure.")
    }
}
