import SwiftUI
import UserNotifications
import WebKit

@main
struct OtochAIApp: App {
    init() {
        // Team notifications (a new challenge, a staff member's result) also show while the app is open.
        UNUserNotificationCenter.current().delegate = NotificationBanner.shared
    }

    var body: some Scene {
        WindowGroup {
            RootView()
        }
    }
}

/// Bottom tab bar: «Нүүр», «Сорил» (self-check from your own material), the AI
/// дасгалжуулагч in the middle (the orb: practise with an AI persona by video or
/// phone), «Баг» (employer ↔ staff: challenges and results) and «Дүгнэлт»
/// (all feedback in one place). On first launch the user picks a role.
struct RootView: View {
    @StateObject private var history = QuizHistory()
    @StateObject private var news = NewsStore()
    @StateObject private var results = ScenarioHistory()
    @StateObject private var coach = CoachStore()
    @StateObject private var team = TeamStore()
    @AppStorage("mainTab") private var tab = AppTab.home
    @AppStorage(UserRole.storageKey) private var roleRaw = ""
    @Environment(\.scenePhase) private var scenePhase
    @State private var askedSignIn = false
    @State private var showSignIn = false
    @State private var keyboardShown = false
    @ObservedObject private var chrome = AppChrome.shared

    /// No role yet, or one from the old health-only version: show the new onboarding.
    private var needsRole: Bool { UserRole(rawValue: roleRaw).map { !UserRole.pickable.contains($0) } ?? true }

    var body: some View {
        TabView(selection: $tab) {
            HomeView(tab: $tab).tag(AppTab.home).tabContent()
            QuizView().tag(AppTab.quiz).tabContent()
            CoachHub().tag(AppTab.coach).tabContent()
            TeamView().tag(AppTab.team).tabContent()
            FeedbackView().tag(AppTab.feedback).tabContent()
        }
        .overlay(alignment: .bottom) {
            // Hidden while typing: otherwise the keyboard pushes it up over the form's buttons.
            if !keyboardShown && !chrome.hideTabBar {
                FloatingTabBar(tab: $tab, teamBadge: team.unseen)
                    .padding(.bottom, 2)
                    .ignoresSafeArea(.keyboard)
                    .transition(.opacity)
            }
        }
        .animation(.easeOut(duration: 0.15), value: keyboardShown)
        .animation(.easeOut(duration: 0.15), value: chrome.hideTabBar)
        .onReceive(NotificationCenter.default.publisher(for: UIResponder.keyboardWillShowNotification)) { _ in keyboardShown = true }
        .onReceive(NotificationCenter.default.publisher(for: UIResponder.keyboardWillHideNotification)) { _ in keyboardShown = false }
        .tint(brand)
        .preferredColorScheme(.dark)
        .environmentObject(history)
        .environmentObject(news)
        .environmentObject(results)
        .environmentObject(coach)
        .environmentObject(team)
        .fullScreenCover(isPresented: .constant(needsRole)) {
            OnboardingView { role in
                askedSignIn = true
                roleRaw = role.rawValue
                tab = role == .manager ? .team : .coach
                Task { await coach.load(); await team.load() }
            }
            .interactiveDismissDisabled()
        }
        .onAppear {
            // Tabs that moved elsewhere (AI өвчтөн → AI дасгалжуулагч, Мэдлэг, Мэдээ) open «Нүүр».
            if !AppTab.visible.contains(tab) { tab = .home }
        }
        .onChange(of: scenePhase) { _, phase in
            // Check for new challenges/results whenever the app comes back (local notifications).
            if phase == .active { Task { await team.load() } }
        }
        .onChange(of: tab) { _, newTab in
            if newTab == .team { team.markSeen() }
        }
        // Not signed in yet (after choosing a role): ask once, inside the app.
        .onChange(of: coach.needsSignIn) { _, needs in
            if needs && !needsRole && !askedSignIn {
                askedSignIn = true
                showSignIn = true
            }
        }
        .sheet(isPresented: $showSignIn) {
            SignInSheet { Task { await coach.load(); await team.load() } }
        }
    }
}

/// App-wide chrome state: a full-screen flow (answering a Сорил) hides the floating tab bar
/// so its own bottom buttons are not covered.
final class AppChrome: ObservableObject {
    static let shared = AppChrome()
    @Published var hideTabBar = false
}

private extension View {
    /// Hides the system tab bar and keeps content clear of the floating one.
    func tabContent() -> some View {
        self.toolbar(.hidden, for: .tabBar)
            .safeAreaInset(edge: .bottom, spacing: 0) { Color.clear.frame(height: 92) }
    }
}

/// The floating pill tab bar: an icon with its name under it, the selected one
/// magenta; the AI дасгалжуулагч sits in the middle as the orb.
struct FloatingTabBar: View {
    @Binding var tab: AppTab
    var teamBadge = 0

    private struct Item: Identifiable {
        let tab: AppTab
        let icon: String
        let title: String
        var id: Int { tab.rawValue }
    }

    private let items = [
        Item(tab: .home, icon: "house", title: "Нүүр"),
        Item(tab: .quiz, icon: "list.clipboard", title: "Сорил"),
        Item(tab: .coach, icon: "", title: "Дасгалжуулагч"),
        Item(tab: .team, icon: "person.3", title: "Баг"),
        Item(tab: .feedback, icon: "chart.bar.doc.horizontal", title: "Дүгнэлт"),
    ]

    var body: some View {
        HStack(spacing: 2) {
            ForEach(items) { item in
                let selected = tab == item.tab
                Button {
                    withAnimation(.snappy(duration: 0.25)) { tab = item.tab }
                } label: {
                    VStack(spacing: 4) {
                        if item.tab == .coach {
                            Orb(size: 46, animated: false)
                                .overlay(Circle().stroke(selected ? Theme.gold : Color.white.opacity(0.25), lineWidth: 2))
                        } else {
                            Image(systemName: item.icon)
                                .font(.system(size: 18, weight: selected ? .semibold : .regular))
                                .foregroundStyle(selected ? Theme.accentInk : Theme.ink)
                                .frame(width: 46, height: 46)
                                .background {
                                    if selected {
                                        Circle().fill(Theme.accentGradient)
                                            .shadow(color: Theme.accent.opacity(0.4), radius: 8, x: 0, y: 4)
                                    } else {
                                        Circle().fill(Theme.field)
                                    }
                                }
                                .overlay(alignment: .topTrailing) {
                                    if item.tab == .team && teamBadge > 0 {
                                        Text("\(min(teamBadge, 9))")
                                            .font(.system(size: 10, weight: .bold))
                                            .foregroundStyle(.white)
                                            .frame(width: 17, height: 17)
                                            .background(Theme.alert, in: Circle())
                                            .offset(x: 2, y: -2)
                                    }
                                }
                        }
                        Text(item.title)
                            .font(.system(size: 11, weight: selected ? .semibold : .medium))
                            .foregroundStyle(selected ? Theme.accentDeep : Theme.muted)
                            .lineLimit(1)
                            .minimumScaleFactor(0.7)
                    }
                    .frame(width: item.tab == .coach ? 74 : 62)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityElement(children: .ignore)
                .accessibilityLabel(item.tab == .team && teamBadge > 0 ? "\(item.title), \(teamBadge) шинэ" : item.title)
                .accessibilityAddTraits(selected ? [.isButton, .isSelected] : .isButton)
            }
        }
        .padding(.horizontal, 6)
        .padding(.vertical, 8)
        .background(.ultraThinMaterial, in: Capsule())
        .background(Color.black.opacity(0.35), in: Capsule())
        .overlay(Capsule().stroke(Theme.line, lineWidth: 1))
        .shadow(color: Theme.shadow, radius: 18, x: 0, y: 8)
    }
}

struct WebView: UIViewRepresentable {
    let url: URL

    func makeCoordinator() -> Coordinator { Coordinator() }

    func makeUIView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        config.allowsInlineMediaPlayback = true
        config.mediaTypesRequiringUserActionForPlayback = []
        let webView = WKWebView(frame: .zero, configuration: config)
        // Navy instead of a white flash while the page loads.
        webView.isOpaque = false
        webView.backgroundColor = UIColor(Theme.canvas)
        webView.scrollView.backgroundColor = UIColor(Theme.canvas)
        webView.uiDelegate = context.coordinator
        webView.navigationDelegate = context.coordinator
        webView.allowsBackForwardNavigationGestures = true

        // Spinner while the page loads, so the tab is never just a white screen.
        let spinner = UIActivityIndicatorView(style: .large)
        spinner.translatesAutoresizingMaskIntoConstraints = false
        spinner.hidesWhenStopped = true
        webView.addSubview(spinner)
        NSLayoutConstraint.activate([
            spinner.centerXAnchor.constraint(equalTo: webView.centerXAnchor),
            spinner.centerYAnchor.constraint(equalTo: webView.centerYAnchor),
        ])
        context.coordinator.spinner = spinner
        context.coordinator.url = url

        webView.load(URLRequest(url: url, timeoutInterval: 20))
        return webView
    }

    func updateUIView(_ webView: WKWebView, context: Context) {}

    final class Coordinator: NSObject, WKUIDelegate, WKNavigationDelegate {
        weak var spinner: UIActivityIndicatorView?
        var url: URL?

        func webView(_ webView: WKWebView, didStartProvisionalNavigation navigation: WKNavigation!) {
            spinner?.startAnimating()
        }

        func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
            spinner?.stopAnimating()
        }

        /// A dead tunnel answers with Cloudflare's 502/530 page: treat 5xx on the main page as unreachable.
        func webView(_ webView: WKWebView, decidePolicyFor navigationResponse: WKNavigationResponse,
                     decisionHandler: @escaping (WKNavigationResponsePolicy) -> Void) {
            if navigationResponse.isForMainFrame, let http = navigationResponse.response as? HTTPURLResponse, http.statusCode >= 500 {
                decisionHandler(.cancel)
                let error = NSError(domain: "Otech", code: http.statusCode, userInfo: [NSLocalizedDescriptionKey: "Сервер хариу өгсөнгүй (\(http.statusCode)). Mac дээрх сервер эсвэл туннель унтарсан байж магадгүй."])
                showError(in: webView, error)
                return
            }
            decisionHandler(.allow)
        }

        func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
            showError(in: webView, error)
        }

        func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
            showError(in: webView, error)
        }

        /// Server unreachable (e.g. the Cloudflare tunnel URL changed): show why and a retry button.
        private func showError(in webView: WKWebView, _ error: Error) {
            spinner?.stopAnimating()
            if (error as NSError).code == NSURLErrorCancelled { return }
            print("[WebView] load failed:", error)
            let target = url?.absoluteString ?? ""
            let html = """
            <html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head>
            <body style="font-family:-apple-system;text-align:center;padding:80px 24px;color:#333">
            <h2>Сервертэй холбогдож чадсангүй</h2>
            <p style="color:#777">\(error.localizedDescription)</p>
            <p style="color:#999;font-size:13px;word-break:break-all">\(target)</p>
            <a href="\(target)" style="display:inline-block;margin-top:20px;padding:12px 28px;border-radius:12px;background:#7d3bed;color:#fff;text-decoration:none;font-weight:600">Дахин оролдох</a>
            </body></html>
            """
            webView.loadHTMLString(html, baseURL: nil)
        }

        // Grant mic/camera to the page without a second in-page prompt (iOS still asks once per app).
        func webView(_ webView: WKWebView,
                     requestMediaCapturePermissionFor origin: WKSecurityOrigin,
                     initiatedByFrame frame: WKFrameInfo,
                     type: WKMediaCaptureType,
                     decisionHandler: @escaping (WKPermissionDecision) -> Void) {
            decisionHandler(.grant)
        }

        // Open target=_blank links in the same view.
        func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration,
                     for navigationAction: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
            if navigationAction.targetFrame == nil { webView.load(navigationAction.request) }
            return nil
        }
    }
}
