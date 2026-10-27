import CoreImage.CIFilterBuiltins
import SwiftUI
import VisionKit

// MARK: - «Аватар студи»: the manager decides who the AI is and what it asks

/// A persona the manager builds by hand (pinequest-team7 src/lib/coach/studio.ts → StudioInputSchema).
struct AvatarStudioView: View {
    let team: TeamInfo
    /// Called with the saved persona: the caller offers to send it to the staff.
    var onSaved: (CoachPack) -> Void

    @EnvironmentObject private var coach: CoachStore
    @Environment(\.dismiss) private var dismiss

    @State private var title = ""
    @State private var role = "interviewer"
    @State private var mood = "calm"
    @State private var personaName = ""
    @State private var gender = "female"
    @State private var age = 35
    @State private var traineeRole = ""
    @State private var situation = ""
    @State private var questions: [String] = []
    @State private var newQuestion = ""
    @State private var knowledge = ""
    @State private var rubric: [Criterion] = Criterion.defaults(for: "interviewer")
    @State private var newCriterion = ""
    @State private var opening = ""
    @State private var mode = "video"
    @State private var minutes = 5
    @State private var working = false
    @State private var error: String?
    @FocusState private var questionFocused: Bool

    struct Criterion: Identifiable, Hashable {
        let id = UUID()
        var label: String
        var weight: Int

        static func defaults(for role: String) -> [Criterion] {
            if role == "interviewer" || role == "colleague" {
                return [.init(label: "Асуулт бүрт тодорхой, бүрэн хариулсан", weight: 3),
                        .init(label: "Жишээ, туршлагаар баталсан", weight: 2),
                        .init(label: "Байгууллагын мэдээлэл, журмыг зөв хэлсэн", weight: 2),
                        .init(label: "Итгэлтэй, эелдэг харилцсан", weight: 1)]
            }
            return [.init(label: "Мэндэлж, эелдэг угтсан", weight: 1),
                    .init(label: "Хэрэгцээг асууж тодруулсан", weight: 2),
                    .init(label: "Мэдээллийг үнэн зөв өгсөн", weight: 3),
                    .init(label: "Шийдэл, дараагийн алхмыг тодорхой хэлсэн", weight: 2),
                    .init(label: "Тайван, хүндэтгэлтэй харилцсан", weight: 1)]
        }
    }

    static let roles: [(String, String, String)] = [
        ("interviewer", "🧑‍💼", "Ярилцлагын комисс"),
        ("customer", "🛎️", "Үйлчлүүлэгч"),
        ("caller", "🎧", "Утсаар залгагч"),
        ("buyer", "🛍️", "Худалдан авагч"),
        ("patient", "🩺", "Өвчтөн"),
        ("student", "🎒", "Суралцагч"),
        ("colleague", "🤝", "Хамт ажиллагч"),
    ]

    static let moods: [(String, String)] = [
        ("friendly", "😊 Найрсаг"), ("calm", "🙂 Тайван"), ("strict", "🧐 Хатуу"),
        ("rushed", "⏱️ Яарсан"), ("worried", "😟 Санаа зовсон"), ("angry", "😠 Уурласан"),
    ]

    /// One-tap starters, so a manager is never facing an empty list.
    private var templates: [(String, [String])] {
        [
            ("Ажлын ярилцлага", ["Өөрийгөө товч танилцуулна уу.", "Яагаад манай байгууллагад ажиллахыг хүсэж байна вэ?",
                                 "Хэцүү үйлчлүүлэгчтэй тулгарч байсан нэг жишээ ярина уу.", "Таны хамгийн том давуу тал юу вэ?"]),
            ("Анхны ажлын өдөр", ["Манай байгууллагын үнэт зүйлсээс нэрлэнэ үү.", "Үйлчлүүлэгч гомдол гаргавал эхний алхам юу вэ?",
                                  "Ажлын цаг, хувцаслалтын журмыг хэлнэ үү."]),
            ("Шинэ соёл / журам", ["Шинэ журмын гол өөрчлөлт юу вэ?", "Энэ өөрчлөлт таны өдөр тутмын ажилд хэрхэн нөлөөлөх вэ?",
                                   "Хамт ажиллагч журмыг зөрчвөл та юу хийх вэ?"]),
            ("Борлуулалт", ["Энэ бүтээгдэхүүний үнэ хэд вэ?", "Яагаад өрсөлдөгчөөс үнэтэй байгаа юм бэ?", "Хөнгөлөлт, урамшуулал байгаа юу?"]),
        ]
    }

    private var ready: Bool {
        title.trimmed.count >= 2 && !personaName.trimmed.isEmpty && !rubric.isEmpty
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("Нэр (жишээ: Шинэ борлуулагчийн ярилцлага)", text: $title)
                    Picker("Аватар хэн бэ", selection: $role) {
                        ForEach(Self.roles, id: \.0) { Text("\($0.1) \($0.2)").tag($0.0) }
                    }
                    TextField("Аватарын нэр (жишээ: Сарнай)", text: $personaName)
                    Picker("Хүйс", selection: $gender) {
                        Text("Эмэгтэй").tag("female")
                        Text("Эрэгтэй").tag("male")
                    }
                    .pickerStyle(.segmented)
                    Stepper("Нас: \(age)", value: $age, in: 18...80)
                } header: {
                    Text("1. Аватар")
                }

                Section {
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: 8) {
                            ForEach(Self.moods, id: \.0) { m in
                                Button { mood = m.0 } label: {
                                    Text(m.1).font(.subheadline.weight(.semibold))
                                        .padding(.horizontal, 12).padding(.vertical, 8)
                                        .background(mood == m.0 ? AnyShapeStyle(Theme.accentGradient) : AnyShapeStyle(Theme.field), in: Capsule())
                                        .foregroundStyle(mood == m.0 ? .white : Theme.ink)
                                }
                                .buttonStyle(.plain)
                            }
                        }
                        .padding(.vertical, 4)
                    }
                    TextField("Хэнийг шалгах вэ (жишээ: шинэ ресепшний ажилтан)", text: $traineeRole)
                    TextField("Нөхцөл байдал (заавал биш)", text: $situation, axis: .vertical).lineLimit(2...5)
                } header: {
                    Text("2. Зан төлөв ба нөхцөл")
                }

                Section {
                    ForEach(Array(questions.enumerated()), id: \.offset) { i, q in
                        HStack(alignment: .top, spacing: 10) {
                            Text("\(i + 1).").font(.subheadline.monospacedDigit()).foregroundStyle(brand)
                            Text(q).font(.subheadline)
                        }
                    }
                    .onDelete { questions.remove(atOffsets: $0) }
                    .onMove { questions.move(fromOffsets: $0, toOffset: $1) }

                    HStack {
                        TextField("Асуулт нэмэх…", text: $newQuestion, axis: .vertical)
                            .focused($questionFocused)
                            .onSubmit(addQuestion)
                        Button(action: addQuestion) { Image(systemName: "plus.circle.fill").font(.title2) }
                            .disabled(newQuestion.trimmed.count < 2 || questions.count >= 15)
                    }
                    Menu {
                        ForEach(templates, id: \.0) { t in
                            Button(t.0) { questions.append(contentsOf: t.1.filter { !questions.contains($0) }) ; questions = Array(questions.prefix(15)) }
                        }
                    } label: {
                        Label("Бэлэн асуулт нэмэх", systemImage: "text.badge.plus")
                    }
                } header: {
                    HStack {
                        Text("3. Аватар юу асуух вэ")
                        Spacer()
                        if !questions.isEmpty { EditButton().font(.caption) }
                    }
                } footer: {
                    Text(questions.isEmpty
                         ? "Хоосон үлдээвэл аватар нөхцөлийнхөө дагуу өөрөө ярина."
                         : "Аватар эдгээрийг дарааллаар, нэг нэгээр асууна. Ажилтан урьдчилж харахгүй.")
                }

                Section {
                    TextField("Нэг мөрөнд нэг баримт: үнэ, журам, үнэт зүйл…", text: $knowledge, axis: .vertical)
                        .lineLimit(3...10)
                } header: {
                    Text("4. Ажилтны мэдэх ёстой зүйл")
                } footer: {
                    Text("AI ажилтны хэлснийг үүнтэй тулгаж шалгана.")
                }

                Section {
                    ForEach($rubric) { $c in
                        VStack(alignment: .leading, spacing: 6) {
                            TextField("Шалгуур", text: $c.label, axis: .vertical).font(.subheadline)
                            HStack(spacing: 6) {
                                Text("Ач холбогдол").font(.caption).foregroundStyle(Theme.muted)
                                Spacer()
                                ForEach(1...5, id: \.self) { w in
                                    Image(systemName: w <= c.weight ? "star.fill" : "star")
                                        .foregroundStyle(w <= c.weight ? Theme.gold : Theme.subtle)
                                        .onTapGesture { c.weight = w }
                                }
                            }
                        }
                    }
                    .onDelete { rubric.remove(atOffsets: $0) }
                    HStack {
                        TextField("Шалгуур нэмэх…", text: $newCriterion)
                        Button {
                            rubric.append(.init(label: newCriterion.trimmed, weight: 2))
                            newCriterion = ""
                        } label: { Image(systemName: "plus.circle.fill").font(.title2) }
                            .disabled(newCriterion.trimmed.count < 2 || rubric.count >= 10)
                    }
                } header: {
                    Text("5. Үнэлэх шалгуур")
                } footer: {
                    Text("Оноог одны жингээр тооцно: биелсэн = бүтэн, хагас = ½.")
                }

                Section {
                    Picker("Хэлбэр", selection: $mode) { ForEach(CoachLabels.modes, id: \.0) { Text($0.1).tag($0.0) } }
                    Stepper("Хугацаа: \(minutes) минут", value: $minutes, in: 1...30)
                    TextField("Эхний үг (заавал биш)", text: $opening, axis: .vertical).lineLimit(1...3)
                } header: {
                    Text("6. Тохиргоо")
                }

                if let error {
                    Section { Text(error).foregroundStyle(Theme.alert) }
                }
            }
            .scrollContentBackground(.hidden)
            .background(Theme.canvas)
            .navigationTitle("Аватар студи")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) { Button("Болих") { dismiss() } }
                ToolbarItem(placement: .topBarTrailing) {
                    if working { ProgressView() } else {
                        Button("Хадгалах") { Task { await save() } }.fontWeight(.semibold).disabled(!ready)
                    }
                }
            }
            .onChange(of: role) { old, new in
                // Swap the default criteria only while the manager has not edited them.
                if rubric.map(\.label) == Criterion.defaults(for: old).map(\.label) { rubric = Criterion.defaults(for: new) }
                if new == "caller" { mode = "audio" }
            }
        }
        .tint(brand)
        .preferredColorScheme(.dark)
    }

    private func addQuestion() {
        let q = newQuestion.trimmed
        guard q.count >= 2, questions.count < 15 else { return }
        questions.append(q)
        newQuestion = ""
        questionFocused = true
    }

    private func save() async {
        working = true
        error = nil
        defer { working = false }
        var body: [String: Any] = [
            "teamId": team.id, "title": title.trimmed, "role": role, "mood": mood,
            "personaName": personaName.trimmed, "age": age, "gender": gender,
            "traineeRole": traineeRole.trimmed.isEmpty ? "шинэ ажилтан" : traineeRole.trimmed,
            "situation": situation.trimmed, "questions": questions, "knowledge": knowledge,
            "rubric": rubric.filter { $0.label.trimmed.count >= 2 }.map { ["label": $0.label.trimmed, "weight": $0.weight] },
            "mode": mode, "timeLimitMin": minutes,
        ]
        if !opening.trimmed.isEmpty { body["opening"] = opening.trimmed }
        do {
            let pack = try await coach.createStudioPack(body)
            dismiss()
            onSaved(pack)
        } catch {
            self.error = error.localizedDescription
        }
    }
}

private extension String {
    var trimmed: String { trimmingCharacters(in: .whitespacesAndNewlines) }
}

// MARK: - Challenge progress (owner): who has done it, scores, recordings of the talk

struct ChallengeProgressView: View {
    let team: TeamInfo
    let challenge: TeamInfo.Challenge
    @EnvironmentObject private var coach: CoachStore
    @Environment(\.dismiss) private var dismiss
    @State private var preview: CoachLaunch?

    private var progress: [TeamInfo.Progress] { (challenge.progress ?? []).sorted { ($0.best ?? -1) > ($1.best ?? -1) } }
    private var done: Int { progress.filter { $0.attempts > 0 }.count }

    var body: some View {
        NavigationStack {
            List {
                Section {
                    HStack(spacing: 16) {
                        stat("\(done)/\(progress.count)", "оролдсон")
                        stat("\(challenge.passedCount)", "тэнцсэн", Theme.ok)
                        stat(average.map(String.init) ?? "–", "дундаж", average.map(scoreColor) ?? Theme.subtle)
                    }
                    .frame(maxWidth: .infinity)
                    Text(details).font(.caption).foregroundStyle(Theme.muted)
                    Button { preview = CoachLaunch(packRef: challenge.packRef, mode: challenge.mode, difficulty: challenge.difficulty) } label: {
                        Label("Аватарыг өөрөө туршиж үзэх", systemImage: "play.circle")
                    }
                }
                Section("Ажилтнууд") {
                    if progress.isEmpty { Text("Ажилтан алга.").foregroundStyle(Theme.muted) }
                    ForEach(progress) { p in
                        let row = HStack(spacing: 12) {
                            Image(systemName: p.passed ? "checkmark.seal.fill" : p.attempts > 0 ? "xmark.seal" : "clock")
                                .foregroundStyle(p.passed ? Theme.ok : p.attempts > 0 ? Theme.alert : Theme.subtle)
                            VStack(alignment: .leading, spacing: 2) {
                                Text(p.name).font(.subheadline.weight(.semibold))
                                Text(p.attempts == 0 ? "Хийгээгүй" : "\(p.attempts) оролдлого").font(.caption).foregroundStyle(Theme.muted)
                            }
                            Spacer()
                            if let best = p.best { Text("\(best)").font(.headline.monospacedDigit()).foregroundStyle(scoreColor(best)) }
                        }
                        if let id = p.lastResultId {
                            NavigationLink(value: id) { row }
                        } else {
                            row
                        }
                    }
                }
            }
            .scrollContentBackground(.hidden)
            .background(Theme.canvas)
            .navigationTitle(challenge.title)
            .navigationBarTitleDisplayMode(.inline)
            .navigationDestination(for: String.self) { CoachResultDetailView(id: $0) }
            .toolbar { ToolbarItem(placement: .topBarTrailing) { Button("Хаах") { dismiss() } } }
        }
        .tint(brand)
        .preferredColorScheme(.dark)
        .fullScreenCover(item: $preview) { item in CoachSessionView(launch: item) { preview = nil } }
    }

    private var average: Int? {
        let scores = progress.compactMap(\.best)
        return scores.isEmpty ? nil : scores.reduce(0, +) / scores.count
    }

    private var details: String {
        var parts = ["Зорилт \(challenge.targetScore)", CoachLabels.mode(challenge.mode)]
        if let t = challenge.timeLimitSec { parts.append("⏱ \(t / 60) мин") }
        if let m = challenge.maxAttempts { parts.append("\(m) оролдлого") }
        if let due = challenge.due { parts.append("\(due.formatted(.dateTime.month(.abbreviated).day())) хүртэл") }
        return parts.joined(separator: " · ")
    }

    private func stat(_ value: String, _ label: String, _ color: Color = brand) -> some View {
        VStack(spacing: 2) {
            Text(value).font(.title2.weight(.semibold).monospacedDigit()).foregroundStyle(color)
            Text(label).font(.caption).foregroundStyle(Theme.muted)
        }
        .frame(maxWidth: .infinity)
    }
}

// MARK: - Join by QR

enum TeamQR {
    static let prefix = "OTECH-TEAM:"

    static func image(for code: String) -> UIImage? {
        let filter = CIFilter.qrCodeGenerator()
        filter.message = Data((prefix + code).utf8)
        filter.correctionLevel = "M"
        guard let output = filter.outputImage?.transformed(by: CGAffineTransform(scaleX: 12, y: 12)),
              let cg = CIContext().createCGImage(output, from: output.extent) else { return nil }
        return UIImage(cgImage: cg)
    }

    /// "OTECH-TEAM:K7M2QX" (or a bare code) → "K7M2QX".
    static func code(from text: String) -> String? {
        let raw = text.trimmingCharacters(in: .whitespacesAndNewlines).uppercased()
        let code = raw.hasPrefix(prefix) ? String(raw.dropFirst(prefix.count)) : raw
        return (4...12).contains(code.count) && code.allSatisfy { $0.isLetter || $0.isNumber } ? code : nil
    }
}

/// Owner: the team's QR code, big enough to scan off a meeting-room screen.
struct TeamQRSheet: View {
    let team: TeamInfo
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        VStack(spacing: 20) {
            Capsule().fill(Theme.line).frame(width: 40, height: 5).padding(.top, 10)
            Text(team.name).font(.title2.weight(.semibold)).foregroundStyle(Theme.ink)
            Text("Ажилтан апп → Баг → «QR уншуулах»").font(.subheadline).foregroundStyle(Theme.muted)
            if let code = team.code, let image = TeamQR.image(for: code) {
                Image(uiImage: image).interpolation(.none).resizable().scaledToFit()
                    .frame(width: 240, height: 240).padding(16)
                    .background(.white, in: RoundedRectangle(cornerRadius: 24))
                Text(code).font(.system(size: 34, weight: .bold, design: .monospaced)).foregroundStyle(brand)
                ShareLink(item: "OTech AI-д манай «\(team.name)» багт нэгдээрэй. Апп → Баг → Нэгдэх, код: \(code)") {
                    Label("Код хуваалцах", systemImage: "square.and.arrow.up")
                }
                .buttonStyle(.secondary)
                .padding(.horizontal, 40)
            }
            Spacer()
        }
        .frame(maxWidth: .infinity)
        .background(Theme.canvas)
        .presentationDetents([.large])
        .preferredColorScheme(.dark)
    }
}

/// Member: scan the manager's QR with the camera.
struct TeamQRScanner: UIViewControllerRepresentable {
    let onCode: (String) -> Void

    static var isAvailable: Bool { DataScannerViewController.isSupported && DataScannerViewController.isAvailable }

    func makeUIViewController(context: Context) -> DataScannerViewController {
        let scanner = DataScannerViewController(recognizedDataTypes: [.barcode(symbologies: [.qr])], qualityLevel: .balanced,
                                                isHighlightingEnabled: true)
        scanner.delegate = context.coordinator
        try? scanner.startScanning()
        return scanner
    }

    func updateUIViewController(_ controller: DataScannerViewController, context: Context) {}

    func makeCoordinator() -> Coordinator { Coordinator(onCode: onCode) }

    final class Coordinator: NSObject, DataScannerViewControllerDelegate {
        let onCode: (String) -> Void
        private var done = false
        init(onCode: @escaping (String) -> Void) { self.onCode = onCode }

        func dataScanner(_ scanner: DataScannerViewController, didAdd items: [RecognizedItem], allItems: [RecognizedItem]) {
            guard !done else { return }
            for case let .barcode(code) in items {
                if let text = code.payloadStringValue, let team = TeamQR.code(from: text) {
                    done = true
                    scanner.stopScanning()
                    onCode(team)
                    return
                }
            }
        }
    }
}
