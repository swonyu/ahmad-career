import Foundation
import Darwin

/// Exercises the actual display helper without a simulator, account or request.
@main
struct DiscoverySummaryCheck {
    static func main() {
        var checks = 0
        func check(_ value: Bool, _ message: String) throws {
            guard value else { throw NSError(domain: "DiscoverySummaryCheck", code: 1,
                userInfo: [NSLocalizedDescriptionKey: message]) }
            checks += 1
        }
        let arabic = ["All roles": "جميع الوظائف", "Any location": "أي موقع",
                      "Any work arrangement": "أي نمط عمل", "Remote evidence": "إشارة إلى العمل عن بُعد"]
        do {
            for language in ["en", "ar"] {
                let translated: (String) -> String = { language == "ar" ? (arabic[$0] ?? "MISSING:" + $0) : $0 }
                var copied: [String] = []
                func render(_ query: DiscoveryQuery) -> String {
                    copied = []
                    return nativeDiscoverySummary(query) { key in copied.append(key); return translated(key) }
                }
                try check(render(DiscoveryQuery()) == [translated("All roles"), translated("Any location"), translated("Any work arrangement")].joined(separator: " · "),
                          "\(language): empty-field defaults must be localized individually")
                try check(copied == ["All roles", "Any location", "Any work arrangement"], "All and only app defaults are translated")
                var explicit = DiscoveryQuery(); explicit.keywords = "All roles"; explicit.location = "Any location"
                try check(render(explicit) == "All roles · Any location · " + translated("Any work arrangement"),
                          "\(language): explicit words equal to default labels must remain verbatim")
                try check(copied == ["Any work arrangement"], "Explicit search words are not submitted to the copy lookup")
                explicit.keywords = "  مُمَرِّض / Nurse  "; explicit.location = "  Montréal  "
                try check(render(explicit) == explicit.keywords + " · " + explicit.location + " · " + translated("Any work arrangement"),
                          "\(language): supplied spaces, accents, script and punctuation remain exact")
                try check(copied == ["Any work arrangement"], "Custom query and location are not translated or normalized")
                explicit.keywords = ""; explicit.location = "Remote"; explicit.remoteOnly = true
                try check(render(explicit) == translated("All roles") + " · Remote · " + translated("Remote evidence"),
                          "\(language): the remote arrangement is app copy while the location stays original")
                try check(copied == ["All roles", "Remote evidence"], "Only the empty role and arrangement are app copy")
                explicit.keywords = " "; explicit.location = ""; explicit.remoteOnly = false
                try check(render(explicit) == "  · " + translated("Any location") + " · " + translated("Any work arrangement"),
                          "\(language): display formatting does not trim a supplied search value")
                try check(copied == ["Any location", "Any work arrangement"], "Only genuinely empty text takes a default label")
            }
            print("PASS \(checks) actual discovery-summary assertions across English and Arabic")
        } catch { fputs(error.localizedDescription + "\n", stderr); exit(1) }
    }
}
