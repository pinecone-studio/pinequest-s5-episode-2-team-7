import SwiftUI

/// «Түүх»: past «Сорил» attempts, newest first (stored on the phone).
struct HistoryView: View {
    @EnvironmentObject private var history: QuizHistory
    @EnvironmentObject private var results: ScenarioHistory

    var body: some View {
        NavigationStack {
            Group {
                if history.attempts.isEmpty && results.results.isEmpty {
                    ContentUnavailableView("Түүх хоосон байна", systemImage: "clock",
                                           description: Text("Тохиолдол тоглох эсвэл Сорил өгөхөд энд хадгалагдана."))
                } else {
                    List {
                        if !results.results.isEmpty {
                            Section("Тохиолдол") {
                                ForEach(results.results) { r in
                                    HStack(spacing: 14) {
                                        Text("\(r.score)")
                                            .font(.headline.monospacedDigit())
                                            .frame(width: 48, height: 48)
                                            .background(color(r.score).opacity(0.15), in: Circle())
                                            .foregroundStyle(color(r.score))
                                        VStack(alignment: .leading, spacing: 3) {
                                            Text(r.title).font(.subheadline.weight(.semibold))
                                            Text("\(r.stable ? "Тогтворжсон" : "Дордсон") · \(r.date.formatted(date: .abbreviated, time: .shortened))")
                                                .font(.caption).foregroundStyle(.secondary)
                                        }
                                    }
                                }
                            }
                        }
                        Section("Сорил") {
                        ForEach(history.attempts) { attempt in
                            NavigationLink {
                                ResultView(quiz: attempt.quiz, answers: attempt.answers, grade: attempt.grade)
                                    .appScreen()
                                    .navigationTitle("Дүн")
                                    .navigationBarTitleDisplayMode(.inline)
                            } label: {
                                HStack(spacing: 14) {
                                    Text("\(attempt.grade.score)")
                                        .font(.headline.monospacedDigit())
                                        .frame(width: 48, height: 48)
                                        .background(color(attempt.grade.score).opacity(0.15), in: Circle())
                                        .foregroundStyle(color(attempt.grade.score))
                                    VStack(alignment: .leading, spacing: 3) {
                                        Text(attempt.quiz.title).font(.subheadline.weight(.semibold)).lineLimit(2)
                                        Text(attempt.date.formatted(date: .abbreviated, time: .shortened)).font(.caption).foregroundStyle(.secondary)
                                    }
                                }
                            }
                        }
                        .onDelete(perform: history.remove)
                        }
                    }
                }
            }
            .appScreen()
            .navigationTitle("Түүх")
        }
        .tint(brand)
    }

    private func color(_ score: Int) -> Color { score >= 80 ? Theme.ok : score >= 50 ? Theme.warn : Theme.alert }
}
