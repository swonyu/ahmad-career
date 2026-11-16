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
        check(profile.firstName.isEmpty && profile.lastName.isEmpty && profile.email.isEmpty && profile.resumeData == nil,
              "No personal defaults")
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
        print("PASS \(checks) native application boundary checks")
    }
}
