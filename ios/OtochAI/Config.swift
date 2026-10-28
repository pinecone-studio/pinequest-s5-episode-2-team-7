import Foundation

enum Config {
    /// Built-in server address. A Cloudflare quick tunnel URL changes on every `cloudflared` run,
    /// so the app also lets the user type a new one (saved below) without rebuilding in Xcode.
    /// Must be HTTPS for the microphone.
    static let defaultURL = "https://projects-queries-happy-fluid.trycloudflare.com"

    private static let key = "server.url"

    /// The server the app talks to: the address saved in the app, else the built-in one.
    static var url: URL {
        if let saved = UserDefaults.standard.string(forKey: key), let u = URL(string: saved), u.host != nil { return u }
        return URL(string: defaultURL)!
    }

    static var urlString: String { url.absoluteString }

    /// Saves a server address typed by the user ("abc.trycloudflare.com" or a full https:// link).
    /// Returns false when it is not a usable http(s) address.
    @discardableResult
    static func setURL(_ text: String) -> Bool {
        var s = text.trimmingCharacters(in: .whitespacesAndNewlines)
        if s.isEmpty {
            UserDefaults.standard.removeObject(forKey: key)
            return true
        }
        if !s.lowercased().hasPrefix("http://") && !s.lowercased().hasPrefix("https://") { s = "https://" + s }
        while s.hasSuffix("/") { s.removeLast() }
        guard let u = URL(string: s), let host = u.host, host.contains(".") || host == "localhost" else { return false }
        UserDefaults.standard.set(s, forKey: key)
        return true
    }
}
