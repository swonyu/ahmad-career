import Foundation

@main
enum LiveFeedCheck {
    static func main() async throws {
        let payload = await CareerFeed.refresh()
        guard let sources = payload["sources"] as? [[String: Any]],
              let jobs = payload["jobs"] as? [[String: Any]], sources.count == CareerFeed.activeSourceNames.count else {
            fatalError("Invalid native refresh payload")
        }
        let data = try JSONSerialization.data(withJSONObject: payload, options: [.prettyPrinted, .sortedKeys])
        try data.write(to: URL(fileURLWithPath: "BuildLogs/live-refresh.json"))
        for source in sources {
            print("\(source["name"] ?? "Unknown"): ok=\(source["ok"] ?? false), jobs=\(source["count"] ?? 0), limited=\(source["limited"] ?? false)\(source["error"].map { ", error=\($0)" } ?? "")")
        }
        precondition(sources.contains { $0["ok"] as? Bool == true }, "No employer source responded successfully")
        precondition(jobs.allSatisfy { ($0["salary"] is NSNull) && ($0["fit"] as? String == "Needs review") })
        print("PASS: native URLSession refresh returned \(jobs.count) leads across \(sources.count) explicit source results")
    }
}
