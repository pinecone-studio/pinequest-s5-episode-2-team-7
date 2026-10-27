import SwiftUI
import UserNotifications

/// «Дүгнэлт»: every piece of feedback in one place — AI дасгалжуулагч
/// conversations (from the server), «Сорил» attempts and emergency cases (on the phone).
/// The app's promise: whatever you practise, you get scored and told what to improve.
struct FeedbackView: View {
    @EnvironmentObject private var coach: CoachStore
    @EnvironmentObject private var history: QuizHistory
    @EnvironmentObject private var results: ScenarioHistory
    @State private var showSignIn = false

    private var quizAverage: Int? {
        let s = history.attempts.map(\.grade.score)
        return s.isEmpty ? nil : s.reduce(0, +) / s.count
    }

    /// The most frequent advice across recent conversations and quizzes.
    private var focus: [String] {
        let fromCoach = coach.results.prefix(5).flatMap(\.improvements)
        let fromQuiz = history.attempts.prefix(3).flatMap { $0.grade.weaknesses }
        return Array((fromCoach + fromQuiz).prefix(4))
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    VStack(alignment: .leading, spacing: 6) {
                        Text("Дүгнэлт").font(.system(size: 32, weight: .semibold)).foregroundStyle(.white)
                        Text("Хийсэн бүх дадлагын оноо, AI-ийн санал нэг дор.").font(.subheadline).foregroundStyle(.white.opacity(0.9))
                    }

                    HStack(spacing: 10) {
                        StatTile(value: coach.average.map { "\($0)" } ?? "–", label: "Дасгалжуулагч", icon: "person.wave.2.fill")
                        StatTile(value: quizAverage.map { "\($0)" } ?? "–", label: "Сорил", icon: "list.clipboard.fill")
                        StatTile(value: "\(coach.results.count + history.attempts.count + results.results.count)", label: "Нийт дадлага", icon: "flame.fill")
                    }

                    if !focus.isEmpty {
                        VStack(alignment: .leading, spacing: 8) {
                            Label("Анхаарах зүйлс", systemImage: "target").font(.headline).foregroundStyle(Theme.warn)
                            ForEach(focus, id: \.self) { Text("• \($0)").font(.subheadline).foregroundStyle(Theme.ink) }
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(16)
                        .background(Theme.tintPeach.opacity(0.9), in: RoundedRectangle(cornerRadius: 24, style: .continuous))
                    }

                    if coach.needsSignIn { SignInBanner(text: "AI дасгалжуулагчийн дүгнэлтээ харахын тулд нэвтэрнэ үү.") { showSignIn = true } }

                    if !coach.results.isEmpty {
                        Text("AI дасгалжуулагч").font(.title3.weight(.semibold)).foregroundStyle(Theme.ink)
                        ForEach(coach.results) { r in
                            NavigationLink(value: r.id) {
                                ScoreRow(score: r.score, title: "\(coach.pack(r.packRef)?.icon ?? "💬") \(r.packTitle)",
                                         detail: r.summary, date: r.date, badge: r.challengeId == nil ? nil : "Сорилт")
                            }
                            .buttonStyle(.plain)
                        }
                    }

                    if !history.attempts.isEmpty {
                        Text("Сорил").font(.title3.weight(.semibold)).foregroundStyle(Theme.ink)
                        ForEach(history.attempts) { attempt in
                            NavigationLink {
                                ResultView(quiz: attempt.quiz, answers: attempt.answers, grade: attempt.grade)
                                    .appScreen()
                                    .navigationTitle("Дүн")
                                    .navigationBarTitleDisplayMode(.inline)
                            } label: {
                                ScoreRow(score: attempt.grade.score, title: "📝 \(attempt.quiz.title)", detail: attempt.grade.verdict, date: attempt.date, badge: nil)
                            }
                            .buttonStyle(.plain)
                        }
                    }

                    if !results.results.isEmpty {
                        Text("Яаралтай тохиолдол").font(.title3.weight(.semibold)).foregroundStyle(Theme.ink)
                        ForEach(results.results) { r in
                            ScoreRow(score: r.score, title: "🚑 \(r.title)", detail: r.stable ? "Тогтворжсон" : "Дордсон", date: r.date, badge: nil)
                        }
                    }

                    if coach.results.isEmpty && history.attempts.isEmpty && results.results.isEmpty {
                        ContentUnavailableView("Дүгнэлт алга", systemImage: "chart.bar.doc.horizontal",
                                               description: Text("AI дасгалжуулагчтай ярилцах эсвэл Сорил өгөхөд энд оноо, санал хадгалагдана."))
                            .padding(.top, 20)
                    }
                }
                .padding(20)
            }
            .refreshable { await coach.load() }
            .appScreen()
            .toolbar(.hidden, for: .navigationBar)
            .navigationDestination(for: String.self) { CoachResultDetailView(id: $0) }
        }
        .tint(brand)
        .task { await coach.load() }
        .sheet(isPresented: $showSignIn) { SignInSheet { Task { await coach.load() } } }
    }
}

private struct StatTile: View {
    let value: String
    let label: String
    let icon: String
    var body: some View {
        VStack(spacing: 6) {
            Image(systemName: icon).font(.footnote).foregroundStyle(brand)
            Text(value).font(.title2.weight(.semibold).monospacedDigit()).foregroundStyle(Theme.ink)
            Text(label).font(.caption2).foregroundStyle(Theme.muted).lineLimit(1).minimumScaleFactor(0.75)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 14)
        .background(Theme.field, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 20, style: .continuous).stroke(Theme.line, lineWidth: 1))
    }
}

struct ScoreRow: View {
    let score: Int
    let title: String
    let detail: String
    let date: Date
    let badge: String?

    var body: some View {
        HStack(spacing: 14) {
            Text("\(score)")
                .font(.headline.monospacedDigit())
                .frame(width: 50, height: 50)
                .background(scoreColor(score).opacity(0.15), in: Circle())
                .foregroundStyle(scoreColor(score))
            VStack(alignment: .leading, spacing: 3) {
                HStack(spacing: 6) {
                    Text(title).font(.subheadline.weight(.semibold)).foregroundStyle(Theme.ink).lineLimit(1)
                    if let badge {
                        Text(badge).font(.caption2.weight(.semibold)).foregroundStyle(brand)
                            .padding(.horizontal, 6).padding(.vertical, 2).background(Theme.accentSoft, in: Capsule())
                    }
                }
                Text(detail).font(.caption).foregroundStyle(Theme.muted).lineLimit(2)
                Text(date.formatted(date: .abbreviated, time: .shortened)).font(.caption2).foregroundStyle(Theme.subtle)
            }
            Spacer(minLength: 0)
        }
        .card(padding: 12, radius: 20)
    }
}

/// Shows the team notifications as banners even while the app is open.
final class NotificationBanner: NSObject, UNUserNotificationCenterDelegate {
    static let shared = NotificationBanner()
    func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification,
                                withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void) {
        completionHandler([.banner, .sound, .list])
    }
}
