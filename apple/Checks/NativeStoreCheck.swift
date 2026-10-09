import Foundation
import Combine

@main struct NativeStoreCheck {
 @MainActor static func main() throws {
  let researchURL=URL(fileURLWithPath:CommandLine.arguments[1])
  let root=FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
  defer {try? FileManager.default.removeItem(at:root)}
  let stateURL=root.appendingPathComponent("workspace.json")
  let store=NativeCareerStore(researchURL:researchURL,storageURL:stateURL)
  assert(!store.research.jobs.isEmpty && store.storageError==nil)
  assert(store.research.jobs.allSatisfy { $0.applicationURL != nil }, "Every researched employer link must remain usable")
  let criteriaJSON=Data(#"{"years":"","degree":"","skills":"","achievements":"","preferredCity":"riyadh","minimumMonthlySAR":"1000","unknownSalary":"hide"}"#.utf8)
  let criteriaProfile=try JSONDecoder().decode(NativeProfile.self,from:criteriaJSON)
  let criteriaRoundTrip=try JSONSerialization.jsonObject(with:JSONEncoder().encode(criteriaProfile)) as! [String:Any]
  assert(criteriaRoundTrip["minimumMonthlySAR"] as? String == "1000", "Private discovery criteria must survive profile encoding")
  var criteriaInput=criteriaProfile;criteriaInput.minimumMonthlySAR="١٬٠٠٠٫٠٠"
  store.updateProfile(criteriaInput)
  assert(store.workspace.profile.minimumMonthlySAR=="1000", "Whole Arabic pay input is saved in canonical SAR")
  let validCriteria=store.workspace.profile
  let savedCriteriaData=try Data(contentsOf:stateURL)
  for value in ["1.50","1000001","-1","1,00","1000oops","NaN","Infinity"] {
   var invalid=validCriteria;invalid.minimumMonthlySAR=value;store.updateProfile(invalid)
   let unchangedData=try Data(contentsOf:stateURL)
   assert(store.workspace.profile==validCriteria && store.storageError != nil && unchangedData==savedCriteriaData, "Invalid amount must not overwrite profile or disk")
  }
  for field in ["city","salary"] {
   var invalid=validCriteria
   if field=="city" {invalid.preferredCity="anywhere"} else {invalid.unknownSalary="guess"}
   store.updateProfile(invalid)
   let unchangedData=try Data(contentsOf:stateURL)
   assert(store.workspace.profile==validCriteria && store.storageError != nil && unchangedData==savedCriteriaData, "Invalid enums must not overwrite profile or disk")
  }
  store.updateProfile(validCriteria)
  assert(NativeCareerStore(researchURL:researchURL,storageURL:stateURL).workspace.profile==validCriteria)
  let first=store.research.jobs[0]
  store.toggleSaved(first); store.setStatus("Preparing",for:first)
  let restored=NativeCareerStore(researchURL:researchURL,storageURL:stateURL)
  assert(restored.isSaved(first) && restored.status(for:first)=="Preparing")
  var lead=first;lead.id="new-live";lead.rank=nil;lead.kind="live";lead.researchCheckedAt=nil
  let leadData=try JSONSerialization.jsonObject(with:JSONEncoder().encode(lead))
  let payload:[String:Any] = ["checkedAt":"2026-10-09T00:00:00Z","jobs":[leadData],"sources":[["name":"Johnson & Johnson","ok":true,"count":1]]]
  store.acceptLive(payload);assert(store.liveJobs.count==1)
  store.setStatus("Applied",for:lead)
  store.acceptLive(["checkedAt":"2026-10-09T00:01:00Z","jobs":[],"sources":[["name":"Johnson & Johnson","ok":true,"count":0]]])
  assert(store.liveJobs.isEmpty && store.trackedJobs.contains(where:{$0.id==lead.id}))
  assert(store.exportText().contains("Applied"))
  let before=store.workspace.live?.checkedAt
  store.acceptLive(["checkedAt":"2026-10-09T00:02:00Z","jobs":[],"sources":[["name":"Johnson & Johnson","ok":false,"count":0,"error":"Offline"]]])
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
  store.acceptLive(["checkedAt":"2026-10-09T00:03:00Z","jobs":[updatedData],"sources":[["name":"Johnson & Johnson","ok":true,"count":1]]])
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
  store.acceptLive(["checkedAt":"2026-10-09T00:04:00Z","jobs":[],"sources":[["name":"Johnson & Johnson","ok":true,"count":0]]])
  assert(store.savedJobs.first(where:{$0.id==first.id})?.closes=="2099-12-31")
  store.setStatus("Interviewing",for:first)
  let latestReload=NativeCareerStore(researchURL:researchURL,storageURL:stateURL)
  assert(latestReload.current(first).closes=="2099-12-31")
  bad=lead;bad.location="Dubai"
  let invalidData=try JSONSerialization.jsonObject(with:JSONEncoder().encode(bad))
  let previousTime=store.workspace.live?.checkedAt
  store.acceptLive(["checkedAt":"2026-10-09T00:05:00Z","jobs":[invalidData],"sources":[["name":"Johnson & Johnson","ok":true,"count":1]]])
  assert(store.workspace.live?.checkedAt==previousTime && store.searchError != nil)
  profile.years="١٠٫٥";store.updateProfile(profile);assert(store.workspace.profile.years=="10.5")
  assert(CareerJob.safeURL("https://apply.workable.com/unrelated/j/ABC123/")==nil)
  assert(CareerJob.safeURL("https://roche.wd3.myworkdayjobs.com:4444/job")==nil)
  assert(store.note(for:lead).contains("Salary was not checked"))
  assert(CareerJob.expired("2099-02-30T00:00:00Z"))
  assert(CareerJob.expired("2099-01-01T00:00:00Zgarbage"))
  assert(!store.note(for:first).contains("Verified degree input"), "Single-role sharing excludes private profile by default")
  assert(store.note(for:first,includeProfile:true).contains("Verified degree input"))
  for url in ["https://eenp.fa.em3.oraclecloud.com/hcmUI/CandidateExperience/en/sites/CX_1/job/1235", "https://efan.fa.em3.oraclecloud.com/hcmUI/CandidateExperience/en/sites/CX_1/job/100/", "https://careers.al-dawaa.com/en/saudi-arabia/jobs/operations-manager-123/", "https://www.linkedin.com/jobs/view/123456789/", "https://sa.linkedin.com/jobs/view/demand-planning-at-employer-123456789/"] { assert(CareerJob.safeURL(url) != nil) }
  for url in ["https://other.fa.em3.oraclecloud.com/hcmUI/CandidateExperience/en/sites/CX_1/job/1235", "https://eenp.fa.em3.oraclecloud.com/other/1235", "https://sa.linkedin.com/in/someone", "https://www.linkedin.com/jobs/view/not-a-job", "https://careers.al-dawaa.com/other", "https://user@eenp.fa.em3.oraclecloud.com/hcmUI/CandidateExperience/en/sites/CX_1/job/1235", "https://sa.linkedin.com:444/jobs/view/123/"] { assert(CareerJob.safeURL(url) == nil) }

  // A new bundle corrects older saved facts and keeps removed applications as history.
  profile=store.workspace.profile
  var oldResearch=store.research;oldResearch.checkedAt="2020-01-01"
  oldResearch.jobs=oldResearch.jobs.map { var job=$0;job.researchCheckedAt="2020-01-01";return job }
  oldResearch.jobs[0].title="Old procurement title";oldResearch.jobs[0].closes="2098-01-01"
  var archived=first;archived.id="qiddiya-HISTORY";archived.company="Qiddiya";archived.title="Old Procurement Manager";archived.url="https://apply.workable.com/qiddiya-investment-company-1/j/HISTORY/";archived.applyUrl=nil;archived.rank=1;archived.researchCheckedAt="2020-01-01"
  oldResearch.jobs.append(archived)
  let oldResearchURL=root.appendingPathComponent("old-research.json")
  try JSONEncoder().encode(oldResearch).write(to:oldResearchURL)
  let migrationURL=root.appendingPathComponent("migration.json")
  let oldStore=NativeCareerStore(researchURL:oldResearchURL,storageURL:migrationURL)
  oldStore.toggleSaved(oldStore.shortlistJobs[0]);oldStore.setStatus("Applied",for:oldStore.shortlistJobs[0]);oldStore.setStatus("Applied",for:archived)
  oldStore.updateProfile(profile);oldStore.setChecklist("cv",done:true)
  let newStore=NativeCareerStore(researchURL:researchURL,storageURL:migrationURL)
  assert(newStore.current(first).title==first.title && newStore.current(first).closes==first.closes, "New research must replace old saved facts")
  assert(newStore.status(for:first)=="Applied" && newStore.isSaved(first) && newStore.workspace.profile==profile && newStore.workspace.completed.contains("cv"))
  // A corrected bundle must remain durable when a subsequent bundle archives the role.
  var removedResearch=store.research;removedResearch.jobs.removeAll {$0.id==first.id}
  let removedResearchURL=root.appendingPathComponent("removed-research.json")
  try JSONEncoder().encode(removedResearch).write(to:removedResearchURL)
  let removedStore=NativeCareerStore(researchURL:removedResearchURL,storageURL:migrationURL)
  assert(removedStore.current(first).title==first.title && removedStore.current(first).closes==first.closes, "Bundle corrections must survive later archival without re-saving a role")
  assert(removedStore.status(for:first)=="Applied" && removedStore.isSaved(first) && removedStore.workspace.profile==profile && removedStore.workspace.completed.contains("cv"))
  // A temporary failed reconciliation must catch up on the next successful save.
  let recoveryDir=root.appendingPathComponent("recovery"),recoveryURL=recoveryDir.appendingPathComponent("state.json")
  let recoveryA=NativeCareerStore(researchURL:oldResearchURL,storageURL:recoveryURL)
  recoveryA.toggleSaved(recoveryA.shortlistJobs[0]);recoveryA.setStatus("Applied",for:recoveryA.shortlistJobs[0])
  try FileManager.default.setAttributes([.posixPermissions:0o500],ofItemAtPath:recoveryDir.path)
  defer {try? FileManager.default.setAttributes([.posixPermissions:0o700],ofItemAtPath:recoveryDir.path)}
  let recoveryB=NativeCareerStore(researchURL:researchURL,storageURL:recoveryURL)
  assert(recoveryB.storageError != nil && recoveryB.current(first).title==first.title)
  try FileManager.default.setAttributes([.posixPermissions:0o700],ofItemAtPath:recoveryDir.path)
  recoveryB.setChecklist("cv",done:true)
  let recoveryC=NativeCareerStore(researchURL:removedResearchURL,storageURL:recoveryURL)
  assert(recoveryB.storageError==nil && recoveryC.current(first).title==first.title,"An unrelated recovery save must preserve newly corrected facts")
  assert(recoveryC.isSaved(first) && recoveryC.status(for:first)=="Applied" && recoveryC.workspace.completed.contains("cv"))
  let corruptURL=root.appendingPathComponent("corrupt.json"),corrupt=Data("unreadable workspace".utf8)
  try corrupt.write(to:corruptURL)
  let blocked=NativeCareerStore(researchURL:researchURL,storageURL:corruptURL)
  var notices=0
  let subscription=blocked.$storageError.dropFirst().compactMap{$0}.sink{_ in notices+=1}
  blocked.toggleSaved(first);blocked.setChecklist("cv",done:true)
  let preserved=try Data(contentsOf:corruptURL)
  assert(notices==2 && preserved==corrupt && blocked.savedJobs.isEmpty,"Each refused action publishes an error without overwriting unreadable data")
  withExtendedLifetime(subscription) {}
  // Expired cached evidence must never reopen an older researched deadline.
  var expiryResearch=store.research;expiryResearch.jobs[0].closes="2099-12-31"
  let expiryResearchURL=root.appendingPathComponent("expiry-research.json"),expiryStateURL=root.appendingPathComponent("expiry-state.json")
  try JSONEncoder().encode(expiryResearch).write(to:expiryResearchURL)
  var expiredJob=first;expiredJob.closes="2000-01-01";expiredJob.lastCheckedAt=nil
  var expiryWorkspace=NativeWorkspace()
  expiryWorkspace.live=LiveSnapshot(checkedAt:ISO8601DateFormatter().string(from:Date()),jobs:[expiredJob],sources:[EmployerStatus(name:first.company,ok:true,count:1)])
  try JSONEncoder().encode(expiryWorkspace).write(to:expiryStateURL)
  let expiryStore=NativeCareerStore(researchURL:expiryResearchURL,storageURL:expiryStateURL)
  assert(expiryStore.liveJobs.isEmpty && expiryStore.current(first).isExpired, "Expired employer evidence stays authoritative but absent from live discovery")
  expiryStore.toggleSaved(first);expiryStore.setStatus("Applied",for:first)
  expiryStore.acceptLive(["checkedAt":ISO8601DateFormatter().string(from:Date()),"jobs":[],"sources":[["name":first.company,"ok":true,"count":0]]])
  let expiryRestart=NativeCareerStore(researchURL:expiryResearchURL,storageURL:expiryStateURL)
  assert(expiryRestart.current(first).closes=="2000-01-01" && expiryRestart.isSaved(first) && expiryRestart.status(for:first)=="Applied", "Newer expired facts survive an empty refresh and restart")
  var sameDayResearch=store.research
  sameDayResearch.jobs[0].title="Superseded same-day title";sameDayResearch.jobs[0].location="Jeddah, Saudi Arabia"
  let sameDayResearchURL=root.appendingPathComponent("same-day-research.json"),sameDayStateURL=root.appendingPathComponent("same-day-state.json")
  try JSONEncoder().encode(sameDayResearch).write(to:sameDayResearchURL)
  let beforeCorrection=NativeCareerStore(researchURL:sameDayResearchURL,storageURL:sameDayStateURL)
  beforeCorrection.toggleSaved(beforeCorrection.shortlistJobs[0]);beforeCorrection.setStatus("Applied",for:beforeCorrection.shortlistJobs[0])
  let afterCorrection=NativeCareerStore(researchURL:researchURL,storageURL:sameDayStateURL)
  assert(afterCorrection.current(first).title==first.title && afterCorrection.current(first).location==first.location, "Corrected bundled facts must win a same-day saved research tie")
  assert(afterCorrection.isSaved(first) && afterCorrection.status(for:first)=="Applied")
  let historical=newStore.current(archived)
  assert(historical.rank==nil && historical.kind=="archived" && newStore.trackedJobs.contains { $0.id==archived.id })
  assert(newStore.note(for:historical).contains("2020-01-01") && !newStore.note(for:historical).contains("checked \(newStore.research.checkedAt)"))
  assert(newStore.note(for:historical).contains("Archived"))
  newStore.acceptLive(["checkedAt":"2026-10-09T00:06:00Z","jobs":[updatedData],"sources":[["name":"Johnson & Johnson","ok":true,"count":1]]])
  assert(newStore.current(first).closes=="2099-12-31", "Newer live facts still beat older research")
  newStore.acceptLive(["checkedAt":"2026-10-09T00:00:00Z","jobs":[],"sources":[["name":"Johnson & Johnson","ok":true,"count":0]]])
  assert(!newStore.liveJobs.isEmpty && newStore.searchError != nil, "Older refresh must not erase newer data")
  newStore.acceptLive(["checkedAt":"2099-01-01T00:00:00Z","jobs":[],"sources":[["name":"Johnson & Johnson","ok":true,"count":0]]])
  assert(!newStore.liveJobs.isEmpty && newStore.searchError != nil, "Future checkedAt must not replace cache")
  var invalidLead=lead;invalidLead.posted="2026-02-30T00:00:00Z"
  let invalidLeadData=try JSONSerialization.jsonObject(with:JSONEncoder().encode(invalidLead))
  newStore.acceptLive(["checkedAt":"2026-10-09T00:07:00Z","jobs":[invalidLeadData],"sources":[["name":"Johnson & Johnson","ok":true,"count":1]]])
  assert(newStore.liveJobs.first?.id==first.id && newStore.searchError != nil)
  newStore.acceptLive(["checkedAt":"2026-10-09T00:08:00Z","jobs":[updatedData,invalidLeadData],"sources":[["name":"Johnson & Johnson","ok":true,"count":2]]])
  assert(newStore.liveJobs.count==1 && newStore.searchError?.contains("1 invalid") == true, "A malformed row does not discard a valid peer")
  let partialTime=newStore.workspace.live?.checkedAt
  newStore.acceptLive(["checkedAt":"2026-10-09T00:09:00Z","jobs":[],"sources":[["name":"Johnson & Johnson","ok":true,"count":-1]]])
  assert(newStore.workspace.live?.checkedAt==partialTime && newStore.searchError != nil)

  var legacy=oldStore.workspace
  legacy.snapshots=legacy.snapshots.mapValues { var job=$0;job.lastCheckedAt=nil;job.researchCheckedAt=nil;return job }
  legacy.live=LiveSnapshot(checkedAt:"2026-10-08T12:00:00Z",jobs:[archived],sources:[EmployerStatus(name:"Qiddiya",ok:true,count:1)])
  let legacyURL=root.appendingPathComponent("legacy.json")
  try JSONEncoder().encode(legacy).write(to:legacyURL)
  let legacyStore=NativeCareerStore(researchURL:researchURL,storageURL:legacyURL)
  assert(legacyStore.current(first).title==first.title && legacyStore.status(for:first)=="Applied")
  assert(legacyStore.liveJobs.isEmpty && legacyStore.trackedJobs.contains { $0.id==archived.id }, "Old Qiddiya discovery is hidden but its applied record survives")
  assert(legacyStore.note(for:legacyStore.current(archived)).contains("Original research check date is unavailable"))
  var laterResearch=store.research;laterResearch.checkedAt="2026-10-10";laterResearch.jobs.removeAll {$0.id==first.id}
  let laterURL=root.appendingPathComponent("later-research.json")
  try JSONEncoder().encode(laterResearch).write(to:laterURL)
  let laterStore=NativeCareerStore(researchURL:laterURL,storageURL:migrationURL)
  let laterArchived=laterStore.current(first)
  assert(!laterStore.isCurrentResearch(laterArchived) && laterArchived.kind=="archived" && laterArchived.rank==nil)
  assert(laterArchived.requirements==first.requirements && laterArchived.closes=="2099-12-31")
  assert(laterArchived.researchCheckedAt==store.research.checkedAt && laterArchived.lastCheckedAt==partialTime)
  assert(!laterStore.note(for:laterArchived).contains("checked 2026-10-10"))

  // A literal pre-criteria workspace keeps its profile and application records writable.
  let preCriteriaJSON=Data(#"{"saved":["legacy-criteria"],"statuses":{"legacy-criteria":"Applied"},"snapshots":{"legacy-criteria":{"id":"legacy-criteria","title":"Procurement Manager","company":"Johnson & Johnson","location":"Saudi Arabia","url":"https://www.careers.jnj.com/job","posted":"","fit":"Needs review","summary":"Retained application"}},"profile":{"years":"8","degree":"Legacy degree","skills":"Legacy skills","achievements":"Legacy achievement"},"completed":["cv"]}"#.utf8)
  let preCriteriaURL=root.appendingPathComponent("pre-criteria.json")
  try preCriteriaJSON.write(to:preCriteriaURL)
  let preCriteriaStore=NativeCareerStore(researchURL:researchURL,storageURL:preCriteriaURL)
  assert(preCriteriaStore.storageError==nil && preCriteriaStore.savedJobs.count==1 && preCriteriaStore.trackedJobs.count==1 && preCriteriaStore.workspace.completed.contains("cv"))
  let oldProfile=preCriteriaStore.workspace.profile
  assert(oldProfile.years=="8" && oldProfile.degree=="Legacy degree" && oldProfile.skills=="Legacy skills" && oldProfile.achievements=="Legacy achievement")
  assert(oldProfile.preferredCity==nil && oldProfile.minimumMonthlySAR==nil && oldProfile.unknownSalary==nil && !oldProfile.hidesUnverifiedSalary)
  assert(NativeProfile().preferredCity==nil && NativeProfile().minimumMonthlySAR==nil && NativeProfile().unknownSalary==nil, "Decoded empty or legacy profiles remain neutral")

  var criteria=NativeProfile()
  let cityCases:[(String,Bool,Bool)]=[("Riyadh Region, Saudi Arabia",false,false),("Riyadh Province",false,false),("منطقة الرياض، السعودية",false,false),("Al Kharj, Riyadh Region",false,false),("Riyadh, Riyadh Region, Saudi Arabia",true,false),("الرياض، منطقة الرياض",true,false),("Riyadh, Saudi Arabia",true,false),("الرياض، السعودية",true,false),("Riyadh / Jeddah",true,true),("الرياض أو جدة",true,true),("Riyadh; 2 locations",true,true),("Riyadh and multiple locations",true,true),("Jeddah, Saudi Arabia",false,false),("Saudi Arabia",false,false),("2 locations",false,false),("",false,false),("NotRiyadh",false,false),("الرياضيات",false,false)]
  for (location,includesCity,conditional) in cityCases {
   var job=first;job.location=location
   assert(criteria.includesInDiscovery(job), "Neutral preferences retain the existing Saudi discovery set")
   criteria.preferredCity="riyadh"
   assert(criteria.includesInDiscovery(job)==includesCity && job.requiresRiyadhConfirmation==conditional, "Riyadh needs explicit city evidence")
   assert(criteria.criteriaMessages(for:job).contains("Confirm Riyadh assignment")==conditional)
   criteria.preferredCity=nil
  }
  for minimum in [nil,"","0","1000"] as [String?] {
   for policy in [nil,"show","hide"] as [String?] {
    criteria.minimumMonthlySAR=minimum;criteria.unknownSalary=policy
    assert(criteria.includesInDiscovery(first) == !(minimum=="1000" && policy=="hide"), "No current listing has verified comparable salary")
    assert(criteria.criteriaMessages(for:first).contains("Salary unverified — confirm your minimum") == (minimum=="1000"))
   }
  }
  criteria=oldProfile
  for amount in ["", "0", "١٬٠٠٠٫٠٠", "۱٬۰۰۰", "1,000,000"] {
   criteria.minimumMonthlySAR=amount;preCriteriaStore.updateProfile(criteria)
   assert(preCriteriaStore.storageError==nil && preCriteriaStore.workspace.profile.minimumMonthlyAmount==NativeMoney.parse(amount,limit:1e6))
  }
  let migratedCriteria=NativeCareerStore(researchURL:researchURL,storageURL:preCriteriaURL)
  assert(migratedCriteria.savedJobs.count==1 && migratedCriteria.trackedJobs.count==1 && migratedCriteria.workspace.completed.contains("cv"))
  assert(migratedCriteria.workspace.profile.years==oldProfile.years && migratedCriteria.workspace.profile.degree==oldProfile.degree && migratedCriteria.workspace.profile.skills==oldProfile.skills && migratedCriteria.workspace.profile.achievements==oldProfile.achievements)

  let savedIDs=newStore.savedJobs.map(\.id),trackedIDs=newStore.trackedJobs.map(\.id),liveIDs=newStore.liveJobs.map(\.id),researchIDs=newStore.shortlistJobs.map(\.id)
  let originalExport=newStore.exportText(),originalNote=newStore.note(for:first,includeProfile:true)
  var strict=newStore.workspace.profile;strict.preferredCity="riyadh";strict.minimumMonthlySAR="1000";strict.unknownSalary="hide"
  assert(strict != newStore.workspace.profile, "Criteria participate in the existing dirty/conflict comparison")
  newStore.updateProfile(strict)
  assert(newStore.savedJobs.map(\.id)==savedIDs && newStore.trackedJobs.map(\.id)==trackedIDs && newStore.liveJobs.map(\.id)==liveIDs && newStore.shortlistJobs.map(\.id)==researchIDs, "Criteria never alter history or underlying job collections")
  assert(newStore.shortlistJobs.filter { strict.includesInDiscovery($0) }.isEmpty)
  assert(newStore.exportText()==originalExport && newStore.note(for:first,includeProfile:true)==originalNote, "All notes and exports omit private criteria")
  var outsideCity=updated;outsideCity.location="Jeddah, Saudi Arabia";outsideCity.closes="2099-11-30"
  let outsideData=try JSONSerialization.jsonObject(with:JSONEncoder().encode(outsideCity))
  newStore.acceptLive(["checkedAt":"2026-10-09T00:10:00Z","jobs":[outsideData],"sources":[["name":"Johnson & Johnson","ok":true,"count":1]]])
  assert(newStore.liveJobs.count==1 && newStore.current(first).location==outsideCity.location && newStore.current(first).closes==outsideCity.closes, "Excluded discoveries still refresh saved employer facts")
  assert(newStore.workspace.profile==strict && newStore.isSaved(first) && newStore.status(for:first)=="Applied")
  let strictReload=NativeCareerStore(researchURL:researchURL,storageURL:migrationURL)
  assert(strictReload.workspace.profile==strict && strictReload.savedJobs.map(\.id)==savedIDs)
  unwritable.updateProfile(strict)
  assert(unwritable.workspace.profile==NativeProfile(preferredCity:"riyadh") && unwritable.storageError != nil, "A failed criteria save never announces durable success")
  let recordURL=root.appendingPathComponent("record-workspace.json")
  let records=NativeCareerStore(researchURL:researchURL,storageURL:recordURL)
  records.beginApplicationRecord(first)
  records.editApplicationRecord(first,appliedAt:"",receiptNote:"Private receipt 🌷")
  assert(records.saveApplicationRecord(first))
  assert(records.status(for:first)=="Not started" && !records.isSaved(first))
  assert(!records.note(for:first).contains("Private receipt"))
  assert(records.exportText().contains("Private receipt"))
  let recordsReload=NativeCareerStore(researchURL:researchURL,storageURL:recordURL)
  assert(recordsReload.recordJobs.contains{$0.id==first.id})
  recordsReload.beginApplicationRecord(first)
  recordsReload.editApplicationRecord(first,appliedAt:"",receiptNote:"Conflicting draft")
  records.editApplicationRecord(first,appliedAt:"2026-10-08",receiptNote:"New saved value")
  assert(records.saveApplicationRecord(first))
  assert(!recordsReload.saveApplicationRecord(first))
  assert(recordsReload.exportText().contains("UNSAVED application record draft"))
  assert(recordsReload.exportText().contains("Conflicting draft"))
  records.setStatus("Applied",for:first)
  assert(records.applicationRecords[first.id]?.appliedAt=="2026-10-08")
  let dateNow=CareerFeed.isoDate("2026-10-09T21:00:00Z")!
  var record=ApplicationRecord(jobId:first.id,appliedAt:"2026-10-10",receiptNote:String(repeating:"🌷",count:2000),updatedAt:ApplicationRecord.timestamp(dateNow))
  assert(record.valid(for:first.id,now:dateNow))
  for date in ["2026-02-29","2026-10-11","2026-10-10T00:00:00Z"] {record.appliedAt=date;assert(!record.valid(for:first.id,now:dateNow))}
  record.appliedAt="2024-02-29";assert(record.valid(for:first.id,now:dateNow))
  record.receiptNote += "a";assert(!record.valid(for:first.id,now:dateNow))
  var past=first;past.id="a";past.closes="2026-10-09"
  var near=first;near.id="b";near.closes="2026-10-17"
  var invalid=first;invalid.id="c";invalid.closes="2026-02-29"
  let prompts=NativeCareerStore.attentionFor([past,near,invalid],statuses:[:],records:[:],now:dateNow)
  assert(prompts.map(\.id)==["a:deadline","b:deadline","b:requirements","c:requirements"])
  assert(NativeCareerStore.attentionFor([past],statuses:["a":"unknown"],records:[:],now:dateNow).isEmpty)
  let recovery=NativeCareerStore(researchURL:researchURL,storageURL:root.appendingPathComponent("partial.json"))
  assert(recovery.workspace.profile.preferredCity=="riyadh" && recovery.workspace.profile.minimumMonthlySAR==nil)
  var unknown=lead;unknown.id="unknown";unknown.closes="2099-12-31";unknown.posted="2020-01-01"
  var excluded=unknown;excluded.id="excluded"
  let oldStamp="2026-10-09T00:30:00Z",attemptStamp="2026-10-09T00:40:00Z"
  let recoveryRows=try [unknown,excluded].map {try JSONSerialization.jsonObject(with:JSONEncoder().encode($0))}
  recovery.acceptLive(["checkedAt":oldStamp,"jobs":recoveryRows,"sources":[["name":lead.company,"ok":true,"count":2]]])
  recovery.setStatus("Applied",for:excluded)
  recovery.acceptLive(["checkedAt":attemptStamp,"jobs":[],"sources":[["name":lead.company,"ok":true,"count":0,"detailErrors":1,"excludedIds":[excluded.id]]]])
  assert(recovery.liveJobs.map(\.id)==[unknown.id] && recovery.liveJobs[0].lastCheckedAt==oldStamp)
  assert(recovery.trackedJobs.contains{$0.id==excluded.id} && recovery.status(for:excluded)=="Applied")
  assert(recovery.isUnrefreshed(unknown) && recovery.employerObservation(unknown).lastCheckedAt==oldStamp)
  var newer=unknown;newer.lastCheckedAt=attemptStamp
  assert(!recovery.isUnrefreshed(newer) && recovery.employerObservation(newer).lastCheckedAt==attemptStamp)
  let recoveryReload=NativeCareerStore(researchURL:researchURL,storageURL:root.appendingPathComponent("partial.json"))
  assert(recoveryReload.isUnrefreshed(unknown) && recoveryReload.liveJobs[0].lastCheckedAt==oldStamp)
  let evidenceNote=recovery.note(for:unknown)
  assert(evidenceNote.contains(oldStamp) && evidenceNote.contains("2099-12-31"))
  for invalidExclusions:[Any] in [[""], [String(repeating:"x",count:257)], Array(repeating:"x",count:21), [1]] {
   recovery.acceptLive(["checkedAt":"2026-10-09T00:50:00Z","jobs":[],"sources":[["name":lead.company,"ok":true,"count":0,"excludedIds":invalidExclusions]]])
   assert(recovery.workspace.live?.checkedAt==attemptStamp && recovery.searchError != nil)
  }
  // New editorial facts and the latest actual employer observation survive reconciliation independently.
  var editorial=first;editorial.title="Synthetic editorial correction";editorial.lastCheckedAt=nil;editorial.researchCheckedAt="2026-10-09"
  let observationResearch=root.appendingPathComponent("observation-research.json"),observationState=root.appendingPathComponent("observation-state.json")
  try JSONEncoder().encode(CareerResearch(checkedAt:"2026-10-09",jobs:[editorial],profile:store.research.profile)).write(to:observationResearch)
  var observed=first;observed.title="Synthetic older employer title";observed.researchCheckedAt=nil;observed.lastCheckedAt="2026-10-08T12:00:00Z"
  var cached=observed;cached.lastCheckedAt="2026-10-07T12:00:00Z"
  var observationWorkspace=NativeWorkspace();observationWorkspace.saved.insert(first.id);observationWorkspace.statuses[first.id]="Applied";observationWorkspace.snapshots[first.id]=observed
  observationWorkspace.live=LiveSnapshot(checkedAt:"2026-10-09T12:00:00Z",jobs:[cached],sources:[EmployerStatus(name:first.company,ok:true,count:1)])
  try JSONEncoder().encode(observationWorkspace).write(to:observationState)
  for _ in 0..<2 {
   let observationStore=NativeCareerStore(researchURL:observationResearch,storageURL:observationState),current=observationStore.current(first)
   assert(current.title==editorial.title && current.researchCheckedAt==editorial.researchCheckedAt && current.lastCheckedAt==observed.lastCheckedAt)
   assert(observationStore.note(for:current).contains("Employer checked: 2026-10-08T12:00:00Z") && observationStore.exportText().contains(editorial.title))
   observationStore.setStatus("Applied",for:current)
   assert(observationStore.workspace.snapshots[first.id]?.lastCheckedAt==observed.lastCheckedAt)
  }
  print("Full review regression checks passed: fresh Riyadh default, partial evidence age, exact exclusions, saved history, persisted observation chronology and dated exports.")
  print("Application record checks passed: legacy preservation, metadata-only history, conflicts, export privacy, strict date/scalar limits and derived attention.")
  print("Native store checks passed: \(store.research.jobs.count) researched jobs, atomic saves, pre-criteria migration, city/pay criteria, unfiltered history, export privacy, strict URLs/dates, stale response rejection and input validation.")
 }
}
