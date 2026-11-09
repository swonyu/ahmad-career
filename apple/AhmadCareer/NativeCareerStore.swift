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
    var relevance: Int?
    var subtitle: String?
    var mode: String?
    var postedKind: String?
    var experienceLevel: String?
    var employmentType: String?
    var requirementNotes: [String]?
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

    var publicationLabel:String {postedKind=="last-published" ? "Last published" : "Published"}
    var validEmployerMetadata:Bool {
        (postedKind==nil || ["published","last-published"].contains(postedKind!)) &&
        (experienceLevel?.utf16.count ?? 0)<=100 && (employmentType?.utf16.count ?? 0)<=100 &&
        (requirementNotes?.count ?? 0)<=6 && (requirementNotes?.allSatisfy{$0.utf16.count<=300} ?? true)
    }
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
        let hosts: Set<String> = ["apply.workable.com","alcon.wd5.myworkdayjobs.com","jj.wd5.myworkdayjobs.com","roche.wd3.myworkdayjobs.com","novartis.wd3.myworkdayjobs.com","gsk.wd5.myworkdayjobs.com","bdx.wd1.myworkdayjobs.com","www.careers.jnj.com","eenp.fa.em3.oraclecloud.com","efan.fa.em3.oraclecloud.com","careers.al-dawaa.com","www.linkedin.com","sa.linkedin.com","jobs.ashbyhq.com","job-boards.eu.greenhouse.io","jobs.unifonic.com"]
        guard let u=URL(string:value), u.scheme == "https", let host=u.host?.lowercased(), hosts.contains(host), u.user == nil, u.password == nil, u.port == nil || u.port == 443 else { return nil }
        if host == "apply.workable.com", u.path.range(of:"^/(qiddiya-investment-company-1|mozn-ai|lucidya|foodics|salla)/j/[A-Za-z0-9]{1,64}(?:/apply)?/?$",options:.regularExpression)==nil {return nil}
        if host == "jobs.ashbyhq.com", u.path.range(of:#"^/LeanTech/[a-f0-9-]{36}(?:/application)?/?$"#,options:[.regularExpression,.caseInsensitive])==nil {return nil}
        if host == "job-boards.eu.greenhouse.io", u.path.range(of:#"^/tamara/jobs/[0-9]{1,20}/?$"#,options:.regularExpression)==nil {return nil}
        if host == "jobs.unifonic.com", u.path.range(of:#"^/o/[a-z0-9][a-z0-9-]{0,199}/?$"#,options:[.regularExpression,.caseInsensitive])==nil {return nil}
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
struct NativeDiscoveryOptions: Equatable {
    var company=""
    var days=0
    var employmentType=""
    var hideTracked=false
    var isActive:Bool {!company.isEmpty || days != 0 || !employmentType.isEmpty || hideTracked}
    func includes(_ job:CareerJob,tracked:Bool=false,now:Date=Date())->Bool {
        guard company.isEmpty || job.company==company,employmentType.isEmpty || job.employmentType==employmentType,!hideTracked || !tracked else{return false}
        if days>0 {
            guard let age=Self.ageInSaudiDays(job.posted,now:now),age>=0,age<days else{return false}
        }
        return true
    }
    static func ageInSaudiDays(_ value:String,now:Date=Date())->Int? {
        guard let parsed=CareerFeed.parsedDate(value) else{return nil}
        var calendar=Calendar(identifier:.gregorian)
        calendar.timeZone=TimeZone(identifier:"Asia/Riyadh")!
        return calendar.dateComponents([.day],from:calendar.startOfDay(for:parsed),to:calendar.startOfDay(for:now)).day
    }
}
struct NativeApplicationGroup:Identifiable {
    var status:String
    var jobs:[CareerJob]
    var id:String {status}
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
struct EmployerStatus: Codable { var name:String;var ok:Bool;var count:Int;var scanned:Int?;var limited:Bool?;var error:String?;var detailErrors:Int?;var excludedIds:[String]?;var incomplete:Bool {!ok || limited == true || (detailErrors ?? 0)>0 || !(error ?? "").isEmpty} }
// Local comparison of consecutive result lists, never a claim about a vacancy's creation date.
struct SearchComparison: Codable, Equatable {
    var schema=1
    var previousCheckedAt:String?
    var checkedAt:String
    var addedIds:[String]
    private enum CodingKeys:String,CodingKey {case schema,previousCheckedAt,checkedAt,addedIds}
    init(previousCheckedAt:String?,checkedAt:String,addedIds:[String]) {
        self.previousCheckedAt=previousCheckedAt;self.checkedAt=checkedAt;self.addedIds=addedIds
    }
    init(from decoder:Decoder)throws {
        let values=try decoder.container(keyedBy:CodingKeys.self)
        schema=try values.decode(Int.self,forKey:.schema)
        guard values.contains(.previousCheckedAt) else {throw CocoaError(.coderInvalidValue)}
        previousCheckedAt=try values.decodeIfPresent(String.self,forKey:.previousCheckedAt)
        checkedAt=try values.decode(String.self,forKey:.checkedAt)
        addedIds=try values.decode([String].self,forKey:.addedIds)
    }
    func encode(to encoder:Encoder)throws {
        var values=encoder.container(keyedBy:CodingKeys.self)
        try values.encode(schema,forKey:.schema)
        try values.encode(previousCheckedAt,forKey:.previousCheckedAt)
        try values.encode(checkedAt,forKey:.checkedAt)
        try values.encode(addedIds,forKey:.addedIds)
    }
    func valid(checkedAt:String,jobs:[CareerJob])->Bool {
        guard schema==1,let fetched=CareerFeed.isoDate(self.checkedAt),let checked=CareerFeed.isoDate(checkedAt),fetched==checked,
              addedIds.count<=1000,Set(addedIds).count==addedIds.count,
              addedIds.allSatisfy({!$0.trimmingCharacters(in:.whitespacesAndNewlines).isEmpty && $0.utf16.count<=256}),
              Set(addedIds).isSubset(of:Set(jobs.map(\.id))) else {return false}
        if let previousCheckedAt {guard let previous=CareerFeed.isoDate(previousCheckedAt),previous<fetched else {return false}}
        else if !addedIds.isEmpty {return false}
        return true
    }
}
struct LiveSnapshot: Codable {
    var checkedAt:String
    var jobs:[CareerJob]
    var sources:[EmployerStatus]
    var searchComparison:SearchComparison?
    init(checkedAt:String,jobs:[CareerJob],sources:[EmployerStatus],searchComparison:SearchComparison?=nil) {
        self.checkedAt=checkedAt;self.jobs=jobs;self.sources=sources;self.searchComparison=searchComparison
    }
    private enum CodingKeys:String,CodingKey {case checkedAt,jobs,sources,searchComparison}
    init(from decoder:Decoder)throws {
        let values=try decoder.container(keyedBy:CodingKeys.self)
        checkedAt=try values.decode(String.self,forKey:.checkedAt)
        jobs=try values.decode([CareerJob].self,forKey:.jobs)
        sources=try values.decode([EmployerStatus].self,forKey:.sources)
        // Optional view metadata cannot make saved jobs or application history unreadable.
        let candidate=try? values.decode(SearchComparison.self,forKey:.searchComparison)
        searchComparison=candidate?.valid(checkedAt:checkedAt,jobs:jobs)==true ? candidate : nil
    }
}
struct NativeWorkspace: Codable {
    var saved=Set<String>()
    var statuses=[String:String]()
    var snapshots=[String:CareerJob]()
    var profile=NativeProfile(preferredCity:"riyadh")
    var completed=Set<String>()
    var live:LiveSnapshot?
    var importedApplicationRecords:[String:ApplicationRecord]?
    var importedNextActions:[String:NextActionRecord]?
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
// Private, user-entered planning is separate from application evidence and its schema.
struct NextActionRecord: Codable, Equatable {
    var schema=1
    var jobId:String
    var dueOn=""
    var actionNote=""
    var completed=false
    var updatedAt:String
    var meaningful:Bool {!actionNote.trimmingCharacters(in:.whitespacesAndNewlines).isEmpty}
    func valid(for id:String)->Bool {
        guard schema==1,jobId==id,!id.trimmingCharacters(in:.whitespacesAndNewlines).isEmpty,
              id.utf16.count<=256,!["__proto__","constructor","prototype"].contains(id),
              actionNote.unicodeScalars.count<=500,
              let edited=CareerFeed.isoDate(updatedAt),ApplicationRecord.timestamp(edited)==updatedAt,
              dueOn.isEmpty || dueOn.range(of:"^[0-9]{4}-[0-9]{2}-[0-9]{2}$",options:.regularExpression) != nil && dueOn.count==10 && CareerFeed.parsedDate(dueOn) != nil else {return false}
        return meaningful || dueOn.isEmpty && !completed
    }
    func group(at now:Date)->String {
        if completed {return "Completed"}
        if dueOn.isEmpty {return "No due date"}
        let today=CareerFeed.saudiDay(now)
        var calendar=Calendar(identifier:.gregorian);calendar.timeZone=TimeZone(identifier:"Asia/Riyadh")!
        let last=CareerFeed.saudiDay(calendar.date(byAdding:.day,value:7,to:now)!)
        return dueOn<today ? "Overdue" : dueOn==today ? "Today" : dueOn<=last ? "Next 7 days" : "Upcoming"
    }
}
struct NextActionDraft {
    var job:CareerJob?
    var base:NextActionRecord?
    var dueOn=""
    var actionNote=""
    var completed=false
    var dirty:Bool {dueOn != (base?.dueOn ?? "") || actionNote != (base?.actionNote ?? "") || completed != (base?.completed ?? false)}
}
struct NextActionGroup:Identifiable {
    var title:String
    var jobs:[CareerJob]
    var id:String {title}
}

struct ApplicationAttention: Identifiable {
    var job:CareerJob
    var kind:String
    var order:Int
    var deadline:Date?
    var id:String {job.id+":"+kind}
    var title:String {
        kind=="uncertain" ? "Verify the employer account or receipt before retrying" : kind=="requirements" ? "Review the role requirements" : kind=="applied-date" ? "Application date not recorded — add it if known" : order==0 ? "Past listed deadline — verify employer status" : "Recheck listed deadline"
    }
}

@MainActor final class NativeCareerStore: ObservableObject {
    static let statuses=["Not started","Preparing","Submission uncertain","Applied","Interviewing","Offer received","Closed / not pursuing"]
    #if CAREER_PREVIEW
    static let storageDirectoryName="CareerFinderPreview"
    #else
    static let storageDirectoryName="AhmadCareer"
    #endif
    let research:CareerResearch
    @Published private(set) var workspace=NativeWorkspace()
    @Published var isSearching=false
    @Published var searchError:String?
    @Published var searchNotice:String?
    @Published var storageError:String?
    @Published private(set) var applicationRecords=[String:ApplicationRecord]()
    @Published private(set) var recordDrafts=[String:ApplicationRecordDraft]()
    @Published private(set) var recordErrors=[String:String]()
    @Published private(set) var nextActions=[String:NextActionRecord]()
    @Published private(set) var nextActionDrafts=[String:NextActionDraft]()
    @Published private(set) var nextActionErrors=[String:String]()
    private let storageURL:URL
    private var canWrite=true
    private var diskWorkspace:Data?

    init(researchURL:URL? = Bundle.main.url(forResource:"CareerResearch",withExtension:"json"), storageURL:URL? = nil) {
        self.storageURL=storageURL ?? FileManager.default.urls(for:.applicationSupportDirectory,in:.userDomainMask)[0].appendingPathComponent(Self.storageDirectoryName).appendingPathComponent("native-workspace.json")
        do {
            guard let researchURL else { throw CocoaError(.fileNoSuchFile) }
            var loaded=try JSONDecoder().decode(CareerResearch.self,from:Data(contentsOf:researchURL))
            loaded.jobs=loaded.jobs.map { job in
                var stamped=job;stamped.researchCheckedAt=job.researchCheckedAt ?? loaded.checkedAt;stamped.kind="researched"
                return stamped
            }
            research=loaded
        } catch {
            research=CareerResearch(checkedAt:"Unavailable",jobs:[],profile:PublicProfile(name:"Your name",role:"Your professional focus",organization:"",location:"",url:"",facts:[],unknowns:["The bundled research could not be loaded. Rebuild the app with CareerResearch.json."]))
            storageError="The research bundle is missing or unreadable."
        }
        if FileManager.default.fileExists(atPath:self.storageURL.path) {
            do {let data=try Data(contentsOf:self.storageURL);workspace=try JSONDecoder().decode(NativeWorkspace.self,from:data);diskWorkspace=data}
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
        guard FileManager.default.fileExists(atPath:url.path) else {return workspace.importedApplicationRecords?[id]}
        let data=try Data(contentsOf:url)
        guard let object=try JSONSerialization.jsonObject(with:data) as? [String:Any],Set(object.keys)==Set(["schema","jobId","appliedAt","receiptNote","updatedAt"]) else {throw CocoaError(.coderInvalidValue)}
        let value=try JSONDecoder().decode(ApplicationRecord.self,from:data)
        guard value.valid(for:id) else {throw CocoaError(.coderInvalidValue)}
        return value
    }
    func reloadApplicationRecords() {
        reloadNextActions()
        for job in allJobs {
            do {applicationRecords[job.id]=try readApplicationRecord(job.id);recordErrors[job.id]=nil}
            catch {recordErrors[job.id]="Stored application metadata could not be read. Original data is preserved; record saving is blocked."}
        }
    }
    private func reloadWorkspaceForRecord()throws {
        guard canWrite else {throw NativeBackupError.unreadable}
        if try workspaceMatchesDisk() {return}
        let data=try Data(contentsOf:storageURL)
        let latest=try JSONDecoder().decode(NativeWorkspace.self,from:data)
        workspace=latest;diskWorkspace=data;storageError=nil
    }
    func beginApplicationRecord(_ job:CareerJob,discardDraft:Bool=false) {
        let id=job.id
        if recordDrafts[id]?.dirty==true && !discardDraft {return}
        if discardDraft {do {try reloadWorkspaceForRecord()} catch {recordErrors[id]="The latest workspace could not be loaded. Your draft is preserved.";return}}
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
    private func nextActionURL(_ id:String)->URL {
        let filename=SHA256.hash(data:Data(id.utf8)).map{String(format:"%02x",$0)}.joined()
        return storageURL.appendingPathExtension("next-action-v1").appendingPathComponent(filename+".json")
    }
    private func readNextAction(_ id:String)throws->NextActionRecord? {
        let url=nextActionURL(id)
        guard FileManager.default.fileExists(atPath:url.path) else {return workspace.importedNextActions?[id]}
        let data=try Data(contentsOf:url)
        guard let object=try JSONSerialization.jsonObject(with:data) as? [String:Any],
              Set(object.keys)==Set(["schema","jobId","dueOn","actionNote","completed","updatedAt"]) else {throw CocoaError(.coderInvalidValue)}
        let value=try JSONDecoder().decode(NextActionRecord.self,from:data)
        guard value.valid(for:id) else {throw CocoaError(.coderInvalidValue)}
        return value
    }
    func reloadNextActions() {
        for job in allJobs {
            do {nextActions[job.id]=try readNextAction(job.id);nextActionErrors[job.id]=nil}
            catch {nextActionErrors[job.id]="Stored next action could not be read. Original data is preserved; saving is blocked."}
        }
    }
    func beginNextAction(_ job:CareerJob,discardDraft:Bool=false) {
        let id=job.id
        if nextActionDrafts[id]?.dirty==true && !discardDraft {return}
        if discardDraft {do {try reloadWorkspaceForRecord()} catch {nextActionErrors[id]="The latest workspace could not be loaded. Your draft is preserved.";return}}
        do {nextActions[id]=try readNextAction(id);nextActionErrors[id]=nil}
        catch {nextActionErrors[id]="Stored next action could not be read. Original data is preserved; saving is blocked."}
        let base=nextActions[id]
        nextActionDrafts[id]=NextActionDraft(job:current(job),base:base,dueOn:base?.dueOn ?? "",actionNote:base?.actionNote ?? "",completed:base?.completed ?? false)
    }
    func editNextAction(_ job:CareerJob,dueOn:String,actionNote:String,completed:Bool) {
        if nextActionDrafts[job.id]==nil {beginNextAction(job)}
        nextActionDrafts[job.id]?.dueOn=dueOn;nextActionDrafts[job.id]?.actionNote=actionNote;nextActionDrafts[job.id]?.completed=completed
    }
    @discardableResult func saveNextAction(_ job:CareerJob)->Bool {
        let id=job.id
        guard let draft=nextActionDrafts[id] else {return false}
        let value=NextActionRecord(jobId:id,dueOn:draft.dueOn,actionNote:draft.actionNote,completed:draft.completed,updatedAt:ApplicationRecord.timestamp(Date()))
        guard value.valid(for:id) else {nextActionErrors[id]="Use a real YYYY-MM-DD due date or leave it blank, and a note up to 500 Unicode characters. A due date or completed action needs a nonblank note.";return false}
        do {
            // MainActor serializes app edits; optimistic comparison detects prior external writes, not cross-process locking.
            guard try readNextAction(id)==draft.base else {nextActionErrors[id]="This next action changed. Your draft is preserved. Export it before reloading the saved version.";return false}
            var next=workspace;next.snapshots[id]=current(job)
            guard commit(next) else {nextActionErrors[id]="The opportunity could not be saved. Your next-action draft is preserved.";return false}
            let url=nextActionURL(id)
            try FileManager.default.createDirectory(at:url.deletingLastPathComponent(),withIntermediateDirectories:true)
            try JSONEncoder().encode(value).write(to:url,options:.atomic)
            nextActions[id]=value;nextActionDrafts[id]?.base=value;nextActionErrors[id]=nil
            return true
        } catch {nextActionErrors[id]="The next action could not be read or saved. Original data and your session draft are preserved.";return false}
    }
    func nextActionGroups(at now:Date=Date())->[NextActionGroup] {
        ["Overdue","Today","Next 7 days","Upcoming","No due date","Completed"].map { title in
            NextActionGroup(title:title,jobs:allJobs.filter {nextActions[$0.id]?.meaningful==true && nextActions[$0.id]?.group(at:now)==title}.sorted {
                let a=nextActions[$0.id]?.dueOn ?? "",b=nextActions[$1.id]?.dueOn ?? ""
                return a==b ? $0.id<$1.id : a<b
            })
        }.filter{!$0.jobs.isEmpty}
    }
    var recordJobs:[CareerJob] {allJobs.filter{hasApplicationRecord($0) || nextActions[$0.id]?.meaningful==true || nextActionErrors[$0.id] != nil}}
    func hasApplicationRecord(_ job:CareerJob)->Bool {
        status(for:job) != "Not started" || applicationRecords[job.id]?.meaningful==true
    }
    var applicationGroups:[NativeApplicationGroup] {
        let order=["Submission uncertain","Preparing","Applied","Interviewing","Offer received","Closed / not pursuing","Not started"]
        let other=Set(recordJobs.map{status(for:$0)}).subtracting(order).sorted()
        return (order+other).map{status in NativeApplicationGroup(status:status,jobs:recordJobs.filter{self.status(for:$0)==status})}.filter{!$0.jobs.isEmpty}
    }
    func applicationWarnings(for job:CareerJob)->[String] {
        var messages=[String]()
        if hasApplicationRecord(job) {
            messages.append(status(for:job)=="Submission uncertain" ? "Submission is uncertain. Check the employer account or receipt before trying again." : "This role already has a local application record. Review it before applying again.")
        }
        let others=allJobs.filter{$0.id != job.id && $0.company.lowercased()==job.company.lowercased() && hasApplicationRecord($0)}
        if !others.isEmpty {messages.append("You are tracking \(others.count) other role\(others.count==1 ? "" : "s") at \(job.company). Check any company or program application rules. Different roles are not automatically duplicates.")}
        return messages
    }
    func attention(at now:Date=Date())->[ApplicationAttention] {Self.attentionFor(allJobs.filter{isSaved($0)||status(for:$0) != "Not started"||applicationRecords[$0.id]?.meaningful==true},statuses:workspace.statuses,records:applicationRecords,now:now)}
    static func attentionFor(_ jobs:[CareerJob],statuses:[String:String],records:[String:ApplicationRecord],now:Date=Date())->[ApplicationAttention] {
        let today=CareerFeed.saudiDay(now),last=CareerFeed.saudiDay(now.addingTimeInterval(7*86400))
        var prompts=[ApplicationAttention]()
        for job in jobs {
            let status=statuses[job.id] ?? "Not started"
            if status=="Submission uncertain" {
                prompts.append(ApplicationAttention(job:job,kind:"uncertain",order:-1))
            } else if ["Applied","Interviewing","Offer received"].contains(status) {
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
    private func technologyLead(_ job:CareerJob)->Bool {
        (CareerFeed.sources.contains { $0.name == job.company } || CareerFeed.activeSourceNames.contains(job.company)) && CareerFeed.relevant(job.title)
    }
    private var cachedEmployerJobs:[CareerJob] {cachedEmployerJobs(in:workspace)}
    private func cachedEmployerJobs(in value:NativeWorkspace)->[CareerJob] {
        guard let live=value.live else {return []}
        return live.jobs.filter { technologyLead($0) && $0.isSaudi }.map { job in
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
    var searchComparison:SearchComparison? {workspace.live?.searchComparison}
    func isAddedToLatestResults(_ job:CareerJob)->Bool {searchComparison?.addedIds.contains(job.id)==true && liveJobs.contains{$0.id==job.id}}
    var searchChangeSummary:String {
        guard let comparison=searchComparison else {return workspace.live == nil ? "Run a search to establish a result-list baseline." : "No comparison is recorded for this saved search. Run another search to compare result lists."}
        guard let previous=comparison.previousCheckedAt else {return "First successful search: baseline saved. No earlier result list is available to compare."}
        return "\(comparison.addedIds.count) added to the result list since \(previous). Compared with the successful search at \(comparison.checkedAt)."
    }
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
    private func workspaceMatchesDisk()throws->Bool {
        let current=FileManager.default.fileExists(atPath:storageURL.path) ? try Data(contentsOf:storageURL) : nil
        if current==diskWorkspace {return true}
        // Re-encoding an identical workspace may change dictionary/set ordering.
        // Compare raw JSON fields so unknown future fields cannot be discarded.
        func canonical(_ data:Data)throws->Data {
            guard var object=try JSONSerialization.jsonObject(with:data) as? [String:Any] else {throw NativeBackupError.unreadable}
            for key in ["saved","completed"] {if let values=object[key] as? [String] {object[key]=values.sorted()}}
            return try JSONSerialization.data(withJSONObject:object,options:[.sortedKeys])
        }
        guard let current,let prior=diskWorkspace,try canonical(current)==canonical(prior) else {return false}
        diskWorkspace=current;return true
    }
    @discardableResult private func commit(_ value:NativeWorkspace)->Bool {
        guard canWrite else {storageError="Saved records could not be read. They have been preserved; no new changes will overwrite that file.";return false}
        let next=retainingKnownJobs(value)
        do {
            guard try workspaceMatchesDisk() else {storageError="Another app instance changed saved records. Export your unsaved drafts, then reopen this app before saving. Existing disk records were preserved.";return false}
            let data=try JSONEncoder().encode(next)
            try FileManager.default.createDirectory(at:storageURL.deletingLastPathComponent(),withIntermediateDirectories:true)
            try data.write(to:storageURL,options:.atomic)
            workspace=next;diskWorkspace=data;storageError=nil;return true
        } catch {storageError="This change could not be saved. Your previous records are intact. Check device storage and try again.";return false}
    }
    func refresh() async {
        guard !isSearching else {return};isSearching=true;searchError=nil
        defer {isSearching=false}
        acceptLive(await CareerFeed.refresh())
    }
    func acceptLive(_ payload:[String:Any],now:Date=Date()) {
        searchNotice=nil
        do {
            guard let checkedAt=payload["checkedAt"] as? String,let checked=CareerFeed.isoDate(checkedAt),checked<=now.addingTimeInterval(60),
                  let rows=payload["jobs"] as? [Any],rows.count<=1000,
                  let sourceRows=payload["sources"] as? [[String:Any]],sourceRows.count<=20 else {throw CocoaError(.coderInvalidValue)}
            let sources=try sourceRows.map { row -> EmployerStatus in
                let source=try JSONDecoder().decode(EmployerStatus.self,from:JSONSerialization.data(withJSONObject:row))
                guard !source.name.trimmingCharacters(in:.whitespacesAndNewlines).isEmpty,source.count>=0,(source.scanned ?? 0)>=0,(source.detailErrors ?? 0)>=0,(source.excludedIds?.count ?? 0)<=500,source.excludedIds?.allSatisfy({!$0.trimmingCharacters(in:.whitespacesAndNewlines).isEmpty && $0.utf16.count<=256}) ?? true else {throw CocoaError(.coderInvalidValue)}
                return source
            }
            guard sources.contains(where:{$0.ok}) else {
                let failures=sources.map{"\($0.name): \($0.error ?? "unavailable")"}.joined(separator:"\n")
                searchError="Employer search is unavailable. Previous results are preserved.\n"+failures;return
            }
            if let previous=workspace.live.flatMap({CareerFeed.isoDate($0.checkedAt)}),checked<=previous {
                if checked==previous {
                    searchNotice="No newer search snapshot is available. Results and their original comparison are unchanged."
                    searchError=workspace.live?.sources.contains(where:{$0.incomplete})==true ? "Some employer checks in the saved search were incomplete. Review source coverage below." : nil
                } else {searchError="An older employer response was ignored. Previous results are preserved."}
                return
            }
            let valid=rows.compactMap { row -> CareerJob? in
                guard JSONSerialization.isValidJSONObject(row),let data=try? JSONSerialization.data(withJSONObject:row),
                      var job=try? JSONDecoder().decode(CareerJob.self,from:data),
                      !job.id.trimmingCharacters(in:.whitespacesAndNewlines).isEmpty,job.id.utf16.count<=256,
                      !job.title.trimmingCharacters(in:.whitespacesAndNewlines).isEmpty,
                      job.applicationURL != nil,job.isSaudi,job.validEmployerMetadata,
                      job.posted.isEmpty || CareerFeed.parsedDate(job.posted) != nil,
                      job.closes == nil || job.closes == "" || CareerFeed.parsedDate(job.closes!) != nil else {return nil}
                job.lastCheckedAt=checkedAt;job.researchCheckedAt=nil;job.rank=nil;job.kind="live"
                return job
            }
            if !rows.isEmpty && valid.isEmpty {searchError="The employer response contained no valid Saudi listings. Previous results are preserved.";return}
            let rejected=rows.count-valid.count
            var seen=Set<String>()
            var jobs=valid.filter { technologyLead($0) && CareerFeed.dateIsEligible($0.posted,now:now,closing:false) && CareerFeed.dateIsEligible($0.closes ?? "",now:now,closing:true) && seen.insert($0.id).inserted }
            let failedNames=Set(sources.filter{$0.incomplete}.map(\.name))
            jobs += cachedEmployerJobs.filter { job in !seen.contains(job.id) && failedNames.contains(job.company) && !sources.contains(where:{$0.name==job.company && ($0.excludedIds ?? []).contains(job.id)}) && CareerFeed.dateIsEligible(job.posted,now:now,closing:false) && CareerFeed.dateIsEligible(job.closes ?? "",now:now,closing:true) && seen.insert(job.id).inserted }
            jobs=jobs.map{($0,CareerFeed.parsedDate($0.posted) ?? .distantPast)}.sorted {a,b in (a.0.relevance ?? CareerFeed.relevance(a.0.title)) != (b.0.relevance ?? CareerFeed.relevance(b.0.title)) ? (a.0.relevance ?? CareerFeed.relevance(a.0.title)) > (b.0.relevance ?? CareerFeed.relevance(b.0.title)) : a.1 != b.1 ? a.1>b.1 : (a.0.title,a.0.id)<(b.0.title,b.0.id)}.map{ $0.0 }
            guard jobs.count<=1000 else {searchError="The combined result list exceeded the local capacity. Previous results and comparison are preserved.";return}
            let previousIDs=Set(cachedEmployerJobs.map(\.id))
            let comparison=SearchComparison(previousCheckedAt:workspace.live?.checkedAt,checkedAt:checkedAt,addedIds:workspace.live == nil ? [] : jobs.filter{!previousIDs.contains($0.id)}.map(\.id))
            var next=workspace;next.live=LiveSnapshot(checkedAt:checkedAt,jobs:jobs,sources:sources,searchComparison:comparison)
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
        let employerEvidence="\n\nEmployer-listed clues (not proof of eligibility):\nExperience level: \(job.experienceLevel.flatMap{$0.isEmpty ? nil:$0} ?? "Not stated")\nEmployment type: \(job.employmentType ?? "Not stated")\nWork arrangement: \(job.mode ?? "Not stated")\n\(job.publicationLabel): \(job.posted.isEmpty ? "Not stated" : job.posted)\n"+((job.requirementNotes ?? []).isEmpty ? "Requirement excerpts unavailable. Read the full employer description." : (job.requirementNotes ?? []).map{"• "+$0}.joined(separator:"\n"))
        let warnings=applicationWarnings(for:job).joined(separator:"\n")
        return "APPLICATION PREPARATION — \(job.title)\n\(job.company) · \(job.location)\n\(job.applicationURL?.absoluteString ?? job.url)\(history)\n\nEmployer checked: \(employerObservation(job).lastCheckedAt ?? "Not recorded")\nListed deadline: \(job.closes?.isEmpty==false ? job.closes! : "Not published")\nDate-only deadlines use Riyadh calendar days. Past checks and listed deadlines do not establish current availability; recheck with the employer.\n\nFit: \(job.fit)\n\(job.summary)\n\nConfirm first:\n"+job.requirements.map{"• "+$0}.joined(separator:"\n")+"\n\nSteps:\n"+job.applicationSteps.enumerated().map{"\($0.offset+1). \($0.element[0]): \($0.element[1])"}.joined(separator:"\n\n")+(includeProfile ? "\n\n"+profileText : "")+"\n\nStatus: \(status(for:job))\n"+salary+" Review and submit personally on the employer website."+employerEvidence+(warnings.isEmpty ? "" : "\n\nLocal tracking advisories:\n"+warnings)
    }
    private func applicationRecordText(_ id:String)->String {
        let record=applicationRecords[id],draft=recordDrafts[id]
        var text="\nApplication date (self-entered): \(record?.appliedAt.isEmpty==false ? record!.appliedAt : "Not recorded")\nReceipt / record note (self-entered): \(record?.receiptNote ?? "Not recorded")"
        if let record {text += "\nRecord last edited (not application time): \(record.updatedAt)"}
        if let error=recordErrors[id] {text += "\nRecord notice: \(error)"}
        if let draft,draft.dirty {text += "\nUNSAVED application record draft\nApplication date: \(draft.appliedAt.isEmpty ? "Not recorded" : draft.appliedAt)\nReceipt / record note: \(draft.receiptNote)"}
        return text
    }
    private func nextActionText(_ id:String)->String {
        var text=""
        if let record=nextActions[id] {
            text += "\nNext action (self-entered local plan): \(record.actionNote)\nDue date (Riyadh): \(record.dueOn.isEmpty ? "Not set" : record.dueOn)\nCompleted: \(record.completed ? "Yes" : "No")\nNext action last edited: \(record.updatedAt)"
        }
        if let error=nextActionErrors[id] {text += "\nNext-action notice: \(error)"}
        if let draft=nextActionDrafts[id],draft.dirty {
            text += "\nUNSAVED next-action draft\nNext action: \(draft.actionNote)\nDue date (Riyadh): \(draft.dueOn.isEmpty ? "Not set" : draft.dueOn)\nCompleted: \(draft.completed ? "Yes" : "No")"
        }
        return text
    }
    func exportText()->String {
        let currentJobs=allJobs
        let draftCandidates=recordDrafts.values.filter{$0.dirty}.compactMap(\.job)+nextActionDrafts.values.filter{$0.dirty}.compactMap(\.job)
        var seen=Set(currentJobs.map(\.id))
        let draftJobs=draftCandidates.filter{seen.insert($0.id).inserted}
        let jobs=(currentJobs+draftJobs).filter{workspace.saved.contains($0.id)||status(for:$0) != "Not started"||applicationRecords[$0.id]?.meaningful==true||recordDrafts[$0.id]?.dirty==true||nextActions[$0.id]?.meaningful==true||nextActionDrafts[$0.id]?.dirty==true||nextActionErrors[$0.id] != nil}
        let labels=["profile":"Professional record", "evidence":"Achievement stories", "cv":"Two focused CVs", "priority":"Priority roles reviewed", "deadline":"Deadlines rechecked", "review":"Applications reviewed"]
        let checklist=labels.keys.sorted().map{(workspace.completed.contains($0) ? "[x] " : "[ ] ")+(labels[$0] ?? $0)}.joined(separator:"\n")
        return "SALEH CAREER FINDER — Saudi Arabia\nCurrent shortlist research snapshot: \(research.checkedAt)\n\n"+profileText+"\n\nPREPARATION CHECKLIST\n"+checklist+"\n\nSAVED AND TRACKED APPLICATIONS\n\n"+jobs.map{note(for:$0,includeProfile:false)+applicationRecordText($0.id)+nextActionText($0.id)}.joined(separator:"\n\n——————————\n\n")
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

struct NativeBackupEnvelope:Codable {
    struct Workspace:Codable {var saved:[String];var states:[String:String];var savedDetails:[String:CareerJob]}
    var format="saleh-career-workspace"
    var schema=1
    var exportedAt:String
    var platform="native"
    var workspace:Workspace
    var profile:[String:String]
    var checklist:[String:Bool]
    var applicationRecords:[ApplicationRecord]
    var nextActions:[NextActionRecord]
}
struct NativeRestorePreview {
    fileprivate var envelope:NativeBackupEnvelope
    fileprivate var fingerprint:Data
    let additions:Int
    let conflicts:Int
    let skipped:Int
    var summary:String {"\(additions) additions; \(conflicts) existing values preserved; \(skipped) profile/checklist fields skipped. Existing profile, checklist, receipts and plans will not be overwritten."}
}
enum NativeBackupError:LocalizedError {
    case invalid,changed,unreadable
    var errorDescription:String? {
        switch self {
        case .invalid:return "This is not a supported private workspace backup, or it exceeds the limits. Nothing was changed."
        case .changed:return "Saved data changed after the preview. Create a new preview before restoring."
        case .unreadable:return "Saved data could not be read or written safely. Nothing was restored."
        }
    }
}
extension NativeCareerStore {
    static let backupLimit=4*1024*1024
    private static func backupID(_ id:String)->Bool { !id.trimmingCharacters(in:.whitespacesAndNewlines).isEmpty && id.utf16.count<=256 && !["__proto__","prototype","constructor"].contains(id) }
    static func decodeBackup(_ data:Data,now:Date=Date())throws->NativeBackupEnvelope {
        guard data.count<=backupLimit,String(data:data,encoding:.utf8) != nil,
              let raw=try JSONSerialization.jsonObject(with:data) as? [String:Any],
              Set(raw.keys)==Set(["format","schema","exportedAt","platform","workspace","profile","checklist","applicationRecords","nextActions"]),
              let w=raw["workspace"] as? [String:Any],Set(w.keys)==Set(["saved","states","savedDetails"]),
              let profile=raw["profile"] as? [String:String],Set(profile.keys).isSubset(of:Set(["years","degree","skills","achievements","preferredCity","minimumMonthlySAR","unknownSalary"])) else {throw NativeBackupError.invalid}
        let value=try JSONDecoder().decode(NativeBackupEnvelope.self,from:data)
        guard value.format=="saleh-career-workspace",value.schema==1,["native","web"].contains(value.platform),
              let exported=CareerFeed.isoDate(value.exportedAt),exported<=now,
              value.workspace.saved.count<=1000,Set(value.workspace.saved).count==value.workspace.saved.count,
              value.workspace.saved.allSatisfy(backupID),value.workspace.states.count<=1000,
              value.workspace.states.allSatisfy({backupID($0.key) && statuses.contains($0.value)}),
              value.workspace.savedDetails.count<=1000,value.applicationRecords.count<=1000,value.nextActions.count<=1000,
              value.checklist.count<=100,value.checklist.keys.allSatisfy({backupID($0) && $0.count<80}) else {throw NativeBackupError.invalid}
        let jobKeys=Set("id title company location url posted fit summary rank relevance subtitle mode postedKind experienceLevel employmentType requirementNotes closes applyUrl sourceUrl gaps steps minYears healthcare leadership kind lastCheckedAt researchCheckedAt".split(separator:" ").map(String.init))
        guard let jobRows=w["savedDetails"] as? [String:[String:Any]],jobRows.values.allSatisfy({Set($0.keys).isSubset(of:jobKeys)}) else {throw NativeBackupError.invalid}
        for (id,job) in value.workspace.savedDetails {
            guard backupID(id),id==job.id,!job.title.trimmingCharacters(in:.whitespacesAndNewlines).isEmpty,
                  CareerJob.safeURL(job.url) != nil,job.applyUrl.map({CareerJob.safeURL($0) != nil}) ?? true,job.sourceUrl.map({CareerJob.safeURL($0) != nil}) ?? true,
                  job.validEmployerMetadata,job.isSaudi,job.posted.isEmpty || CareerFeed.parsedDate(job.posted) != nil,
                  job.closes == nil || job.closes == "" || CareerFeed.parsedDate(job.closes!) != nil else {throw NativeBackupError.invalid}
        }
        for (key,fields) in [("applicationRecords",Set(["schema","jobId","appliedAt","receiptNote","updatedAt"])),("nextActions",Set(["schema","jobId","dueOn","actionNote","completed","updatedAt"]))] {
            guard let rows=raw[key] as? [[String:Any]],rows.allSatisfy({Set($0.keys)==fields}) else {throw NativeBackupError.invalid}
        }
        guard Set(value.applicationRecords.map(\.jobId)).count==value.applicationRecords.count,
              Set(value.nextActions.map(\.jobId)).count==value.nextActions.count,
              value.applicationRecords.allSatisfy({$0.valid(for:$0.jobId,now:now) && (CareerFeed.isoDate($0.updatedAt) ?? .distantFuture)<=now}),
              value.nextActions.allSatisfy({$0.valid(for:$0.jobId) && (CareerFeed.isoDate($0.updatedAt) ?? .distantFuture)<=now}) else {throw NativeBackupError.invalid}
        let references=Set(value.workspace.saved).union(value.workspace.states.keys).union(value.applicationRecords.map(\.jobId)).union(value.nextActions.map(\.jobId))
        guard references.isSubset(of:Set(value.workspace.savedDetails.keys)) else {throw NativeBackupError.invalid}
        return value
    }
    private func backupFingerprint()throws->Data {
        guard canWrite else {throw NativeBackupError.unreadable}
        guard try workspaceMatchesDisk() else {throw NativeBackupError.changed}
        let encoder=JSONEncoder();encoder.outputFormatting=[.sortedKeys]
        func canonical(_ value:NativeWorkspace)throws->Data {
            var object=try JSONSerialization.jsonObject(with:encoder.encode(value)) as! [String:Any]
            object["saved"]=value.saved.sorted();object["completed"]=value.completed.sorted()
            return try JSONSerialization.data(withJSONObject:object,options:[.sortedKeys])
        }
        var data=try canonical(workspace)
        if FileManager.default.fileExists(atPath:storageURL.path) {
            let disk=try JSONDecoder().decode(NativeWorkspace.self,from:Data(contentsOf:storageURL))
            guard try canonical(disk)==data else {throw NativeBackupError.changed}
        }
        // Include every sidecar, including unreadable/orphaned files, to detect external changes.
        for url in [storageURL,storageURL.appendingPathExtension("application-records-v1"),storageURL.appendingPathExtension("next-action-v1")] {
            if FileManager.default.fileExists(atPath:url.path) {
                var directory:ObjCBool=false;FileManager.default.fileExists(atPath:url.path,isDirectory:&directory)
                let files=directory.boolValue ? try FileManager.default.contentsOfDirectory(at:url,includingPropertiesForKeys:nil).sorted{$0.path<$1.path} : [url]
                for file in files {data.append(Data(file.lastPathComponent.utf8));data.append(try Data(contentsOf:file))}
            } else {data.append(Data("missing:\(url.lastPathComponent)".utf8))}
        }
        return Data(SHA256.hash(data:data))
    }
    func privateBackupData(now:Date=Date())throws->Data {
        _=try backupFingerprint()
        let ids=Set(workspace.snapshots.keys).union(workspace.saved).union(workspace.statuses.keys)
        for (directory,known) in [(storageURL.appendingPathExtension("application-records-v1"),Set(ids.map{recordURL($0).lastPathComponent})),(storageURL.appendingPathExtension("next-action-v1"),Set(ids.map{nextActionURL($0).lastPathComponent}))] {
            if FileManager.default.fileExists(atPath:directory.path) {
                let files=try FileManager.default.contentsOfDirectory(atPath:directory.path)
                guard Set(files).isSubset(of:known) else {throw NativeBackupError.unreadable}
            }
        }
        return try portableBackupData(for:workspace,now:now)
    }
    private func portableBackupData(for candidate:NativeWorkspace,now:Date=Date())throws->Data {
        let ids=Set(candidate.snapshots.keys).union(candidate.saved).union(candidate.statuses.keys)
        var records=[ApplicationRecord](),actions=[NextActionRecord](),details=[String:CareerJob]()
        for id in ids.sorted() {
            guard let job=candidate.snapshots[id] ?? allJobs.first(where:{$0.id==id}) else {throw NativeBackupError.unreadable}
            details[id]=job
            if let record=try readApplicationRecord(id) ?? candidate.importedApplicationRecords?[id] {records.append(record)}
            if let action=try readNextAction(id) ?? candidate.importedNextActions?[id] {actions.append(action)}
        }
        var profile=try JSONDecoder().decode([String:String].self,from:JSONEncoder().encode(candidate.profile))
        if let years=profile["years"],!years.trimmingCharacters(in:.whitespacesAndNewlines).isEmpty,let number=NativeMoney.parse(years,limit:60) {profile["years"]=String(number)}
        if let raw=profile["minimumMonthlySAR"],!raw.trimmingCharacters(in:.whitespacesAndNewlines).isEmpty,let amount=candidate.profile.minimumMonthlyAmount {profile["minimumMonthlySAR"]=String(Int(amount))}
        let envelope=NativeBackupEnvelope(exportedAt:ApplicationRecord.timestamp(now.addingTimeInterval(-0.001)),workspace:.init(saved:candidate.saved.sorted(),states:candidate.statuses,savedDetails:details),profile:profile,checklist:Dictionary(uniqueKeysWithValues:candidate.completed.map{($0,true)}),applicationRecords:records,nextActions:actions)
        let encoder=JSONEncoder();encoder.outputFormatting=[.prettyPrinted,.sortedKeys]
        let data=try encoder.encode(envelope);_=try Self.decodeBackup(data,now:now);return data
    }
    private func restoringWorkspace(_ envelope:NativeBackupEnvelope)throws->NativeWorkspace {
        var next=workspace
        for (id,job) in envelope.workspace.savedDetails where next.snapshots[id]==nil {next.snapshots[id]=job}
        next.saved.formUnion(envelope.workspace.saved)
        for (id,status) in envelope.workspace.states where next.statuses[id]==nil {next.statuses[id]=status}
        for r in envelope.applicationRecords where try readApplicationRecord(r.jobId)==nil {if next.importedApplicationRecords==nil {next.importedApplicationRecords=[:]};next.importedApplicationRecords?[r.jobId]=r}
        for r in envelope.nextActions where try readNextAction(r.jobId)==nil {if next.importedNextActions==nil {next.importedNextActions=[:]};next.importedNextActions?[r.jobId]=r}
        return next
    }
    func previewBackup(_ data:Data)throws->NativeRestorePreview {
        let envelope=try Self.decodeBackup(data)
        let fingerprint=try backupFingerprint()
        _=try privateBackupData()
        _=try portableBackupData(for:restoringWorkspace(envelope))
        var additions=0,conflicts=0
        for id in envelope.workspace.savedDetails.keys {if workspace.snapshots[id]==nil {additions+=1} else {conflicts+=1}}
        for id in envelope.workspace.saved {if !workspace.saved.contains(id) {additions+=1} else {conflicts+=1}}
        for id in envelope.workspace.states.keys {if workspace.statuses[id]==nil {additions+=1} else {conflicts+=1}}
        for r in envelope.applicationRecords {if try readApplicationRecord(r.jobId)==nil {additions+=1} else {conflicts+=1}}
        for r in envelope.nextActions {if try readNextAction(r.jobId)==nil {additions+=1} else {conflicts+=1}}
        return NativeRestorePreview(envelope:envelope,fingerprint:fingerprint,additions:additions,conflicts:conflicts,skipped:envelope.profile.count+envelope.checklist.count)
    }
    func applyBackup(_ preview:NativeRestorePreview)throws {
        guard try backupFingerprint()==preview.fingerprint else {throw NativeBackupError.changed}
        _=try Self.decodeBackup(JSONEncoder().encode(preview.envelope))
        let next=try restoringWorkspace(preview.envelope)
        _=try portableBackupData(for:next)
        let original=try privateBackupData()
        let encoder=JSONEncoder()
        let data=try encoder.encode(next)
        guard next.snapshots.count<=1000,next.saved.count<=1000,next.statuses.count<=1000,
              (next.importedApplicationRecords?.count ?? 0)<=1000,(next.importedNextActions?.count ?? 0)<=1000,
              data.count<=Self.backupLimit else {throw NativeBackupError.invalid}
        try FileManager.default.createDirectory(at:storageURL.deletingLastPathComponent(),withIntermediateDirectories:true)
        // Immutable recovery copy first. Imported records live in the same atomic workspace transaction.
        try original.write(to:storageURL.appendingPathExtension("before-restore-"+UUID().uuidString+".json"),options:.atomic)
        guard try backupFingerprint()==preview.fingerprint else {throw NativeBackupError.changed}
        try data.write(to:storageURL,options:.atomic)
        workspace=next;diskWorkspace=data;reloadApplicationRecords();storageError=nil
    }
}
