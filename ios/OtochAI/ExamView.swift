import SwiftUI
import WebKit

/// Oral exam: the web page /exam shows the examiner avatar, asks the questions
/// aloud and records spoken answers. The quiz is injected before the page
/// loads; the page posts back `{type: "answers", answers}` or `{type: "text"}`.
struct ExamView: UIViewRepresentable {
    let quiz: Quiz
    let onAnswers: ([String]) -> Void
    let onText: () -> Void

    func makeCoordinator() -> Coordinator { Coordinator(self) }

    func makeUIView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        config.allowsInlineMediaPlayback = true
        config.mediaTypesRequiringUserActionForPlayback = []
        // The quiz without answer keys: the examiner only needs to ask.
        let questions = quiz.questions.map { ["id": $0.id, "kind": $0.kind, "prompt": $0.prompt, "options": $0.options] as [String: Any] }
        let payload: [String: Any] = ["title": quiz.title, "questions": questions]
        if let data = try? JSONSerialization.data(withJSONObject: payload), let json = String(data: data, encoding: .utf8) {
            config.userContentController.addUserScript(WKUserScript(source: "window.__OTOCH_QUIZ = \(json);", injectionTime: .atDocumentStart, forMainFrameOnly: true))
        }
        config.userContentController.add(context.coordinator, name: "otoch")

        let webView = WKWebView(frame: .zero, configuration: config)
        webView.uiDelegate = context.coordinator
        webView.isOpaque = false
        webView.backgroundColor = .black
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        webView.load(URLRequest(url: Config.url.appendingPathComponent("exam")))
        return webView
    }

    func updateUIView(_ webView: WKWebView, context: Context) {}

    static func dismantleUIView(_ webView: WKWebView, coordinator: Coordinator) {
        // Unload the page so the avatar session and microphone close at once.
        webView.configuration.userContentController.removeScriptMessageHandler(forName: "otoch")
        webView.loadHTMLString("", baseURL: nil)
    }

    final class Coordinator: NSObject, WKScriptMessageHandler, WKUIDelegate {
        let parent: ExamView
        init(_ parent: ExamView) { self.parent = parent }

        func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
            guard let body = message.body as? [String: Any], let type = body["type"] as? String else { return }
            if type == "answers" {
                parent.onAnswers(body["answers"] as? [String] ?? [])
            } else if type == "text" {
                parent.onText()
            }
        }

        func webView(_ webView: WKWebView,
                     requestMediaCapturePermissionFor origin: WKSecurityOrigin,
                     initiatedByFrame frame: WKFrameInfo,
                     type: WKMediaCaptureType,
                     decisionHandler: @escaping (WKPermissionDecision) -> Void) {
            decisionHandler(.grant)
        }
    }
}
