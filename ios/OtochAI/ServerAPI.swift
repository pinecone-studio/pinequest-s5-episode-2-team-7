import Foundation
import SwiftUI
import WebKit

/// JSON calls to the web app (pinequest-team7) with the web view's sign-in
/// cookie, so the user signs in once (in any web page of the app) and every
/// screen can use it. Errors reuse `QuizAPIError` (Mongolian messages).
enum ServerAPI {
    private struct ErrorBody: Decodable { struct Inner: Decodable { let message: String }; let error: Inner }

    static func get<T: Decodable>(_ path: String, as type: T.Type, timeout: TimeInterval = 30) async throws -> T {
        try await send(path, method: "GET", body: nil, as: type, timeout: timeout)
    }

    static func post<T: Decodable>(_ path: String, _ body: [String: Any], as type: T.Type, timeout: TimeInterval = 60) async throws -> T {
        try await send(path, method: "POST", body: try JSONSerialization.data(withJSONObject: body), as: type, timeout: timeout)
    }

    private static func send<T: Decodable>(_ path: String, method: String, body: Data?, as type: T.Type, timeout: TimeInterval) async throws -> T {
        var request = URLRequest(url: Config.url.appendingPathComponent(path), timeoutInterval: timeout)
        request.httpMethod = method
        if let body {
            request.setValue("application/json", forHTTPHeaderField: "content-type")
            request.httpBody = body
        }
        let host = Config.url.host ?? ""
        let jar = await cookies().filter { host.hasSuffix($0.domain.trimmingCharacters(in: CharacterSet(charactersIn: "."))) }
        HTTPCookie.requestHeaderFields(with: jar).forEach { request.setValue($1, forHTTPHeaderField: $0) }

        let data: Data
        let response: URLResponse
        do {
            (data, response) = try await URLSession.shared.data(for: request)
        } catch {
            throw QuizAPIError.network
        }
        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        if status == 401 { throw QuizAPIError.notSignedIn }
        guard (200..<300).contains(status) else {
            if let message = try? JSONDecoder().decode(ErrorBody.self, from: data).error.message { throw QuizAPIError.server(message) }
            throw QuizAPIError.server("Серверийн алдаа (\(status)). Дахин оролдоно уу.")
        }
        do {
            return try JSONDecoder().decode(T.self, from: data)
        } catch {
            throw QuizAPIError.server("Серверийн хариуг уншиж чадсангүй. Апп болон серверийн хувилбар таарахгүй байж магадгүй.")
        }
    }

    @MainActor
    private static func cookies() async -> [HTTPCookie] {
        await WKWebsiteDataStore.default().httpCookieStore.allCookies()
    }

    /// ISO-8601 timestamps from the server (JavaScript `toISOString`, with milliseconds).
    static func date(_ iso: String) -> Date {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let d = f.date(from: iso) { return d }
        f.formatOptions = [.withInternetDateTime]
        return f.date(from: iso) ?? .now
    }
}

extension ServerAPI {
    /// Native sign-in / sign-up: the server's session cookie is copied into the web view store,
    /// so the practice pages (AI дасгалжуулагч, Сорилын аватар) are signed in too — no website to visit.
    static func signIn(register: Bool, name: String, email: String, password: String) async throws {
        let url = Config.url.appendingPathComponent(register ? "api/auth/register" : "api/auth/login")
        var request = URLRequest(url: url, timeoutInterval: 30)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "content-type")
        var body: [String: String] = ["email": email, "password": password]
        if register { body["name"] = name }
        request.httpBody = try JSONSerialization.data(withJSONObject: body)

        let data: Data
        let response: URLResponse
        do {
            (data, response) = try await URLSession.shared.data(for: request)
        } catch {
            throw QuizAPIError.network
        }
        guard let http = response as? HTTPURLResponse else { throw QuizAPIError.network }
        guard (200..<300).contains(http.statusCode) else {
            struct Detail: Decodable { let message: String }
            struct Inner: Decodable { let message: String; let details: [Detail]? }
            struct Body: Decodable { let error: Inner }
            if let e = try? JSONDecoder().decode(Body.self, from: data).error {
                throw QuizAPIError.server(e.details?.first?.message ?? e.message)
            }
            throw QuizAPIError.server("Серверийн алдаа (\(http.statusCode)).")
        }
        var headers: [String: String] = [:]
        for (key, value) in http.allHeaderFields {
            if let k = key as? String, let v = value as? String { headers[k] = v }
        }
        let cookies = HTTPCookie.cookies(withResponseHeaderFields: headers, for: url)
        await storeCookies(cookies)
    }

    /// True when the web view store holds a valid session (the server knows the user).
    static func isSignedIn() async -> Bool {
        struct Me: Decodable {}
        do {
            _ = try await get("api/auth/me", as: Me.self, timeout: 15)
            return true
        } catch QuizAPIError.notSignedIn {
            return false
        } catch {
            // Server unreachable: let the page show its own error instead of a sign-in loop.
            return true
        }
    }

    @MainActor
    private static func storeCookies(_ cookies: [HTTPCookie]) async {
        let store = WKWebsiteDataStore.default().httpCookieStore
        for cookie in cookies { await store.setCookie(cookie) }
    }
}

/// «Нэвтрэх / Бүртгүүлэх» inside the app.
struct SignInSheet: View {
    var onDone: () -> Void
    /// Set when shown inside another screen (not as a sheet): «Хаах» calls it instead of dismissing.
    var onCancel: (() -> Void)? = nil
    var cancelTitle = "Хаах"
    @Environment(\.dismiss) private var dismiss
    @State private var register = false
    @State private var name = ""
    @State private var email = ""
    @State private var password = ""
    @State private var working = false
    @State private var error: String?

    private var ready: Bool {
        email.contains("@") && password.count >= (register ? 8 : 1) && (!register || name.trimmingCharacters(in: .whitespaces).count >= 2)
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    Orb(size: 90).frame(maxWidth: .infinity)
                    Text(register ? "Бүртгүүлэх" : "Нэвтрэх").font(.title.weight(.semibold)).foregroundStyle(Theme.ink)
                    Text("Дадлагын дүгнэлт тань хадгалагдаж, багтайгаа холбогдоно.").font(.subheadline).foregroundStyle(Theme.muted)

                    Picker("", selection: $register) {
                        Text("Нэвтрэх").tag(false)
                        Text("Бүртгүүлэх").tag(true)
                    }
                    .pickerStyle(.segmented)

                    if register { field("Нэр", text: $name, content: .name) }
                    field("И-мэйл", text: $email, content: .emailAddress, keyboard: .emailAddress)
                    SecureField(register ? "Нууц үг (8-аас доошгүй тэмдэгт)" : "Нууц үг", text: $password)
                        .textContentType(register ? .newPassword : .password)
                        .padding(14).background(Theme.field, in: RoundedRectangle(cornerRadius: 14))

                    if let error { Text(error).font(.footnote).foregroundStyle(Theme.alert) }

                    Button {
                        Task { await submit() }
                    } label: {
                        if working { ProgressView().tint(.white) } else { Text(register ? "Бүртгүүлэх" : "Нэвтрэх") }
                    }
                    .buttonStyle(.primary)
                    .disabled(!ready || working)
                }
                .padding(24)
            }
            .scrollDismissesKeyboard(.interactively)
            .appScreen()
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button(cancelTitle) { if let onCancel { onCancel() } else { dismiss() } }
                }
            }
        }
        .tint(brand)
    }

    private func field(_ title: String, text: Binding<String>, content: UITextContentType, keyboard: UIKeyboardType = .default) -> some View {
        TextField(title, text: text)
            .textContentType(content)
            .keyboardType(keyboard)
            .textInputAutocapitalization(keyboard == .emailAddress ? .never : .words)
            .autocorrectionDisabled()
            .padding(14).background(Theme.field, in: RoundedRectangle(cornerRadius: 14))
    }

    private func submit() async {
        working = true
        error = nil
        defer { working = false }
        do {
            try await ServerAPI.signIn(register: register, name: name.trimmingCharacters(in: .whitespaces),
                                       email: email.trimmingCharacters(in: .whitespaces), password: password)
            if onCancel == nil { dismiss() }
            onDone()
        } catch {
            self.error = error.localizedDescription
        }
    }
}

/// «Нэвтрээгүй байна» banner with a sign-in button.
struct SignInBanner: View {
    var text = "Дадлагын үр дүнгээ хадгалж, багтайгаа холбогдохын тулд нэвтэрнэ үү."
    let onSignIn: () -> Void

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: "person.crop.circle.badge.exclamationmark").font(.title2).foregroundStyle(brand)
            Text(text).font(.footnote).foregroundStyle(Theme.ink)
            Spacer(minLength: 0)
            Button("Нэвтрэх", action: onSignIn)
                .font(.subheadline.weight(.semibold))
                .padding(.horizontal, 14).padding(.vertical, 8)
                .background(Theme.accentGradient, in: Capsule())
                .foregroundStyle(.white)
        }
        .card(padding: 14, radius: 20)
    }
}

/// Score colour used across the app.
func scoreColor(_ score: Int) -> Color { score >= 80 ? Theme.ok : score >= 50 ? Theme.warn : Theme.alert }
