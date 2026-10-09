import Foundation
import Combine

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
    var hasRiyadhEvidence:Bool { location.range(of:"(?:^|[^\\p{L}])(?:riyadh|الرياض)(?=$|[^\\p{L}])",options:[.regularExpression,.caseInsensitive]) != nil }
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
struct EmployerStatus: Codable { var name:String;var ok:Bool;var count:Int;var scanned:Int?;var limited:Bool?;var error:String?;var detailErrors:Int? }
struct LiveSnapshot: Codable { var checkedAt:String;var jobs:[CareerJob];var sources:[EmployerStatus] }
struct NativeWorkspace: Codable {
    var saved=Set<String>()
    var statuses=[String:String]()
    var snapshots=[String:CareerJob]()
    var profile=NativeProfile()
    var completed=Set<String>()
    var live:LiveSnapshot?
}

@MainActor final class NativeCareerStore: ObservableObject {
    static let statuses=["Not started","Preparing","Applied","Interviewing","Offer received","Closed / not pursuing"]
    let research:CareerResearch
    @Published private(set) var workspace=NativeWorkspace()
    @Published var isSearching=false
    @Published var searchError:String?
    @Published var storageError:String?
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
    }
    func isCurrentResearch(_ job:CareerJob)->Bool { research.jobs.contains { $0.id == job.id } }
    private func healthcareLead(_ job:CareerJob)->Bool {
        CareerFeed.sources.contains { $0.name == job.company } && CareerFeed.relevant(job.title)
    }
    var liveJobs:[CareerJob] {
        guard let live=workspace.live else {return []}
        return live.jobs.filter { healthcareLead($0) && $0.isSaudi && !$0.isExpired }.map { job in
            var stamped=job;stamped.lastCheckedAt=job.lastCheckedAt ?? live.checkedAt;return stamped
        }
    }
    private func factsDate(_ job:CareerJob)->Date? { (job.lastCheckedAt ?? job.researchCheckedAt).flatMap(CareerFeed.parsedDate) }
    private func mergeFacts(_ facts:CareerJob, editorial:CareerJob)->CareerJob {
        var current=facts
        current.rank=editorial.rank;current.fit=editorial.fit;current.summary=editorial.summary
        current.gaps=editorial.gaps;current.steps=editorial.steps;current.minYears=editorial.minYears
        current.healthcare=editorial.healthcare;current.leadership=editorial.leadership
        current.subtitle=editorial.subtitle;current.mode=current.mode ?? editorial.mode
        current.researchCheckedAt=editorial.researchCheckedAt;current.kind=editorial.kind
        return current
    }
    var shortlistJobs:[CareerJob] {research.jobs.map { editorial in
        var current=editorial
        for candidate in [workspace.snapshots[editorial.id], liveJobs.first(where:{$0.id==editorial.id})].compactMap({$0}) {
            if let checked=factsDate(candidate),checked > (factsDate(current) ?? .distantPast) {
                current=mergeFacts(candidate,editorial:editorial)
            }
        }
        return current
    }}
    private var allJobs:[CareerJob] {
        var jobs=workspace.snapshots
        for job in liveJobs {
            if let prior=jobs[job.id] {
                if (factsDate(prior) ?? .distantPast) > (factsDate(job) ?? .distantPast) {continue}
                jobs[job.id]=(prior.rank != nil || prior.kind == "archived" || prior.kind == "researched") ? mergeFacts(job,editorial:prior) : job
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
    private func commit(_ next:NativeWorkspace) {
        guard canWrite else {return}
        do {
            let data=try JSONEncoder().encode(next)
            try FileManager.default.createDirectory(at:storageURL.deletingLastPathComponent(),withIntermediateDirectories:true)
            try data.write(to:storageURL,options:.atomic)
            workspace=next;storageError=nil
        } catch {storageError="This change could not be saved. Your previous records are intact. Check device storage and try again."}
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
                guard !source.name.trimmingCharacters(in:.whitespacesAndNewlines).isEmpty,source.count>=0,(source.scanned ?? 0)>=0,(source.detailErrors ?? 0)>=0 else {throw CocoaError(.coderInvalidValue)}
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
            let jobs=valid.filter { healthcareLead($0) && CareerFeed.dateIsEligible($0.posted,now:now,closing:false) && CareerFeed.dateIsEligible($0.closes ?? "",now:now,closing:true) && seen.insert($0.id).inserted }.sorted { ($0.posted,$0.title) > ($1.posted,$1.title) }
            var next=workspace;next.live=LiveSnapshot(checkedAt:checkedAt,jobs:jobs,sources:sources)
            for job in jobs where next.snapshots[job.id] != nil || next.saved.contains(job.id) || next.statuses[job.id] != nil {
                let prior=next.snapshots[job.id]
                let editorial=research.jobs.first(where:{$0.id==job.id}) ?? prior.flatMap { $0.rank != nil || $0.kind == "archived" || $0.kind == "researched" ? $0 : nil }
                next.snapshots[job.id]=editorial.map {mergeFacts(job,editorial:$0)} ?? job
            }
            commit(next)
            let failed=sources.filter{!$0.ok || ($0.detailErrors ?? 0)>0 || $0.error != nil}
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
        return "APPLICATION PREPARATION — \(job.title)\n\(job.company) · \(job.location)\n\(job.applicationURL?.absoluteString ?? job.url)\(history)\n\nFit: \(job.fit)\n\(job.summary)\n\nConfirm first:\n"+job.requirements.map{"• "+$0}.joined(separator:"\n")+"\n\nSteps:\n"+job.applicationSteps.enumerated().map{"\($0.offset+1). \($0.element[0]): \($0.element[1])"}.joined(separator:"\n\n")+(includeProfile ? "\n\n"+profileText : "")+"\n\nStatus: \(status(for:job))\n"+salary+" Review and submit personally on the employer website."
    }
    func exportText()->String {
        let jobs=allJobs.filter{workspace.saved.contains($0.id)||status(for:$0) != "Not started"}
        let labels=["profile":"Professional record", "evidence":"Achievement stories", "cv":"Two focused CVs", "priority":"Priority roles reviewed", "deadline":"Deadlines rechecked", "review":"Applications reviewed"]
        let checklist=labels.keys.sorted().map{(workspace.completed.contains($0) ? "[x] " : "[ ] ")+(labels[$0] ?? $0)}.joined(separator:"\n")
        return "AHMAD CAREER — Saudi Arabia\nResearch snapshot: \(research.checkedAt)\n\n"+profileText+"\n\nPREPARATION CHECKLIST\n"+checklist+"\n\nSAVED AND TRACKED APPLICATIONS\n\n"+jobs.map{note(for:$0,includeProfile:false)}.joined(separator:"\n\n——————————\n\n")
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
