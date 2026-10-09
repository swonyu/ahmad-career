import Foundation
import Combine
import CryptoKit

struct CareerJob: Codable, Identifiable, Hashable {
    var id: String
    var title: String
    var company: String
    var location: String
    var url: String
    var posted: String
    var fit: String
    var summary: String
    var rank: Int?
    var subtitle: String?
    var mode: String?
    var closes: String?
    var applyUrl: String?
    var sourceUrl: String?
    var gaps: [String]?
    var steps: [[String]]?
    var minYears: Int?
    var healthcare: Bool?
    var leadership: Bool?
    var kind: String?
    var lastCheckedAt: String?
    var researchCheckedAt: String?

    var initials: String { company == "Johnson & Johnson" ? "J&J" : String(company.prefix(1)) }
    var isSaudi: Bool { location.range(of: "Saudi|Riyadh|Jeddah|Dammam|Khobar|\\bSAU\\b|الرياض|جدة|السعودية", options: [.regularExpression,.caseInsensitive]) != nil }
    var hasRiyadhEvidence:Bool { location.replacingOccurrences(of:"\\briyadh\\s+(?:region|province)\\b|(?:منطقة|إقليم)\\s+الرياض",with:"",options:[.regularExpression,.caseInsensitive]).range(of:"(?:^|[^\\p{L}])(?:riyadh|الرياض)(?=$|[^\\p{L}])",options:[.regularExpression,.caseInsensitive]) != nil }
    // ponytail: location-text heuristic; replace with explicit worksite data when feeds supply it.
    var requiresRiyadhConfirmation:Bool {
        hasRiyadhEvidence && location.range(of:"\\b(?:jeddah|dammam|khobar|dhahran|makkah|mecca|madinah|medina|taif|tabuk|abha|jubail|yanbu|qassim|buraidah|hail|jazan|najran|hofuf|ahsa)\\b|جدة|الدمام|الخبر|الظهران|مكة|المدينة|الطائف|تبوك|أبها|الجبيل|ينبع|القصيم|بريدة|حائل|جازان|نجران|الهفوف|الأحساء|[/;؛]|\\b(?:or|and|multiple|locations)\\b|(?:^|\\s)(?:أو|و)(?:\\s|$)|مواقع متعددة|موقعين",options:[.regularExpression,.caseInsensitive]) != nil
    }
    var applicationURL: URL? { Self.safeURL(applyUrl ?? url) }
    var sourceURL: URL? { Self.safeURL(sourceUrl ?? url) }
    var isExpired: Bool { Self.expired(closes) }
    var requirements: [String] { gaps ?? ["Confirm the complete degree, experience, location and seniority requirements on the employer website.","This lead was found by title and location. It has not had the full review of the researched shortlist."] }
    var applicationSteps: [[String]] { (steps ?? [["Read the official description","Check that the position is open and compare all mandatory requirements."],["Tailor your evidence","Use two actual achievements relevant to the responsibilities."],["Apply personally","Open the employer application, review your answers and attachments, then submit when ready."],["Keep the confirmation","Save the acknowledgement and update your application status."]]).filter { $0.count >= 2 } }
    static func safeURL(_ value: String) -> URL? {
        let hosts: Set<String> = ["apply.workable.com","alcon.wd5.myworkdayjobs.com","jj.wd5.myworkdayjobs.com","roche.wd3.myworkdayjobs.com","novartis.wd3.myworkdayjobs.com","gsk.wd5.myworkdayjobs.com","bdx.wd1.myworkdayjobs.com","www.careers.jnj.com","eenp.fa.em3.oraclecloud.com","efan.fa.em3.oraclecloud.com","careers.al-dawaa.com","www.linkedin.com","sa.linkedin.com"]
        guard let u=URL(string:value), u.scheme == "https", let host=u.host?.lowercased(), hosts.contains(host), u.user == nil, u.password == nil, u.port == nil || u.port == 443 else { return nil }
        if host == "apply.workable.com", u.path.range(of:"^/qiddiya-investment-company-1/j/[A-Za-z0-9]+(?:/apply)?/?$",options:.regularExpression)==nil {return nil}
        if host.hasSuffix(".oraclecloud.com"), u.path.range(of:"^/hcmUI/CandidateExperience/en/sites/CX_1/job/[0-9]+/?$",options:.regularExpression)==nil {return nil}
        if host == "careers.al-dawaa.com", !u.path.hasPrefix("/en/saudi-arabia/jobs/") {return nil}
        if host == "www.linkedin.com" || host == "sa.linkedin.com", u.path.range(of:"^/jobs/view/(?:[A-Za-z0-9-]+-)?[0-9]+/?$",options:.regularExpression)==nil {return nil}
        return u
    }
    static func expired(_ value: String?, today: String? = nil) -> Bool {
        guard let value, !value.isEmpty else { return false }
        guard let instant=CareerFeed.parsedDate(value) else { return true }
        if value.count == 10 { return value < (today ?? CareerFeed.saudiDay(Date())) }
        return instant < Date()
    }
}
struct PublicProfile: Codable { var name,role,organization,location,url:String; var facts,unknowns:[String] }
struct CareerResearch: Codable { var checkedAt:String;var jobs:[CareerJob];var profile:PublicProfile }
struct NativeProfile: Codable, Equatable {
    var years="";var degree="";var skills="";var achievements=""
    var preferredCity:String?
    var minimumMonthlySAR:String?
    var unknownSalary:String?
    var minimumMonthlyAmount:Double? {
        guard let amount=NativeMoney.parse(minimumMonthlySAR ?? "",limit:1_000_000),amount.rounded()==amount else {return nil}
        return amount
    }
    var criteriaError:String? {
        guard ["","riyadh"].contains(preferredCity ?? "") else {return "Choose any Saudi city or Riyadh."}
        guard ["show","hide"].contains(unknownSalary ?? "show") else {return "Choose whether to show or hide unverified salaries."}
        guard minimumMonthlyAmount != nil else {return "Enter a whole monthly SAR amount from 0 to 1,000,000, or leave blank."}
        return nil
    }
    var hasPayFloor:Bool { (minimumMonthlyAmount ?? 0)>0 }
    var hidesUnverifiedSalary:Bool { hasPayFloor && unknownSalary=="hide" }
    func includesInDiscovery(_ job:CareerJob)->Bool {
        (preferredCity != "riyadh" || job.hasRiyadhEvidence) && !hidesUnverifiedSalary
    }
    func criteriaMessages(for job:CareerJob)->[String] {
        var messages=[String]()
        if preferredCity=="riyadh" {
            if !job.hasRiyadhEvidence {messages.append("Outside current city criteria")}
            else if job.requiresRiyadhConfirmation {messages.append("Confirm Riyadh assignment")}
        }
        // Current feeds have no comparable, verified monthly pay evidence.
        if hasPayFloor {messages.append("Salary unverified — confirm your minimum")}
        return messages
    }
    var criteriaSummary:String {
        let city=preferredCity=="riyadh" ? "Riyadh" : "Any Saudi city"
        guard hasPayFloor,let amount=minimumMonthlyAmount else {return city+" · No pay floor"}
        return city+" · Minimum SAR \(Int(amount).formatted())/month · "+(hidesUnverifiedSalary ? "Unverified salaries hidden" : "Unverified salaries shown")
    }
}
struct EmployerStatus: Codable { var name:String;var ok:Bool;var count:Int;var scanned:Int?;var limited:Bool?;var error:String?;var detailErrors:Int?;var excludedIds:[String]?;var incomplete:Bool {!ok || (detailErrors ?? 0)>0 || !(error ?? "").isEmpty} }
struct LiveSnapshot: Codable { var checkedAt:String;var jobs:[CareerJob];var sources:[EmployerStatus] }
struct NativeWorkspace: Codable {
    var saved=Set<String>()
    var statuses=[String:String]()
    var snapshots=[String:CareerJob]()
    var profile=NativeProfile(preferredCity:"riyadh")
    var completed=Set<String>()
    var live:LiveSnapshot?
}

struct ApplicationRecord: Codable, Equatable {
    var schema=1
    var jobId:String
    var appliedAt=""
    var receiptNote=""
    var updatedAt:String
    static func timestamp(_ date:Date)->String {
        let format=ISO8601DateFormatter();format.formatOptions=[.withInternetDateTime,.withFractionalSeconds]
        return format.string(from:date)
    }
    func valid(for id:String,now:Date=Date())->Bool {
        guard schema==1,jobId==id,!id.trimmingCharacters(in:.whitespacesAndNewlines).isEmpty,id.utf16.count<=256,!["__proto__","constructor","prototype"].contains(id),receiptNote.unicodeScalars.count<=2000,
              let edited=CareerFeed.isoDate(updatedAt),Self.timestamp(edited)==updatedAt else {return false}
        return appliedAt.isEmpty || appliedAt.count==10 && CareerFeed.parsedDate(appliedAt) != nil && appliedAt<=CareerFeed.saudiDay(now)
    }
    var meaningful:Bool {!appliedAt.isEmpty || !receiptNote.trimmingCharacters(in:.whitespacesAndNewlines).isEmpty}
}
struct ApplicationRecordDraft {
    var job:CareerJob?
    var base:ApplicationRecord?
    var appliedAt=""
    var receiptNote=""
    var dirty:Bool {appliedAt != (base?.appliedAt ?? "") || receiptNote != (base?.receiptNote ?? "")}
}
struct ApplicationAttention: Identifiable {
    var job:CareerJob
    var kind:String
    var order:Int
    var deadline:Date?
    var id:String {job.id+":"+kind}
    var title:String {
        kind=="requirements" ? "Review the role requirements" : kind=="applied-date" ? "Application date not recorded — add it if known" : order==0 ? "Past listed deadline — verify employer status" : "Recheck listed deadline"
    }
}

@MainActor final class NativeCareerStore: ObservableObject {
    static let statuses=["Not started","Preparing","Applied","Interviewing","Offer received","Closed / not pursuing"]
    let research:CareerResearch
    @Published private(set) var workspace=NativeWorkspace()
    @Published var isSearching=false
    @Published var searchError:String?
    @Published var storageError:String?
    @Published private(set) var applicationRecords=[String:ApplicationRecord]()
    @Published private(set) var recordDrafts=[String:ApplicationRecordDraft]()
    @Published private(set) var recordErrors=[String:String]()
    private let storageURL:URL
    private var canWrite=true

    init(researchURL:URL? = Bundle.main.url(forResource:"CareerResearch",withExtension:"json"), storageURL:URL? = nil) {
        self.storageURL=storageURL ?? FileManager.default.urls(for:.applicationSupportDirectory,in:.userDomainMask)[0].appendingPathComponent("AhmadCareer/native-workspace.json")
        do {
            guard let researchURL else { throw CocoaError(.fileNoSuchFile) }
            var loaded=try JSONDecoder().decode(CareerResearch.self,from:Data(contentsOf:researchURL))
            loaded.jobs=loaded.jobs.map { job in
                var stamped=job;stamped.researchCheckedAt=job.researchCheckedAt ?? loaded.checkedAt;stamped.kind="researched"
                return stamped
            }
            research=loaded
        } catch {
            research=CareerResearch(checkedAt:"Unavailable",jobs:[],profile:PublicProfile(name:"Ahmad Alayed",role:"Healthcare supply chain",organization:"",location:"Saudi Arabia",url:"https://www.linkedin.com/in/ahmad-alayed-b91185b3",facts:[],unknowns:["The bundled research could not be loaded. Rebuild the app with CareerResearch.json."]))
            storageError="The research bundle is missing or unreadable."
        }
        if FileManager.default.fileExists(atPath:self.storageURL.path) {
            do { workspace=try JSONDecoder().decode(NativeWorkspace.self,from:Data(contentsOf:self.storageURL)) }
            catch {canWrite=false;storageError="Saved records could not be read. They have been preserved; no new changes will overwrite that file."}
        }
        if canWrite {
            let next=retainingKnownJobs(workspace)
            if next.snapshots != workspace.snapshots {commit(next)}
        }
        reloadApplicationRecords()
    }
    private func recordURL(_ id:String)->URL {
        let filename=SHA256.hash(data:Data(id.utf8)).map{String(format:"%02x",$0)}.joined()
        return storageURL.appendingPathExtension("application-records-v1").appendingPathComponent(filename+".json")
    }
    private func readApplicationRecord(_ id:String)throws->ApplicationRecord? {
        let url=recordURL(id)
        guard FileManager.default.fileExists(atPath:url.path) else {return nil}
        let data=try Data(contentsOf:url)
        guard let object=try JSONSerialization.jsonObject(with:data) as? [String:Any],Set(object.keys)==Set(["schema","jobId","appliedAt","receiptNote","updatedAt"]) else {throw CocoaError(.coderInvalidValue)}
        let value=try JSONDecoder().decode(ApplicationRecord.self,from:data)
        guard value.valid(for:id) else {throw CocoaError(.coderInvalidValue)}
        return value
    }
    func reloadApplicationRecords() {
        for job in allJobs {
            do {applicationRecords[job.id]=try readApplicationRecord(job.id);recordErrors[job.id]=nil}
            catch {recordErrors[job.id]="Stored application metadata could not be read. Original data is preserved; record saving is blocked."}
        }
    }
    func beginApplicationRecord(_ job:CareerJob,discardDraft:Bool=false) {
        let id=job.id
        if recordDrafts[id]?.dirty==true && !discardDraft {return}
        do {applicationRecords[id]=try readApplicationRecord(id);recordErrors[id]=nil}
        catch {recordErrors[id]="Stored application metadata could not be read. Original data is preserved; record saving is blocked."}
        let base=applicationRecords[id]
        recordDrafts[id]=ApplicationRecordDraft(job:current(job),base:base,appliedAt:base?.appliedAt ?? "",receiptNote:base?.receiptNote ?? "")
    }
    func editApplicationRecord(_ job:CareerJob,appliedAt:String,receiptNote:String) {
        if recordDrafts[job.id]==nil {beginApplicationRecord(job)}
        recordDrafts[job.id]?.appliedAt=appliedAt;recordDrafts[job.id]?.receiptNote=receiptNote
    }
    @discardableResult func saveApplicationRecord(_ job:CareerJob)->Bool {
        let id=job.id
        guard let draft=recordDrafts[id] else {return false}
        let value=ApplicationRecord(jobId:id,appliedAt:draft.appliedAt,receiptNote:draft.receiptNote,updatedAt:ApplicationRecord.timestamp(Date()))
        guard value.valid(for:id) else {recordErrors[id]="Use a real application date no later than today in Riyadh, or leave it blank. Notes allow 2,000 characters.";return false}
        do {
            // ponytail: MainActor serializes this app; detect external changes, not cross-process locking.
            let latest=try readApplicationRecord(id)
            guard latest==draft.base else {recordErrors[id]="This saved record changed. Your draft is preserved. Export it before reloading the saved version.";return false}
            var next=workspace;next.snapshots[id]=current(job)
            guard commit(next) else {recordErrors[id]="The opportunity could not be saved. Your record draft is preserved.";return false}
            let url=recordURL(id)
            try FileManager.default.createDirectory(at:url.deletingLastPathComponent(),withIntermediateDirectories:true)
            try JSONEncoder().encode(value).write(to:url,options:.atomic)
            applicationRecords[id]=value;recordDrafts[id]?.base=value;recordErrors[id]=nil
            return true
        } catch {recordErrors[id]="The record could not be read or saved. Original data and your session draft are preserved.";return false}
    }
    var recordJobs:[CareerJob] {allJobs.filter{status(for:$0) != "Not started" || applicationRecords[$0.id]?.meaningful==true}}
    func attention(at now:Date=Date())->[ApplicationAttention] {Self.attentionFor(allJobs.filter{isSaved($0)||status(for:$0) != "Not started"||applicationRecords[$0.id]?.meaningful==true},statuses:workspace.statuses,records:applicationRecords,now:now)}
    static func attentionFor(_ jobs:[CareerJob],statuses:[String:String],records:[String:ApplicationRecord],now:Date=Date())->[ApplicationAttention] {
        let today=CareerFeed.saudiDay(now),last=CareerFeed.saudiDay(now.addingTimeInterval(7*86400))
        var prompts=[ApplicationAttention]()
        for job in jobs {
            let status=statuses[job.id] ?? "Not started"
            if ["Applied","Interviewing","Offer received"].contains(status) {
                if records[job.id]?.valid(for:job.id,now:now) != true || records[job.id]?.appliedAt.isEmpty != false {prompts.append(ApplicationAttention(job:job,kind:"applied-date",order:2))}
            } else if ["Not started","Preparing"].contains(status) {
                let closing=job.closes.flatMap(CareerFeed.parsedDate),day=closing.map(CareerFeed.saudiDay)
                let dateOnly=job.closes?.count==10
                let past=closing.map{dateOnly ? (job.closes ?? "")<today : $0<now} ?? false
                if let closing,let day,past || day>=today && day<=last {prompts.append(ApplicationAttention(job:job,kind:"deadline",order:past ? 0:1,deadline:dateOnly ? closing.addingTimeInterval(86400-0.001):closing))}
                if !past {prompts.append(ApplicationAttention(job:job,kind:"requirements",order:3))}
            }
        }
        return prompts.sorted {a,b in
            if a.order != b.order {return a.order<b.order}
            if a.order==1,a.deadline != b.deadline {return (a.deadline ?? .distantFuture)<(b.deadline ?? .distantFuture)}
            return a.job.id<b.job.id
        }
    }
    func isCurrentResearch(_ job:CareerJob)->Bool { research.jobs.contains { $0.id == job.id } }
    private func healthcareLead(_ job:CareerJob)->Bool {
        CareerFeed.sources.contains { $0.name == job.company } && CareerFeed.relevant(job.title)
    }
    private var cachedEmployerJobs:[CareerJob] {cachedEmployerJobs(in:workspace)}
    private func cachedEmployerJobs(in value:NativeWorkspace)->[CareerJob] {
        guard let live=value.live else {return []}
        return live.jobs.filter { healthcareLead($0) && $0.isSaudi }.map { job in
            var stamped=job;stamped.lastCheckedAt=job.lastCheckedAt ?? live.checkedAt;return stamped
        }
    }
    func employerObservation(_ job:CareerJob)->CareerJob {
        [job,workspace.snapshots[job.id],cachedEmployerJobs.first(where:{$0.id==job.id})].compactMap{$0}.reduce(job) { latest,observation in
            (observation.lastCheckedAt.flatMap(CareerFeed.parsedDate) ?? .distantPast) > (latest.lastCheckedAt.flatMap(CareerFeed.parsedDate) ?? .distantPast) ? observation : latest
        }
    }
    func isUnrefreshed(_ job:CareerJob)->Bool {
        guard let snapshot=workspace.live, snapshot.sources.contains(where:{$0.name==job.company && $0.incomplete}),
              let observed=employerObservation(job).lastCheckedAt.flatMap(CareerFeed.parsedDate),let attempted=CareerFeed.parsedDate(snapshot.checkedAt) else {return false}
        return observed<attempted
    }
    var liveJobs:[CareerJob] {cachedEmployerJobs.filter {!$0.isExpired}}
    private func factsDate(_ job:CareerJob)->Date? { [job.lastCheckedAt,job.researchCheckedAt].compactMap{$0.flatMap(CareerFeed.parsedDate)}.max() }
    private func retainingEmployerObservation(_ facts:CareerJob,from observations:[CareerJob])->CareerJob {
        var result=facts
        for observation in observations where (observation.lastCheckedAt.flatMap(CareerFeed.parsedDate) ?? .distantPast) > (result.lastCheckedAt.flatMap(CareerFeed.parsedDate) ?? .distantPast) {result.lastCheckedAt=observation.lastCheckedAt}
        return result
    }
    private func mergeFacts(_ facts:CareerJob, editorial:CareerJob)->CareerJob {
        var current=facts
        current.rank=editorial.rank;current.fit=editorial.fit;current.summary=editorial.summary
        current.gaps=editorial.gaps;current.steps=editorial.steps;current.minYears=editorial.minYears
        current.healthcare=editorial.healthcare;current.leadership=editorial.leadership
        current.subtitle=editorial.subtitle;current.mode=current.mode ?? editorial.mode
        current.researchCheckedAt=editorial.researchCheckedAt;current.kind=editorial.kind
        return current
    }
    var shortlistJobs:[CareerJob] {shortlistJobs(in:workspace)}
    private func shortlistJobs(in value:NativeWorkspace)->[CareerJob] {research.jobs.map { editorial in
        var current=editorial
        let candidates=[value.snapshots[editorial.id], cachedEmployerJobs(in:value).first(where:{$0.id==editorial.id})].compactMap({$0})
        for candidate in candidates {
            if let checked=factsDate(candidate),checked > (factsDate(current) ?? .distantPast) {
                current=mergeFacts(candidate,editorial:editorial)
            }
        }
        return retainingEmployerObservation(current,from:candidates+[editorial])
    }}
    private var allJobs:[CareerJob] {
        var jobs=workspace.snapshots
        for job in cachedEmployerJobs {
            if let prior=jobs[job.id] {
                let facts=(factsDate(prior) ?? .distantPast) > (factsDate(job) ?? .distantPast) ? prior : ((prior.rank != nil || prior.kind == "archived" || prior.kind == "researched") ? mergeFacts(job,editorial:prior) : job)
                jobs[job.id]=retainingEmployerObservation(facts,from:[prior,job])
            } else {jobs[job.id]=job}
        }
        for job in shortlistJobs {jobs[job.id]=job}
        return jobs.values.map { job in
            var current=job
            if !isCurrentResearch(job),job.rank != nil || job.kind == "researched" || job.kind == "archived" {
                current.rank=nil;current.kind="archived"
            }
            return current
        }.sorted { ($0.rank ?? 999,$0.title) < ($1.rank ?? 999,$1.title) }
    }
    var savedJobs:[CareerJob] {allJobs.filter{workspace.saved.contains($0.id)}}
    var trackedJobs:[CareerJob] {allJobs.filter{status(for:$0) != "Not started"}}
    func current(_ job:CareerJob)->CareerJob {allJobs.first(where:{$0.id==job.id}) ?? job}
    func isSaved(_ job:CareerJob)->Bool {workspace.saved.contains(job.id)}
    func status(for job:CareerJob)->String {workspace.statuses[job.id] ?? "Not started"}
    func toggleSaved(_ job:CareerJob) {
        var next=workspace
        if next.saved.contains(job.id) {next.saved.remove(job.id)} else {next.saved.insert(job.id)}
        next.snapshots[job.id]=current(job)
        commit(next)
    }
    func setStatus(_ value:String,for job:CareerJob) {
        guard Self.statuses.contains(value) else {return}
        var next=workspace;next.statuses[job.id]=value;next.snapshots[job.id]=current(job);commit(next)
    }
    func updateProfile(_ value:NativeProfile) {
        var profile=value
        let years=profile.years.trimmingCharacters(in:.whitespacesAndNewlines).replacingOccurrences(of:",",with:".")
        if years.isEmpty {profile.years=""} else if let number=NativeMoney.parse(years,limit:60) {profile.years=number.rounded()==number ? String(Int(number)) : String(number)} else {storageError="Enter relevant experience between 0 and 60 years.";return}
        guard profile.degree.count<=300,profile.skills.count<=3000,profile.achievements.count<=5000 else {storageError="Profile text exceeds the field limit. Shorten it before saving; your existing profile is unchanged.";return}
        if let error=profile.criteriaError {storageError=error;return}
        if let minimum=profile.minimumMonthlySAR,let amount=profile.minimumMonthlyAmount {
            profile.minimumMonthlySAR=minimum.trimmingCharacters(in:.whitespacesAndNewlines).isEmpty ? "" : String(Int(amount))
        }
        var next=workspace;next.profile=profile;commit(next)
    }
    func setChecklist(_ id:String,done:Bool) {
        guard id.count<80 else {return};var next=workspace
        if done {next.completed.insert(id)} else {next.completed.remove(id)}
        commit(next)
    }
    private func retainingKnownJobs(_ value:NativeWorkspace)->NativeWorkspace {
        var next=value
        let observed=Set(cachedEmployerJobs(in:value).map(\.id))
        for job in shortlistJobs(in:value) where next.snapshots[job.id] != nil || next.saved.contains(job.id) || next.statuses[job.id] != nil || observed.contains(job.id) {
            next.snapshots[job.id]=job
        }
        return next
    }
    @discardableResult private func commit(_ value:NativeWorkspace)->Bool {
        guard canWrite else {storageError="Saved records could not be read. They have been preserved; no new changes will overwrite that file.";return false}
        let next=retainingKnownJobs(value)
        do {
            let data=try JSONEncoder().encode(next)
            try FileManager.default.createDirectory(at:storageURL.deletingLastPathComponent(),withIntermediateDirectories:true)
            try data.write(to:storageURL,options:.atomic)
            workspace=next;storageError=nil;return true
        } catch {storageError="This change could not be saved. Your previous records are intact. Check device storage and try again.";return false}
    }
    func refresh() async {
        guard !isSearching else {return};isSearching=true;searchError=nil
        defer {isSearching=false}
        acceptLive(await CareerFeed.refresh())
    }
    func acceptLive(_ payload:[String:Any],now:Date=Date()) {
        do {
            guard let checkedAt=payload["checkedAt"] as? String,let checked=CareerFeed.isoDate(checkedAt),checked<=now.addingTimeInterval(60),
                  let rows=payload["jobs"] as? [Any],rows.count<=1000,
                  let sourceRows=payload["sources"] as? [[String:Any]],sourceRows.count<=20 else {throw CocoaError(.coderInvalidValue)}
            let sources=try sourceRows.map { row -> EmployerStatus in
                let source=try JSONDecoder().decode(EmployerStatus.self,from:JSONSerialization.data(withJSONObject:row))
                guard !source.name.trimmingCharacters(in:.whitespacesAndNewlines).isEmpty,source.count>=0,(source.scanned ?? 0)>=0,(source.detailErrors ?? 0)>=0,(source.excludedIds?.count ?? 0)<=20,source.excludedIds?.allSatisfy({!$0.trimmingCharacters(in:.whitespacesAndNewlines).isEmpty && $0.count<=256}) ?? true else {throw CocoaError(.coderInvalidValue)}
                return source
            }
            if let previous=workspace.live.flatMap({CareerFeed.isoDate($0.checkedAt)}),checked<previous {
                searchError="An older employer response was ignored. Previous results are preserved.";return
            }
            guard sources.contains(where:{$0.ok}) else {
                let failures=sources.map{"\($0.name): \($0.error ?? "unavailable")"}.joined(separator:"\n")
                searchError="Employer search is unavailable. Previous results are preserved.\n"+failures;return
            }
            let valid=rows.compactMap { row -> CareerJob? in
                guard JSONSerialization.isValidJSONObject(row),let data=try? JSONSerialization.data(withJSONObject:row),
                      var job=try? JSONDecoder().decode(CareerJob.self,from:data),
                      !job.id.trimmingCharacters(in:.whitespacesAndNewlines).isEmpty,job.id.count<=256,
                      !job.title.trimmingCharacters(in:.whitespacesAndNewlines).isEmpty,
                      job.applicationURL != nil,job.isSaudi,
                      job.posted.isEmpty || CareerFeed.parsedDate(job.posted) != nil,
                      job.closes == nil || job.closes == "" || CareerFeed.parsedDate(job.closes!) != nil else {return nil}
                job.lastCheckedAt=checkedAt;job.researchCheckedAt=nil;job.rank=nil;job.kind="live"
                return job
            }
            if !rows.isEmpty && valid.isEmpty {searchError="The employer response contained no valid Saudi listings. Previous results are preserved.";return}
            let rejected=rows.count-valid.count
            var seen=Set<String>()
            var jobs=valid.filter { healthcareLead($0) && CareerFeed.dateIsEligible($0.posted,now:now,closing:false) && CareerFeed.dateIsEligible($0.closes ?? "",now:now,closing:true) && seen.insert($0.id).inserted }
            let failedNames=Set(sources.filter{$0.incomplete}.map(\.name))
            jobs += cachedEmployerJobs.filter { job in !seen.contains(job.id) && failedNames.contains(job.company) && !sources.contains(where:{$0.name==job.company && ($0.excludedIds ?? []).contains(job.id)}) && CareerFeed.dateIsEligible(job.posted,now:now,closing:false) && CareerFeed.dateIsEligible(job.closes ?? "",now:now,closing:true) }
            jobs=jobs.map{($0,CareerFeed.parsedDate($0.posted) ?? .distantPast)}.sorted {a,b in a.1 != b.1 ? a.1>b.1 : (a.0.title,a.0.id)<(b.0.title,b.0.id)}.map{ $0.0 }
            var next=workspace;next.live=LiveSnapshot(checkedAt:checkedAt,jobs:jobs,sources:sources)
            for job in jobs where next.snapshots[job.id] != nil || next.saved.contains(job.id) || next.statuses[job.id] != nil || isCurrentResearch(job) {
                let prior=next.snapshots[job.id]
                let editorial=research.jobs.first(where:{$0.id==job.id}) ?? prior.flatMap { $0.rank != nil || $0.kind == "archived" || $0.kind == "researched" ? $0 : nil }
                if (factsDate(prior ?? job) ?? .distantPast) <= (factsDate(job) ?? .distantPast) {next.snapshots[job.id]=editorial.map {mergeFacts(job,editorial:$0)} ?? job}
                if let facts=next.snapshots[job.id] {next.snapshots[job.id]=retainingEmployerObservation(facts,from:[prior,job].compactMap{$0})}
            }
            commit(next)
            let failed=sources.filter{$0.incomplete}
            var issues=[String]()
            if !failed.isEmpty {issues.append("Some employer checks were incomplete: "+failed.map(\.name).joined(separator:", ")+". Coverage may be incomplete.")}
            if rejected>0 {issues.append("\(rejected) invalid listings were excluded.")}
            searchError=issues.isEmpty ? nil : issues.joined(separator:" ")
        } catch {searchError="The search response could not be read. Previous results are preserved."}
    }
    private var profileText:String {
        "SELF-ENTERED PROFILE — verify before using\nRelevant years: \(workspace.profile.years.isEmpty ? "Not provided" : workspace.profile.years)\nDegree and certifications: \(workspace.profile.degree)\nTools and responsibilities: \(workspace.profile.skills)\nAchievements: \(workspace.profile.achievements)"
    }
    func note(for job:CareerJob,includeProfile:Bool=false)->String {
        let researchDate=job.researchCheckedAt ?? (isCurrentResearch(job) ? research.checkedAt : nil)
        let archived=job.kind == "archived" || (!isCurrentResearch(job) && job.rank != nil)
        let salary=researchDate.map { "Salary was not disclosed in the research checked \($0)." } ?? (archived ? "Original research check date is unavailable. Recheck salary." : "Salary was not checked for this live lead.")
        let history=archived ? "\nArchived saved research; this role is not in the current shortlist.\n" : ""
        return "APPLICATION PREPARATION — \(job.title)\n\(job.company) · \(job.location)\n\(job.applicationURL?.absoluteString ?? job.url)\(history)\n\nEmployer checked: \(employerObservation(job).lastCheckedAt ?? "Not recorded")\nListed deadline: \(job.closes?.isEmpty==false ? job.closes! : "Not published")\nDate-only deadlines use Riyadh calendar days. Past checks and listed deadlines do not establish current availability; recheck with the employer.\n\nFit: \(job.fit)\n\(job.summary)\n\nConfirm first:\n"+job.requirements.map{"• "+$0}.joined(separator:"\n")+"\n\nSteps:\n"+job.applicationSteps.enumerated().map{"\($0.offset+1). \($0.element[0]): \($0.element[1])"}.joined(separator:"\n\n")+(includeProfile ? "\n\n"+profileText : "")+"\n\nStatus: \(status(for:job))\n"+salary+" Review and submit personally on the employer website."
    }
    private func applicationRecordText(_ id:String)->String {
        let record=applicationRecords[id],draft=recordDrafts[id]
        var text="\nApplication date (self-entered): \(record?.appliedAt.isEmpty==false ? record!.appliedAt : "Not recorded")\nReceipt / record note (self-entered): \(record?.receiptNote ?? "Not recorded")"
        if let record {text += "\nRecord last edited (not application time): \(record.updatedAt)"}
        if let error=recordErrors[id] {text += "\nRecord notice: \(error)"}
        if let draft,draft.dirty {text += "\nUNSAVED application record draft\nApplication date: \(draft.appliedAt.isEmpty ? "Not recorded" : draft.appliedAt)\nReceipt / record note: \(draft.receiptNote)"}
        return text
    }
    func exportText()->String {
        let currentJobs=allJobs
        let draftJobs=recordDrafts.values.filter{$0.dirty}.compactMap(\.job).filter{j in !currentJobs.contains{$0.id==j.id}}
        let jobs=(currentJobs+draftJobs).filter{workspace.saved.contains($0.id)||status(for:$0) != "Not started"||applicationRecords[$0.id]?.meaningful==true||recordDrafts[$0.id]?.dirty==true}
        let labels=["profile":"Professional record", "evidence":"Achievement stories", "cv":"Two focused CVs", "priority":"Priority roles reviewed", "deadline":"Deadlines rechecked", "review":"Applications reviewed"]
        let checklist=labels.keys.sorted().map{(workspace.completed.contains($0) ? "[x] " : "[ ] ")+(labels[$0] ?? $0)}.joined(separator:"\n")
        return "AHMAD CAREER — Saudi Arabia\nCurrent shortlist research snapshot: \(research.checkedAt)\n\n"+profileText+"\n\nPREPARATION CHECKLIST\n"+checklist+"\n\nSAVED AND TRACKED APPLICATIONS\n\n"+jobs.map{note(for:$0,includeProfile:false)+applicationRecordText($0.id)}.joined(separator:"\n\n——————————\n\n")
    }
}

// Fixed input convention: comma groups thousands, dot (or Arabic decimal mark) separates cents.
enum NativeMoney {
    static func parse(_ text:String,limit:Double)->Double? {
        let trimmed=text.trimmingCharacters(in:.whitespacesAndNewlines)
        if trimmed.isEmpty {return 0}
        let normalized=String(trimmed.flatMap { character -> [Character] in
            if let number=character.wholeNumberValue,(0...9).contains(number) {return Array(String(number))}
            if character == "٫" {return ["."]}
            if character == "٬" {return [","]}
            return [character]
        })
        guard normalized.range(of:"^(?:[0-9]{1,3}(?:,[0-9]{3})+|[0-9]+)(?:\\.[0-9]{1,2})?$",options:.regularExpression) != nil,
              let value=Double(normalized.replacingOccurrences(of:",",with:"")),value.isFinite,value>=0,value<=limit else {return nil}
        return value
    }
}
