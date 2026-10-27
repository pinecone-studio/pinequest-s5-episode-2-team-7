import SwiftUI

/// The centre tab «AI өвчтөн»: emergency cases played as decisions in a
/// tilt-to-look scene, plus the conversational AI patient (web) for history taking.
struct PatientHub: View {
    @EnvironmentObject private var results: ScenarioHistory
    @AppStorage(UserRole.storageKey) private var roleRaw = ""
    @State private var playing: Scenario?
    @State private var showInterview = false

    private var role: UserRole { UserRole(rawValue: roleRaw) ?? .student }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 22) {
                    VStack(alignment: .leading, spacing: 6) {
                        Text("AI өвчтөн").font(.system(size: 32, weight: .semibold)).foregroundStyle(.white)
                        Text("Жинхэнэ өвчтөнөөс өмнө энд алдаад, энд сур.").font(.subheadline).foregroundStyle(.white.opacity(0.9))
                    }

                    let daily = Scenario.daily(for: role)
                    Button { playing = daily } label: { FeaturedScenarioCard(scenario: daily, best: results.best(for: daily.id)) }
                        .buttonStyle(.plain)

                    VStack(alignment: .leading, spacing: 12) {
                        Text("Яаралтай тохиолдлууд").font(.title3.weight(.semibold)).foregroundStyle(Theme.ink)
                        ForEach(Scenario.ordered(for: role)) { scenario in
                            Button { playing = scenario } label: { ScenarioRow(scenario: scenario, best: results.best(for: scenario.id)) }
                                .buttonStyle(.plain)
                        }
                    }

                    Button { showInterview = true } label: {
                        HStack(spacing: 14) {
                            Image(systemName: "bubble.left.and.text.bubble.right.fill")
                                .font(.title2).foregroundStyle(brand)
                                .frame(width: 54, height: 54)
                                .background(Theme.accentSoft, in: Circle())
                            VStack(alignment: .leading, spacing: 3) {
                                Text("Өвчтөнтэй ярилцах").font(.headline).foregroundStyle(Theme.ink)
                                Text("Дуугаар асууж анамнез аван онош тавих (интернэт шаардлагатай)").font(.caption).foregroundStyle(Theme.muted)
                            }
                            Spacer()
                            Image(systemName: "chevron.right").foregroundStyle(Theme.subtle)
                        }
                        .card(padding: 14, radius: 24)
                    }
                    .buttonStyle(.plain)
                }
                .padding(20)
            }
            .appScreen()
            .toolbar(.hidden, for: .navigationBar)
        }
        .tint(brand)
        .fullScreenCover(item: $playing) { ScenarioPlayView(scenario: $0) }
        .fullScreenCover(isPresented: $showInterview) {
            NavigationStack {
                WebView(url: Config.url)
                    .ignoresSafeArea(edges: .bottom)
                    .navigationTitle("Өвчтөнтэй ярилцах")
                    .navigationBarTitleDisplayMode(.inline)
                    .toolbar { ToolbarItem(placement: .topBarLeading) { Button("Хаах") { showInterview = false } } }
            }
            .tint(brand)
        }
    }
}

struct FeaturedScenarioCard: View {
    let scenario: Scenario
    let best: Int?

    var body: some View {
        ZStack(alignment: .bottomLeading) {
            SceneWindow(kind: scenario.scene, interactive: false)
                .frame(height: 210)
            LinearGradient(colors: [.clear, .black.opacity(0.65)], startPoint: .center, endPoint: .bottom)
            VStack(alignment: .leading, spacing: 6) {
                Label("Өнөөдрийн даалгавар", systemImage: "star.fill")
                    .font(.caption.weight(.bold))
                    .padding(.horizontal, 10).padding(.vertical, 5)
                    .background(Theme.accentGradient, in: Capsule())
                    .foregroundStyle(.white)
                Text(scenario.title).font(.title2.weight(.bold)).foregroundStyle(.white)
                HStack(spacing: 10) {
                    Label("\(scenario.minutes) мин", systemImage: "clock")
                    Label("\(scenario.steps.count) шийдвэр", systemImage: "arrow.triangle.branch")
                    if let best { Label("Шилдэг \(best)", systemImage: "trophy.fill") }
                }
                .font(.caption).foregroundStyle(.white.opacity(0.9))
            }
            .padding(16)
        }
        .clipShape(RoundedRectangle(cornerRadius: 28, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 28, style: .continuous).stroke(Theme.line, lineWidth: 1))
        .shadow(color: Theme.shadow, radius: 16, y: 8)
        .overlay(alignment: .topTrailing) {
            Text("Эхлэх").font(.subheadline.weight(.semibold)).foregroundStyle(.white)
                .padding(.horizontal, 16).padding(.vertical, 9)
                .background(Theme.accentGradient, in: Capsule())
                .padding(14)
        }
        .accessibilityElement(children: .combine)
    }
}

private struct ScenarioRow: View {
    let scenario: Scenario
    let best: Int?

    var body: some View {
        HStack(spacing: 14) {
            SceneWindow(kind: scenario.scene, interactive: false)
                .frame(width: 84, height: 84)
                .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
            VStack(alignment: .leading, spacing: 4) {
                Text(scenario.title).font(.headline).foregroundStyle(Theme.ink)
                Text(scenario.subtitle).font(.caption).foregroundStyle(Theme.muted)
                HStack(spacing: 8) {
                    DifficultyDots(level: scenario.difficulty)
                    Text("\(scenario.minutes) мин").font(.caption2).foregroundStyle(Theme.muted)
                    if let best {
                        Label("\(best)", systemImage: "trophy.fill").font(.caption2.weight(.semibold)).foregroundStyle(Theme.warn)
                    }
                }
            }
            Spacer()
            Image(systemName: "play.fill").font(.footnote).foregroundStyle(.white)
                .frame(width: 38, height: 38).background(Theme.accentGradient, in: Circle())
        }
        .card(padding: 12, radius: 24)
    }
}

struct DifficultyDots: View {
    let level: Int
    var body: some View {
        HStack(spacing: 3) {
            ForEach(1...3, id: \.self) { i in
                Circle().fill(i <= level ? Theme.accent : Theme.subtle.opacity(0.4)).frame(width: 6, height: 6)
            }
        }
        .accessibilityLabel("Хүндрэл \(level)/3")
    }
}

// MARK: - Playing a scenario

struct ScenarioPlayView: View {
    let scenario: Scenario

    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject private var results: ScenarioHistory
    @AppStorage("mainTab") private var tab = AppTab.home
    @AppStorage("quizPrefill") private var quizPrefill = ""
    @AppStorage(UserRole.storageKey) private var roleRaw = ""

    private enum Stage: Equatable { case briefing, step(Int), feedback(Int), debrief }

    @State private var stage: Stage = .briefing
    @State private var vitals: Vitals
    @State private var choices: [String: ScenarioOption] = [:]
    @State private var stepSeconds = 0
    @State private var totalSeconds = 0
    @State private var overtime = 0
    @State private var showFindings = false
    @State private var saved = false
    @State private var article: KnowledgeArticle?
    /// Block world: the medic has walked to the patient (unlocks the first decision).
    @State private var reached = false


    init(scenario: Scenario) {
        self.scenario = scenario
        _vitals = State(initialValue: scenario.start)
    }

    private var role: UserRole { UserRole(rawValue: roleRaw) ?? .student }

    /// Road accidents and the emergency room play in the walkable block world.
    private var usesWorld: Bool { scenario.scene == .roadAccident || scenario.scene == .emergencyRoom }

    /// The crash site until the patient is ready to move (step 4, circulation), then the hospital.
    private var worldLocation: BlockLocation {
        guard scenario.scene == .roadAccident else { return .hospital }
        if case .debrief = stage { return .hospital }
        return (currentIndex ?? 0) >= 3 ? .hospital : .road
    }

    /// Walk first: the decisions open once the medic has reached the patient.
    private var mustWalk: Bool { usesWorld && !reached && currentIndex != nil }

    private var currentIndex: Int? {
        switch stage {
        case .step(let i), .feedback(let i): return i
        default: return nil
        }
    }

    var body: some View {
        ZStack(alignment: .top) {
            Color.black.ignoresSafeArea()
            if stage == .debrief {
                debrief
            } else {
                VStack(spacing: 0) {
                    ZStack(alignment: .top) {
                        if usesWorld {
                            BlockWorldView(location: worldLocation, danger: vitals.danger) {
                                reached = true
                                if currentIndex != nil { showFindings = true }
                            }
                        } else {
                            SceneWindow(kind: scenario.scene, danger: vitals.danger, onPatientTap: currentIndex == nil ? nil : { showFindings = true })
                        }
                        topBar
                        if showFindings, let i = currentIndex { findingsCard(scenario.steps[i]) }
                    }
                    .frame(maxHeight: .infinity)
                    VitalsStrip(vitals: vitals)
                    panel
                }
                .ignoresSafeArea(edges: .top)
            }
        }
        .preferredColorScheme(.dark)
        .task {
            // One-second clock while a step is on screen.
            while !Task.isCancelled {
                try? await Task.sleep(for: .seconds(1))
                guard case .step = stage else { continue }
                stepSeconds += 1
                totalSeconds += 1
            }
        }
        .sheet(item: $article) { KnowledgeArticleView(article: $0) }
        // Arriving at the hospital: walk to the bed again.
        .onChange(of: worldLocation) { _, _ in
            reached = false
            showFindings = false
        }
    }

    // MARK: Top bar

    private var topBar: some View {
        HStack {
            Button { dismiss() } label: { GlassCircle(icon: "xmark", size: 40) }
                .accessibilityLabel("Гарах")
            Spacer()
            if let i = currentIndex {
                let limit = scenario.steps[i].timeLimit
                Label("\(stepSeconds) / \(limit)с", systemImage: "timer")
                    .font(.subheadline.monospacedDigit().weight(.semibold))
                    .foregroundStyle(stepSeconds > limit ? Color.red : .white)
                    .padding(.horizontal, 12).padding(.vertical, 8)
                    .background(.ultraThinMaterial, in: Capsule())
                Text("\(i + 1)/\(scenario.steps.count)")
                    .font(.subheadline.weight(.semibold)).foregroundStyle(.white)
                    .padding(.horizontal, 12).padding(.vertical, 8)
                    .background(.ultraThinMaterial, in: Capsule())
            }
        }
        .padding(.horizontal, 16)
        .padding(.top, 58)
    }

    private func findingsCard(_ step: ScenarioStep) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Label("Үзлэгийн илрэл", systemImage: "stethoscope").font(.headline)
                Spacer()
                Button { showFindings = false } label: { Image(systemName: "xmark.circle.fill").font(.title3) }
                    .accessibilityLabel("Хаах")
            }
            ForEach(step.findings, id: \.self) { f in
                HStack(alignment: .top, spacing: 8) {
                    Circle().fill(Theme.accent).frame(width: 6, height: 6).padding(.top, 7)
                    Text(f).font(.subheadline)
                }
            }
        }
        .foregroundStyle(Theme.ink)
        .padding(16)
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
        .padding(.horizontal, 16)
        .padding(.top, 112)
        .transition(.scale.combined(with: .opacity))
    }

    // MARK: Bottom panel

    @ViewBuilder
    private var panel: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                switch stage {
                case .briefing: briefing
                case .step where mustWalk:
                    Label("Джойстикоор өвчтөн рүү алхаж очоод «Үзлэг хийх» дар. Хуруугаараа чирж эргэн тойрноо хар.", systemImage: "figure.walk")
                        .font(.subheadline.weight(.semibold))
                case .step(let i): stepView(i)
                case .feedback(let i): feedbackView(i)
                case .debrief: EmptyView()
                }
            }
            .padding(20)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .frame(height: mustWalk ? 120 : 390)
        .animation(.snappy, value: mustWalk)
        .background(Theme.canvas, in: UnevenRoundedRectangle(topLeadingRadius: 28, topTrailingRadius: 28, style: .continuous))
        .foregroundStyle(Theme.ink)
        .environment(\.colorScheme, .light)
    }

    private var briefing: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(scenario.title).font(.title2.weight(.bold))
            Text(scenario.briefing).font(.body)
            Label(scenario.patient, systemImage: "person.fill").font(.subheadline).foregroundStyle(Theme.muted)
            Label("Та: \(role.title). Утсаа хөдөлгөж эсвэл хуруугаараа чирж эргэн тойрноо хар. Өвчтөн дээр дарж үзлэг хий.", systemImage: "iphone.gen3.radiowaves.left.and.right")
                .font(.caption).foregroundStyle(Theme.muted)
            Button { stage = .step(0); stepSeconds = 0 } label: { Text("Эхлэх") }
                .buttonStyle(.primary)
        }
    }

    private func stepView(_ i: Int) -> some View {
        let step = scenario.steps[i]
        return VStack(alignment: .leading, spacing: 12) {
            Text(step.phase).font(.caption.weight(.bold)).foregroundStyle(brand)
                .padding(.horizontal, 10).padding(.vertical, 4).background(Theme.accentSoft, in: Capsule())
            Text(step.situation).font(.subheadline)
            Text(step.question).font(.headline)
            ForEach(step.options) { option in
                Button { choose(option, at: i) } label: {
                    HStack(alignment: .top, spacing: 10) {
                        Text(option.text).font(.subheadline).multilineTextAlignment(.leading)
                        Spacer(minLength: 0)
                    }
                    .padding(14)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(Theme.field, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
                    .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).stroke(Theme.subtle.opacity(0.35)))
                }
                .buttonStyle(.plain)
            }
        }
    }

    private func feedbackView(_ i: Int) -> some View {
        let step = scenario.steps[i]
        let picked = choices[step.id]
        let best = step.options.first { $0.grade == .best }
        return VStack(alignment: .leading, spacing: 12) {
            if let picked {
                GradeBadge(grade: picked.grade)
                Text(picked.text).font(.subheadline.weight(.semibold))
                Text(picked.feedback).font(.subheadline)
                if picked.grade != .best, let best {
                    VStack(alignment: .leading, spacing: 4) {
                        Text("Зөв хариулт").font(.caption.weight(.bold)).foregroundStyle(Theme.ok)
                        Text(best.text).font(.subheadline)
                    }
                    .padding(12)
                    .background(Theme.ok.opacity(0.1), in: RoundedRectangle(cornerRadius: 14))
                }
            }
            Button {
                showFindings = false
                if i + 1 < scenario.steps.count { stage = .step(i + 1); stepSeconds = 0 } else { finish() }
            } label: { Text(i + 1 < scenario.steps.count ? "Дараагийн алхам" : "Дүгнэлт харах") }
                .buttonStyle(.primary)
        }
    }

    private func choose(_ option: ScenarioOption, at i: Int) {
        let step = scenario.steps[i]
        choices[step.id] = option
        if stepSeconds > step.timeLimit { overtime += 1 }
        withAnimation(.easeInOut(duration: 0.6)) { vitals = vitals.applying(option.effect) }
        let generator = UINotificationFeedbackGenerator()
        generator.notificationOccurred(option.grade == .best ? .success : option.grade == .ok ? .warning : .error)
        stage = .feedback(i)
    }

    // MARK: Score and debrief

    private var score: Int {
        let max = scenario.steps.count * 10
        let points = scenario.steps.reduce(0) { $0 + (choices[$1.id]?.points ?? 0) } - overtime * 2
        return Swift.max(0, Swift.min(100, Int((Double(points) / Double(max) * 100).rounded())))
    }

    private var stable: Bool { vitals.danger < 0.4 && !choices.values.contains { $0.grade == .harmful } }

    private func finish() {
        stage = .debrief
        guard !saved else { return }
        saved = true
        results.add(ScenarioResult(scenarioID: scenario.id, title: scenario.title, date: .now, score: score, seconds: totalSeconds, stable: stable))
    }

    private var debrief: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                HStack {
                    Button { dismiss() } label: { GlassCircle(icon: "xmark", size: 40) }
                    Spacer()
                }
                HStack(spacing: 18) {
                    ScoreRingView(score: score)
                    VStack(alignment: .leading, spacing: 6) {
                        Text(scenario.title).font(.headline)
                        Label(stable ? "Өвчтөн тогтворжлоо" : "Өвчтөний байдал дордлоо", systemImage: stable ? "heart.fill" : "heart.slash.fill")
                            .font(.subheadline.weight(.semibold))
                            .foregroundStyle(stable ? Theme.ok : Theme.alert)
                        Text("Хугацаа: \(totalSeconds / 60):\(String(format: "%02d", totalSeconds % 60))").font(.caption).foregroundStyle(Theme.muted)
                    }
                }
                .card(padding: 16, radius: 26)

                Text("Алхам бүрээр").font(.title3.weight(.semibold))
                ForEach(scenario.steps) { step in
                    if let picked = choices[step.id] {
                        VStack(alignment: .leading, spacing: 6) {
                            HStack {
                                Text(step.phase).font(.caption.weight(.bold)).foregroundStyle(brand)
                                Spacer()
                                GradeBadge(grade: picked.grade)
                            }
                            Text(picked.text).font(.subheadline)
                            Text(picked.feedback).font(.caption).foregroundStyle(Theme.muted)
                        }
                        .card(padding: 14, radius: 20)
                    }
                }

                Text("Цааш судлах").font(.title3.weight(.semibold))
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 10) {
                        ForEach(scenario.learnMore.compactMap(KnowledgeArticle.find)) { a in
                            Button { article = a } label: {
                                Label(a.title, systemImage: a.icon)
                                    .font(.subheadline.weight(.medium))
                                    .padding(.horizontal, 14).padding(.vertical, 10)
                                    .background(Theme.field, in: Capsule())
                                    .overlay(Capsule().stroke(Theme.line))
                            }
                            .buttonStyle(.plain)
                        }
                    }
                }

                VStack(spacing: 10) {
                    Button {
                        quizPrefill = scenario.quizTopic
                        tab = .quiz
                        dismiss()
                    } label: { Label("Энэ сэдвээр Сорил өгөх", systemImage: "list.clipboard") }
                        .buttonStyle(.primary)
                    Button { restart() } label: { Label("Дахин тоглох", systemImage: "arrow.counterclockwise") }
                        .buttonStyle(.secondary)
                }
                Text("⚠️ Сургалтын симуляци. Эмнэлзүйн агуулгыг багш, эмчээр баталгаажуулна.")
                    .font(.caption2).foregroundStyle(Theme.muted)
            }
            .padding(20)
            .padding(.top, 40)
        }
        .foregroundStyle(Theme.ink)
        .background(AppBackground())
        .environment(\.colorScheme, .light)
    }

    private func restart() {
        vitals = scenario.start
        choices = [:]
        stepSeconds = 0
        totalSeconds = 0
        overtime = 0
        saved = false
        reached = false
        stage = .briefing
    }
}

struct GradeBadge: View {
    let grade: ScenarioOption.Grade
    var body: some View {
        let (text, icon, color): (String, String, Color) = {
            switch grade {
            case .best: return ("Зөв", "checkmark.circle.fill", Theme.ok)
            case .ok: return ("Хангалтгүй", "exclamationmark.circle.fill", Theme.warn)
            case .wrong: return ("Буруу", "xmark.circle.fill", Theme.alert)
            case .harmful: return ("Аюултай", "exclamationmark.triangle.fill", Theme.alert)
            }
        }()
        Label(text, systemImage: icon)
            .font(.caption.weight(.bold)).foregroundStyle(color)
            .padding(.horizontal, 10).padding(.vertical, 5)
            .background(color.opacity(0.12), in: Capsule())
    }
}

/// HR / BP / SpO₂ / RR / GCS strip under the scene, red when out of range.
struct VitalsStrip: View {
    let vitals: Vitals

    var body: some View {
        HStack(spacing: 0) {
            cell("ЗЦ", "\(vitals.hr)", vitals.hr > 120 || vitals.hr < 50)
            cell("АД", "\(vitals.sys)/\(vitals.dia)", vitals.sys < 90)
            cell("SpO₂", "\(vitals.spo2)%", vitals.spo2 < 90)
            cell("АТ", "\(vitals.rr)", vitals.rr > 28 || vitals.rr < 8)
            cell("ГКО", "\(vitals.gcs)", vitals.gcs < 13)
        }
        .padding(.vertical, 8)
        .background(Theme.rgb(0x0E1A24))
        .accessibilityElement(children: .combine)
    }

    private func cell(_ label: String, _ value: String, _ bad: Bool) -> some View {
        VStack(spacing: 2) {
            Text(label).font(.system(size: 10, weight: .semibold)).foregroundStyle(.white.opacity(0.6))
            Text(value).font(.system(size: 17, weight: .bold).monospacedDigit())
                .foregroundStyle(bad ? Color.red : Color.green)
                .contentTransition(.numericText())
        }
        .frame(maxWidth: .infinity)
    }
}

struct ScoreRingView: View {
    let score: Int
    var body: some View {
        ZStack {
            Circle().stroke(Theme.subtle.opacity(0.25), lineWidth: 10)
            Circle().trim(from: 0, to: CGFloat(score) / 100)
                .stroke(Theme.accentGradient, style: StrokeStyle(lineWidth: 10, lineCap: .round))
                .rotationEffect(.degrees(-90))
            VStack(spacing: 0) {
                Text("\(score)").font(.title.bold())
                Text("/100").font(.caption2).foregroundStyle(Theme.muted)
            }
        }
        .frame(width: 92, height: 92)
    }
}
