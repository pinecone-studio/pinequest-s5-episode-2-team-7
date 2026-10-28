import PhotosUI
import SwiftUI
import UniformTypeIdentifiers
import WebKit

// MARK: - Models (mirror pinequest-team7 src/lib/coach/types.ts → PublicPack)

struct RubricItem: Codable, Hashable {
    let id: String
    let label: String
}

/// A practice persona of the AI дасгалжуулагч (public part only: hidden facts stay on the server).
struct CoachPack: Codable, Identifiable, Hashable {
    let id: String
    let kind: String
    let title: String
    let subtitle: String
    let icon: String
    let traineeRole: String
    let defaultMode: String      // "video" | "audio"
    let language: String         // "mn" | "en"
    let gender: String
    let maxSec: Int
    let draft: Bool
    let brief: String
    let personaName: String
    let opening: String
    let openingEmotion: String
    let fillers: [String]
    let rubric: [RubricItem]
    let factCount: Int
    let orgName: String?
    let teamId: String?
    var questionCount: Int? = nil
    var studio: Bool? = nil

    var isCustom: Bool { kind == "custom" }

    /// Shown while the server is unreachable, so the roles are always visible.
    static let offline: [CoachPack] = [
        .placeholder("patient", "🩺", "AI өвчтөн", "Эмч, сувилагчийг шалгана: анамнез, тайлбар, итгэл", "video"),
        .placeholder("student", "🎒", "AI сурагч", "Багшийг шалгана: хэцүү сурагчтай ярилцлага", "video"),
        .placeholder("callcenter", "🎧", "AI call center", "Call center-ийн шинэ ажилтныг шалгана", "audio"),
        .placeholder("reception", "🛎️", "AI ресепшн", "Ресепшний ажилтныг шалгана: ядарсан зочин", "video"),
        .placeholder("buyer", "🛍️", "AI худалдан авагч", "Борлуулагчийг шалгана: үнийн эсэргүүцэл", "video"),
        .placeholder("tourist", "🧳", "AI гадаад жуулчин", "Англиар үйлчлэх дадлага", "video"),
        .placeholder("dispatch103", "🚑", "AI 103 дуудлага", "Яаралтай дуудлага хүлээн авагчийг шалгана", "audio"),
    ]

    private static func placeholder(_ id: String, _ icon: String, _ title: String, _ subtitle: String, _ mode: String) -> CoachPack {
        CoachPack(id: id, kind: id, title: title, subtitle: subtitle, icon: icon, traineeRole: "", defaultMode: mode, language: id == "tourist" ? "en" : "mn",
                  gender: "female", maxSec: 360, draft: false, brief: subtitle, personaName: "", opening: "", openingEmotion: "calm",
                  fillers: [], rubric: [], factCount: 0, orgName: nil, teamId: nil)
    }
}

struct CoachResultSummary: Codable, Identifiable, Hashable {
    let id: String
    let packRef: String
    let packTitle: String
    let mode: String
    let score: Int
    let durationSec: Int
    let challengeId: String?
    let summary: String
    let improvements: [String]
    let createdAt: String
    var date: Date { ServerAPI.date(createdAt) }
}

struct CoachDebrief: Codable, Hashable {
    struct Criterion: Codable, Hashable { let id: String; let label: String; let result: String; let evidence: String }
    struct Better: Codable, Hashable { let said: String; let better: String }
    let score: Int
    let summary: String
    let rubric: [Criterion]
    let strengths: [String]
    let improvements: [String]
    let betterLines: [Better]
    let factErrors: [String]
}

struct CoachLine: Codable, Hashable {
    let role: String
    let text: String
    let t: Double
}

struct CoachResultDetail: Codable, Hashable {
    let id: String
    let name: String
    let packRef: String
    let packTitle: String
    let mode: String
    let difficulty: String
    let score: Int
    let durationSec: Int
    let debrief: CoachDebrief
    let transcript: [CoachLine]
    let createdAt: String
}

/// What to open in the practice page.
struct CoachLaunch: Identifiable, Hashable {
    let id = UUID()
    let packRef: String
    let mode: String
    let difficulty: String
    var challengeId: String? = nil

    var url: URL {
        var c = URLComponents(url: Config.url.appendingPathComponent("coach"), resolvingAgainstBaseURL: false)!
        c.queryItems = [URLQueryItem(name: "pack", value: packRef), URLQueryItem(name: "mode", value: mode), URLQueryItem(name: "difficulty", value: difficulty)]
        if let challengeId { c.queryItems?.append(URLQueryItem(name: "challenge", value: challengeId)) }
        return c.url!
    }
}

enum CoachLabels {
    static let modes = [("video", "🎥 Видео"), ("audio", "📞 Аудио")]
    static let difficulties = [("easy", "Тайван"), ("medium", "Дунд"), ("hard", "Хэцүү")]
    static func mode(_ m: String) -> String { m == "video" ? "🎥 Видео" : "📞 Аудио" }
    static func difficulty(_ d: String) -> String { difficulties.first { $0.0 == d }?.1 ?? d }
}

// MARK: - Store

@MainActor
final class CoachStore: ObservableObject {
    @Published private(set) var builtin: [CoachPack] = []
    @Published private(set) var custom: [CoachPack] = []
    @Published private(set) var results: [CoachResultSummary] = []
    @Published private(set) var needsSignIn = false
    @Published private(set) var error: String?
    @Published private(set) var loading = false

    private struct PacksBody: Decodable { let builtin: [CoachPack]; let custom: [CoachPack] }
    private struct ResultsBody: Decodable { let results: [CoachResultSummary] }
    private struct PackBody: Decodable { let pack: CoachPack }

    /// Built-in roles from the server, or the offline list.
    var roles: [CoachPack] { builtin.isEmpty ? CoachPack.offline : builtin }

    var average: Int? { results.isEmpty ? nil : results.map(\.score).reduce(0, +) / results.count }

    func pack(_ ref: String) -> CoachPack? { (builtin + custom).first { $0.id == ref } ?? CoachPack.offline.first { $0.id == ref } }

    func load() async {
        loading = true
        defer { loading = false }
        do {
            let packs = try await ServerAPI.get("api/coach/packs", as: PacksBody.self)
            builtin = packs.builtin
            custom = packs.custom
            results = try await ServerAPI.get("api/coach/results", as: ResultsBody.self).results
            needsSignIn = false
            error = nil
        } catch QuizAPIError.notSignedIn {
            needsSignIn = true
        } catch {
            self.error = error.localizedDescription
        }
    }

    /// «Аватар студи»: a persona the manager wrote by hand (saved at once, no AI call).
    func createStudioPack(_ body: [String: Any]) async throws -> CoachPack {
        let pack = try await ServerAPI.post("api/coach/studio", body, as: PackBody.self).pack
        custom.insert(pack, at: 0)
        return pack
    }

    /// Company material → a new persona (20–40 s: Claude reads it).
    func createPack(orgName: String, persona: String, mode: String, materials: [Material], notes: String, teamId: String?) async throws -> CoachPack {
        let files = materials.map { ["name": $0.name, "mediaType": $0.mediaType, "data": $0.data.base64EncodedString()] }
        var payload: [String: Any] = ["orgName": orgName, "persona": persona, "mode": mode, "files": files, "notes": notes]
        if let teamId { payload["teamId"] = teamId } else { payload["teamId"] = NSNull() }
        let pack = try await ServerAPI.post("api/coach/packs", payload, as: PackBody.self, timeout: 180).pack
        custom.insert(pack, at: 0)
        return pack
    }
}

// MARK: - «AI дасгалжуулагч» tab

struct CoachHub: View {
    @EnvironmentObject private var coach: CoachStore
    @EnvironmentObject private var team: TeamStore
    @State private var selected: CoachPack?
    @State private var launch: CoachLaunch?
    @State private var showCustom = false
    @State private var showSignIn = false
    @State private var showCases = false

    private let columns = [GridItem(.flexible(), spacing: 12), GridItem(.flexible(), spacing: 12)]

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    VStack(alignment: .leading, spacing: 6) {
                        Text("AI дасгалжуулагч").font(.system(size: 32, weight: .semibold)).foregroundStyle(.white)
                        Text("Дүрээ сонго: AI тэр хүн болж видео эсвэл утсаар ярьж, дараа нь чамайг дүгнэнэ.")
                            .font(.subheadline).foregroundStyle(.white.opacity(0.9))
                    }

                    if coach.needsSignIn { SignInBanner { showSignIn = true } }

                    if let challenge = team.nextChallenge {
                        Button {
                            launch = CoachLaunch(packRef: challenge.challenge.packRef, mode: challenge.challenge.mode,
                                                 difficulty: challenge.challenge.difficulty, challengeId: challenge.challenge.id)
                        } label: { ChallengeBanner(item: challenge) }
                            .buttonStyle(.plain)
                    }

                    LazyVGrid(columns: columns, spacing: 12) {
                        ForEach(coach.roles) { pack in
                            Button { selected = pack } label: { RoleCard(pack: pack) }
                                .buttonStyle(.plain)
                        }
                        Button { showCustom = true } label: { CustomCard() }
                            .buttonStyle(.plain)
                    }

                    if !coach.custom.isEmpty {
                        VStack(alignment: .leading, spacing: 10) {
                            Text("Манай компанийн дүрүүд").font(.title3.weight(.semibold)).foregroundStyle(Theme.ink)
                            ForEach(coach.custom) { pack in
                                Button { selected = pack } label: { PackRow(pack: pack) }
                                    .buttonStyle(.plain)
                            }
                        }
                    }

                    Button { showCases = true } label: {
                        HStack(spacing: 14) {
                            Image(systemName: "cross.case.fill").font(.title2).foregroundStyle(brand)
                                .frame(width: 50, height: 50).background(Theme.accentSoft, in: Circle())
                            VStack(alignment: .leading, spacing: 3) {
                                Text("Яаралтай тохиолдлын тоглоом").font(.headline).foregroundStyle(Theme.ink)
                                Text("Осол, цээжний өвдөлт, анафилакс: цаг, амин үзүүлэлттэй сценари (сервергүй)")
                                    .font(.caption).foregroundStyle(Theme.muted)
                            }
                            Spacer()
                            Image(systemName: "chevron.right").foregroundStyle(Theme.subtle)
                        }
                        .card(padding: 14, radius: 22)
                    }
                    .buttonStyle(.plain)

                    if let error = coach.error {
                        Text(error).font(.caption).foregroundStyle(Theme.muted)
                    }
                }
                .padding(20)
            }
            .refreshable { await coach.load() }
            .appScreen()
            .toolbar(.hidden, for: .navigationBar)
        }
        .tint(brand)
        .task { await coach.load() }
        .sheet(item: $selected) { pack in
            CoachSetupView(pack: pack) { mode, difficulty in
                selected = nil
                present(CoachLaunch(packRef: pack.id, mode: mode, difficulty: difficulty))
            }
        }
        .sheet(isPresented: $showCustom) {
            CoachCustomView(teamId: nil) { pack in
                showCustom = false
                Task {
                    // Let the sheet finish closing before the next one opens.
                    try? await Task.sleep(for: .milliseconds(450))
                    selected = pack
                }
            }
        }
        .sheet(isPresented: $showSignIn) { SignInSheet { Task { await coach.load(); await team.load() } } }
        .sheet(isPresented: $showCases) { PatientHub() }
        .fullScreenCover(item: $launch) { item in
            CoachSessionView(launch: item) {
                launch = nil
                Task { await coach.load(); await team.load() }
            }
        }
    }

    /// Opens the practice page once the setup sheet has finished closing.
    private func present(_ item: CoachLaunch) {
        Task {
            try? await Task.sleep(for: .milliseconds(450))
            launch = item
        }
    }
}

private struct RoleCard: View {
    let pack: CoachPack
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(pack.icon).font(.system(size: 34))
            Text(pack.title).font(.headline).foregroundStyle(Theme.ink).lineLimit(1).minimumScaleFactor(0.8)
            Text(pack.subtitle).font(.caption).foregroundStyle(Theme.muted).lineLimit(3).multilineTextAlignment(.leading)
            Spacer(minLength: 0)
            Text(CoachLabels.mode(pack.defaultMode) + (pack.language == "en" ? " · EN" : ""))
                .font(.caption2.weight(.semibold)).foregroundStyle(brand)
                .padding(.horizontal, 8).padding(.vertical, 3)
                .background(Theme.accentSoft, in: Capsule())
        }
        .frame(maxWidth: .infinity, minHeight: 170, alignment: .topLeading)
        .card(padding: 14, radius: 22)
    }
}

private struct CustomCard: View {
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Image(systemName: "plus.circle.fill").font(.system(size: 30)).foregroundStyle(brand)
            Text("AI custom").font(.headline).foregroundStyle(Theme.ink)
            Text("Компанийнхаа мэдээллийг PDF, зураг, текстээр оруулаад өөрийн дасгалжуулагчаа үүсгэ")
                .font(.caption).foregroundStyle(Theme.muted).lineLimit(4).multilineTextAlignment(.leading)
            Spacer(minLength: 0)
        }
        .frame(maxWidth: .infinity, minHeight: 170, alignment: .topLeading)
        .padding(14)
        .background(Theme.tintLilac.opacity(0.9), in: RoundedRectangle(cornerRadius: 22, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 22, style: .continuous).strokeBorder(brand.opacity(0.5), style: StrokeStyle(lineWidth: 1.5, dash: [6, 4])))
    }
}

struct PackRow: View {
    let pack: CoachPack
    var body: some View {
        HStack(spacing: 12) {
            Text(pack.icon).font(.system(size: 28)).frame(width: 48, height: 48).background(Theme.accentSoft, in: Circle())
            VStack(alignment: .leading, spacing: 2) {
                Text(pack.title).font(.subheadline.weight(.semibold)).foregroundStyle(Theme.ink)
                Text([pack.orgName, pack.subtitle].compactMap { $0 }.joined(separator: " · "))
                    .font(.caption).foregroundStyle(Theme.muted).lineLimit(2)
            }
            Spacer()
            if pack.teamId != nil {
                Image(systemName: "person.3.fill").font(.caption).foregroundStyle(brand).accessibilityLabel("Багтай хуваалцсан")
            }
            Image(systemName: "chevron.right").foregroundStyle(Theme.subtle)
        }
        .card(padding: 12, radius: 20)
    }
}

// MARK: - Before starting: video or audio, difficulty

struct CoachSetupView: View {
    let pack: CoachPack
    let onStart: (_ mode: String, _ difficulty: String) -> Void
    @State private var mode = ""
    @State private var difficulty = "medium"
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    HStack(spacing: 14) {
                        Text(pack.icon).font(.system(size: 44))
                        VStack(alignment: .leading, spacing: 3) {
                            Text(pack.title).font(.title2.weight(.semibold)).foregroundStyle(Theme.ink)
                            Text(pack.subtitle).font(.subheadline).foregroundStyle(Theme.muted)
                        }
                    }
                    Text(pack.brief).font(.body).foregroundStyle(Theme.ink).card(padding: 14, radius: 20)
                    if pack.draft {
                        Label("Ноорог агуулга: мэргэжлийн байгууллагаар баталгаажуулна.", systemImage: "exclamationmark.triangle.fill")
                            .font(.caption).foregroundStyle(Theme.warn)
                    }
                    if pack.isCustom && pack.factCount > 0 {
                        Label("Компанийн материалаас \(pack.factCount) баримт уншсан: таны хариуг эдгээртэй тулгаж дүгнэнэ.", systemImage: "doc.text.magnifyingglass")
                            .font(.caption).foregroundStyle(Theme.muted)
                    }

                    VStack(alignment: .leading, spacing: 8) {
                        Text("Хэлбэр").font(.headline)
                        Picker("Хэлбэр", selection: $mode) {
                            ForEach(CoachLabels.modes, id: \.0) { Text($0.1).tag($0.0) }
                        }
                        .pickerStyle(.segmented)
                        Text(mode == "video" ? "Аватар нүүр тулж ярина." : "Утасны дуудлага шиг: зөвхөн дуу, арын чимээтэй.")
                            .font(.caption).foregroundStyle(Theme.muted)
                    }
                    VStack(alignment: .leading, spacing: 8) {
                        Text("Хүндийн зэрэг").font(.headline)
                        Picker("Хүндийн зэрэг", selection: $difficulty) {
                            ForEach(CoachLabels.difficulties, id: \.0) { Text($0.1).tag($0.0) }
                        }
                        .pickerStyle(.segmented)
                    }

                    Button {
                        onStart(mode, difficulty)
                    } label: {
                        Label("Эхлэх", systemImage: mode == "video" ? "video.fill" : "phone.fill")
                    }
                    .buttonStyle(.primary)

                    Text("Товч дарахгүйгээр зүгээр л ярина; AI-г тасалж ярьж болно. Дуусахад AI дүгнэлт өгнө.")
                        .font(.caption).foregroundStyle(Theme.subtle)
                }
                .padding(20)
            }
            .appScreen()
            .toolbar { ToolbarItem(placement: .topBarLeading) { Button("Болих") { dismiss() } } }
        }
        .tint(brand)
        .onAppear { if mode.isEmpty { mode = pack.defaultMode } }
    }
}

// MARK: - «AI custom»: the company's own material → a persona for its new staff

struct CoachCustomView: View {
    /// Share the new persona with this team (its owner only).
    let teamId: String?
    let onCreated: (CoachPack) -> Void
    @EnvironmentObject private var coach: CoachStore
    @EnvironmentObject private var team: TeamStore
    @Environment(\.dismiss) private var dismiss

    @State private var orgName = ""
    @State private var persona = "customer"
    @State private var mode = "video"
    @State private var materials: [Material] = []
    @State private var notes = ""
    @State private var shareTeam: String?
    @State private var photoItems: [PhotosPickerItem] = []
    @State private var showCamera = false
    @State private var showFiles = false
    @State private var working = false
    @State private var error: String?

    private let personas = [("customer", "🛎️ Үйлчлүүлэгч"), ("caller", "🎧 Утсаар залгагч"), ("buyer", "🛍️ Худалдан авагч"), ("patient", "🩺 Өвчтөн"), ("student", "🎒 Сурагч")]

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    Text("Компанийнхаа мэдээллийг (үнийн жагсаалт, журам, түгээмэл асуулт…) оруулахад AI тухайн компанийн үйлчлүүлэгчийн дүрд орж шинэ ажилтнаас асууж, дүгнэнэ.")
                        .font(.subheadline).foregroundStyle(Theme.muted)

                    VStack(alignment: .leading, spacing: 6) {
                        Text("Компанийн нэр").font(.headline)
                        TextField("Жишээ: Нарны эмнэлэг", text: $orgName)
                            .padding(12).background(Theme.field, in: RoundedRectangle(cornerRadius: 14))
                    }

                    VStack(alignment: .leading, spacing: 8) {
                        Text("AI хэн болох вэ?").font(.headline)
                        ScrollView(.horizontal, showsIndicators: false) {
                            HStack(spacing: 8) {
                                ForEach(personas, id: \.0) { p in
                                    Button { persona = p.0; if p.0 == "caller" { mode = "audio" } } label: {
                                        Text(p.1).font(.subheadline.weight(.medium))
                                            .padding(.horizontal, 12).padding(.vertical, 8)
                                            .background(persona == p.0 ? AnyShapeStyle(Theme.accentGradient) : AnyShapeStyle(Theme.field), in: Capsule())
                                            .foregroundStyle(persona == p.0 ? .white : Theme.ink)
                                    }
                                    .buttonStyle(.plain)
                                }
                            }
                        }
                        Picker("Хэлбэр", selection: $mode) {
                            ForEach(CoachLabels.modes, id: \.0) { Text($0.1).tag($0.0) }
                        }
                        .pickerStyle(.segmented)
                    }

                    VStack(alignment: .leading, spacing: 8) {
                        Text("Материал").font(.headline)
                        HStack(spacing: 10) {
                            sourceButton("Зураг авах", "camera.fill") { showCamera = true }
                            PhotosPicker(selection: $photoItems, maxSelectionCount: 10, matching: .images) {
                                sourceLabel("Зургийн сан", "photo.on.rectangle")
                            }
                            sourceButton("Файл (PDF)", "doc.fill") { showFiles = true }
                        }
                        ForEach(materials) { m in
                            HStack {
                                Image(systemName: m.mediaType == "application/pdf" ? "doc.richtext" : m.mediaType == "text/plain" ? "doc.text" : "photo")
                                    .foregroundStyle(brand)
                                Text(m.name).font(.caption).lineLimit(1)
                                Spacer()
                                Button { materials.removeAll { $0.id == m.id } } label: { Image(systemName: "xmark.circle.fill").foregroundStyle(Theme.subtle) }
                                    .buttonStyle(.plain)
                            }
                            .padding(10).background(Theme.field, in: RoundedRectangle(cornerRadius: 12))
                        }
                        TextField("эсвэл текстээр: үйлчилгээ, үнэ, ажлын цаг, журам…", text: $notes, axis: .vertical)
                            .lineLimit(4...10)
                            .padding(12).background(Theme.field, in: RoundedRectangle(cornerRadius: 14))
                    }

                    let owned = team.ownedTeams
                    if teamId == nil && !owned.isEmpty {
                        VStack(alignment: .leading, spacing: 6) {
                            Text("Багтай хуваалцах").font(.headline)
                            Picker("Баг", selection: $shareTeam) {
                                Text("Зөвхөн надад").tag(String?.none)
                                ForEach(owned) { Text($0.name).tag(Optional($0.id)) }
                            }
                            .pickerStyle(.menu)
                        }
                    }

                    if let error { Text(error).font(.footnote).foregroundStyle(Theme.alert) }

                    Button {
                        Task { await create() }
                    } label: {
                        if working {
                            HStack(spacing: 10) { ProgressView().tint(.white); Text("AI материалыг уншиж байна… (20–40 сек)") }
                        } else {
                            Label("Дасгалжуулагч үүсгэх", systemImage: "sparkles")
                        }
                    }
                    .buttonStyle(.primary)
                    .disabled(working || (materials.isEmpty && notes.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty))
                }
                .padding(20)
            }
            .scrollDismissesKeyboard(.interactively)
            .appScreen()
            .navigationTitle("AI custom")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .topBarLeading) { Button("Болих") { dismiss() } } }
        }
        .tint(brand)
        .onChange(of: photoItems) { _, items in
            guard !items.isEmpty else { return }
            Task {
                for item in items {
                    if let data = try? await item.loadTransferable(type: Data.self), let image = UIImage(data: data) { addImage(image) }
                }
                photoItems = []
            }
        }
        .fullScreenCover(isPresented: $showCamera) { CameraPicker { addImage($0) }.ignoresSafeArea() }
        .fileImporter(isPresented: $showFiles, allowedContentTypes: [.pdf, .image, .plainText], allowsMultipleSelection: true) { result in
            guard case .success(let urls) = result else { return }
            for url in urls { addFile(url) }
        }
    }

    private func sourceButton(_ title: String, _ icon: String, action: @escaping () -> Void) -> some View {
        Button(action: action) { sourceLabel(title, icon) }.buttonStyle(.plain)
    }

    private func sourceLabel(_ title: String, _ icon: String) -> some View {
        VStack(spacing: 6) {
            Image(systemName: icon).font(.title3).foregroundStyle(brand)
            Text(title).font(.caption2.weight(.medium)).foregroundStyle(Theme.ink)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 12)
        .background(Theme.field, in: RoundedRectangle(cornerRadius: 16))
    }

    private func addImage(_ image: UIImage) {
        guard let jpeg = image.materialJPEG() else { return }
        materials.append(Material(name: "Зураг \(materials.count + 1).jpg", mediaType: "image/jpeg", data: jpeg, thumbnail: image))
    }

    private func addFile(_ url: URL) {
        let scoped = url.startAccessingSecurityScopedResource()
        defer { if scoped { url.stopAccessingSecurityScopedResource() } }
        guard let data = try? Data(contentsOf: url) else { return }
        let type = UTType(filenameExtension: url.pathExtension)
        if type?.conforms(to: .pdf) == true {
            materials.append(Material(name: url.lastPathComponent, mediaType: "application/pdf", data: data, thumbnail: nil))
        } else if type?.conforms(to: .image) == true, let image = UIImage(data: data) {
            addImage(image)
        } else {
            materials.append(Material(name: url.lastPathComponent, mediaType: "text/plain", data: data, thumbnail: nil))
        }
    }

    private func create() async {
        working = true
        error = nil
        defer { working = false }
        do {
            let pack = try await coach.createPack(orgName: orgName.trimmingCharacters(in: .whitespaces), persona: persona, mode: mode,
                                                  materials: materials, notes: notes, teamId: teamId ?? shareTeam)
            onCreated(pack)
        } catch {
            self.error = error.localizedDescription
        }
    }
}

// MARK: - The practice page (web: /coach), full screen

struct CoachSessionView: View {
    let launch: CoachLaunch
    let onClose: () -> Void
    /// nil = checking; false = show the in-app sign-in first.
    @State private var signedIn: Bool?

    var body: some View {
        Group {
            switch signedIn {
            case .some(true):
                CoachWebView(url: launch.url, onClose: onClose, onNeedSignIn: { signedIn = false })
                    .ignoresSafeArea()
            case .some(false):
                SignInSheet(onDone: { Task { signedIn = await ServerAPI.isSignedIn() } }, onCancel: onClose)
            case .none:
                ProgressView().tint(.white).frame(maxWidth: .infinity, maxHeight: .infinity)
            }
        }
        .background(Color.black)
        .task { signedIn = await ServerAPI.isSignedIn() }
    }
}

/// Like ExamView: the page talks back through `window.webkit.messageHandlers.otoch`
/// (`{type:"close"}` or `{type:"coachDone", resultId, score, title}`).
struct CoachWebView: UIViewRepresentable {
    let url: URL
    let onClose: () -> Void
    var onNeedSignIn: () -> Void = {}

    func makeCoordinator() -> Coordinator { Coordinator(onClose: onClose, onNeedSignIn: onNeedSignIn) }

    func makeUIView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        config.allowsInlineMediaPlayback = true
        config.mediaTypesRequiringUserActionForPlayback = []
        config.userContentController.add(context.coordinator, name: "otoch")
        let webView = WKWebView(frame: .zero, configuration: config)
        webView.uiDelegate = context.coordinator
        webView.isOpaque = false
        webView.backgroundColor = .black
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        webView.load(URLRequest(url: url, timeoutInterval: 20))
        return webView
    }

    func updateUIView(_ webView: WKWebView, context: Context) {}

    static func dismantleUIView(_ webView: WKWebView, coordinator: Coordinator) {
        // Unload the page so the avatar session and the microphone close at once.
        webView.configuration.userContentController.removeScriptMessageHandler(forName: "otoch")
        webView.loadHTMLString("", baseURL: nil)
    }

    final class Coordinator: NSObject, WKScriptMessageHandler, WKUIDelegate {
        let onClose: () -> Void
        let onNeedSignIn: () -> Void
        init(onClose: @escaping () -> Void, onNeedSignIn: @escaping () -> Void) {
            self.onClose = onClose
            self.onNeedSignIn = onNeedSignIn
        }

        func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
            guard let body = message.body as? [String: Any], let type = body["type"] as? String else { return }
            if type == "close" || type == "coachDone" { onClose() }
            if type == "needSignIn" { onNeedSignIn() }
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

// MARK: - One result in full (own, or a team member's for the owner)

struct CoachResultDetailView: View {
    let id: String
    @State private var detail: CoachResultDetail?
    @State private var error: String?
    private struct DetailResponse: Decodable { let result: CoachResultDetail }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                if let d = detail {
                    HStack(spacing: 16) {
                        Text("\(d.score)")
                            .font(.system(size: 34, weight: .bold).monospacedDigit())
                            .frame(width: 84, height: 84)
                            .background(scoreColor(d.score).opacity(0.15), in: Circle())
                            .foregroundStyle(scoreColor(d.score))
                        VStack(alignment: .leading, spacing: 4) {
                            Text(d.packTitle).font(.headline)
                            Text("\(d.name) · \(CoachLabels.mode(d.mode)) · \(CoachLabels.difficulty(d.difficulty))")
                                .font(.caption).foregroundStyle(Theme.muted)
                            Text(ServerAPI.date(d.createdAt).formatted(date: .abbreviated, time: .shortened))
                                .font(.caption).foregroundStyle(Theme.subtle)
                        }
                    }
                    Text(d.debrief.summary).font(.body)
                    section("Шалгуурууд") {
                        ForEach(d.debrief.rubric, id: \.id) { r in
                            HStack(alignment: .top, spacing: 8) {
                                Text(r.result == "yes" ? "✅" : r.result == "partial" ? "🟡" : "❌")
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(r.label).font(.subheadline)
                                    Text(r.evidence).font(.caption).foregroundStyle(Theme.muted)
                                }
                            }
                        }
                    }
                    section("Сайн хийсэн") { ForEach(d.debrief.strengths, id: \.self) { Label($0, systemImage: "checkmark.circle").font(.subheadline) } }
                    section("Сайжруулах") { ForEach(d.debrief.improvements, id: \.self) { Label($0, systemImage: "arrow.up.circle").font(.subheadline) } }
                    if !d.debrief.betterLines.isEmpty {
                        section("Ингэж хэлбэл илүү") {
                            ForEach(d.debrief.betterLines, id: \.said) { b in
                                VStack(alignment: .leading, spacing: 3) {
                                    Text(b.said).strikethrough().font(.caption).foregroundStyle(Theme.muted)
                                    Text("→ \(b.better)").font(.subheadline)
                                }
                            }
                        }
                    }
                    if !d.debrief.factErrors.isEmpty {
                        section("Буруу мэдээлэл") { ForEach(d.debrief.factErrors, id: \.self) { Label($0, systemImage: "exclamationmark.triangle").font(.subheadline).foregroundStyle(Theme.alert) } }
                    }
                    DisclosureGroup("Ярианы тэмдэглэл") {
                        VStack(alignment: .leading, spacing: 8) {
                            ForEach(Array(d.transcript.enumerated()), id: \.offset) { _, line in
                                Text("\(line.role == "me" ? "Ажилтан" : "AI"): \(line.text)")
                                    .font(.caption)
                                    .frame(maxWidth: .infinity, alignment: line.role == "me" ? .trailing : .leading)
                            }
                        }
                        .padding(.top, 8)
                    }
                    .card(padding: 14, radius: 20)
                } else if let error {
                    Text(error).foregroundStyle(Theme.alert)
                } else {
                    ProgressView().frame(maxWidth: .infinity).padding(40)
                }
            }
            .padding(20)
        }
        .appScreen()
        .navigationTitle("Дүгнэлт")
        .navigationBarTitleDisplayMode(.inline)
        .task {
            do { detail = try await ServerAPI.get("api/coach/results/\(id)", as: DetailResponse.self).result } catch { self.error = error.localizedDescription }
        }
    }

    private func section<Content: View>(_ title: String, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(title).font(.headline)
            content()
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .card(padding: 14, radius: 20)
    }
}
