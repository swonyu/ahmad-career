import Foundation

@main
struct MobileApplicationCheck {
    static func main() throws {
        var checks = 0
        func check(_ condition: @autoclosure () -> Bool, _ label: String) {
            precondition(condition(), label); checks += 1
        }
        for value in ["http://apply.example.com", "https://user:password@apply.example.com", "https://apply.example.com/private", "https://apply.example.com?token=secret", "https://apply.example.com#secret"] {
            check(MobileApplicationPolicy.serviceURL(value) == nil, "Invalid service origin rejected: \(value)")
        }
        check(MobileApplicationPolicy.serviceURL("https://apply.example.com") != nil, "HTTPS service accepted")
        check(MobileApplicationPolicy.serviceURL("https://apply.example.com/") != nil, "HTTPS root accepted")
        check(MobileApplicationPolicy.serviceURL("https://APPLY.example.com:443/")?.absoluteString == "https://apply.example.com", "Equivalent service origins share one identity")
        check(MobileApplicationPolicy.connectionSetupAddress("") == MobileApplicationPolicy.hostedServiceOrigin, "New setup offers the hosted HTTPS origin")
        check(MobileApplicationPolicy.connectionSetupAddress("https://existing.example") == "https://existing.example", "Existing custom connection is never replaced by the preset")
        check(MobileApplicationPolicy.connectionSetupAddress("https://needs-repair.example/private") == "https://needs-repair.example/private", "An invalid existing address remains visible for explicit repair")
        check(MobileApplicationPolicy.isHostedService(""), "New setup exposes hosted account links")
        check(!MobileApplicationPolicy.isHostedService("https://operator.example"), "Custom services never inherit hosted account claims")
        for page in ApplicationServicePage.allCases {
            let link = MobileApplicationPolicy.servicePageURL(page, address: "")
            check(link?.absoluteString == MobileApplicationPolicy.hostedServiceOrigin + "/" + page.rawValue,
                  "Account pages use a fixed HTTPS path without credentials")
        }
        check(MobileApplicationPolicy.servicePageURL(.account, address: "https://service.example?token=secret") == nil,
              "Account links cannot carry an embedded credential or arbitrary query")
        check(MobileApplicationPolicy.servicePageURL(.privacy, address: "https://existing.example")?.host == "existing.example",
              "Service page routing preserves the actual configured origin")
        for value in ["javascript:alert(1)", "file:///tmp/resume.pdf", "http://jobs.example.com/1", "https://localhost/x", "https://192.168.1.1/x", "https://user:pass@jobs.example.com/x"] {
            check(MobileApplicationPolicy.jobURL(value) == nil, "Unsafe job link rejected")
        }
        check(MobileApplicationPolicy.jobURL("https://jobs.example.com/opportunities/1") != nil, "Public HTTPS opportunity accepted")
        func sharedJob(_ link: String, sourceName: String? = "Synthetic board") -> String? {
            MobileApplicationPolicy.jobShareText(title: "مهندس برمجيات", company: "Synthetic\r\nStudio", sourceName: sourceName, link: link)
        }
        check(sharedJob("https://jobs.example.com/posting?jobId=123&utm_source=board#PRIVATE") ==
            "مهندس برمجيات\nSynthetic Studio\nSynthetic board\nhttps://jobs.example.com/posting?jobId=123&utm_source=board",
            "Share keeps the exact public fields, removes fragments and normalizes line breaks")
        check(sharedJob("HTTPS://JOBS.example.com:443/?gh_jid=456&utm_campaign=engineers", sourceName: nil) ==
            "مهندس برمجيات\nSynthetic Studio\nhttps://jobs.example.com/?gh_jid=456&utm_campaign=engineers",
            "Share preserves public identifiers and omits an unknown board")
        check(sharedJob("https://jobs.example.com/%D9%88%D8%B8%D9%8A%D9%81%D8%A9/123") != nil, "Arabic public posting paths can be shared")
        for link in [
            "https://jobs.example.com/invitations/secret", "https://jobs.example.com/%63andidates/secret",
            "https://jobs.example.com/applicants/secret", "https://jobs.example.com/password-reset/secret",
            "https://jobs.example.com/jobs/../invitations", "https://jobs.example.com/jobs/a%252Fb",
            "https://jobs.example.com/posting?utm_token=secret", "https://jobs.example.com/posting?utm_email=person.example.com",
            "https://jobs.example.com/posting?source=private%40example.com", "https://jobs.example.com/posting?redirect=https%3A%2F%2Fexample.com",
            "https://jobs.example.com/posting?utm_source=board%0A", "https://jobs.example.com/posting?jobId",
            "https://user:password@jobs.example.com/posting", "https://127.0.0.1/posting", "https://jobs.internal./posting",
        ] {
            check(sharedJob(link) == nil, "Private and ambiguous links do not produce a share payload")
        }
        let linkedInVectors = [
            ("HTTPS://SA.LINKEDIN.COM:443/in/Jos%C3%A9-42/?trk=x#about", "https://www.linkedin.com/in/Jos%C3%A9-42"),
            ("https://linkedin.com/in/سلام", "https://www.linkedin.com/in/%D8%B3%D9%84%D8%A7%D9%85"),
            ("https://www.linkedin.com/in/a+b", "https://www.linkedin.com/in/a%2Bb"),
            ("https://www.linkedin.com/in/a%3Fb", "https://www.linkedin.com/in/a%3Fb"),
            ("https://linkedin.com/in/alice%2Dsmith", "https://www.linkedin.com/in/alice-smith"),
            ("https://www.linkedin.com/in/a%23b/", "https://www.linkedin.com/in/a%23b"),
            ("https://abc.linkedin.com/in/profile-42/?tracking=discarded", "https://www.linkedin.com/in/profile-42")
        ]
        for (input, expected) in linkedInVectors {
            check(MobileApplicationPolicy.linkedInProfileURL(input)?.absoluteString == expected, "LinkedIn links share a canonical HTTPS profile URL")
            check(MobileApplicationPolicy.linkedInProfileURL(expected)?.absoluteString == expected, "Canonical LinkedIn links are stable")
        }
        check(MobileApplicationPolicy.linkedInProfileURL("https://www.linkedin.com/in/" + String(repeating: "س", count: 400)) == nil,
              "A short Unicode input cannot expand beyond the supported canonical URL length")
        let boundedUnicode = MobileApplicationPolicy.linkedInProfileURL("https://www.linkedin.com/in/" + String(repeating: "س", count: 300))!
        check(MobileApplicationPolicy.linkedInProfileURL(boundedUnicode.absoluteString) == boundedUnicode,
              "An accepted long Unicode URL remains valid on service readback")
        for suffix in ["a%2Fb", "a%5Cb", "a%252Fb", "a%20b", "a%C2%A0b", "%2E", "..", "a%FF", "a%", "a%0Ab", "a%7Fb", "a%C2%85b", "a/b", "a//", "", "a b", "a\u{00a0}b", "a%E2%80%AEb", "a\u{200b}b", "a\u{200d}b"] {
            check(MobileApplicationPolicy.linkedInProfileURL("https://www.linkedin.com/in/" + suffix) == nil,
                  "LinkedIn slugs reject ambiguous, malformed or invisible path data")
        }
        for input in ["http://www.linkedin.com/in/person", "https://user@linkedin.com/in/person", "https://linkedin.com:444/in/person",
                      "https://www.linkedin.com.evil.example/in/person", "https://linkedin.com/company/person", "https://abcd.linkedin.com/in/person",
                      "https://www.linkedin.com/in/person?x=%0A", "https://www.linkedin.com/in/person#%FF", " https://www.linkedin.com/in/person",
                      "https://www.linkedin.com/in/person\\other", "https://%6cinkedin.com/in/person", "https://www.linkedin.com/in/person?tracking=\u{202e}"] {
            check(MobileApplicationPolicy.linkedInProfileURL(input) == nil, "LinkedIn profile boundary rejects unsafe hosts, paths and encoded controls")
        }
        let linkedInSearch = MobileApplicationPolicy.linkedInJobSearchURL(keywords: "C++ & design", location: "الرياض, SA")!
        let searchParts = URLComponents(url: linkedInSearch, resolvingAgainstBaseURL: false)!
        check(searchParts.host == "www.linkedin.com" && searchParts.path == "/jobs/search/", "LinkedIn search uses a fixed public destination")
        check(searchParts.queryItems == [URLQueryItem(name: "keywords", value: "C++ & design"), URLQueryItem(name: "location", value: "الرياض, SA")],
              "LinkedIn handoff carries only exact user-entered keyword and location values")
        check(MobileApplicationPolicy.linkedInJobSearchURL(keywords: "", location: "")?.absoluteString == "https://www.linkedin.com/jobs/search/",
              "Empty LinkedIn search does not add profile or tracking fields")
        check(MobileApplicationPolicy.linkedInJobSearchURL(keywords: String(repeating: "x", count: 121), location: "") == nil,
              "External search keeps the same bounded keyword field")
        let pdf = SyntheticPDF.onePage
        check(MobileApplicationPolicy.resumeError(pdf, filename: "Resume.pdf") == nil, "PDF accepted")
        check(MobileApplicationPolicy.resumeError(Data("not a PDF".utf8), filename: "Resume.pdf") != nil, "Mismatched bytes rejected")
        check(MobileApplicationPolicy.resumeError(Data("%PDF-123".utf8), filename: "Resume.pdf") != nil, "A signature-only file cannot become a readable CV")
        check(MobileApplicationPolicy.resumeError(Data(repeating: 1, count: 5 * 1024 * 1024 + 1), filename: "Resume.pdf") != nil, "Oversize rejected")
        for name in ["../Resume.pdf", "folder\\Resume.pdf", ".Resume.pdf", "Resume:copy.pdf", "Resume.docx"] {
            check(MobileApplicationPolicy.resumeError(pdf, filename: name) != nil, "Unsafe filename rejected")
        }
        let good: [String: ApplicationValue] = ["state": .string("confirmed"), "provider": .string("lever"),
                                               "applicationId": .string("receipt-123"), "evidenceMode": .string("live")]
        check(MobileApplicationPolicy.isVerified(good), "Documented live receipt accepted")
        var malformed = good; malformed.removeValue(forKey: "applicationId")
        check(!MobileApplicationPolicy.isVerified(malformed), "Missing receipt never verifies")
        malformed = good; malformed["applicationId"] = .string(" \n ")
        check(!MobileApplicationPolicy.isVerified(malformed), "Blank receipt never verifies")
        malformed = good; malformed["provider"] = .string("manual")
        check(!MobileApplicationPolicy.isVerified(malformed), "Manual note never verifies")
        malformed = good; malformed["state"] = .string("dispatching")
        check(!MobileApplicationPolicy.isVerified(malformed), "Dispatch never verifies")
        malformed = good; malformed.removeValue(forKey: "evidenceMode")
        check(!MobileApplicationPolicy.isVerified(malformed), "Unknown evidence mode fails closed")
        check(MobileApplicationPolicy.stateTitle("confirmed", test: true) == "Test receipt", "Test receipts stay labeled")
        check(MobileApplicationPolicy.stateTitle("uncertain") == "Needs verification", "Uncertainty is visible")
        check(MobileApplicationPolicy.stateTitle("ready") == "Prepared draft", "A prepared draft never claims submission")
        let historicalCV: [String: ApplicationValue] = ["resumeName": .string("CV-A.pdf"), "profileRevision": .number(7)]
        let historicalDetails = ApplicationCVDetails(attempt: historicalCV)
        check(historicalDetails.resumeName == "CV-A.pdf" && historicalDetails.profileRevision == 7,
              "Attempt details use the immutable reviewed filename and profile revision")
        let reviewedDetails = ApplicationCVDetails(reviewItem: ["resume": .object(["name": .string("سيرة-أ.PDF")])],
                                                  plan: ["profileRevision": .number(0)])
        check(reviewedDetails.resumeName == "سيرة-أ.PDF" && reviewedDetails.profileRevision == 0,
              "Review details preserve an original Unicode filename and an explicit zero revision")
        let oldDetails = ApplicationCVDetails(attempt: ["profile": .object(["resume": .object(["name": .string("Current-B.pdf")])])])
        check(oldDetails.resumeName == nil && oldDetails.profileRevision == nil,
              "Missing historical metadata never falls back to a nested current profile or revision zero")
        for invalid in [ApplicationValue.null, .bool(true), .number(1), .string(""), .string(" CV-A.pdf"), .string("CV-A.pdf "),
             .string("../CV-A.pdf"), .string("folder\\CV-A.pdf"), .string("CV:A.pdf"), .string(".CV-A.pdf"),
             .string("CV-A.txt"), .string("CV\nA.pdf"), .string("CV\u{007f}A.pdf"), .string(String(repeating: "x", count: 177) + ".pdf"),
             .string(String(repeating: "😀", count: 89) + ".pdf")] {
            check(ApplicationCVDetails(attempt: ["resumeName": invalid, "profileRevision": .number(7)]).resumeName == nil,
                  "Unsafe or malformed historical filename is not rendered as a recorded CV")
        }
        for invalid in [ApplicationValue.null, .bool(true), .string("7"), .number(-1), .number(1.5), .number(.infinity)] {
            check(ApplicationCVDetails(attempt: ["resumeName": .string("CV-A.pdf"), "profileRevision": invalid]).profileRevision == nil,
                  "Only a supplied nonnegative integer becomes a profile version")
        }
        check(ApplicationCVDetails(attempt: ["resumeName": .string(String(repeating: "x", count: 176) + ".pdf")]).resumeName != nil,
              "A recorded PDF filename accepts the exact 180 UTF-16-unit boundary")
        let validManualNames: [String?] = [nil, "", "سيرة ذاتية.pdf", "CV-A.txt", ".private-note", String(repeating: "x", count: 180)]
        for name in validManualNames {
            check(MobileApplicationPolicy.manualResumeNameIsValid(name), "A bounded self-entered filename note does not pretend to validate a PDF")
        }
        for name in ["/Users/example/CV.pdf", "folder\\CV.pdf", "CV:copy.pdf", "CV\tcopy.pdf", "CV\u{007f}.pdf", String(repeating: "x", count: 181)] {
            check(!MobileApplicationPolicy.manualResumeNameIsValid(name), "Manual filename notes reject full paths, controls and overlong values")
        }
        for state in ["ready", "dispatching", "uncertain", "rate_limited", "rejected", "blocked", "cancelled"] {
            var named = good; named["state"] = .string(state); named["resumeName"] = .string("CV-A.pdf"); named["profileRevision"] = .number(7)
            check(!MobileApplicationPolicy.isVerified(named), "A recorded CV filename cannot turn a non-confirmed state into a receipt")
        }
        let job = "https://jobs.lever.co/example/00000000-0000-4000-8000-000000000001"
        check(MobileApplicationPolicy.jobIdentity(job) == MobileApplicationPolicy.jobIdentity(job + "/apply?utm_source=link#top"),
              "Application URL variants preserve duplicate identity")
        var profile = PhoneApplicationProfile()
        check([profile.firstName, profile.lastName, profile.email, profile.phone, profile.city, profile.country,
               profile.headline, profile.skills, profile.targetRoles, profile.targetCountries, profile.website, profile.linkedin, profile.resumeName].allSatisfy(\.isEmpty)
                && profile.resumeData == nil && profile.resumeSize == nil && profile.resumeSHA256 == nil,
              "New applicants have no personal name, contact, location, profession, link or CV defaults")
        check(profile.experienceLevel == "any" && profile.remote && profile.hybrid && profile.onsite,
              "New applicants have no assumed career stage or restricted work mode")
        profile.firstName = " Example "; profile.lastName = " Applicant "
        profile.skills = "Swift, Kotlin"; profile.resumeName = "Resume.pdf"; profile.resumeData = pdf; profile.resumeChanged = true
        let payload = profile.payload()
        check(payload["firstName"]?.string == "Example", "Trim applicant names")
        check(payload["skills"]?.array.count == 2, "Explicit skills carried")
        check(payload["resume"]?.object["dataBase64"]?.string == pdf.base64EncodedString(), "Exact CV bytes retained")
        var multilingual = PhoneApplicationProfile()
        multilingual.skills = " Swift، Kotlin, العربية ، Swift "
        multilingual.targetRoles = "محاسب، محلل بيانات,,\u{00a0}مصمم\u{00a0}، محاسب"
        multilingual.targetCountries = " sa ، US, ae "
        let multilingualPayload = multilingual.payload()
        check(multilingualPayload["skills"]?.array.compactMap(\.string) == ["Swift", "Kotlin", "العربية", "Swift"],
              "Mixed comma skills preserve order and existing duplicate semantics")
        check(multilingualPayload["targetRoles"]?.array.compactMap(\.string) == ["محاسب", "محلل بيانات", "مصمم", "محاسب"],
              "Arabic target roles trim whitespace and skip empty items without merging roles")
        check(multilingualPayload["targetCountries"]?.array.compactMap(\.string) == ["SA", "US", "AE"],
              "Either comma separates normalized target countries")
        check(multilingual.targetRoleShortcuts == ["محاسب", "محلل بيانات", "مصمم"],
              "Search shortcuts split either comma and deduplicate in first-seen order")
        check(MobileApplicationPolicy.profileListItems(" ، , \u{00a0}، ").isEmpty,
              "Whitespace and either comma alone do not create profile entries")
        let multilingualDraft = try JSONDecoder().decode(PhoneApplicationProfile.self, from: JSONEncoder().encode(multilingual))
        check(multilingualDraft == multilingual, "Parsing for sharing leaves the original phone draft spelling unchanged")
        profile.resumeChanged = false
        check(profile.payload()["resume"] == nil, "Unchanged CV metadata cannot substitute bytes")
        profile.resumeRemoved = true
        check(profile.payload()["resume"] == .null, "Explicit removal is distinct from omission")
        let roundtrip = try JSONDecoder().decode(PhoneApplicationProfile.self, from: JSONEncoder().encode(profile))
        check(roundtrip == profile, "Private draft preserves its fields")
        profile.linkedin = "https://www.linkedin.com/in/example-profile"
        let linkedInRoundtrip = try JSONDecoder().decode(PhoneApplicationProfile.self, from: JSONEncoder().encode(profile))
        check(linkedInRoundtrip == profile, "A LinkedIn link persists with existing draft and CV fields")
        check(profile.payload()["linkedin"] == nil, "Unknown older services do not receive the new profile key")
        check(profile.payload(includeLinkedIn: true)["linkedin"]?.string == profile.linkedin, "Confirmed support includes the exact LinkedIn profile field")
        profile.linkedin = ""
        check(profile.payload(includeLinkedIn: true)["linkedin"] == .string(""), "An explicit empty field can clear a previously saved profile link")
        var oldProfile = try JSONSerialization.jsonObject(with: JSONEncoder().encode(profile)) as! [String: Any]
        oldProfile.removeValue(forKey: "linkedin")
        let migrated = try JSONDecoder().decode(PhoneApplicationProfile.self, from: JSONSerialization.data(withJSONObject: oldProfile))
        check(migrated == profile, "Older stored profiles migrate without losing identity, preferences or CV data")
        oldProfile["linkedin"] = NSNull()
        var malformedLinkRejected = false
        do { _ = try JSONDecoder().decode(PhoneApplicationProfile.self, from: JSONSerialization.data(withJSONObject: oldProfile)) }
        catch { malformedLinkRejected = true }
        check(malformedLinkRejected, "A corrupt present LinkedIn draft is preserved rather than silently erased")
        let encoded = try JSONEncoder().encode(good)
        let decoded = try JSONDecoder().decode([String: ApplicationValue].self, from: encoded)
        check(decoded == good, "Receipt codec roundtrip")
        profile.updateFromServer(["firstName": .string("Updated"), "resume": .object(["name": .string("Other.pdf")])])
        check(profile.resumeData == nil && !profile.resumeChanged && profile.resumeName == "Other.pdf", "Server CV metadata clears stale local bytes")
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent("career-pdf-check-" + UUID().uuidString)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: directory) }
        let file = directory.appendingPathComponent("Exact.pdf")
        try pdf.write(to: file)
        let selected = try MobileApplicationPolicy.readResume(at: file)
        try Data("%PDF-1.4\nchanged original\n%%EOF".utf8).write(to: file)
        check(selected == pdf, "Selected PDF is an owned snapshot after original file changes")
        try profile.selectResume(selected, filename: "Exact.pdf")
        check(profile.resumeSize == selected.count && profile.resumeSHA256?.count == 64, "Selected bytes determine size and fingerprint")
        do { try profile.selectResume(Data("invalid".utf8), filename: "Invalid.pdf") } catch {}
        check(profile.resumeData == selected && profile.resumeName == "Exact.pdf", "Rejected selection leaves the previous PDF intact")
        try Data(repeating: 1, count: MobileApplicationPolicy.maximumResumeBytes + 1).write(to: file)
        var oversizedRejected = false
        do { _ = try MobileApplicationPolicy.readResume(at: file) } catch { oversizedRejected = true }
        check(oversizedRejected, "Bounded file reader rejects oversized files from actual bytes")
        check(MobileApplicationPolicy.isFileSelectionCancelled(CocoaError(.userCancelled)), "File-picker cancellation is distinct from an invalid PDF")
        var expired: MobileApplicationError?
        do { _ = try MobileApplicationResponse.decode(Data("gateway error".utf8), statusCode: 401) }
        catch let error as MobileApplicationError { expired = error }
        check(expired?.statusCode == 401, "Malformed 401 body still carries session-expiry status")
        let conflictBody = try JSONEncoder().encode(["ok": ApplicationValue.bool(false), "error": .object(["code": .string("stale_profile")])])
        var conflict: MobileApplicationError?
        do { _ = try MobileApplicationResponse.decode(conflictBody, statusCode: 409) }
        catch let error as MobileApplicationError { conflict = error }
        check(conflict?.statusCode == 409 && conflict?.code == "stale_profile", "Conflict status and code survive response decoding")
        let deletingBody = try JSONEncoder().encode(["ok": ApplicationValue.bool(false), "error": .object(["code": .string("account_deleting")])])
        var deleting: MobileApplicationError?
        do { _ = try MobileApplicationResponse.decode(deletingBody, statusCode: 409) }
        catch let error as MobileApplicationError { deleting = error }
        check(deleting?.code == "account_deleting" && deleting?.message.contains("being deleted") == true,
              "Pending account deletion has an actionable explanation instead of a profile-conflict prompt")
        print("PASS \(checks) native application boundary checks")
    }
}
