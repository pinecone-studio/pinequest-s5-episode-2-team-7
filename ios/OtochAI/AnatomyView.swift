import SwiftUI

/// Human Atlas viewer (BodyParts3D, Mongolian names) served by the web app at /anatomy/.
/// Opened from «Мэдлэг» (AtlasScreen) and from body-system articles.
struct AtlasWeb: View {
    var body: some View {
        WebView(url: Config.url.appendingPathComponent("anatomy/index.html"))
            .background(Theme.canvas)
    }
}
