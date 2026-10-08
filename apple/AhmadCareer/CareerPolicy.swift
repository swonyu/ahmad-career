import Foundation

enum CareerNavigation: Equatable {
    case bundled, external, blocked
}

enum CareerPolicy {
    static func acceptsRefresh(_ body: Any) -> Bool {
        guard let message = body as? [String: Any], message.count == 1 else { return false }
        return message["action"] as? String == "refresh"
    }

    static func navigation(_ url: URL, webRoot: URL, userInitiated: Bool) -> CareerNavigation {
        if url.isFileURL {
            guard url.host == nil || url.host == "" else { return .blocked }
            let root = webRoot.resolvingSymlinksInPath().standardizedFileURL.path + "/"
            let path = url.resolvingSymlinksInPath().standardizedFileURL.path
            return path.hasPrefix(root) ? .bundled : .blocked
        }
        switch url.scheme?.lowercased() {
        case "https", "http":
            return url.host?.isEmpty == false ? .external : .blocked
        case "mailto":
            return userInitiated && !url.path.isEmpty ? .external : .blocked
        default:
            return .blocked
        }
    }
}
