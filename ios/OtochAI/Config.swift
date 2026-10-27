import Foundation

enum Config {
    // Cloudflare tunnel URL (changes on every `cloudflared` run). Must be HTTPS for the microphone.
    #if targetEnvironment(simulator)
    // The Simulator shares the Mac's network: talk to `npm run dev` directly (IP hosts are exempt from ATS).
    static let url = URL(string: "http://127.0.0.1:3000")!
    #else
    static let url = URL(string: "https://supervisors-nose-triangle-fires.trycloudflare.com")!
    #endif
}
