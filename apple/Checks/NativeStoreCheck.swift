import Foundation

@main struct NativeStoreCheck {
 @MainActor static func main() throws {
  let researchURL=URL(fileURLWithPath:CommandLine.arguments[1])
  let root=FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
  defer {try? FileManager.default.removeItem(at:root)}
  let stateURL=root.appendingPathComponent("workspace.json")
  let store=NativeCareerStore(researchURL:researchURL,storageURL:stateURL)
  assert(store.research.jobs.count==10 && store.storageError==nil)
  let first=store.research.jobs[0]
  store.toggleSaved(first); store.setStatus("Preparing",for:first)
  let restored=NativeCareerStore(researchURL:researchURL,storageURL:stateURL)
  assert(restored.isSaved(first) && restored.status(for:first)=="Preparing")
  var lead=first;lead.id="new-live";lead.rank=nil;lead.kind="live"
  let leadData=try JSONSerialization.jsonObject(with:JSONEncoder().encode(lead))
  let payload:[String:Any] = ["checkedAt":"2026-10-09T00:00:00Z","jobs":[leadData],"sources":[["name":"Qiddiya","ok":true,"count":1]]]
  store.acceptLive(payload);assert(store.liveJobs.count==1)
  store.setStatus("Applied",for:lead)
  store.acceptLive(["checkedAt":"2026-10-09T01:00:00Z","jobs":[],"sources":[["name":"Qiddiya","ok":true,"count":0]]])
  assert(store.liveJobs.isEmpty && store.trackedJobs.contains(where:{$0.id==lead.id}))
  assert(store.exportText().contains("Applied"))
  let before=store.workspace.live?.checkedAt
  store.acceptLive(["checkedAt":"2026-10-09T02:00:00Z","jobs":[],"sources":[["name":"Qiddiya","ok":false,"count":0,"error":"Offline"]]])
  assert(store.workspace.live?.checkedAt==before && store.searchError != nil)
  var bad=lead;bad.applyUrl=nil;bad.url="javascript:alert(1)";assert(bad.applicationURL==nil)
  bad.url="https://example.com/phishing";assert(bad.applicationURL==nil)
  bad=lead;bad.location="Dubai, United Arab Emirates";assert(!bad.isSaudi)
  let file=root.appendingPathComponent("not-a-folder");try Data("x".utf8).write(to:file)
  let unwritable=NativeCareerStore(researchURL:researchURL,storageURL:file.appendingPathComponent("data.json"))
  unwritable.toggleSaved(first);assert(!unwritable.isSaved(first) && unwritable.storageError != nil)
  let afterReload=NativeCareerStore(researchURL:researchURL,storageURL:stateURL)
  assert(afterReload.trackedJobs.contains(where:{$0.id==lead.id}))
  assert(CareerJob.expired("2026-10-08",today:"2026-10-09"))
  assert(!CareerJob.expired("2026-10-09",today:"2026-10-09"))
  assert(CareerJob.expired("9999-99-99"))
  assert(CareerJob.expired("2000-01-01T00:00:00Z"))
  let justExpired=ISO8601DateFormatter().string(from:Date().addingTimeInterval(-60))
  let stillOpen=ISO8601DateFormatter().string(from:Date().addingTimeInterval(3600))
  assert(CareerJob.expired(justExpired) && !CareerJob.expired(stillOpen))
  var profile=NativeProfile();profile.years="10.5";store.updateProfile(profile)
  assert(store.workspace.profile.years=="10.5")
  var updated=first;updated.closes="2099-12-31";updated.rank=nil;updated.gaps=nil;updated.steps=nil;updated.fit="Needs review"
  let updatedData=try JSONSerialization.jsonObject(with:JSONEncoder().encode(updated))
  store.acceptLive(["checkedAt":"2026-10-09T03:00:00Z","jobs":[updatedData],"sources":[["name":"Qiddiya","ok":true,"count":1]]])
  let merged=store.savedJobs.first(where:{$0.id==first.id})!
  assert(merged.closes=="2099-12-31" && merged.rank==first.rank && merged.requirements==first.requirements)
  assert(NativeMoney.parse("30,000",limit:1e6)==30000)
  assert(NativeMoney.parse("٣٠٬٠٠٠٫٥٠",limit:1e6)==30000.5)
  assert(NativeMoney.parse("30,00",limit:1e6)==nil)
  assert(NativeMoney.parse("30000oops",limit:1e6)==nil)
  assert(NativeMoney.parse("1000001",limit:1e6)==nil)
  assert(NativeMoney.parse("-5",limit:1e6)==nil)
  profile.degree="Verified degree input";profile.skills="Procurement analytics";store.updateProfile(profile)
  store.setChecklist("cv",done:true)
  assert(store.exportText().contains("Verified degree input") && store.exportText().contains("Procurement analytics") && store.exportText().contains("[x] Two focused CVs"))
  var tooLong=profile;tooLong.skills=String(repeating:"x",count:3001);store.updateProfile(tooLong)
  assert(store.workspace.profile.skills==profile.skills && store.storageError != nil)
  profile.years="0000000010";store.updateProfile(profile);assert(store.workspace.profile.years=="10")
  store.acceptLive(["checkedAt":"2026-10-09T04:00:00Z","jobs":[],"sources":[["name":"Qiddiya","ok":true,"count":0]]])
  assert(store.savedJobs.first(where:{$0.id==first.id})?.closes=="2099-12-31")
  store.setStatus("Interviewing",for:first)
  let latestReload=NativeCareerStore(researchURL:researchURL,storageURL:stateURL)
  assert(latestReload.current(first).closes=="2099-12-31")
  bad=lead;bad.location="Dubai"
  let invalidData=try JSONSerialization.jsonObject(with:JSONEncoder().encode(bad))
  let previousTime=store.workspace.live?.checkedAt
  store.acceptLive(["checkedAt":"2026-10-09T05:00:00Z","jobs":[invalidData],"sources":[["name":"Qiddiya","ok":true,"count":1]]])
  assert(store.workspace.live?.checkedAt==previousTime && store.searchError != nil)
  profile.years="١٠٫٥";store.updateProfile(profile);assert(store.workspace.profile.years=="10.5")
  assert(CareerJob.safeURL("https://apply.workable.com/unrelated/j/ABC123/")==nil)
  assert(CareerJob.safeURL("https://roche.wd3.myworkdayjobs.com:4444/job")==nil)
  assert(store.note(for:lead).contains("Salary was not checked"))
  print("Native store checks passed: 10 researched jobs, save/reload, tracked removed lead, outage cache, safe URLs, Saudi scope, failed writes and closing dates.")
 }
}
