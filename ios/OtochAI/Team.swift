import SwiftUI
import UserNotifications

// MARK: - Models (mirror pinequest-team7 src/lib/services/coach.ts → teamsOverview)

struct TeamInfo: Decodable, Identifiable, Hashable {
    struct Member: Decodable, Identifiable, Hashable {
        let userId: String
        let name: String
        let role: String
        let practices: Int
        let best: Int?
        let last: Int?
        var id: String { userId }
    }

    struct Challenge: Decodable, Identifiable, Hashable {
        let id: String
        let title: String
        let packRef: String
        let mode: String
        let difficulty: String
        let targetScore: Int
        let dueAt: String?
        let createdAt: String
        let myBest: Int?
        let passed: Bool
        let passedCount: Int
        let attemptCount: Int
        var due: Date? { dueAt.map(ServerAPI.date) }
    }

    struct FeedItem: Decodable, Identifiable, Hashable {
        let id: String
        let name: String
        let packTitle: String
        let score: Int
        let targetScore: Int?
        let passed: Bool?
        let createdAt: String
        var date: Date { ServerAPI.date(createdAt) }
    }

    let id: String
    let name: String
    let role: String          // "owner" | "member"
    let code: String?         // owners only
    let memberCount: Int
    let members: [Member]
    let challenges: [Challenge]
    let feed: [FeedItem]

    var isOwner: Bool { role == "owner" }
    var ownerName: String? { members.first { $0.role == "owner" }?.name }
}

/// A challenge the signed-in member still has to pass.
struct PendingChallenge: Hashable {
    let team: TeamInfo
    let challenge: TeamInfo.Challenge
}

// MARK: - Store (+ local notifications)

@MainActor
final class TeamStore: ObservableObject {
    @Published private(set) var teams: [TeamInfo] = []
    @Published private(set) var needsSignIn = false
    @Published private(set) var error: String?
    @Published private(set) var loaded = false
    /// New results (owners) or new challenges (members) since the «Баг» tab was last opened.
    @Published private(set) var unseen = 0

    private struct Overview: Decodable { let teams: [TeamInfo] }
    private struct TeamBody: Decodable { struct T: Decodable { let id: String; let name: String }; let team: T }
    private struct ChallengeBody: Decodable { struct C: Decodable { let id: String; let title: String }; let challenge: C }

    private let seenKey = "team.seenIds"
    private let notifiedKey = "team.notifiedIds"

    var ownedTeams: [TeamInfo] { teams.filter(\.isOwner) }

    var nextChallenge: PendingChallenge? {
        for team in teams where !team.isOwner {
            if let c = team.challenges.first(where: { !$0.passed }) { return PendingChallenge(team: team, challenge: c) }
        }
        return nil
    }

    func load() async {
        do {
            teams = try await ServerAPI.get("api/teams", as: Overview.self).teams
            needsSignIn = false
            error = nil
            loaded = true
            refreshUnseen()
        } catch QuizAPIError.notSignedIn {
            needsSignIn = true
            teams = []
        } catch {
            self.error = error.localizedDescription
        }
    }

    func create(name: String) async throws {
        _ = try await ServerAPI.post("api/teams", ["name": name], as: TeamBody.self)
        await load()
        markSeen()
    }

    func join(code: String) async throws -> String {
        let team = try await ServerAPI.post("api/teams/join", ["code": code], as: TeamBody.self).team
        await load()
        markSeen()
        return team.name
    }

    func createChallenge(teamId: String, packRef: String, title: String, mode: String, difficulty: String, target: Int, dueDays: Int?) async throws {
        var body: [String: Any] = ["packRef": packRef, "title": title, "mode": mode, "difficulty": difficulty, "targetScore": target]
        if let dueDays { body["dueDays"] = dueDays } else { body["dueDays"] = NSNull() }
        _ = try await ServerAPI.post("api/teams/\(teamId)/challenges", body, as: ChallengeBody.self)
        await load()
        markSeen()
    }

    // MARK: Notifications
    //
    // Owners hear about every new result of their staff, members about every new
    // challenge. Without a push server, the app checks when it comes to the
    // foreground and shows a local notification for anything new.

    /// What the user should be told about: (id, title, body).
    private var events: [(String, String, String)] {
        teams.flatMap { team -> [(String, String, String)] in
            if team.isOwner {
                return team.feed.map { item in
                    let mark = item.passed == true ? "✅" : item.passed == false ? "❌" : ""
                    let target = item.targetScore.map { " (зорилт \($0))" } ?? ""
                    return ("r:\(item.id)", team.name, "\(item.name) «\(item.packTitle)»: \(item.score) оноо\(target) \(mark)")
                }
            }
            return team.challenges.map { c in ("c:\(c.id)", team.name, "Шинэ сорилт: «\(c.title)» — зорилт \(c.targetScore) оноо") }
        }
    }

    private func refreshUnseen() {
        let seen = Set(UserDefaults.standard.stringArray(forKey: seenKey) ?? [])
        let all = events
        if UserDefaults.standard.object(forKey: seenKey) == nil {
            // First load on this phone: nothing is "new" yet.
            UserDefaults.standard.set(all.map(\.0), forKey: seenKey)
            UserDefaults.standard.set(all.map(\.0), forKey: notifiedKey)
            unseen = 0
            return
        }
        let fresh = all.filter { !seen.contains($0.0) }
        unseen = fresh.count
        notify(fresh)
    }

    /// Called when the «Баг» tab is opened.
    func markSeen() {
        UserDefaults.standard.set(events.map(\.0), forKey: seenKey)
        unseen = 0
    }

    private func notify(_ fresh: [(String, String, String)]) {
        var notified = Set(UserDefaults.standard.stringArray(forKey: notifiedKey) ?? [])
        let toSend = fresh.filter { !notified.contains($0.0) }.prefix(5)
        guard !toSend.isEmpty else { return }
        let center = UNUserNotificationCenter.current()
        for (id, title, body) in toSend {
            let content = UNMutableNotificationContent()
            content.title = title
            content.body = body
            content.sound = .default
            center.add(UNNotificationRequest(identifier: id, content: content, trigger: nil))
            notified.insert(id)
        }
        UserDefaults.standard.set(Array(notified), forKey: notifiedKey)
    }

    static func askNotificationPermission() {
        UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge]) { _, _ in }
    }
}

// MARK: - «Баг» tab

struct TeamView: View {
    @EnvironmentObject private var team: TeamStore
    @EnvironmentObject private var coach: CoachStore
    @State private var newTeamName = ""
    @State private var joinCode = ""
    @State private var working = false
    @State private var message: String?
    @State private var showSignIn = false
    @State private var challengeFor: TeamInfo?
    @State private var materialFor: TeamInfo?
    @State private var launch: CoachLaunch?
    @State private var showJoinMore = false

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    VStack(alignment: .leading, spacing: 6) {
                        Text("Баг").font(.system(size: 32, weight: .semibold)).foregroundStyle(.white)
                        Text("Ажил олгогч сорилт өгч, ажилтан биелүүлнэ. Үр дүн бүр менежерт шууд мэдэгдэнэ.")
                            .font(.subheadline).foregroundStyle(.white.opacity(0.9))
                    }

                    if team.needsSignIn {
                        SignInBanner(text: "Багт нэгдэх эсвэл баг үүсгэхийн тулд нэвтэрнэ үү.") { showSignIn = true }
                    } else if team.loaded && team.teams.isEmpty {
                        startCards
                    }

                    ForEach(team.teams) { t in
                        if t.isOwner { ownerCard(t) } else { memberCard(t) }
                    }

                    if !team.teams.isEmpty {
                        DisclosureGroup("Өөр баг үүсгэх эсвэл нэгдэх", isExpanded: $showJoinMore) { startCards.padding(.top, 10) }
                            .font(.subheadline.weight(.semibold))
                            .card(padding: 14, radius: 20)
                    }

                    if let message { Text(message).font(.footnote).foregroundStyle(Theme.muted) }
                    if let error = team.error { Text(error).font(.caption).foregroundStyle(Theme.alert) }
                }
                .padding(20)
            }
            .refreshable { await team.load() }
            .scrollDismissesKeyboard(.interactively)
            .appScreen()
            .toolbar(.hidden, for: .navigationBar)
            .navigationDestination(for: String.self) { CoachResultDetailView(id: $0) }
        }
        .tint(brand)
        .task {
            TeamStore.askNotificationPermission()
            await team.load()
            team.markSeen()
        }
        .sheet(isPresented: $showSignIn) { SignInSheet { Task { await team.load(); await coach.load() } } }
        .sheet(item: $challengeFor) { t in ChallengeCreateView(team: t) }
        .sheet(item: $materialFor) { t in
            CoachCustomView(teamId: t.id) { _ in
                materialFor = nil
                message = "Компанийн дасгалжуулагч үүслээ. Одоо «Сорилт өгөх»-өөс сонгоод ажилтнууддаа илгээгээрэй."
            }
        }
        .fullScreenCover(item: $launch) { item in
            CoachSessionView(launch: item) {
                launch = nil
                Task { await team.load(); await coach.load() }
            }
        }
    }

    // MARK: No team yet

    private var startCards: some View {
        VStack(spacing: 12) {
            VStack(alignment: .leading, spacing: 10) {
                Label("Би ажил олгогч / менежер", systemImage: "briefcase.fill").font(.headline).foregroundStyle(Theme.ink)
                Text("Баг үүсгээд кодоо шинэ ажилтандаа өгнө. Компанийн мэдээллээ оруулж, сорилт өгч, үр дүнг харна.")
                    .font(.caption).foregroundStyle(Theme.muted)
                TextField("Компани / багийн нэр", text: $newTeamName)
                    .padding(12).background(Theme.field, in: RoundedRectangle(cornerRadius: 14))
                Button {
                    run { try await team.create(name: newTeamName.trimmingCharacters(in: .whitespaces)); newTeamName = ""; message = "Баг үүслээ. Кодыг ажилтнууддаа илгээгээрэй." }
                } label: { Text("Баг үүсгэх") }
                    .buttonStyle(.primary)
                    .disabled(working || newTeamName.trimmingCharacters(in: .whitespaces).count < 2)
            }
            .card(padding: 16, radius: 22)

            VStack(alignment: .leading, spacing: 10) {
                Label("Би ажилтан", systemImage: "person.fill").font(.headline).foregroundStyle(Theme.ink)
                Text("Менежерээсээ авсан 6 оронтой кодоор нэгдээд сорилтуудаа биелүүлнэ.")
                    .font(.caption).foregroundStyle(Theme.muted)
                TextField("Код (жишээ: K7M2QX)", text: $joinCode)
                    .textInputAutocapitalization(.characters)
                    .autocorrectionDisabled()
                    .padding(12).background(Theme.field, in: RoundedRectangle(cornerRadius: 14))
                Button {
                    run { let name = try await team.join(code: joinCode.trimmingCharacters(in: .whitespaces)); joinCode = ""; message = "«\(name)» багт нэгдлээ." }
                } label: { Text("Нэгдэх") }
                    .buttonStyle(.secondary)
                    .disabled(working || joinCode.trimmingCharacters(in: .whitespaces).count < 4)
            }
            .card(padding: 16, radius: 22)
        }
    }

    private func run(_ action: @escaping () async throws -> Void) {
        working = true
        message = nil
        Task {
            defer { working = false }
            do { try await action() } catch { message = error.localizedDescription }
        }
    }

    // MARK: Owner (employer)

    private func ownerCard(_ t: TeamInfo) -> some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack {
                VStack(alignment: .leading, spacing: 2) {
                    Text(t.name).font(.title3.weight(.semibold)).foregroundStyle(Theme.ink)
                    Text("Та менежер · \(t.memberCount - 1) ажилтан").font(.caption).foregroundStyle(Theme.muted)
                }
                Spacer()
                if let code = t.code {
                    ShareLink(item: "OTech AI-д манай «\(t.name)» багт нэгдээрэй. Апп → Баг → Нэгдэх, код: \(code)") {
                        VStack(spacing: 2) {
                            Text(code).font(.headline.monospaced()).foregroundStyle(brand)
                            Label("Хуваалцах", systemImage: "square.and.arrow.up").font(.caption2).foregroundStyle(Theme.muted)
                        }
                        .padding(.horizontal, 12).padding(.vertical, 8)
                        .background(Theme.accentSoft, in: RoundedRectangle(cornerRadius: 14))
                    }
                }
            }

            HStack(spacing: 10) {
                Button { challengeFor = t } label: { Label("Сорилт өгөх", systemImage: "flag.checkered") }
                    .buttonStyle(.primary)
                Button { materialFor = t } label: { Label("Материал", systemImage: "doc.badge.plus") }
                    .buttonStyle(.secondary)
            }

            if !t.challenges.isEmpty {
                Text("Сорилтууд").font(.headline)
                ForEach(t.challenges) { c in
                    HStack(spacing: 12) {
                        Text(coach.pack(c.packRef)?.icon ?? "🏆").font(.title2)
                        VStack(alignment: .leading, spacing: 2) {
                            Text(c.title).font(.subheadline.weight(.semibold))
                            Text("Зорилт \(c.targetScore) · \(CoachLabels.mode(c.mode)) · \(CoachLabels.difficulty(c.difficulty))" + dueText(c.due))
                                .font(.caption).foregroundStyle(Theme.muted)
                        }
                        Spacer()
                        Text("\(c.passedCount)/\(max(0, t.memberCount - 1))")
                            .font(.subheadline.weight(.semibold).monospacedDigit()).foregroundStyle(brand)
                            .accessibilityLabel("\(c.passedCount) ажилтан биелүүлсэн")
                    }
                    .padding(10).background(Theme.field, in: RoundedRectangle(cornerRadius: 14))
                }
            }

            let staff = t.members.filter { $0.role != "owner" }
            if !staff.isEmpty {
                Text("Ажилтнууд").font(.headline)
                ForEach(staff) { m in
                    HStack {
                        Image(systemName: "person.crop.circle.fill").font(.title2).foregroundStyle(Theme.subtle)
                        VStack(alignment: .leading, spacing: 1) {
                            Text(m.name).font(.subheadline.weight(.semibold))
                            Text("\(m.practices) дадлага").font(.caption).foregroundStyle(Theme.muted)
                        }
                        Spacer()
                        if let best = m.best {
                            Text("\(best)").font(.headline.monospacedDigit()).foregroundStyle(scoreColor(best))
                        } else {
                            Text("–").foregroundStyle(Theme.subtle)
                        }
                    }
                }
            } else {
                Text("Ажилтан нэгдээгүй байна. Дээрх кодыг илгээгээрэй.").font(.caption).foregroundStyle(Theme.muted)
            }

            if !t.feed.isEmpty {
                Text("Сүүлийн үр дүн").font(.headline)
                ForEach(t.feed.prefix(10)) { item in
                    NavigationLink(value: item.id) { FeedRow(item: item) }.buttonStyle(.plain)
                }
            }
        }
        .card(padding: 16, radius: 24)
    }

    // MARK: Member (employee)

    private func memberCard(_ t: TeamInfo) -> some View {
        VStack(alignment: .leading, spacing: 14) {
            VStack(alignment: .leading, spacing: 2) {
                Text(t.name).font(.title3.weight(.semibold)).foregroundStyle(Theme.ink)
                Text("Менежер: \(t.ownerName ?? "—")").font(.caption).foregroundStyle(Theme.muted)
            }
            if t.challenges.isEmpty {
                Text("Одоогоор сорилт алга. Менежер сорилт өгөхөд энд гарч ирнэ.").font(.caption).foregroundStyle(Theme.muted)
            }
            ForEach(t.challenges) { c in
                HStack(spacing: 12) {
                    Text(coach.pack(c.packRef)?.icon ?? "🏆").font(.title2)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(c.title).font(.subheadline.weight(.semibold))
                        Text("Зорилт \(c.targetScore)" + (c.myBest.map { " · Таны шилдэг \($0)" } ?? "") + dueText(c.due))
                            .font(.caption).foregroundStyle(Theme.muted)
                    }
                    Spacer()
                    if c.passed {
                        Label("Биелсэн", systemImage: "checkmark.seal.fill").font(.caption.weight(.semibold)).foregroundStyle(Theme.ok)
                    } else {
                        Button {
                            launch = CoachLaunch(packRef: c.packRef, mode: c.mode, difficulty: c.difficulty, challengeId: c.id)
                        } label: {
                            Text(c.myBest == nil ? "Эхлэх" : "Дахин").font(.subheadline.weight(.semibold))
                                .padding(.horizontal, 14).padding(.vertical, 8)
                                .background(Theme.accentGradient, in: Capsule()).foregroundStyle(.white)
                        }
                        .buttonStyle(.plain)
                    }
                }
                .padding(10).background(Theme.field, in: RoundedRectangle(cornerRadius: 14))
            }
            if !t.feed.isEmpty {
                Text("Миний үр дүн").font(.headline)
                ForEach(t.feed.prefix(10)) { item in
                    NavigationLink(value: item.id) { FeedRow(item: item) }.buttonStyle(.plain)
                }
            }
        }
        .card(padding: 16, radius: 24)
    }

    private func dueText(_ due: Date?) -> String {
        guard let due else { return "" }
        return " · \(due.formatted(.dateTime.month(.abbreviated).day())) хүртэл"
    }
}

private struct FeedRow: View {
    let item: TeamInfo.FeedItem
    var body: some View {
        HStack(spacing: 12) {
            Text("\(item.score)")
                .font(.headline.monospacedDigit())
                .frame(width: 44, height: 44)
                .background(scoreColor(item.score).opacity(0.15), in: Circle())
                .foregroundStyle(scoreColor(item.score))
            VStack(alignment: .leading, spacing: 2) {
                Text("\(item.name) · \(item.packTitle)").font(.subheadline.weight(.semibold)).foregroundStyle(Theme.ink).lineLimit(1)
                Text(item.date.formatted(date: .abbreviated, time: .shortened)).font(.caption).foregroundStyle(Theme.muted)
            }
            Spacer()
            if let passed = item.passed {
                Image(systemName: passed ? "checkmark.seal.fill" : "xmark.seal").foregroundStyle(passed ? Theme.ok : Theme.alert)
            }
            Image(systemName: "chevron.right").font(.caption).foregroundStyle(Theme.subtle)
        }
    }
}

/// Banner on «AI дасгалжуулагч» / «Нүүр»: the next challenge from the employer.
struct ChallengeBanner: View {
    let item: PendingChallenge
    var body: some View {
        HStack(spacing: 14) {
            Image(systemName: "flag.checkered").font(.title2).foregroundStyle(.white)
                .frame(width: 50, height: 50).background(Theme.accentGradient, in: Circle())
            VStack(alignment: .leading, spacing: 3) {
                Text("Сорилт: \(item.challenge.title)").font(.headline).foregroundStyle(Theme.ink)
                Text("\(item.team.name) · зорилт \(item.challenge.targetScore) оноо" + (item.challenge.myBest.map { " · таны шилдэг \($0)" } ?? ""))
                    .font(.caption).foregroundStyle(Theme.muted)
            }
            Spacer()
            Text("Эхлэх").font(.subheadline.weight(.semibold)).foregroundStyle(brand)
        }
        .card(padding: 14, radius: 22)
    }
}

// MARK: - Owner: give the staff a challenge

struct ChallengeCreateView: View {
    let team: TeamInfo
    @EnvironmentObject private var store: TeamStore
    @EnvironmentObject private var coach: CoachStore
    @Environment(\.dismiss) private var dismiss
    @State private var packRef = ""
    @State private var title = ""
    @State private var mode = "audio"
    @State private var difficulty = "medium"
    @State private var target = 70
    @State private var dueDays: Int? = 7
    @State private var working = false
    @State private var error: String?

    private var packs: [CoachPack] { coach.custom.filter { $0.teamId == nil || $0.teamId == team.id } + coach.roles }

    var body: some View {
        NavigationStack {
            Form {
                Section("Дүр") {
                    Picker("Дүр", selection: $packRef) {
                        ForEach(packs) { p in Text("\(p.icon) \(p.title)").tag(p.id) }
                    }
                    .pickerStyle(.navigationLink)
                    TextField("Сорилтын нэр (заавал биш)", text: $title)
                }
                Section("Нөхцөл") {
                    Picker("Хэлбэр", selection: $mode) { ForEach(CoachLabels.modes, id: \.0) { Text($0.1).tag($0.0) } }
                    Picker("Хүндийн зэрэг", selection: $difficulty) { ForEach(CoachLabels.difficulties, id: \.0) { Text($0.1).tag($0.0) } }
                    Stepper("Зорилт: \(target) оноо", value: $target, in: 40...100, step: 5)
                    Picker("Хугацаа", selection: $dueDays) {
                        Text("Хугацаагүй").tag(Int?.none)
                        Text("3 хоног").tag(Optional(3))
                        Text("7 хоног").tag(Optional(7))
                        Text("14 хоног").tag(Optional(14))
                    }
                }
                Section {
                    Text("Ажилтан бүрийн үр дүн танд мэдэгдэл болон «Баг» хэсэгт ирнэ.").font(.caption).foregroundStyle(.secondary)
                    if let error { Text(error).foregroundStyle(Theme.alert) }
                }
            }
            .navigationTitle("Сорилт өгөх")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) { Button("Болих") { dismiss() } }
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Илгээх") { Task { await send() } }
                        .disabled(packRef.isEmpty || working)
                }
            }
            .onAppear {
                if packRef.isEmpty, let first = packs.first {
                    packRef = first.id
                    mode = first.defaultMode
                }
            }
            .onChange(of: packRef) { _, ref in
                if let p = packs.first(where: { $0.id == ref }) { mode = p.defaultMode }
            }
        }
        .tint(brand)
    }

    private func send() async {
        working = true
        defer { working = false }
        do {
            try await store.createChallenge(teamId: team.id, packRef: packRef, title: title.trimmingCharacters(in: .whitespaces),
                                            mode: mode, difficulty: difficulty, target: target, dueDays: dueDays)
            dismiss()
        } catch {
            self.error = error.localizedDescription
        }
    }
}
