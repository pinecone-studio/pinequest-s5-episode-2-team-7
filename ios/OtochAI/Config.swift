import Foundation

enum Config {
    // Cloudflare tunnel URL (changes on every `cloudflared` run). Must be HTTPS for the microphone.
    static let url = URL(string: "https://projects-queries-happy-fluid.trycloudflare.com")!
}
