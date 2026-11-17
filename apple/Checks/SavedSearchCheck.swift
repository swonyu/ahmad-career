import Foundation

private struct SearchFixture: Decodable {
    let schema: Int
    let cases: [SearchCase]
}
private struct SearchCase: Decodable {
    let id: String
    let fields: [String]
    let query: String
    let matches: Bool
}

@main struct SavedSearchCheck {
    static func main() throws {
        guard CommandLine.arguments.count == 2 else { fatalError("Expected the shared saved-search fixture path") }
        let bytes = try Data(contentsOf: URL(fileURLWithPath: CommandLine.arguments[1]))
        let fixture = try JSONDecoder().decode(SearchFixture.self, from: bytes)
        precondition(fixture.schema == 1)
        for item in fixture.cases {
            let originalFields = item.fields, originalQuery = item.query
            precondition(NativeSavedSearch.matches(item.fields, query: item.query) == item.matches, "Saved search: \(item.id)")
            precondition(item.fields == originalFields && item.query == originalQuery, "Comparison must not rewrite source content")
        }
        print("Saved-search comparison contract: \(fixture.cases.count) cases passed")
        let translations = ["Yes": "نعم", "No": "لا", "Not provided": "غير مُقدّم", "Additional details": "تفاصيل إضافية"]
        let localize: (String) -> String = { translations[$0] ?? $0 }
        let nested = ApplicationValue.array([.string("Yes"), .bool(true), .null,
            .array([.bool(false), .string("Not provided {0}"), .object(["private": .string("Original employer answer")])]), .number(4)])
        let original = try JSONEncoder().encode(nested)
        precondition(nativeDisplayValue(nested, appCopy: localize) == "Yes, نعم, غير مُقدّم, لا, Not provided {0}, تفاصيل إضافية, 4.0")
        precondition(nativeDisplayValue(.string("Additional details"), appCopy: localize) == "Additional details")
        precondition(nativeDisplayValue(nil, appCopy: localize) == "غير مُقدّم")
        let roundTrip = try JSONDecoder().decode(ApplicationValue.self, from: original)
        precondition(roundTrip == nested)
        print("Nested typed display contract: app labels localized, source strings and payload preserved")
    }
}
