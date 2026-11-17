import Foundation

/// Translate app-owned labels at every typed level, preserving all string payloads.
func nativeDisplayValue(_ value: ApplicationValue?, appCopy: (String) -> String) -> String {
    guard let value else { return appCopy("Not provided") }
    switch value {
    case .string(let text): return text
    case .bool(let enabled): return appCopy(enabled ? "Yes" : "No")
    case .null: return appCopy("Not provided")
    case .array(let values): return values.map { nativeDisplayValue($0, appCopy: appCopy) }.joined(separator: ", ")
    case .object: return appCopy("Additional details")
    case .number: return value.display
    }
}

/// Comparison-only Saved search. Never use this value as a record key or exported text.
enum NativeSavedSearch {
    static func normalized(_ value: String) -> String {
        let canonical = value.precomposedStringWithCanonicalMapping
        let scalars = canonical.unicodeScalars.filter { scalar in
            scalar.value != 0x0640 && !(0x064B...0x0652).contains(scalar.value) && scalar.value != 0x0670
        }
        return String(String.UnicodeScalarView(scalars)).lowercased(with: Locale(identifier: "en_US_POSIX"))
            .precomposedStringWithCanonicalMapping
    }
    static func terms(_ query: String) -> [String] {
        normalized(query).split(whereSeparator: { $0.isWhitespace }).map(String.init)
    }
    static func matches(_ fields: [String], query: String) -> Bool {
        matches(fields, terms: terms(query))
    }
    static func matches(_ fields: [String], terms requested: [String]) -> Bool {
        guard !requested.isEmpty else { return true }
        let searchable = normalized(fields.joined(separator: " "))
        return requested.allSatisfy { searchable.contains($0) }
    }
}

#if os(iOS)
import SwiftUI

/// A display preference only: accounts, workspace records and wire values are unchanged.
enum NativeLanguage: String, CaseIterable, Identifiable {
    case system, en, ar
    var id: String { rawValue }
    var title: String { switch self { case .system: "Device language"; case .en: "English"; case .ar: "العربية" } }
    var locale: Locale {
        if self != .system { return Locale(identifier: rawValue) }
        let supported = Locale.preferredLanguages.compactMap { Locale(identifier: $0).languageCode }
            .first { $0 == "ar" || $0 == "en" } ?? "en"
        return Locale(identifier: supported)
    }
    var direction: LayoutDirection { locale.languageCode == "ar" ? .rightToLeft : .leftToRight }
    @MainActor static var storageKey: String {
        #if DEBUG
        if CareerAppEnvironment.isUIAcceptance {
            return "career.display.language.acceptance." + (ProcessInfo.processInfo.environment["CAREER_UI_TEST_ID"] ?? "fixture")
        }
        #endif
        return "career.display.language"
    }
}

/// Observe locale changes without recreating stores or discarding a view's drafts.
@propertyWrapper
struct NativeLocalization: DynamicProperty {
    @Environment(\.locale) private var locale
    var wrappedValue: NativeCopy { NativeCopy(locale: locale) }
}

struct NativeCopy {
    let locale: Locale
    private var isArabic: Bool { locale.languageCode == "ar" }
    private var bundle: Bundle {
        guard let path = Bundle.main.path(forResource: isArabic ? "ar" : "en", ofType: "lproj"),
              let localized = Bundle(path: path) else { return .main }
        return localized
    }
    private struct Template: Decodable {
        let key: String
        let parts: [String]
        let arguments: Int
    }
    private static let templates: [Template] = {
        guard let url = Bundle.main.url(forResource: "NativeCopyTemplates", withExtension: "json"),
              let data = try? Data(contentsOf: url),
              let entries = try? JSONDecoder().decode([Template].self, from: data) else { return [] }
        return entries.filter { item in
            item.arguments > 0 && item.arguments <= 12 && item.parts.count == item.arguments + 1
                && !item.parts.dropFirst().dropLast().contains("")
                && item.parts.joined().count >= 6
        }
    }()
    private func arguments(in text: String, for template: Template) -> [String]? {
        guard text.hasPrefix(template.parts[0]) else { return nil }
        var cursor = text.index(text.startIndex, offsetBy: template.parts[0].count)
        var values: [String] = []
        for index in 1...template.arguments {
            let delimiter = template.parts[index]
            if delimiter.isEmpty && index == template.arguments {
                values.append(String(text[cursor...])); cursor = text.endIndex
            } else if index == template.arguments {
                guard text.hasSuffix(delimiter) else { return nil }
                let start = text.index(text.endIndex, offsetBy: -delimiter.count)
                guard start >= cursor else { return nil }
                values.append(String(text[cursor..<start])); cursor = text.endIndex
            } else {
                guard let match = text.range(of: delimiter, range: cursor..<text.endIndex) else { return nil }
                values.append(String(text[cursor..<match.lowerBound])); cursor = match.upperBound
            }
        }
        return cursor == text.endIndex ? values : nil
    }
    private func value(_ key: String) -> String? {
        let missing = "__career_copy_missing__"
        let value = bundle.localizedString(forKey: key, value: missing, table: "Localizable")
        return value == missing ? nil : value
    }
    private func interpolate(_ format: String, _ arguments: [String]) -> String {
        // Replace only original resource placeholders; inserted user text is not interpreted again.
        let expression = try! NSRegularExpression(pattern: "\\{([0-9]+)\\}")
        var result = format
        let matches = expression.matches(in: format, range: NSRange(format.startIndex..., in: format))
        for match in matches.reversed() {
            guard let numberRange = Range(match.range(at: 1), in: format), let index = Int(format[numberRange]),
                  arguments.indices.contains(index), let range = Range(match.range, in: result) else { continue }
            let argument = arguments[index]
            result.replaceSubrange(range, with: isArabic ? "\u{2068}" + argument + "\u{2069}" : argument)
        }
        return result
    }
    func callAsFunction(_ text: String) -> String {
        guard isArabic else { return text }
        if let direct = value(text) { return direct }
        guard text.utf16.count <= 12_000 else { return text }
        for template in Self.templates {
            guard let arguments = arguments(in: text, for: template), let translated = value(template.key) else { continue }
            return interpolate(translated, arguments)
        }
        return text
    }
    /// Typed labels and container captions are app copy; string payload fields stay original.
    func displayValue(_ value: ApplicationValue?) -> String {
        nativeDisplayValue(value, appCopy: { self($0) })
    }
    func format(_ key: String, _ arguments: [String]) -> String {
        interpolate(isArabic ? value(key) ?? key : key, arguments)
    }
    /// App errors only. Unknown details are preserved under a general localized prefix.
    func message(_ text: String) -> String {
        let translated = self(text)
        guard isArabic, translated == text,
              !text.unicodeScalars.contains(where: { (0x0600...0x06ff).contains($0.value) }),
              text.range(of: "[A-Za-z]", options: .regularExpression) != nil else { return translated }
        return self("This action could not be completed. Original details:") + "\n\u{2068}" + text + "\u{2069}"
    }
    /// Compose translated captions around original country/city/role preferences.
    func criteriaSummary(_ profile: NativeProfile) -> String {
        let country = profile.effectiveCountry.isEmpty ? self("Any covered country")
            : locale.localizedString(forRegionCode: profile.effectiveCountry) ?? profile.effectiveCountry
        var parts = [country, profile.effectiveCity.isEmpty ? self("Any city in that scope") : profile.effectiveCity]
        if let role = profile.roleKeywords, !role.isEmpty { parts.append(format("Role words: {0}", [role])) }
        if profile.hasPayFloor, let amount = profile.minimumMonthlyAmount {
            let formatter = NumberFormatter(); formatter.locale = locale; formatter.numberStyle = .decimal
            formatter.maximumFractionDigits = 0
            parts.append(format("Minimum SAR {0}/month", [formatter.string(from: NSNumber(value: amount)) ?? String(Int(amount))]))
            parts.append(self(profile.hidesUnverifiedSalary ? "Unverified salaries hidden" : "Unverified salaries shown"))
        } else { parts.append(self("No pay floor")) }
        return parts.joined(separator: " · ")
    }
    func civilDate(_ value: String) -> String {
        PhoneRecordDay.date(value).map { date($0) } ?? value
    }
    /// Preserve source civil days and the user's selected display zone, changing only language.
    func sourceDate(_ value: String, profile: NativeProfile, includeTime: Bool = false) -> String {
        guard let parsed = CareerFeed.parsedDate(value) else { return self("Not stated") }
        let dateOnly = value.count == 10
        let selectedZone = TimeZone(identifier: dateOnly ? "Asia/Riyadh" : profile.effectiveTimeZone) ?? .current
        let formatter = DateFormatter(); formatter.locale = locale; formatter.calendar = Calendar(identifier: .gregorian)
        formatter.timeZone = selectedZone; formatter.dateStyle = .medium
        formatter.timeStyle = includeTime && !dateOnly ? .short : .none
        guard includeTime && !dateOnly else { return formatter.string(from: parsed) }
        let offset = selectedZone.secondsFromGMT(for: parsed)
        let offsetLabel = String(format: "UTC%@%02d:%02d", offset < 0 ? "−" : "+", abs(offset) / 3600, (abs(offset) % 3600) / 60)
        return formatter.string(from: parsed) + " · " + profile.effectiveTimeZone + " (" + offsetLabel + ")"
    }
    func time(_ date: Date) -> String {
        let formatter = DateFormatter(); formatter.locale = locale
        formatter.calendar = Calendar(identifier: .gregorian); formatter.timeStyle = .short
        return formatter.string(from: date)
    }
    func date(_ date: Date, includeTime: Bool = false) -> String {
        let formatter = DateFormatter()
        formatter.locale = locale
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.dateStyle = .medium
        formatter.timeStyle = includeTime ? .short : .none
        return formatter.string(from: date)
    }
}


/// Localized export captions are constructed before the editable preview. Imported
/// values and any edits made in that preview are never passed through a translator.
extension NativeCopy {
    private func profileNote(_ profile: NativeProfile) -> String {
        format("SELF-ENTERED PROFILE — verify before using\nRelevant years: {0}\nDegree and certifications: {1}\nTools and responsibilities: {2}\nAchievements: {3}", [profile.years.isEmpty ? self("Not provided") : profile.years, profile.degree, profile.skills, profile.achievements])
    }
    @MainActor func note(for job: CareerJob, in store: NativeCareerStore, includeProfile: Bool = false) -> String {
        guard isArabic else { return store.note(for: job, includeProfile: includeProfile) }
        let researchDate = job.researchCheckedAt ?? (store.isCurrentResearch(job) ? store.research.checkedAt : nil)
        let archived = job.kind == "archived" || (!store.isCurrentResearch(job) && job.rank != nil)
        let salary = researchDate.map { format("Salary was not disclosed in the research checked {0}.", [sourceDate($0, profile: store.workspace.profile)]) }
            ?? self(archived ? "Original research check date is unavailable. Recheck salary." : "Salary was not checked for this live lead.")
        let history = archived ? self("\nArchived saved research; this role is not in the current shortlist.\n") : ""
        let checked = store.employerObservation(job).lastCheckedAt.map { sourceDate($0, profile: store.workspace.profile) } ?? self("Not recorded")
        let deadline = job.closes.flatMap { $0.isEmpty ? nil : sourceDate($0, profile: store.workspace.profile) } ?? self("Not published")
        let header = format("APPLICATION PREPARATION — {0}\n{1} · {2}\n{3}{4}\n\nEmployer checked: {5}\nListed deadline: {6}\nDate-only deadlines use Riyadh calendar days. Past checks and listed deadlines do not establish current availability; recheck with the employer.\n\nFit: {7}\n{8}\n\nConfirm first:\n", [job.title, job.company, job.location, job.applicationURL?.absoluteString ?? job.url, history, checked, deadline, job.fit, job.summary])
        let requirements = job.requirements.map { "• " + $0 }.joined(separator: "\n")
        let steps = job.applicationSteps.enumerated().map { item in
            String(item.offset + 1) + ". " + (item.element.first ?? "") + ": " + (item.element.count > 1 ? item.element[1] : "")
        }.joined(separator: "\n\n")
        return header + requirements + self("\n\nSteps:\n") + steps + (includeProfile ? "\n\n" + profileNote(store.workspace.profile) : "")
            + format("\n\nStatus: {0}\n", [self(store.status(for: job))]) + salary + self(" Review and submit personally on the employer website.")
    }
    @MainActor private func recordNote(_ id: String, in store: NativeCareerStore) -> String {
        let record = store.applicationRecords[id], draft = store.recordDrafts[id]
        let applied = record.map { $0.appliedAt.isEmpty ? self("Not recorded") : civilDate($0.appliedAt) } ?? self("Not recorded")
        var result = format("\nApplication date (self-entered): {0}\nReceipt / record note (self-entered): {1}", [applied, record?.receiptNote ?? self("Not recorded")])
        if let record {
            let edited = ApplicationReviewPolicy.date(record.updatedAt).map { date($0, includeTime: true) } ?? record.updatedAt
            result += format("\nRecord last edited (not application time): {0}", [edited])
        }
        if let error = store.recordErrors[id] { result += format("\nRecord notice: {0}", [message(error)]) }
        if let draft, draft.dirty {
            result += format("\nUNSAVED application record draft\nApplication date: {0}\nReceipt / record note: {1}", [draft.appliedAt.isEmpty ? self("Not recorded") : civilDate(draft.appliedAt), draft.receiptNote])
        }
        return result
    }
    @MainActor func exportNotes(from store: NativeCareerStore) -> String {
        guard isArabic else { return store.exportText() }
        let jobs = store.exportJobs
        let labels = ["profile": "Professional record", "evidence": "Achievement stories", "cv": "Prepare your CV materials", "priority": "Review selected role requirements", "deadline": "Check selected deadlines", "review": "Applications reviewed"]
        let checklist = labels.keys.sorted().map { (store.workspace.completed.contains($0) ? "[x] " : "[ ] ") + self(labels[$0] ?? $0) }.joined(separator: "\n")
        return format("CAREER FINDER — APPLICATION NOTES\nLegacy research reference date (retained records only): {0}\n\n", [sourceDate(store.research.checkedAt, profile: store.workspace.profile)])
            + profileNote(store.workspace.profile) + self("\n\nPREPARATION CHECKLIST\n") + checklist
            + self("\n\nChecked items record your preparation on this device. Recheck the requirements, dates and materials for each application.\n\nSAVED AND TRACKED APPLICATIONS\n\n")
            + jobs.map { note(for: $0, in: store) + recordNote($0.id, in: store) }.joined(separator: "\n\n——————————\n\n")
    }
}
#endif
