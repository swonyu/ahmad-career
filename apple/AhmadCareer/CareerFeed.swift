import Foundation
import CoreFoundation

struct WorkdaySource {
    let name: String
    let host: String
    let tenant: String
    let board: String

    var baseURL: URL { URL(string: "https://\(host)/wday/cxs/\(tenant)/\(board)")! }
}

enum CareerFeed {
    static let sourceBudgetNanoseconds: UInt64 = 45_000_000_000
    static let sources = [
        WorkdaySource(name: "Alcon", host: "alcon.wd5.myworkdayjobs.com", tenant: "alcon", board: "careers_alcon"),
        WorkdaySource(name: "Novartis", host: "novartis.wd3.myworkdayjobs.com", tenant: "novartis", board: "Novartis_Careers"),
        WorkdaySource(name: "Johnson & Johnson", host: "jj.wd5.myworkdayjobs.com", tenant: "jj", board: "JJ"),
        WorkdaySource(name: "GSK", host: "gsk.wd5.myworkdayjobs.com", tenant: "gsk", board: "GSKCareers"),
        WorkdaySource(name: "BD", host: "bdx.wd1.myworkdayjobs.com", tenant: "bdx", board: "EXTERNAL_CAREER_SITE_SAUDI_ARABIA"),
        WorkdaySource(name: "Roche", host: "roche.wd3.myworkdayjobs.com", tenant: "roche", board: "roche-ext")
    ]

    static func detailURL(_ path: String, source: WorkdaySource) -> URL? {
        guard path.hasPrefix("/job/"), let decoded = path.removingPercentEncoding,
              !decoded.contains("?"), !decoded.contains("#"), !decoded.contains("\\"),
              !decoded.contains("%"), !decoded.unicodeScalars.contains(where: { $0.value < 32 || $0.value == 127 }), !decoded.split(separator: "/").contains(where: { $0 == ".." || $0 == "." }) else { return nil }
        return URL(string: source.baseURL.absoluteString + path)
    }

    static func relevant(_ title: String) -> Bool { relevance(title) > 0 }

    static func relevance(_ title: String) -> Int {
        let excluded = #"\b(senior|sr\.?|lead|principal|staff|manager|director|head|chief|vp|vice[ -]president|sales|pre[ -]?sales|clinical)\b"#
        guard title.range(of: excluded, options: [.regularExpression, .caseInsensitive]) == nil else { return 0 }
        let relevant = #"software|developer|python|machine[ -]learning|artificial[ -]intelligence|\bAI\b|full[ -]?stack|front[ -]?end|back[ -]?end|\bios\b|\bswift\b|\bswiftui\b|\bandroid\b|\bmobile[ -](engineer|developer)\b|automation|devops|site[ -]reliability|cloud[ -](platform|native|engineer)|database[ -]administrator|techops|data[ -](analyst|engineer|scientist)|builders[ -]program.*data|quality[ -]assurance|\bQA\b|مطور|برمجيات|ذكاء اصطناعي|محلل بيانات"#
        guard title.range(of: relevant, options: [.regularExpression, .caseInsensitive]) != nil else { return 0 }
        return title.range(of: #"junior|entry[ -]level|graduate|intern|trainee|associate|himmah|tamheer|builders[ -]program"#, options: [.regularExpression, .caseInsensitive]) != nil ? 95 : 80
    }

    static func qiddiyaJob(_ listing: [String: Any], now: Date = Date()) -> [String: Any]? {
        guard listing["state"] as? String == "published", listing["isInternal"] as? Bool == false,
              let code = listing["shortcode"] as? String, !code.isEmpty,
              code.range(of: "^[A-Za-z0-9]+$", options: .regularExpression) != nil,
              let title = listing["title"] as? String,
              relevant(title),
              let location = listing["location"] as? [String: Any], location["countryCode"] as? String == "SA",
              let published = listing["published"] as? String,
              let date = isoDate(published), date <= now else { return nil }
        let city = location["city"] as? String ?? "Saudi Arabia"
        return [
            "id": "qiddiya-\(code)", "title": title, "company": "Qiddiya", "location": city == "Saudi Arabia" ? city : city + ", Saudi Arabia",
            "url": "https://apply.workable.com/qiddiya-investment-company-1/j/\(code)/",
            "posted": published, "postedKind": "published", "closes": NSNull(), "status": "live", "salary": NSNull(),
            "kind": "live", "fit": "Needs review",
            "summary": "New employer listing. Review full requirements before applying."
        ]
    }

    static func saudiDay(_ date: Date) -> String {
        let format = dayFormatter()
        return format.string(from: date)
    }

    private static func dayFormatter() -> DateFormatter {
        let format = DateFormatter()
        format.locale = Locale(identifier: "en_US_POSIX")
        format.calendar = Calendar(identifier: .gregorian)
        format.timeZone = TimeZone(identifier: "Asia/Riyadh")
        format.dateFormat = "yyyy-MM-dd"
        format.isLenient = false
        return format
    }

    static func parsedDate(_ value: String) -> Date? {
        if value.count != 10 { return isoDate(value) }
        let format = dayFormatter()
        guard let date = format.date(from: value), format.string(from: date) == value else { return nil }
        return date
    }

    static func isoDate(_ value: String) -> Date? {
        let grammar = "^[0-9]{4}-[0-9]{2}-[0-9]{2}T(?:[01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9](?:\\.[0-9]+)?(?:Z|[+-](?:[01][0-9]|2[0-3]):[0-5][0-9])\\z"
        guard value.count <= 80, value.range(of: grammar, options: .regularExpression) != nil,
              parsedDate(String(value.prefix(10))) != nil else { return nil }
        let format = ISO8601DateFormatter()
        format.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return format.date(from: value) ?? ISO8601DateFormatter().date(from: value)
    }

    static func dateIsEligible(_ value: String, now: Date, closing: Bool) -> Bool {
        if value.isEmpty { return true }
        guard let parsed = parsedDate(value) else { return false }
        if value.count == 10 { return closing ? value >= saudiDay(now) : value <= saudiDay(now) }
        return closing ? parsed >= now : parsed <= now
    }

    private static func strictBool(_ value: Any?) -> Bool? {
        guard let number = value as? NSNumber, CFGetTypeID(number) == CFBooleanGetTypeID() else { return nil }
        return number.boolValue
    }

    private static func validOptionalDate(_ value: Any?) -> Bool {
        guard let value, !(value is NSNull) else { return true }
        guard let text = value as? String else { return false }
        return text.isEmpty || parsedDate(text) != nil
    }

    private static func validDetail(_ detail: [String: Any]) -> Bool {
        guard let title = detail["title"] as? String, !title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
              let id = detail["jobReqId"] as? String, !id.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
              strictBool(detail["canApply"]) != nil,
              validOptionalDate(detail["startDate"]), validOptionalDate(detail["endDate"]) else { return false }
        if let posted = detail["posted"], !(posted is NSNull), strictBool(posted) == nil { return false }
        if let location = detail["location"], !(location is NSNull), !(location is String) { return false }
        if let country = detail["country"], !(country is NSNull) {
            guard let fields = country as? [String: Any] else { return false }
            if let descriptor = fields["descriptor"], !(descriptor is NSNull), !(descriptor is String) { return false }
        }
        return true
    }

    static func job(_ detail: [String: Any], externalPath: String, source: WorkdaySource, now: Date = Date()) -> [String: Any]? {
        guard validDetail(detail), detailURL(externalPath, source: source) != nil,
              strictBool(detail["canApply"]) == true,
              detail["posted"] as? Bool != false,
              let title = detail["title"] as? String, relevant(title),
              let identifier = detail["jobReqId"] as? String, !identifier.isEmpty else { return nil }
        let location = detail["location"] as? String ?? ""
        let country = ((detail["country"] as? [String: Any])?["descriptor"] as? String ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        let saudiCountry = ["saudi arabia", "kingdom of saudi arabia", "sa", "sau", "السعودية", "المملكة العربية السعودية"].contains(country.lowercased())
        // Country is authoritative; a title slug mentioning Saudi is not geography.
        if !country.isEmpty {
            guard saudiCountry else { return nil }
        } else {
            guard location.range(of: "Saudi|Riyadh|Jeddah|Dammam|Khobar|\\bSAU\\b|الرياض|جدة|السعودية", options: [.regularExpression, .caseInsensitive]) != nil else { return nil }
        }
        let deadline = detail["endDate"] as? String
        if let deadline, !dateIsEligible(deadline, now: now, closing: true) { return nil }
        let startDate = detail["startDate"] as? String ?? ""
        guard dateIsEligible(startDate, now: now, closing: false) else { return nil }
        var displayLocation = location.isEmpty ? country : location
        if saudiCountry,
           displayLocation.range(of: "Saudi|Riyadh|Jeddah|Dammam|Khobar|\\bSAU\\b|الرياض|جدة|السعودية", options: [.regularExpression, .caseInsensitive]) == nil {
            displayLocation += ", Saudi Arabia"
        }
        let fallback = "https://\(source.host)/en-US/\(source.board)\(externalPath)"
        let candidate = (detail["externalUrl"] as? String).flatMap(URL.init(string:))
        let url = candidate?.scheme == "https" && candidate?.host == source.host ? candidate!.absoluteString : fallback
        return [
            "id": "\(source.tenant)-\(identifier)", "title": title, "company": source.name,
            "location": displayLocation, "url": url,
            "posted": startDate, "postedKind": "published", "closes": deadline.flatMap { $0.isEmpty ? nil : $0 } as Any? ?? NSNull(),
            "status": "live", "salary": NSNull(), "kind": "live", "fit": "Needs review",
            "healthcare": true, "leadership": title.range(of: "\\b(manager|director|head|lead)\\b", options: [.regularExpression, .caseInsensitive]) != nil, "relevance": relevance(title),
            "summary": "New employer listing. Review full requirements before applying."
        ]
    }

    struct PublicSource {
        let name:String
        let kind:String
        let board:String
        var url:URL {
            if kind == "smartrecruiters" { return URL(string: "https://api.smartrecruiters.com/v1/companies/\(board)/postings?country=sa&limit=100&offset=0")! }
            let value=kind=="recruitee" ? "https://unifonic.recruitee.com/api/offers/" : kind=="workable" ? "https://apply.workable.com/api/v1/widget/accounts/\(board)" : kind=="ashby" ? "https://api.ashbyhq.com/posting-api/job-board/\(board)" : "https://boards-api.greenhouse.io/v1/boards/\(board)/jobs?content=true"
            return URL(string:value)!
        }
    }
    static let publicSources=[
        PublicSource(name:"Mozn",kind:"workable",board:"mozn-ai"),
        PublicSource(name:"Lucidya",kind:"workable",board:"lucidya"),
        PublicSource(name:"Foodics",kind:"workable",board:"foodics"),
        PublicSource(name:"Salla",kind:"workable",board:"salla"),
        PublicSource(name:"Lean Technologies",kind:"ashby",board:"LeanTech"),
        PublicSource(name:"Tamara",kind:"greenhouse",board:"tamara"),
        PublicSource(name:"Unifonic",kind:"recruitee",board:"unifonic")
    ]
    static let smartSources = [
        PublicSource(name: "Devoteam", kind: "smartrecruiters", board: "Devoteam"),
        PublicSource(name: "Delivery Hero", kind: "smartrecruiters", board: "DeliveryHero")
    ]
    static var activeSourceNames:[String] {(publicSources + smartSources).map(\.name)}
    private static func publicText(_ value:Any?,limit:Int=2000)->String? {
        guard let value=value as? String,value.utf16.count<=limit else{return nil}
        let clean=value.trimmingCharacters(in:.whitespacesAndNewlines)
        return clean.isEmpty ? nil : clean
    }
    // Extract bounded clues from description fields already present in a public board response.
    // This is not an eligibility parser; only explicitly supported public feeds supply its input.
    static func plainEmployerText(_ value:Any?)->String {
        guard var text=value as? String,text.utf16.count<=120_000 else{return ""}
        let entities=["amp":"&","lt":"<","gt":">","quot":"\"","apos":"'","nbsp":" "]
        if let regex=try? NSRegularExpression(pattern:#"&(#x[0-9a-f]+|#[0-9]+|amp|lt|gt|quot|apos|nbsp);"#,options:.caseInsensitive) {
            for match in regex.matches(in:text,range:NSRange(text.startIndex...,in:text)).reversed() {
                guard let range=Range(match.range,in:text),let nameRange=Range(match.range(at:1),in:text) else{continue}
                let name=String(text[nameRange]).lowercased()
                let replacement:String
                if name.hasPrefix("#") {
                    let hex=name.hasPrefix("#x")
                    let number=UInt32(name.dropFirst(hex ? 2:1),radix:hex ? 16:10)
                    if let number,number>=32,number<=0x10ffff,!(0xd800...0xdfff).contains(number),let scalar=UnicodeScalar(number) {replacement=String(scalar)} else {replacement=" "}
                } else {replacement=entities[name] ?? " "}
                text.replaceSubrange(range,with:replacement)
            }
        }
        text=text.replacingOccurrences(of:#"<(script|style)\b[^>]*>[\s\S]*?</\1\s*>"#,with:" ",options:[.regularExpression,.caseInsensitive])
            .replacingOccurrences(of:#"</?(?:p|li|div|br|h[1-6]|ul|ol)[^>]*>"#,with:"\n",options:[.regularExpression,.caseInsensitive])
            .replacingOccurrences(of:#"<[^>]*>"#,with:" ",options:.regularExpression)
        return text.replacingOccurrences(of:#"[\t \r]+"#,with:" ",options:.regularExpression)
            .replacingOccurrences(of:#"\n\s*"#,with:"\n",options:.regularExpression).trimmingCharacters(in:.whitespacesAndNewlines)
    }
    static func requirementNotes(_ value:Any?)->[String] {
        let text=plainEmployerText(value)
        let relevant=#"bachelor|master.?s|degree|\bph\.?d\b|university|student|graduat|\d+\+?\s*(?:-\s*\d+\s*)?years?|\bpaid\b|unpaid|work authori[sz]ation|\bsaudi nationals?\b|\b(?:tamheer|eligible|eligibility|GPA)\b|تمهير|citizenship|تخرج|بكالوريوس|سنوات|طالب"#
        let technology=#"(?<![\p{L}\p{N}_])(?:python|javascript|typescript|swift(?:ui)?|sql|react(?:\.js|js)?|node(?:\.js|js)|docker|kubernetes|k8s|aws|amazon web services|azure|git|machine[ -]learning|ML)(?![\p{L}\p{N}_])"#
        let lines=text.replacingOccurrences(of:#"\n+|(?<=[.!?])\s+"#,with:"\n",options:.regularExpression).components(separatedBy:"\n")
        var seen=Set<String>(),primary=[String](),skills=[String]()
        for line in lines {
            let clean=line.trimmingCharacters(in:.whitespacesAndNewlines)
            guard clean.utf16.count>12 else{continue}
            let benefits=clean.range(of:#"\bpaid\s+(?:leave|holidays?|time off|vacation)\b"#,options:[.regularExpression,.caseInsensitive]) != nil
            let roleContext=clean.range(of:#"degree|experience|internship|salary"#,options:[.regularExpression,.caseInsensitive]) != nil
            let companyBoilerplate=clean.range(of:#"\b(?:we serve|our company|founded in|we have served)\b"#,options:[.regularExpression,.caseInsensitive]) != nil
            let applicantContext=clean.range(of:#"\b(?:required|minimum|must|candidate|you have)\b"#,options:[.regularExpression,.caseInsensitive]) != nil
            guard !(benefits && !roleContext),!(companyBoilerplate && !applicantContext),seen.insert(clean).inserted else{continue}
            if clean.range(of:relevant,options:[.regularExpression,.caseInsensitive]) != nil {primary.append(clean)}
            if clean.range(of:technology,options:[.regularExpression,.caseInsensitive]) != nil {skills.append(clean)}
        }
        let prioritized=Array(primary.prefix(4))
        let selected=prioritized+skills.filter{!prioritized.contains($0)}.prefix(2)
        return selected.map{$0.utf16.count>260 ? String(decoding:$0.utf16.prefix(257),as:UTF16.self)+"…" : $0}
    }
    static func employerMode(_ kind:String,row:[String:Any])->String {
        if kind=="recruitee" {
            let modes=[("on_site","On-site"),("hybrid","Hybrid"),("remote","Remote")].filter{strictBool(row[$0.0])==true}.map(\.1)
            return modes.isEmpty ? "Not stated" : modes.joined(separator:" / ")
        }
        if kind=="ashby" {
            if let type=row["workplaceType"] as? String,let label=["Remote":"Remote","Hybrid":"Hybrid","OnSite":"On-site"][type] {return label}
            return strictBool(row["isRemote"])==true ? "Remote or hybrid" : "Not stated"
        }
        return strictBool(row["telecommuting"])==true ? "Remote arrangement: confirm details" : "Not stated"
    }
    static func employmentLabel(_ value:String)->String {
        let key=value.lowercased().replacingOccurrences(of:#"[\s_-]"#,with:"",options:.regularExpression)
        return ["fulltime":"Full time","parttime":"Part time","internship":"Internship","contract":"Contract","temporary":"Temporary"][key] ?? value
    }
    private static func publicSaudi(_ value:Any?)->Bool {
        guard let value=publicText(value) else{return false}
        return value.range(of:#"^(Saudi Arabia|Kingdom of Saudi Arabia|SA|SAU|السعودية|المملكة العربية السعودية)$"#,options:[.regularExpression,.caseInsensitive]) != nil
    }
    private static func publicLocations(_ row:[String:Any],source:PublicSource)->[String] {
        if source.kind=="recruitee" {
            return (row["locations"] as? [[String:Any]] ?? []).filter { location in
                let code=location["country_code"]
                return publicSaudi(code == nil || code is NSNull ? location["country"] : code)
            }.map{publicText($0["city"]) ?? "Saudi Arabia"}
        }
        if source.kind=="workable" {
            let given=row["locations"] as? [[String:Any]]
            let locations=(given?.isEmpty==false ? given! : [["country":row["country"] ?? "","city":row["city"] ?? ""]])
            return locations.filter {strictBool($0["hidden"]) != true && publicSaudi($0["countryCode"] ?? $0["country"])}.map{publicText($0["city"]) ?? "Saudi Arabia"}
        }
        if source.kind=="ashby" {
            let locations=[["location":row["location"] ?? "","address":row["address"] ?? [:]]] + (row["secondaryLocations"] as? [[String:Any]] ?? [])
            return locations.filter { item in
                if let address=item["address"] as? [String:Any] {
                    let postal=address["postalAddress"] as? [String:Any]
                    let country=(postal?["addressCountry"] as? String) ?? (address["addressCountry"] as? String)
                    if let country,!country.isEmpty {return publicSaudi(country)}
                }
                return publicText(item["location"])?.range(of:#"saudi|\briyadh\b|\bjeddah\b|\bdammam\b|\bkhobar\b|\bSAU\b|الرياض|جدة|السعودية"#,options:[.regularExpression,.caseInsensitive]) != nil
            }.compactMap{publicText($0["location"])}
        }
        guard let location=row["location"] as? [String:Any],let name=publicText(location["name"]),name.range(of:#"saudi|\briyadh\b|\bjeddah\b|\bdammam\b|\bkhobar\b|\bSAU\b|الرياض|جدة|السعودية"#,options:[.regularExpression,.caseInsensitive]) != nil else{return []}
        return [name]
    }
    private static func recruiteeDate(_ value:Any?)->String? {
        guard let value,!(value is NSNull) else{return ""}
        guard let text=value as? String else{return nil}
        if text.isEmpty {return ""}
        guard text.range(of:#"^[0-9]{4}-[0-9]{2}-[0-9]{2} [0-9]{2}:[0-9]{2}:[0-9]{2} UTC\z"#,options:.regularExpression) != nil else{return nil}
        let iso=String(text.prefix(10))+"T"+String(text.dropFirst(11).prefix(8))+"Z"
        return isoDate(iso)==nil ? nil : iso
    }
    private static func publicJob(_ row:[String:Any],source:PublicSource)->[String:Any]? {
        guard let title=publicText(row["title"]) else{return nil}
        let rawID=source.kind=="workable" ? row["shortcode"] as? String : source.kind=="ashby" ? row["id"] as? String : (row["id"] as? NSNumber).map{$0.stringValue}
        guard let id=rawID else{return nil}
        let pattern=source.kind=="workable" ? #"^[A-Za-z0-9]{1,64}$"# : source.kind=="ashby" ? #"^[a-f0-9-]{36}$"# : #"^[0-9]{1,20}$"#
        guard id.range(of:pattern,options:[.regularExpression,.caseInsensitive]) != nil else{return nil}
        if source.kind=="ashby",strictBool(row["isListed"])==nil{return nil}
        if source.kind=="workable" {
            if let raw=row["locations"],!(raw is NSNull),!(raw is [[String:Any]]){return nil}
            for location in row["locations"] as? [[String:Any]] ?? [] {
                for key in ["country","countryCode","city"] {if let value=location[key],!(value is NSNull),!(value is String){return nil}}
                if let hidden=location["hidden"],!(hidden is NSNull),strictBool(hidden)==nil{return nil}
            }
            for key in ["country","city"] {if let value=row[key],!(value is NSNull),!(value is String){return nil}}
            if (row["locations"] as? [[String:Any]] ?? []).isEmpty && publicText(row["country"])==nil{return nil}
        }
        if source.kind=="ashby" {
            guard row["location"] is String else{return nil}
            if let secondary=row["secondaryLocations"],!(secondary is NSNull),!(secondary is [[String:Any]]){return nil}
            let locations=[["location":row["location"] ?? "","address":row["address"] ?? NSNull()]] + (row["secondaryLocations"] as? [[String:Any]] ?? [])
            for location in locations {
                guard location["location"] is String else{return nil}
                if let address=location["address"],!(address is NSNull) {
                    guard let address=address as? [String:Any] else{return nil}
                    if let country=address["addressCountry"],!(country is NSNull),!(country is String){return nil}
                    if let postal=address["postalAddress"],!(postal is NSNull) {
                        guard let postal=postal as? [String:Any] else{return nil}
                        if let country=postal["addressCountry"],!(country is NSNull),!(country is String){return nil}
                    }
                }
            }
        }
        if source.kind=="recruitee" {
            guard row["status"] is String,let slug=row["slug"] as? String,slug.range(of:#"^[a-z0-9][a-z0-9-]{0,199}\z"#,options:[.regularExpression,.caseInsensitive]) != nil,
                  let locations=row["locations"] as? [[String:Any]] else{return nil}
            for location in locations {
                for key in ["country_code","country","city"] {if let value=location[key],!(value is NSNull),!(value is String){return nil}}
            }
            for key in ["remote","on_site","hybrid"] {if let value=row[key],!(value is NSNull),strictBool(value)==nil{return nil}}
        }
        if ["greenhouse","recruitee"].contains(source.kind) {guard let id=row["id"] as? NSNumber,strictBool(row["id"])==nil,id.doubleValue>=0,id.doubleValue<=9007199254740991,id.doubleValue.rounded()==id.doubleValue else{return nil}}
        if source.kind=="greenhouse",(row["location"] as? [String:Any])?["name"] as? String == nil{return nil}
        let posted:String,closes:String
        if source.kind=="recruitee" {
            guard let publication=recruiteeDate(row["published_at"]),let closing=recruiteeDate(row["close_at"]) else{return nil}
            posted=publication;closes=closing
        } else {
            let postedValue=source.kind=="workable" ? row["published_on"] : source.kind=="ashby" ? row["publishedAt"] : row["first_published"]
            if let postedValue,!(postedValue is NSNull),!(postedValue is String){return nil}
            posted=postedValue as? String ?? "";closes=""
        }
        if !posted.isEmpty && parsedDate(posted)==nil{return nil}
        let locations=publicLocations(row,source:source),level=publicText(row["experience"]) ?? ""
        // An exact excluded ID is authoritative even when unrelated rows are malformed.
        guard relevant(title),!locations.isEmpty,dateIsEligible(posted,now:Date(),closing:false),!(source.kind=="ashby" && strictBool(row["isListed"]) != true),!(source.kind=="recruitee" && row["status"] as? String != "published"),dateIsEligible(closes,now:Date(),closing:true),level.range(of:#"^(director|executive)$"#,options:[.regularExpression,.caseInsensitive])==nil else{return ["_excludedId":"\(source.board.lowercased())-\(id)"]}
        let value=source.kind=="workable" ? "https://apply.workable.com/\(source.board)/j/\(id)/" : source.kind=="ashby" ? row["jobUrl"] as? String : source.kind=="recruitee" ? row["careers_url"] as? String : row["absolute_url"] as? String
        guard let value,let url=URL(string:value),url.scheme=="https",url.user==nil,url.password==nil,url.port==nil || url.port==443 else{return nil}
        let host=source.kind=="workable" ? "apply.workable.com" : source.kind=="ashby" ? "jobs.ashbyhq.com" : source.kind=="recruitee" ? "jobs.unifonic.com" : "job-boards.eu.greenhouse.io"
        let path=source.kind=="workable" ? "/\(source.board)/j/\(id)" : source.kind=="ashby" ? "/\(source.board)/\(id)" : source.kind=="recruitee" ? "/o/\(row["slug"] as! String)" : "/\(source.board)/jobs/\(id)"
        guard url.host?.lowercased()==host,url.path.trimmingCharacters(in:CharacterSet(charactersIn:"/")).lowercased()==path.trimmingCharacters(in:CharacterSet(charactersIn:"/")).lowercased() else{return nil}
        let unique=locations.reduce(into:[String]()){if !$0.contains($1){$0.append($1)}}
        let early=(title+" "+level).range(of:#"junior|entry[ -]level|graduate|intern|trainee|associate|himmah|tamheer|builders[ -]program"#,options:[.regularExpression,.caseInsensitive]) != nil
        var gaps=[String]()
        if !level.isEmpty{gaps.append("Employer-listed experience level: \(level). Check the full requirements.")}
        gaps += ["Personal projects are not formal employment. Confirm any degree, student-status or minimum professional-experience requirement.","Salary and paid status are not verified. Review the current official job description."]
        let employmentNames=["FullTime":"Full time","PartTime":"Part time","Intern":"Internship","Contract":"Contract","Temporary":"Temporary"]
        let employmentCodes=["fulltime_permanent":"Full time (permanent)","fulltime_fixed_term":"Full time (fixed term)","parttime_permanent":"Part time (permanent)","parttime_fixed_term":"Part time (fixed term)","internship":"Internship"]
        let code=publicText(row["employment_type_code"],limit:100)
        let fallback=source.kind=="recruitee" ? code.map{"Employer code: "+String(decoding:$0.utf16.prefix(80),as:UTF16.self)} : nil
        let employment=employmentNames[row["employmentType"] as? String ?? ""] ?? publicText(row["employment_type"],limit:100) ?? employmentCodes[code ?? ""] ?? fallback ?? "Not stated"
        let description:Any?
        switch source.kind {
        case "ashby": description=(row["descriptionPlain"] as? String).flatMap{$0.isEmpty ? nil:$0} as Any? ?? row["descriptionHtml"]
        case "greenhouse": description=row["content"]
        case "recruitee": description=[row["requirements"],row["description"]].compactMap{$0 as? String}.joined(separator:"\n")
        default: description=nil
        }
        let location=unique.map{source.kind != "greenhouse" && $0.range(of:#"saudi|\briyadh\b|\bjeddah\b|\bdammam\b|\bkhobar\b|\bSAU\b|الرياض|جدة|السعودية"#,options:[.regularExpression,.caseInsensitive])==nil ? $0+", Saudi Arabia" : $0}.joined(separator:" / ")
        return ["id":"\(source.board.lowercased())-\(id)","title":title,"company":source.name,"location":location,
                "url":value,"posted":posted,"closes":closes.isEmpty ? NSNull() : closes as Any,"status":"live","salary":NSNull(),"kind":"live","fit":"Needs review",
                "healthcare":false,"leadership":false,"relevance":early ? 95 : relevance(title),"mode":employerMode(source.kind,row:row),
                "postedKind":["ashby","recruitee"].contains(source.kind) ? "last-published" : "published",
                "experienceLevel":String(decoding:level.utf16.prefix(100),as:UTF16.self),"employmentType":employmentLabel(employment),"requirementNotes":requirementNotes(description),
                "summary":"Currently listed on the employer board. Confirm paid status, degree, professional experience and work location before applying.","gaps":gaps]
    }
    static func parsePublicBoard(_ data:[String:Any],source:PublicSource)throws->SourceResult {
        guard let rows=data[source.kind=="recruitee" ? "offers" : "jobs"] as? [Any],rows.count<=5000 else{throw FeedError.invalidResponse}
        var jobs=[String:[String:Any]](),failures=0,valid=0
        var excluded=Set<String>()
        for raw in rows.prefix(500) {
            guard let row=raw as? [String:Any],let job=publicJob(row,source:source) else{failures+=1;continue}
            valid+=1
            if let id=job["_excludedId"] as? String {excluded.insert(id);continue}
            guard let id=job["id"] as? String else{continue}
            if var prior=jobs[id],let before=prior["location"] as? String,let after=job["location"] as? String {
                prior["location"]=(before.components(separatedBy:" / ")+after.components(separatedBy:" / ")).reduce(into:[String]()){if !$0.contains($1){$0.append($1)}}.joined(separator:" / ")
                prior["relevance"]=max(prior["relevance"] as? Int ?? 0,job["relevance"] as? Int ?? 0);jobs[id]=prior
            }else{jobs[id]=job}
        }
        var status:[String:Any] = ["name":source.name,"ok":valid>0 || rows.isEmpty,"count":jobs.count,"scanned":min(rows.count,500),"total":rows.count,"limited":rows.count>500,"detailErrors":failures,"excludedIds":excluded.filter{jobs[$0]==nil}.sorted()]
        if failures>0{status["error"]="\(failures) malformed listings were skipped; results may be incomplete."}
        return SourceResult(name:source.name,jobs:jobs.keys.sorted().compactMap{jobs[$0]},status:status)
    }
    static func fetchPublic(_ source:PublicSource,session:URLSession)async->SourceResult {
        do {
            var request=URLRequest(url:source.url);request.setValue("application/json",forHTTPHeaderField:"Accept")
            let data=try await json(request,session:session)
            return try parsePublicBoard(data,source:source)
        }catch{return SourceResult(name:source.name,jobs:[],status:["name":source.name,"ok":false,"count":0,"scanned":0,"error":error.localizedDescription])}
    }

    private struct SmartList {
        let candidates: [[String: Any]]
        let excluded: Set<String>
        let failures: Int
        let valid: Int
        let scanned: Int
        let total: Int
        let limited: Bool
    }
    private static func smartInteger(_ value: Any?) -> Int? {
        guard let number = value as? NSNumber, strictBool(value) == nil,
              number.doubleValue.isFinite, number.doubleValue >= 0,
              number.doubleValue <= 9_007_199_254_740_991,
              number.doubleValue.rounded() == number.doubleValue else { return nil }
        return number.intValue
    }
    static func smartDetailURL(_ id: String, source: PublicSource) -> URL? {
        guard smartSources.contains(where: { $0.name == source.name && $0.board == source.board && $0.kind == source.kind }),
              id.range(of: #"^[0-9]{1,20}\z"#, options: .regularExpression) != nil else { return nil }
        return URL(string: "https://api.smartrecruiters.com/v1/companies/\(source.board)/postings/\(id)")
    }
    static func smartPostingURL(_ value: String, source: PublicSource, id: String) -> URL? {
        guard smartDetailURL(id, source: source) != nil,
              let url = URL(string: value), url.scheme?.lowercased() == "https", url.host?.lowercased() == "jobs.smartrecruiters.com",
              url.user == nil, url.password == nil, url.query == nil, url.fragment == nil, url.port == nil || url.port == 443,
              var components = URLComponents(url: url, resolvingAgainstBaseURL: false),
              components.percentEncodedPath.range(of: "^/" + source.board + "/" + id + #"-[a-z0-9-]{1,240}/?\z"#, options: .regularExpression) != nil else { return nil }
        components.scheme = "https"; components.host = "jobs.smartrecruiters.com"; components.port = nil
        return components.url
    }

    // Identity and geography are validated before any exact exclusion is authoritative.
    private static func smartBase(_ row: [String: Any], source: PublicSource, now: Date) -> [String: Any]? {
        guard let id = row["id"] as? String, smartDetailURL(id, source: source) != nil,
              let title = publicText(row["name"]),
              (row["company"] as? [String: Any])?["identifier"] as? String == source.board,
              let location = row["location"] as? [String: Any], let country = publicText(location["country"], limit: 100),
              let visibility = publicText(row["visibility"], limit: 40),
              let released = row["releasedDate"] as? String, !released.isEmpty, parsedDate(released) != nil else { return nil }
        if let city = location["city"], !(city is NSNull) {
            guard let city = city as? String, city.utf16.count <= 2_000 else { return nil }
        }
        let key = source.board.lowercased() + "-" + id
        guard visibility == "PUBLIC", row["visibility"] as? String == "PUBLIC", publicSaudi(country), relevant(title), dateIsEligible(released, now: now, closing: false) else { return ["_excludedId": key, "_rawID": id] }
        let city = publicText(location["city"]) ?? ""
        let remote = strictBool(location["remote"]), hybrid = strictBool(location["hybrid"])
        let mode = hybrid == true && remote == true ? "Remote / Hybrid" : hybrid == true ? "Hybrid" : remote == true ? "Remote" : remote == false && hybrid == false ? "On-site" : "Not stated"
        let level = publicText((row["experienceLevel"] as? [String: Any])?["label"], limit: 100) ?? ""
        let rawEmployment = publicText((row["typeOfEmployment"] as? [String: Any])?["label"], limit: 100) ?? "Not stated"
        let employment = rawEmployment == "Intern" ? "Internship" : employmentLabel(rawEmployment)
        let early = (title + " " + level).range(of: #"junior|entry[ -]level|graduate|intern|trainee|associate|tamheer"#, options: [.regularExpression, .caseInsensitive]) != nil
        return ["id": key, "_rawID": id, "title": title, "company": source.name,
                "location": city.isEmpty ? "Saudi Arabia" : city + ", Saudi Arabia", "posted": released,
                "postedKind": "last-published", "closes": NSNull(), "status": "live", "salary": NSNull(),
                "kind": "live", "fit": "Needs review", "healthcare": false, "leadership": false,
                "relevance": early ? 95 : relevance(title), "mode": mode, "experienceLevel": level, "employmentType": employment,
                "summary": "Currently listed on the employer board. Confirm eligibility, paid status, professional experience and work location.",
                "gaps": ["Confirm mandatory qualifications and any program eligibility directly with the employer.",
                         "Personal projects are not formal employment. Salary and paid status are not verified."]]
    }
    private static func smartList(_ data: [String: Any], source: PublicSource, now: Date) throws -> SmartList {
        guard smartSources.contains(where: { $0.board == source.board && $0.name == source.name && $0.kind == source.kind }),
              let rows = data["content"] as? [Any], rows.count <= 5_000,
              smartInteger(data["offset"]) == 0, let limit = smartInteger(data["limit"]), limit > 0, limit <= 100,
              let total = smartInteger(data["totalFound"]), total >= rows.count,
              !rows.isEmpty || total == 0 else { throw FeedError.invalidResponse }
        var candidates = [[String: Any]](), seen = Set<String>(), excluded = Set<String>(), failures = 0, valid = 0
        for value in rows.prefix(100) {
            guard let row = value as? [String: Any], let base = smartBase(row, source: source, now: now) else { failures += 1; continue }
            valid += 1
            if let id = base["_excludedId"] as? String { excluded.insert(id); continue }
            let id = base["_rawID"] as! String
            if seen.insert(id).inserted { candidates.append(row) }
        }
        return SmartList(candidates: Array(candidates.prefix(20)), excluded: excluded.filter { !seen.contains(String($0.dropFirst(source.board.count + 1))) }, failures: failures, valid: valid,
                         scanned: min(rows.count, 100), total: total, limited: total > rows.count || rows.count > 100 || candidates.count > 20)
    }
    static func smartDetailJob(_ row: [String: Any], id: String, source: PublicSource, now: Date = Date()) -> [String: Any]? {
        guard row["id"] as? String == id, var job = smartBase(row, source: source, now: now), let active = strictBool(row["active"]) else { return nil }
        if !active || job["_excludedId"] != nil { return ["_excludedId": source.board.lowercased() + "-" + id] }
        guard let value = row["postingUrl"] as? String, let postingURL = smartPostingURL(value, source: source, id: id) else { return nil }
        let location = row["location"] as! [String: Any]
        for flag in ["remote", "hybrid"] {
            if let value = location[flag], !(value is NSNull), strictBool(value) == nil { return nil }
        }
        for field in ["typeOfEmployment", "experienceLevel"] {
            if let raw = row[field], !(raw is NSNull) {
                guard let object = raw as? [String: Any] else { return nil }
                if let label = object["label"], !(label is NSNull) {
                    guard let text = label as? String, text.utf16.count <= 100 else { return nil }
                }
            }
        }
        var texts = [String]()
        if let raw = row["jobAd"], !(raw is NSNull) {
            guard let ad = raw as? [String: Any] else { return nil }
            if let rawSections = ad["sections"], !(rawSections is NSNull) {
                guard let sections = rawSections as? [String: Any] else { return nil }
                for key in ["qualifications", "jobDescription", "additionalInformation"] {
                    if let rawSection = sections[key], !(rawSection is NSNull) {
                        guard let section = rawSection as? [String: Any] else { return nil }
                        if let value = section["text"], !(value is NSNull) {
                            guard let text = value as? String, text.utf16.count <= 120_000 else { return nil }
                            texts.append(text)
                        }
                    }
                }
            }
        }
        guard texts.reduce(0, { $0 + $1.utf16.count }) <= 120_000 else { return nil }
        // Never collect company-description years as candidate-experience evidence.
        job["requirementNotes"] = requirementNotes(texts.joined(separator: "\n"))
        job["url"] = postingURL.absoluteString
        job.removeValue(forKey: "_rawID")
        return job
    }
    static func parseSmartRecruiters(_ data: [String: Any], source: PublicSource, details: [String: Any], now: Date = Date()) throws -> SourceResult {
        let list = try smartList(data, source: source, now: now)
        var jobs = [String: [String: Any]](), excluded = list.excluded, failures = list.failures, checked = 0
        for row in list.candidates {
            let id = row["id"] as! String
            guard let detail = details[id] as? [String: Any], let job = smartDetailJob(detail, id: id, source: source, now: now) else { failures += 1; continue }
            checked += 1
            if let id = job["_excludedId"] as? String { excluded.insert(id); continue }
            jobs[job["id"] as! String] = job
        }
        var status: [String: Any] = ["name": source.name, "ok": checked > 0 || !list.excluded.isEmpty || list.candidates.isEmpty && (list.valid > 0 || list.scanned == 0), "count": jobs.count,
                                     "scanned": list.scanned, "total": list.total, "limited": list.limited,
                                     "detailErrors": failures, "excludedIds": excluded.filter { jobs[$0] == nil }.sorted()]
        if failures > 0 { status["error"] = "\(failures) listings or detail checks were unavailable; results may be incomplete." }
        return SourceResult(name: source.name, jobs: jobs.keys.sorted().compactMap { jobs[$0] }, status: status)
    }
    static func fetchSmartRecruiters(_ source: PublicSource, session: URLSession) async -> SourceResult {
        do {
            guard smartDetailURL("0", source: source) != nil else { throw FeedError.invalidResponse }
            var request = URLRequest(url: source.url); request.setValue("application/json", forHTTPHeaderField: "Accept")
            let data = try await json(request, session: session), now = Date()
            let list = try smartList(data, source: source, now: now)
            var details = [String: Any]()
            for start in stride(from: 0, to: list.candidates.count, by: 4) {
                guard !Task.isCancelled else { break }
                let batch = await withTaskGroup(of: (String, [String: Any]?).self, returning: [String: Any].self) { group in
                    for row in list.candidates[start..<min(start + 4, list.candidates.count)] {
                        let id = row["id"] as! String
                        group.addTask {
                            guard !Task.isCancelled, let url = smartDetailURL(id, source: source) else { return (id, nil) }
                            var request = URLRequest(url: url); request.setValue("application/json", forHTTPHeaderField: "Accept")
                            return (id, try? await json(request, session: session))
                        }
                    }
                    var values = [String: Any]()
                    for await (id, detail) in group { if let detail { values[id] = detail } }
                    return values
                }
                details.merge(batch) { _, new in new }
            }
            return try parseSmartRecruiters(data, source: source, details: details, now: now)
        } catch {
            return SourceResult(name: source.name, jobs: [], status: ["name": source.name, "ok": false, "count": 0, "scanned": 0, "error": error.localizedDescription])
        }
    }

    static func refresh() async -> [String: Any] {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.timeoutIntervalForRequest = 20
        configuration.timeoutIntervalForResource = 45
        configuration.requestCachePolicy = .reloadIgnoringLocalCacheData
        configuration.httpShouldSetCookies = false
        let session = URLSession(configuration: configuration, delegate: NoRedirects(), delegateQueue: nil)
        defer { session.invalidateAndCancel() }
        let results = await withTaskGroup(of: SourceResult.self, returning: [SourceResult].self) { group in
            for source in publicSources {
                group.addTask {
                    await boundedSource(name: source.name) { await fetchPublic(source, session: session) }
                }
            }
            for source in smartSources {
                group.addTask {
                    await boundedSource(name: source.name) { await fetchSmartRecruiters(source, session: session) }
                }
            }
            var results: [SourceResult] = []
            for await result in group { results.append(result) }
            return results.sorted { $0.name < $1.name }
        }
        return [
            "checkedAt": ISO8601DateFormatter().string(from: Date()),
            "jobs": results.flatMap(\.jobs), "sources": results.map(\.status)
        ]
    }

    struct SourceResult {
        let name: String
        let jobs: [[String: Any]]
        let status: [String: Any]
    }

    private enum SourceEvent {
        case finished(SourceResult), deadline, cancelled
    }

    static func boundedSource(name: String, budgetNanoseconds: UInt64 = sourceBudgetNanoseconds,
                              operation: @escaping @Sendable () async -> SourceResult) async -> SourceResult {
        await withTaskGroup(of: SourceEvent.self) { group in
            group.addTask { .finished(await operation()) }
            group.addTask {
                do { try await Task.sleep(nanoseconds: budgetNanoseconds); return .deadline }
                catch { return .cancelled }
            }
            var completed: SourceResult?
            var timedOut = false
            while completed == nil, let event = await group.next() {
                switch event {
                case .finished(let result): completed = result; group.cancelAll()
                case .deadline: timedOut = true; group.cancelAll()
                case .cancelled: break
                }
            }
            guard let result = completed else {
                return SourceResult(name: name, jobs: [], status: ["name": name, "ok": false, "count": 0, "error": "Employer search was cancelled."])
            }
            guard timedOut else { return result }
            var status = result.status
            status["timedOut"] = true
            status["incomplete"] = true
            status["limited"] = true
            status["error"] = "Employer search reached its time limit; results may be incomplete."
            return SourceResult(name: result.name, jobs: result.jobs, status: status)
        }
    }

    static func fetchQiddiya(session: URLSession) async -> SourceResult {
        let endpoint = URL(string: "https://apply.workable.com/api/v3/accounts/qiddiya-investment-company-1/jobs")!
        var jobs: [String: [String: Any]] = [:]
        var scanned = 0
        var limited = false
        var failures = 0
        var successfulQueries = 0
        for query in ["healthcare", "procurement", "performance"] {
            var token: String?
            var receivedPage = false
            do {
                for _ in 0..<2 {
                    guard !Task.isCancelled else { throw CancellationError() }
                    var request = URLRequest(url: endpoint)
                    request.httpMethod = "POST"
                    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
                    request.setValue("application/json", forHTTPHeaderField: "Accept")
                    var body: [String: Any] = ["query": query, "location": [], "department": [], "worktype": [], "remote": []]
                    if let token { body["token"] = token }
                    request.httpBody = try JSONSerialization.data(withJSONObject: body)
                    let page = try await json(request, session: session)
                    guard let rows = page["results"] as? [[String: Any]] else { throw FeedError.invalidResponse }
                    receivedPage = true
                    scanned += rows.count
                    for row in rows {
                        if let match = qiddiyaJob(row), let id = match["id"] as? String { jobs[id] = match }
                    }
                    token = (page["nextPage"] as? String).flatMap { $0.isEmpty ? nil : $0 }
                    if token == nil { break }
                }
                limited = limited || token != nil
            } catch { failures += 1 }
            if receivedPage { successfulQueries += 1 }
        }
        var status: [String: Any] = ["name": "Qiddiya", "ok": successfulQueries > 0, "count": jobs.count, "scanned": scanned, "limited": limited, "queryErrors": failures, "incomplete": limited || failures > 0]
        if failures > 0 { status["error"] = "\(failures) Qiddiya searches failed; results may be incomplete." }
        return SourceResult(name: "Qiddiya", jobs: jobs.keys.sorted().compactMap { jobs[$0] }, status: status)
    }

    static func fetch(_ source: WorkdaySource, session: URLSession) async -> SourceResult {
        do {
            var request = URLRequest(url: source.baseURL.appendingPathComponent("jobs"))
            request.httpMethod = "POST"
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.setValue("application/json", forHTTPHeaderField: "Accept")
            let facets: [String: [String]] = source.tenant == "novartis" ? ["locationCountry": ["50423b5190ad49bb89e94cd58dfaad69"]] : [:]
            request.httpBody = try JSONSerialization.data(withJSONObject: ["appliedFacets": facets, "limit": 20, "offset": 0, "searchText": source.tenant == "novartis" ? "" : "Saudi"])
            let listing = try await json(request, session: session)
            guard let postings = listing["jobPostings"] as? [Any], let total = listing["total"] as? Int, total >= postings.count, (total == 0 || !postings.isEmpty), strictBool(listing["total"]) == nil else { throw FeedError.invalidResponse }
            let sampled = postings.prefix(20)
            let valid = sampled.compactMap { row -> [String:Any]? in
                guard let posting=row as? [String:Any],let title=posting["title"] as? String,!title.trimmingCharacters(in:.whitespacesAndNewlines).isEmpty,
                      let path=posting["externalPath"] as? String,detailURL(path,source:source) != nil else {return nil}
                return posting
            }
            let candidates = valid.filter { relevant($0["title"] as! String) }
            var jobs: [[String: Any]] = []
            var failures = sampled.count-valid.count
            var successfulDetails = 0
            var excludedIds = [String]()
            for (index, posting) in candidates.enumerated() {
                guard !Task.isCancelled else { failures += candidates.count - index; break }
                guard let path = posting["externalPath"] as? String,
                      let url = detailURL(path, source: source) else { failures += 1; continue }
                do {
                    let response = try await json(URLRequest(url: url), session: session)
                    guard let detail = response["jobPostingInfo"] as? [String: Any], validDetail(detail) else { throw FeedError.invalidResponse }
                    let id=source.tenant+"-"+(detail["jobReqId"] as! String)
                    guard id.count<=256 else {throw FeedError.invalidResponse}
                    successfulDetails += 1
                    if let match = job(detail, externalPath: path, source: source) { jobs.append(match) } else {excludedIds.append(id)}
                } catch {
                    failures += 1
                    if Task.isCancelled { failures += candidates.count - index - 1; break }
                }
            }
            var status: [String: Any] = ["name": source.name, "ok": successfulDetails > 0 || candidates.isEmpty && (!valid.isEmpty || sampled.isEmpty), "count": jobs.count, "scanned": min(postings.count, 20), "total": total, "limited": total > 20 || postings.count > 20, "detailErrors": failures, "excludedIds": excludedIds, "incomplete": total > 20 || postings.count > 20 || failures > 0]
            if failures > 0 { status["error"] = "\(failures) listing checks failed; results may be incomplete." }
            return SourceResult(name: source.name, jobs: jobs, status: status)
        } catch {
            return SourceResult(name: source.name, jobs: [], status: ["name": source.name, "ok": false, "count": 0, "scanned": 0, "limited": false, "error": error.localizedDescription])
        }
    }

    private static func json(_ request: URLRequest, session: URLSession) async throws -> [String: Any] {
        let (bytes, response) = try await session.bytes(for: request)
        // Cancel rejected/oversized streams rather than buffering the entire response first.
        defer { bytes.task.cancel() }
        guard let http = response as? HTTPURLResponse else { throw FeedError.invalidResponse }
        guard (200..<300).contains(http.statusCode) else { throw FeedError.http(http.statusCode) }
        let limit=8_000_000
        guard response.expectedContentLength<=limit else {throw FeedError.tooLarge}
        var data=Data()
        data.reserveCapacity(min(max(Int(response.expectedContentLength),0),limit))
        for try await byte in bytes {
            guard data.count<limit else {throw FeedError.tooLarge}
            data.append(byte)
        }
        try Task.checkCancellation()
        guard let value = try JSONSerialization.jsonObject(with: data) as? [String: Any] else { throw FeedError.invalidResponse }
        return value
    }

    private enum FeedError: LocalizedError {
        case invalidResponse, tooLarge, http(Int)
        var errorDescription: String? {
            switch self {
            case .invalidResponse: return "The employer returned an unreadable response."
            case .tooLarge: return "The employer response exceeded the safe size limit."
            case .http(let status): return "Employer request failed (HTTP \(status))."
            }
        }
    }

    private final class NoRedirects: NSObject, URLSessionTaskDelegate {
        func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse,
                        newRequest request: URLRequest, completionHandler: @escaping (URLRequest?) -> Void) {
            completionHandler(nil)
        }
    }
}
