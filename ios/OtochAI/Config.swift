import Foundation

enum Config {
    // Cloudflare tunnel URL (changes on every `cloudflared` run). Must be HTTPS for the microphone.
    // The phone can save a newer address in the app («Баг» shows the field when the server is unreachable),
    // so a new tunnel does not need a rebuild in Xcode.
    #if targetEnvironment(simulator)
    // The Simulator shares the Mac's network: talk to `npm run dev` directly (IP hosts are exempt from ATS).
    static let defaultURL = "http://127.0.0.1:3000"
    #else
    static let defaultURL = "https://supervisors-nose-triangle-fires.trycloudflare.com"
    #endif

    private static let key = "server.url"

    /// The server the app talks to: the address saved in the app, else the built-in one.
    static var url: URL {
        if let saved = UserDefaults.standard.string(forKey: key), let u = URL(string: saved), u.host != nil { return u }
        return URL(string: defaultURL)!
    }

    static var urlString: String { url.absoluteString }

    /// Saves a server address typed by the user ("abc.trycloudflare.com" or a full https:// link).
    /// An empty text goes back to the built-in address. Returns false when it is not a usable http(s) address.
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
