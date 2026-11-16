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
        let pdf = Data("%PDF-1.4\nsynthetic policy fixture\n%%EOF".utf8)
        check(MobileApplicationPolicy.resumeError(pdf, filename: "Resume.pdf") == nil, "PDF accepted")
        check(MobileApplicationPolicy.resumeError(Data("not a PDF".utf8), filename: "Resume.pdf") != nil, "Mismatched bytes rejected")
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
        let job = "https://jobs.lever.co/example/00000000-0000-4000-8000-000000000001"
        check(MobileApplicationPolicy.jobIdentity(job) == MobileApplicationPolicy.jobIdentity(job + "/apply?utm_source=link#top"),
              "Application URL variants preserve duplicate identity")
        var profile = PhoneApplicationProfile()
        check([profile.firstName, profile.lastName, profile.email, profile.phone, profile.city, profile.country,
               profile.headline, profile.skills, profile.targetRoles, profile.targetCountries, profile.website, profile.resumeName].allSatisfy(\.isEmpty)
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
        profile.resumeChanged = false
        check(profile.payload()["resume"] == nil, "Unchanged CV metadata cannot substitute bytes")
        profile.resumeRemoved = true
        check(profile.payload()["resume"] == .null, "Explicit removal is distinct from omission")
        let roundtrip = try JSONDecoder().decode(PhoneApplicationProfile.self, from: JSONEncoder().encode(profile))
        check(roundtrip == profile, "Private draft preserves its fields")
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
