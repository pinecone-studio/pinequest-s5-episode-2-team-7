import Foundation
import UIKit
import WebKit

// MARK: - Models (mirror pinequest-team7 src/lib/services/quiz.ts)

struct QuizQuestion: Codable, Identifiable, Hashable {
    let id: String
    let kind: String          // "choice" (тест) | "open" (өгүүлбэр) | "case" (кейс бодлого)
    let prompt: String
    let options: [String]
    let keyPoints: [String]
    let modelAnswer: String
}

extension QuizQuestion {
    /// Question types the server can write (pinequest-team7 QUESTION_KINDS), in display order.
    static let kinds = ["choice", "open", "case"]

    static func label(for kind: String) -> String {
        switch kind {
        case "choice": return "Тест"
        case "case": return "Кейс бодлого"
        default: return "Өгүүлбэр"
        }
    }

    static func icon(for kind: String) -> String {
        switch kind {
        case "choice": return "list.bullet.circle"
        case "case": return "person.text.rectangle"
        default: return "text.alignleft"
        }
    }
}

struct Quiz: Codable, Hashable {
    let title: String
    let summary: String
    let questions: [QuizQuestion]
}

struct GradeItem: Codable, Hashable {
    let score: Double
    let status: String        // correct | partial | wrong | blank
    let feedback: String
    let missing: [String]
    let mistakes: [String]
}

struct StudyTopic: Codable, Hashable, Identifiable {
    let topic: String
    let why: String
    var id: String { topic }
}

struct Grade: Codable, Hashable {
    let score: Int
    let verdict: String
    let items: [GradeItem]
    let strengths: [String]
    let weaknesses: [String]
    let studyNext: [StudyTopic]
}

struct SelfCheck: Codable, Hashable {
    let question: String
    let answer: String
}

struct Lesson: Codable, Hashable {
    let title: String
    let lesson: String
    let keyFacts: [String]
    let selfCheck: [SelfCheck]
}

/// One upload: a photo (already shrunk to JPEG), a PDF or a text file.
struct Material: Identifiable, Hashable {
    let id = UUID()
    let name: String
    let mediaType: String
    let data: Data
    let thumbnail: UIImage?
}

// MARK: - API

enum QuizAPIError: LocalizedError {
    case notSignedIn
    case server(String)
    case network

    var errorDescription: String? {
        switch self {
        case .notSignedIn: return "Эхлээд нэвтэрнэ үү: «AI дасгалжуулагч» эсвэл «Баг» хэсгийн «Нэвтрэх» товч."
        case .server(let message): return message
        case .network: return "Сервертэй холбогдож чадсангүй. Интернэтээ шалгаад дахин оролдоно уу."
        }
    }
}

enum QuizAPI {
    private struct ErrorBody: Decodable { struct Inner: Decodable { let message: String }; let error: Inner }
    private struct QuizBody: Decodable { let quiz: Quiz }
    private struct GradeBody: Decodable { let grade: Grade }
    private struct LessonBody: Decodable { let lesson: Lesson }

    /// The saved role (see UserRole); the server tailors the examiner and the questions to it.
    private static var role: String {
        UserRole(rawValue: UserDefaults.standard.string(forKey: UserRole.storageKey) ?? "")?.rawValue ?? UserRole.student.rawValue
    }

    /// `types`: question kinds to include; `avoid`: prompts of the previous version, for a new variant.
    static func generate(materials: [Material], notes: String, count: Int, focus: [String] = [],
                         types: [String] = ["open", "choice"], avoid: [String] = []) async throws -> Quiz {
        let files = materials.map { ["name": $0.name, "mediaType": $0.mediaType, "data": $0.data.base64EncodedString()] }
        let body: [String: Any] = ["files": files, "notes": notes, "count": count, "focus": focus,
                                   "types": types, "avoid": avoid, "role": role]
        return try await post("/api/quiz/generate", body, as: QuizBody.self).quiz
    }

    static func grade(quiz: Quiz, answers: [String]) async throws -> Grade {
        let questions = try JSONSerialization.jsonObject(with: JSONEncoder().encode(quiz.questions))
        let body: [String: Any] = ["title": quiz.title, "summary": quiz.summary, "questions": questions, "answers": answers, "role": role]
        return try await post("/api/quiz/grade", body, as: GradeBody.self).grade
    }

    static func explain(topic: StudyTopic, quiz: Quiz) async throws -> Lesson {
        let body: [String: Any] = ["topic": topic.topic, "why": topic.why, "title": quiz.title, "summary": quiz.summary, "role": role]
        return try await post("/api/quiz/explain", body, as: LessonBody.self).lesson
    }

    /// A request to the web app carrying the web tab's sign-in cookie.
    static func signedRequest(_ path: String, timeout: TimeInterval = 150) async -> URLRequest {
        var request = URLRequest(url: Config.url.appendingPathComponent(path), timeoutInterval: timeout)
        let host = Config.url.host ?? ""
        let jar = await cookies().filter { host.hasSuffix($0.domain.trimmingCharacters(in: CharacterSet(charactersIn: "."))) }
        HTTPCookie.requestHeaderFields(with: jar).forEach { request.setValue($1, forHTTPHeaderField: $0) }
        return request
    }

    /// The web tab's sign-in cookie, so the student does not log in twice.
    @MainActor
    private static func cookies() async -> [HTTPCookie] {
        await WKWebsiteDataStore.default().httpCookieStore.allCookies()
    }

    private static func post<T: Decodable>(_ path: String, _ body: [String: Any], as type: T.Type) async throws -> T {
        var request = URLRequest(url: Config.url.appendingPathComponent(path), timeoutInterval: 150)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "content-type")
        let host = Config.url.host ?? ""
        let jar = await cookies().filter { host.hasSuffix($0.domain.trimmingCharacters(in: CharacterSet(charactersIn: "."))) }
        HTTPCookie.requestHeaderFields(with: jar).forEach { request.setValue($1, forHTTPHeaderField: $0) }
        request.httpBody = try JSONSerialization.data(withJSONObject: body)

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
        return try JSONDecoder().decode(T.self, from: data)
    }
}

// MARK: - History (Documents/quiz_history.json)

struct QuizAttempt: Codable, Identifiable, Hashable {
    var id = UUID()
    let date: Date
    let quiz: Quiz
    let answers: [String]
    let grade: Grade
}

@MainActor
final class QuizHistory: ObservableObject {
    @Published private(set) var attempts: [QuizAttempt] = []

    private let file = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0].appendingPathComponent("quiz_history.json")

    init() {
        if let data = try? Data(contentsOf: file), let saved = try? JSONDecoder().decode([QuizAttempt].self, from: data) {
            attempts = saved
        }
    }

    func add(_ attempt: QuizAttempt) {
        attempts.insert(attempt, at: 0)
        save()
    }

    func remove(at offsets: IndexSet) {
        attempts.remove(atOffsets: offsets)
        save()
    }

    private func save() {
        try? JSONEncoder().encode(attempts).write(to: file, options: .atomic)
    }
}

// MARK: - Image helpers

extension UIImage {
    /// Longest side ≤ 1600 px, JPEG: keeps uploads small while text stays readable.
    func materialJPEG() -> Data? {
        let maxSide: CGFloat = 1600
        let scale = min(1, maxSide / max(size.width, size.height))
        let target = CGSize(width: size.width * scale, height: size.height * scale)
        let format = UIGraphicsImageRendererFormat.default()
        format.scale = 1
        let resized = UIGraphicsImageRenderer(size: target, format: format).image { _ in draw(in: CGRect(origin: .zero, size: target)) }
        return resized.jpegData(compressionQuality: 0.75)
    }
}
