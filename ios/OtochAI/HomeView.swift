import SwiftUI

/// Bottom tabs. Raw values are stored (AppStorage "mainTab"), so do not renumber
/// (3 was the old VR tab, then the atlas, then «Мэдлэг»). patient, knowledge and
/// news are no longer tabs: the emergency cases open from «AI дасгалжуулагч».
enum AppTab: Int {
    case home = 0, patient, quiz, knowledge, news, coach, team, feedback

    static let visible: [AppTab] = [.home, .quiz, .coach, .team, .feedback]
}

/// «Нүүр»: what to do today, not a second menu. Today's case, streak and
/// progress, the weak spots from the last «Сорил», a fact of the day and the top story.
struct HomeView: View {
    @Binding var tab: AppTab
    @EnvironmentObject private var history: QuizHistory
    @EnvironmentObject private var results: ScenarioHistory
    @EnvironmentObject private var news: NewsStore
    @EnvironmentObject private var coach: CoachStore
    @EnvironmentObject private var team: TeamStore
    @State private var launch: CoachLaunch?
    @AppStorage(UserRole.storageKey) private var roleRaw = ""
    /// Read and cleared by «Сорил» (QuizView) as its topic.
    @AppStorage("quizPrefill") private var quizPrefill = ""
    @State private var showHistory = false
    @State private var showRolePicker = false
    @State private var playing: Scenario?
    @State private var article: KnowledgeArticle?
    @State private var ask = ""
    @FocusState private var asking: Bool

    private var role: UserRole { UserRole(rawValue: roleRaw) ?? .learner }

    /// Days in a row (ending today or yesterday) with at least one case or quiz.
    private var streak: Int {
        let cal = Calendar.current
        let days = Set((history.attempts.map(\.date) + results.results.map(\.date) + coach.results.map(\.date)).map { cal.startOfDay(for: $0) })
        var day = cal.startOfDay(for: .now)
        if !days.contains(day) { day = cal.date(byAdding: .day, value: -1, to: day)! }
        var count = 0
        while days.contains(day) {
            count += 1
            day = cal.date(byAdding: .day, value: -1, to: day)!
        }
        return count
    }

    private var caseAverage: Int? {
        let s = results.results.map(\.score)
        return s.isEmpty ? nil : s.reduce(0, +) / s.count
    }

    private var quizAverage: Int? {
        let s = history.attempts.map(\.grade.score)
        return s.isEmpty ? nil : s.reduce(0, +) / s.count
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 24) {
                    topBar
                    greeting
                    askBar
                    challenge
                    coachCard
                    if role.isMedical { today }
                    progress
                    weakSpots
                    if role.isMedical { factOfTheDay }
                }
                .padding(.horizontal, 20)
                .padding(.top, 8)
                .padding(.bottom, 24)
            }
            .scrollDismissesKeyboard(.interactively)
            .appScreen()
            .toolbar(.hidden, for: .navigationBar)
        }
        .tint(brand)
        .task {
            await coach.load()
            await team.load()
        }
        .fullScreenCover(item: $launch) { item in
            CoachSessionView(launch: item) {
                launch = nil
                Task { await coach.load(); await team.load() }
            }
        }
        .sheet(isPresented: $showHistory) { HistoryView() }
        .sheet(item: $article) { KnowledgeArticleView(article: $0) }
        .fullScreenCover(item: $playing) { ScenarioPlayView(scenario: $0) }
        .sheet(isPresented: $showRolePicker) {
            RolePickerView(initial: role) { picked in
                roleRaw = picked.rawValue
                showRolePicker = false
            }
        }
    }

    // MARK: Top bar

    private var topBar: some View {
        HStack(spacing: 10) {
            Button { showRolePicker = true } label: {
                HStack(spacing: 10) {
                    Image(systemName: role.icon)
                        .font(.system(size: 22))
                        .foregroundStyle(.white)
                        .frame(width: 52, height: 52)
                        .background(Theme.accentGradient, in: Circle())
                        .overlay(Circle().stroke(.white, lineWidth: 2.5))
                    VStack(alignment: .leading, spacing: 1) {
                        Text(role.title).font(.subheadline.weight(.semibold)).foregroundStyle(.white)
                        Text("Үүрэг солих").font(.caption2).foregroundStyle(.white.opacity(0.8))
                    }
                }
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Үүрэг: \(role.title). Солих")

            Spacer()

            if streak > 0 {
                Label("\(streak) өдөр", systemImage: "flame.fill")
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(.white)
                    .padding(.horizontal, 12).padding(.vertical, 8)
                    .background(Color.white.opacity(0.22), in: Capsule())
                    .overlay(Capsule().stroke(.white.opacity(0.55)))
                    .accessibilityLabel("\(streak) өдөр дараалан дадлага хийсэн")
            }
            Button { tab = .feedback } label: { GlassCircle(icon: "chart.bar.doc.horizontal", label: "Дүгнэлт", size: 46) }
                .buttonStyle(.plain)
        }
    }

    // MARK: Greeting

    private var greeting: some View {
        VStack(spacing: 8) {
            Orb(size: 120)
                .padding(.bottom, 6)
            Text("Сайн байна уу!")
                .font(.system(size: 32, weight: .semibold))
                .foregroundStyle(.white)
            Text(role.greeting)
                .font(.subheadline)
                .foregroundStyle(.white.opacity(0.9))
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity)
    }

    // MARK: Ask bar

    private var askBar: some View {
        HStack(spacing: 8) {
            Image(systemName: "sparkles").foregroundStyle(brand).padding(.leading, 16)
            TextField("Юуг шалгуулах вэ? Сэдвээ бичээрэй…", text: $ask)
                .focused($asking)
                .submitLabel(.go)
                .onSubmit(sendAsk)
            Button(action: sendAsk) {
                Image(systemName: "arrow.up")
                    .font(.system(size: 18, weight: .semibold))
                    .foregroundStyle(.white)
                    .frame(width: 46, height: 46)
                    .background(Theme.accentGradient, in: Circle())
            }
            .buttonStyle(.plain)
            .disabled(ask.trimmingCharacters(in: .whitespaces).isEmpty)
            .accessibilityLabel("Сорил бэлдэх")
        }
        .padding(6)
        .background(.ultraThinMaterial, in: Capsule())
        .background(Theme.field, in: Capsule())
        .overlay(Capsule().stroke(Theme.glowBorder, lineWidth: 1.4))
        .shadow(color: Theme.accent.opacity(0.35), radius: 14, x: 0, y: 0)
    }

    private func sendAsk() {
        let topic = ask.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !topic.isEmpty else { return }
        quizPrefill = topic
        ask = ""
        asking = false
        tab = .quiz
    }

    // MARK: Employer's challenge

    @ViewBuilder
    private var challenge: some View {
        if let next = team.nextChallenge {
            Button {
                launch = CoachLaunch(packRef: next.challenge.packRef, mode: next.challenge.mode, difficulty: next.challenge.difficulty, challengeId: next.challenge.id)
            } label: { ChallengeBanner(item: next) }
                .buttonStyle(.plain)
        }
    }

    // MARK: AI дасгалжуулагч

    private var coachCard: some View {
        let suggested = suggestedPack
        return VStack(alignment: .leading, spacing: 12) {
            SectionHeader(title: "AI дасгалжуулагч", action: "Бүгд") { tab = .coach }
            Button {
                launch = CoachLaunch(packRef: suggested.id, mode: suggested.defaultMode, difficulty: "medium")
            } label: {
                HStack(spacing: 14) {
                    Text(suggested.icon).font(.system(size: 36))
                        .frame(width: 64, height: 64)
                        .background(Theme.accentSoft, in: Circle())
                    VStack(alignment: .leading, spacing: 4) {
                        Text(suggested.title).font(.headline).foregroundStyle(Theme.ink)
                        Text(suggested.subtitle).font(.caption).foregroundStyle(Theme.muted).lineLimit(2).multilineTextAlignment(.leading)
                        Text(CoachLabels.mode(suggested.defaultMode)).font(.caption2.weight(.semibold)).foregroundStyle(brand)
                    }
                    Spacer()
                    Image(systemName: "play.circle.fill").font(.system(size: 34)).foregroundStyle(brand)
                }
                .card(padding: 14, radius: 24)
            }
            .buttonStyle(.plain)
        }
    }

    /// The persona that fits the chosen role best.
    private var suggestedPack: CoachPack {
        let id: String
        switch role {
        case .student, .doctor, .nurse, .health: id = "patient"
        case .ems, .dispatcher: id = "dispatch103"
        case .learner: id = "buyer"
        case .teacher: id = "student"
        case .service: id = "callcenter"
        case .manager: id = "reception"
        }
        return coach.pack(id) ?? coach.roles[0]
    }

    // MARK: Today's case

    private var today: some View {
        let daily = Scenario.daily(for: role)
        return VStack(alignment: .leading, spacing: 12) {
            SectionHeader(title: "Өнөөдрийн даалгавар", action: nil) {}
            Button { playing = daily } label: { FeaturedScenarioCard(scenario: daily, best: results.best(for: daily.id)) }
                .buttonStyle(.plain)
        }
    }

    // MARK: Progress

    private var progress: some View {
        VStack(alignment: .leading, spacing: 12) {
            SectionHeader(title: "Миний ахиц", action: history.attempts.isEmpty && results.results.isEmpty && coach.results.isEmpty ? nil : "Дүгнэлт") { tab = .feedback }
            HStack(spacing: 10) {
                Stat(value: coach.average.map { "\($0)" } ?? "–", label: "Дасгалжуулагч", icon: "person.wave.2.fill")
                Stat(value: quizAverage.map { "\($0)" } ?? "–", label: "Сорилын оноо", icon: "list.clipboard.fill")
                if role.isMedical {
                    Stat(value: caseAverage.map { "\($0)" } ?? "–", label: "Тохиолдол", icon: "heart.text.square.fill")
                } else {
                    Stat(value: "\(coach.results.count + history.attempts.count)", label: "Нийт дадлага", icon: "flame.fill")
                }
            }
            if history.attempts.isEmpty && results.results.isEmpty && coach.results.isEmpty {
                Text("Эхний дадлагаа хийхэд ахиц энд харагдана.").font(.caption).foregroundStyle(Theme.muted)
            }
        }
    }

    // MARK: Weak spots

    @ViewBuilder
    private var weakSpots: some View {
        let weak = history.attempts.first?.grade.studyNext ?? []
        if let last = coach.results.first, !last.improvements.isEmpty {
            VStack(alignment: .leading, spacing: 10) {
                SectionHeader(title: "Сүүлийн яриан дээрх санал", action: "Дэлгэрэнгүй") { tab = .feedback }
                VStack(alignment: .leading, spacing: 6) {
                    Text("\(last.packTitle) · \(last.score) оноо").font(.caption.weight(.semibold)).foregroundStyle(scoreColor(last.score))
                    ForEach(last.improvements, id: \.self) { Text("• \($0)").font(.subheadline).foregroundStyle(Theme.ink) }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .card(padding: 14, radius: 22)
            }
        }
        if !weak.isEmpty {
            VStack(alignment: .leading, spacing: 12) {
                SectionHeader(title: "Сул тал дээрээ ажиллах", action: nil) {}
                ForEach(weak.prefix(3)) { topic in
                    Button {
                        quizPrefill = topic.topic
                        tab = .quiz
                    } label: {
                        HStack(spacing: 12) {
                            Image(systemName: "target").foregroundStyle(Theme.warn)
                                .frame(width: 40, height: 40).background(Theme.warn.opacity(0.12), in: Circle())
                            VStack(alignment: .leading, spacing: 2) {
                                Text(topic.topic).font(.subheadline.weight(.semibold)).foregroundStyle(Theme.ink).multilineTextAlignment(.leading)
                                Text(topic.why).font(.caption).foregroundStyle(Theme.muted).lineLimit(2).multilineTextAlignment(.leading)
                            }
                            Spacer()
                            Text("Давтах").font(.caption.weight(.semibold)).foregroundStyle(brand)
                        }
                        .card(padding: 12, radius: 22)
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }

    // MARK: Fact of the day

    private var factOfTheDay: some View {
        let fact = KnowledgeArticle.factOfTheDay()
        return Button { article = fact.article } label: {
            VStack(alignment: .leading, spacing: 10) {
                HStack {
                    Label("Өдрийн мэдлэг", systemImage: "lightbulb.fill").font(.subheadline.weight(.semibold)).foregroundStyle(Theme.warn)
                    Spacer()
                    Text(fact.article.title).font(.caption).foregroundStyle(Theme.muted)
                }
                Text(fact.fact).font(.body).foregroundStyle(Theme.ink).multilineTextAlignment(.leading)
                Text("Дэлгэрэнгүй →").font(.caption.weight(.semibold)).foregroundStyle(brand)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(16)
            .background(Theme.tintPeach.opacity(0.9), in: RoundedRectangle(cornerRadius: 26, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 26, style: .continuous).stroke(Theme.line))
        }
        .buttonStyle(.plain)
    }

    // MARK: Top story

    @ViewBuilder
    private var topStory: some View {
        if let first = news.ordered(for: role).first {
            VStack(alignment: .leading, spacing: 12) {
                SectionHeader(title: "Онцлох мэдээ", action: "Бүгд") { tab = .news }
                Button { tab = .news } label: { NewsCard(item: first) }.buttonStyle(.plain)
            }
        }
    }
}

private struct Stat: View {
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

private struct SectionHeader: View {
    let title: String
    let action: String?
    let onAction: () -> Void

    var body: some View {
        HStack {
            Text(title).font(.title3.weight(.semibold)).foregroundStyle(Theme.ink)
            Spacer()
            if let action {
                Button(action, action: onAction).font(.subheadline).foregroundStyle(Theme.muted)
            }
        }
    }
}
