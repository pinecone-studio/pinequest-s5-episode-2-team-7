import PhotosUI
import SwiftUI
import UniformTypeIdentifiers

/// «Сорил»: material → AI-written exam (тест, өгүүлбэр, кейс бодлого) → answers →
/// AI examiner («AI шүүлэгч») feedback → study next or a new variant.
struct QuizView: View {
    @EnvironmentObject private var history: QuizHistory

    private enum Stage {
        case setup
        case oral(Quiz)
        case answering(Quiz, [String])
        case result(Quiz, [String], Grade)
    }

    @State private var stage: Stage = .setup
    @State private var materials: [Material] = []
    @State private var notes = ""
    @State private var count = 5
    @State private var types: Set<String> = Set(QuizQuestion.kinds)
    @AppStorage("examinerAvatar") private var useAvatar = true
    /// A topic typed on «Нүүр»: becomes the notes of a fresh setup.
    @AppStorage("quizPrefill") private var prefill = ""
    @State private var busy: String?
    @State private var error: String?

    var body: some View {
        NavigationStack {
            Group {
                switch stage {
                case .setup:
                    SetupView(materials: $materials, notes: $notes, count: $count, types: $types, useAvatar: $useAvatar, start: { generate() })
                case .oral(let quiz):
                    Color.black.ignoresSafeArea()
                        .fullScreenCover(isPresented: .constant(true)) {
                            ExamView(quiz: quiz,
                                     onAnswers: { answers in
                                         // Graded from the typed screen, so a failure keeps the answers editable.
                                         stage = .answering(quiz, answers)
                                         grade(quiz, answers)
                                     },
                                     onText: { stage = .answering(quiz, []) })
                                .ignoresSafeArea()
                        }
                case .answering(let quiz, let prefill):
                    AnsweringView(quiz: quiz, prefill: prefill, finish: { answers in grade(quiz, answers) }, cancel: { stage = .setup })
                case .result(let quiz, let answers, let grade):
                    ResultView(quiz: quiz, answers: answers, grade: grade,
                               retryWeak: { generate(focus: grade.weaknesses) },
                               variant: { generate(avoid: quiz.questions.map(\.prompt)) },
                               restart: { stage = .setup })
                }
            }
            .appScreen()
            .navigationTitle("Сорил")
            .overlay { if let busy { BusyOverlay(text: busy) } }
            .alert("Алдаа", isPresented: Binding(get: { error != nil }, set: { if !$0 { error = nil } })) {
                Button("За", role: .cancel) {}
            } message: {
                Text(error ?? "")
            }
        }
        .tint(brand)
        .onAppear(perform: takePrefill)
        .onChange(of: prefill) { _, _ in takePrefill() }
    }

    private func takePrefill() {
        let topic = prefill.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !topic.isEmpty else { return }
        prefill = ""
        notes = topic
        stage = .setup
    }

    private func generate(focus: [String] = [], avoid: [String] = []) {
        busy = !avoid.isEmpty ? "Ижил сэдвээр өөр хувилбар бэлдэж байна…" : focus.isEmpty ? "Материалыг уншиж, асуулт бэлдэж байна…" : "Сул талуудаар шинэ асуулт бэлдэж байна…"
        let kinds = QuizQuestion.kinds.filter { types.contains($0) }
        Task {
            defer { busy = nil }
            do {
                let quiz = try await QuizAPI.generate(materials: materials, notes: notes, count: count, focus: focus,
                                                      types: kinds.isEmpty ? ["open"] : kinds, avoid: avoid)
                stage = useAvatar ? .oral(quiz) : .answering(quiz, [])
            } catch {
                self.error = error.localizedDescription
            }
        }
    }

    private func grade(_ quiz: Quiz, _ answers: [String]) {
        busy = "AI шүүлэгч хариултыг тань шалгаж байна…"
        Task {
            defer { busy = nil }
            do {
                let grade = try await QuizAPI.grade(quiz: quiz, answers: answers)
                history.add(QuizAttempt(date: .now, quiz: quiz, answers: answers, grade: grade))
                stage = .result(quiz, answers, grade)
            } catch {
                self.error = error.localizedDescription
            }
        }
    }
}

// MARK: - Setup

private struct SetupView: View {
    @Binding var materials: [Material]
    @Binding var notes: String
    @Binding var count: Int
    @Binding var types: Set<String>
    @Binding var useAvatar: Bool
    let start: () -> Void

    @State private var photoItems: [PhotosPickerItem] = []
    @State private var showCamera = false
    @State private var showFiles = false

    private var canStart: Bool { !types.isEmpty && (!materials.isEmpty || !notes.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty) }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                VStack(alignment: .leading, spacing: 6) {
                    Text("AI шүүлэгчид шалгуул")
                        .font(.title2.bold())
                    Text("Лекц, номын хуудас, заавар, тэмдэглэлээ оруул. AI шүүлэгч тест, өгүүлбэр, кейс бодлого зохиож, хариултыг чинь дүгнээд юуг дутуу, буруу хэлснийг хэлж өгнө.")
                        .foregroundStyle(.secondary)
                }

                HStack(spacing: 12) {
                    SourceButton(title: "Зураг авах", icon: "camera.fill") { showCamera = true }
                    PhotosPicker(selection: $photoItems, maxSelectionCount: 10, matching: .images) {
                        SourceLabel(title: "Зургийн сан", icon: "photo.on.rectangle")
                    }
                    SourceButton(title: "Файл", icon: "doc.fill") { showFiles = true }
                }

                if !materials.isEmpty {
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: 10) {
                            ForEach(materials) { item in
                                MaterialChip(item: item) { materials.removeAll { $0.id == item.id } }
                            }
                        }
                    }
                }

                VStack(alignment: .leading, spacing: 8) {
                    Text("Сэдэв эсвэл тэмдэглэл").font(.headline)
                    TextField("Жишээ: Артерийн гипертензийн эмчилгээ", text: $notes, axis: .vertical)
                        .lineLimit(3...8)
                        .padding(12)
                        .background(Theme.surface, in: RoundedRectangle(cornerRadius: 12)).overlay(RoundedRectangle(cornerRadius: 12).stroke(Theme.line))
                }

                VStack(alignment: .leading, spacing: 8) {
                    Text("Асуултын төрөл").font(.headline)
                    HStack(spacing: 8) {
                        ForEach(QuizQuestion.kinds, id: \.self) { kind in
                            let on = types.contains(kind)
                            Button {
                                if on { types.remove(kind) } else { types.insert(kind) }
                            } label: {
                                Label(QuizQuestion.label(for: kind), systemImage: on ? "checkmark" : QuizQuestion.icon(for: kind))
                                    .font(.subheadline.weight(.semibold))
                                    .lineLimit(1)
                                    .padding(.horizontal, 12)
                                    .padding(.vertical, 9)
                                    .frame(maxWidth: .infinity)
                                    .foregroundStyle(on ? Theme.accentInk : Theme.ink)
                                    .background(on ? AnyShapeStyle(Theme.accent) : AnyShapeStyle(Theme.surface), in: Capsule())
                                    .overlay(Capsule().stroke(Theme.line))
                            }
                            .buttonStyle(.plain)
                        }
                    }
                    if types.isEmpty {
                        Text("Дор хаяж нэг төрөл сонгоно уу.").font(.caption).foregroundStyle(Theme.alert)
                    }
                }

                Stepper(value: $count, in: 3...10) {
                    Text("Асуултын тоо: **\(count)**")
                }

                Toggle(isOn: $useAvatar) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text("AI шүүлэгч дуугаар асууна")
                        Text("Видео шүүлэгч асуултаа хэлж, та дуугаар хариулна").font(.caption).foregroundStyle(.secondary)
                    }
                }

                Button(action: start) {
                    Label("Асуулт бэлдэх", systemImage: "sparkles")
                        .font(.headline)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 6)
                }
                .buttonStyle(.primary)
                .controlSize(.large)
                .disabled(!canStart)
            }
            .padding()
        }
        .scrollDismissesKeyboard(.interactively)
        .onChange(of: photoItems) { _, items in
            guard !items.isEmpty else { return }
            Task {
                for item in items {
                    if let data = try? await item.loadTransferable(type: Data.self), let image = UIImage(data: data) { addImage(image) }
                }
                photoItems = []
            }
        }
        .fullScreenCover(isPresented: $showCamera) {
            CameraPicker { image in addImage(image) }.ignoresSafeArea()
        }
        .fileImporter(isPresented: $showFiles, allowedContentTypes: [.pdf, .image, .plainText], allowsMultipleSelection: true) { result in
            guard case .success(let urls) = result else { return }
            for url in urls { addFile(url) }
        }
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
}

private struct SourceLabel: View {
    let title: String
    let icon: String
    var body: some View {
        VStack(spacing: 8) {
            Image(systemName: icon).font(.title2)
            Text(title).font(.caption.weight(.medium))
        }
        .frame(maxWidth: .infinity, minHeight: 78)
        .foregroundStyle(brand)
        .background(brand.opacity(0.1), in: RoundedRectangle(cornerRadius: 14))
    }
}

private struct SourceButton: View {
    let title: String
    let icon: String
    let action: () -> Void
    var body: some View {
        Button(action: action) { SourceLabel(title: title, icon: icon) }.buttonStyle(.plain)
    }
}

private struct MaterialChip: View {
    let item: Material
    let remove: () -> Void
    var body: some View {
        ZStack(alignment: .topTrailing) {
            Group {
                if let thumb = item.thumbnail {
                    Image(uiImage: thumb).resizable().scaledToFill()
                } else {
                    VStack(spacing: 4) {
                        Image(systemName: item.mediaType == "application/pdf" ? "doc.richtext" : "doc.text").font(.title2)
                        Text(item.name).font(.caption2).lineLimit(2).multilineTextAlignment(.center)
                    }
                    .padding(6)
                    .foregroundStyle(brand)
                }
            }
            .frame(width: 84, height: 84)
            .background(Theme.surface)
            .clipShape(RoundedRectangle(cornerRadius: 12))

            Button(action: remove) {
                Image(systemName: "xmark.circle.fill").font(.title3).symbolRenderingMode(.palette).foregroundStyle(.white, .black.opacity(0.6))
            }
            .offset(x: 6, y: -6)
        }
        .padding(.top, 6)
    }
}

// MARK: - Answering

private struct AnsweringView: View {
    let quiz: Quiz
    let finish: ([String]) -> Void
    let cancel: () -> Void

    @State private var index = 0
    @State private var answers: [String]
    @State private var shareURL: URL?
    @State private var pdfError: String?
    @FocusState private var typing: Bool

    init(quiz: Quiz, prefill: [String], finish: @escaping ([String]) -> Void, cancel: @escaping () -> Void) {
        self.quiz = quiz
        self.finish = finish
        self.cancel = cancel
        _answers = State(initialValue: quiz.questions.indices.map { $0 < prefill.count ? prefill[$0] : "" })
    }

    private var question: QuizQuestion { quiz.questions[index] }
    private var isLast: Bool { index == quiz.questions.count - 1 }

    /// A4 worksheet to print or fill in a PDF reader; the share sheet offers Print and Save to Files.
    private func exportPDF(answerKey: Bool) {
        do { shareURL = try QuizPDF.write(quiz, answerKey: answerKey) } catch { pdfError = error.localizedDescription }
    }

    var body: some View {
        VStack(spacing: 0) {
            VStack(alignment: .leading, spacing: 8) {
                Text(quiz.title).font(.subheadline).foregroundStyle(.secondary).lineLimit(1)
                ProgressView(value: Double(index + 1), total: Double(quiz.questions.count))
                Text("Асуулт \(index + 1) / \(quiz.questions.count)").font(.caption.weight(.semibold)).foregroundStyle(brand)
            }
            .padding()

            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    Label(QuizQuestion.label(for: question.kind), systemImage: QuizQuestion.icon(for: question.kind))
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(brand)
                        .padding(.horizontal, 10)
                        .padding(.vertical, 5)
                        .background(Theme.accentSoft, in: Capsule())

                    Text(question.prompt).font(question.kind == "case" ? Font.body : Font.title3.weight(.semibold))

                    if question.kind == "choice" {
                        ForEach(Array(question.options.enumerated()), id: \.offset) { _, option in
                            Button { answers[index] = option } label: {
                                HStack {
                                    Text(option).multilineTextAlignment(.leading)
                                    Spacer()
                                    Image(systemName: answers[index] == option ? "checkmark.circle.fill" : "circle")
                                }
                                .padding()
                                .background(answers[index] == option ? brand.opacity(0.15) : Theme.surface, in: RoundedRectangle(cornerRadius: 12))
                                .overlay(RoundedRectangle(cornerRadius: 12).stroke(answers[index] == option ? brand : .clear, lineWidth: 1.5))
                            }
                            .buttonStyle(.plain)
                        }
                    } else {
                        TextField("Хариултаа бич…", text: $answers[index], axis: .vertical)
                            .lineLimit(6...16)
                            .focused($typing)
                            .padding(12)
                            .background(Theme.surface, in: RoundedRectangle(cornerRadius: 12)).overlay(RoundedRectangle(cornerRadius: 12).stroke(Theme.line))
                    }
                }
                .padding()
            }
            .scrollDismissesKeyboard(.interactively)

            HStack(spacing: 12) {
                if index > 0 {
                    Button { index -= 1 } label: { Label("Өмнөх", systemImage: "chevron.left").frame(maxWidth: .infinity) }
                        .buttonStyle(.secondary)
                }
                Button {
                    typing = false
                    if isLast { finish(answers) } else { index += 1 }
                } label: {
                    Label(isLast ? "Дуусгаж шалгуулах" : "Дараах", systemImage: isLast ? "checkmark.seal" : "chevron.right")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.primary)
            }
            .controlSize(.large)
            .padding()
        }
        .toolbar {
            ToolbarItem(placement: .topBarLeading) { Button("Болих", role: .cancel, action: cancel) }
            ToolbarItem(placement: .topBarTrailing) {
                Menu {
                    Button { exportPDF(answerKey: false) } label: { Label("Хэвлэх / PDF татах", systemImage: "printer") }
                    Button { exportPDF(answerKey: true) } label: { Label("Хариутай PDF (багшид)", systemImage: "key") }
                } label: {
                    Image(systemName: "square.and.arrow.down")
                }
                .accessibilityLabel("PDF татах")
            }
        }
        .sheet(isPresented: Binding(get: { shareURL != nil }, set: { if !$0 { shareURL = nil } })) {
            if let shareURL { ShareSheet(items: [shareURL]).presentationDetents([.medium, .large]) }
        }
        .alert("PDF үүсгэж чадсангүй", isPresented: Binding(get: { pdfError != nil }, set: { if !$0 { pdfError = nil } })) {
            Button("За", role: .cancel) {}
        } message: { Text(pdfError ?? "") }
        .animation(.default, value: index)
    }
}

// MARK: - Result

struct ResultView: View {
    let quiz: Quiz
    let answers: [String]
    let grade: Grade
    var retryWeak: (() -> Void)?
    var variant: (() -> Void)?
    var restart: (() -> Void)?

    @State private var lessonTopic: StudyTopic?

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                HStack(spacing: 18) {
                    ScoreRing(score: grade.score)
                    VStack(alignment: .leading, spacing: 6) {
                        Text(quiz.title).font(.headline)
                        Text(grade.verdict).font(.subheadline).foregroundStyle(.secondary)
                    }
                }

                if !grade.strengths.isEmpty {
                    BulletCard(title: "Сайн байсан", icon: "hand.thumbsup.fill", color: Theme.ok, lines: grade.strengths)
                }
                if !grade.weaknesses.isEmpty {
                    BulletCard(title: "Сайжруулах", icon: "exclamationmark.triangle.fill", color: Theme.warn, lines: grade.weaknesses)
                }

                Text("Асуулт бүрээр").font(.title3.bold())
                ForEach(Array(quiz.questions.enumerated()), id: \.offset) { i, question in
                    if i < grade.items.count {
                        QuestionReview(number: i + 1, question: question, answer: i < answers.count ? answers[i] : "", item: grade.items[i])
                    }
                }

                if !grade.studyNext.isEmpty {
                    VStack(alignment: .leading, spacing: 10) {
                        Text("Цааш судлах уу?").font(.title3.bold())
                        Text("Алдаан дээр чинь үндэслэн AI богино хичээл бэлдэж өгнө.").font(.subheadline).foregroundStyle(.secondary)
                        ForEach(grade.studyNext) { topic in
                            Button { lessonTopic = topic } label: {
                                HStack(alignment: .top, spacing: 12) {
                                    Image(systemName: "book.fill").foregroundStyle(brand).padding(.top, 2)
                                    VStack(alignment: .leading, spacing: 4) {
                                        Text(topic.topic).font(.subheadline.weight(.semibold)).multilineTextAlignment(.leading)
                                        Text(topic.why).font(.caption).foregroundStyle(.secondary).multilineTextAlignment(.leading)
                                    }
                                    Spacer()
                                    Image(systemName: "chevron.right").foregroundStyle(.tertiary)
                                }
                                .padding()
                                .background(brand.opacity(0.08), in: RoundedRectangle(cornerRadius: 14))
                            }
                            .buttonStyle(.plain)
                        }
                    }
                }

                if retryWeak != nil || variant != nil || restart != nil {
                    VStack(spacing: 10) {
                        if let retryWeak, !grade.weaknesses.isEmpty {
                            Button(action: retryWeak) {
                                Label("Сул тал дээрээ дахин шалгуулах", systemImage: "arrow.clockwise").frame(maxWidth: .infinity)
                            }
                            .buttonStyle(.primary)
                        }
                        if let variant {
                            Button(action: variant) {
                                Label("Ижил сэдвээр өөр хувилбар", systemImage: "shuffle").frame(maxWidth: .infinity)
                            }
                            .buttonStyle(.secondary)
                        }
                        if let restart {
                            Button(action: restart) {
                                Label("Шинэ материал", systemImage: "plus").frame(maxWidth: .infinity)
                            }
                            .buttonStyle(.secondary)
                        }
                    }
                    .controlSize(.large)
                }
            }
            .padding()
        }
        .sheet(item: $lessonTopic) { topic in LessonView(topic: topic, quiz: quiz) }
    }
}

private struct ScoreRing: View {
    let score: Int
    private var color: Color { score >= 80 ? Theme.ok : score >= 50 ? Theme.warn : Theme.alert }
    var body: some View {
        ZStack {
            Circle().stroke(color.opacity(0.2), lineWidth: 10)
            Circle().trim(from: 0, to: CGFloat(score) / 100).stroke(color, style: StrokeStyle(lineWidth: 10, lineCap: .round)).rotationEffect(.degrees(-90))
            VStack(spacing: 0) {
                Text("\(score)").font(.title.bold())
                Text("/100").font(.caption2).foregroundStyle(.secondary)
            }
        }
        .frame(width: 92, height: 92)
    }
}

private struct BulletCard: View {
    let title: String
    let icon: String
    let color: Color
    let lines: [String]
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Label(title, systemImage: icon).font(.headline).foregroundStyle(color)
            ForEach(lines, id: \.self) { line in
                HStack(alignment: .top, spacing: 8) {
                    Text("•")
                    Text(line)
                }
                .font(.subheadline)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding()
        .background(color.opacity(0.08), in: RoundedRectangle(cornerRadius: 14))
    }
}

private struct QuestionReview: View {
    let number: Int
    let question: QuizQuestion
    let answer: String
    let item: GradeItem

    @State private var showModel = false

    private var badge: (String, Color, String) {
        switch item.status {
        case "correct": return ("Зөв", Theme.ok, "checkmark.circle.fill")
        case "partial": return ("Дутуу", Theme.warn, "circle.lefthalf.filled")
        case "blank": return ("Хариулаагүй", Theme.subtle, "minus.circle.fill")
        default: return ("Буруу", Theme.alert, "xmark.circle.fill")
        }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Label(badge.0, systemImage: badge.2).font(.caption.weight(.bold)).foregroundStyle(badge.1)
                Spacer()
                Text("\(Int(item.score.rounded()))/10").font(.caption.weight(.semibold)).foregroundStyle(.secondary)
            }
            Text("\(number). \(question.prompt)").font(.subheadline.weight(.semibold))
            if !answer.isEmpty {
                Text("Таны хариулт: \(answer)").font(.footnote).foregroundStyle(.secondary)
            }
            Text(item.feedback).font(.subheadline)

            if !item.mistakes.isEmpty {
                Section(title: "Буруу хэлсэн", color: Theme.alert, lines: item.mistakes)
            }
            if !item.missing.isEmpty {
                Section(title: "Дутуу хэлсэн", color: Theme.warn, lines: item.missing)
            }

            DisclosureGroup("Жишиг хариулт", isExpanded: $showModel) {
                Text(question.modelAnswer).font(.footnote).padding(.top, 4).frame(maxWidth: .infinity, alignment: .leading)
            }
            .font(.footnote.weight(.semibold))
        }
        .padding()
        .background(Theme.surface, in: RoundedRectangle(cornerRadius: 14)).overlay(RoundedRectangle(cornerRadius: 14).stroke(Theme.line))
    }

    private struct Section: View {
        let title: String
        let color: Color
        let lines: [String]
        var body: some View {
            VStack(alignment: .leading, spacing: 4) {
                Text(title).font(.caption.weight(.bold)).foregroundStyle(color)
                ForEach(lines, id: \.self) { line in
                    HStack(alignment: .top, spacing: 6) {
                        Text("•")
                        Text(line)
                    }
                    .font(.footnote)
                }
            }
        }
    }
}

// MARK: - Lesson

private struct LessonView: View {
    let topic: StudyTopic
    let quiz: Quiz

    @Environment(\.dismiss) private var dismiss
    @State private var lesson: Lesson?
    @State private var error: String?
    @State private var revealed: Set<Int> = []

    var body: some View {
        NavigationStack {
            Group {
                if let lesson {
                    ScrollView {
                        VStack(alignment: .leading, spacing: 18) {
                            Text(lesson.title).font(.title2.bold())
                            Text(lesson.lesson).font(.body)
                            if !lesson.keyFacts.isEmpty {
                                BulletCard(title: "Гол баримтууд", icon: "star.fill", color: brand, lines: lesson.keyFacts)
                            }
                            if !lesson.selfCheck.isEmpty {
                                Text("Өөрийгөө шалга").font(.headline)
                                ForEach(Array(lesson.selfCheck.enumerated()), id: \.offset) { i, check in
                                    VStack(alignment: .leading, spacing: 8) {
                                        Text(check.question).font(.subheadline.weight(.semibold))
                                        if revealed.contains(i) {
                                            Text(check.answer).font(.subheadline).foregroundStyle(.secondary)
                                        } else {
                                            Button("Хариуг харах") { revealed.insert(i) }.font(.subheadline)
                                        }
                                    }
                                    .frame(maxWidth: .infinity, alignment: .leading)
                                    .padding()
                                    .background(Theme.surface, in: RoundedRectangle(cornerRadius: 12)).overlay(RoundedRectangle(cornerRadius: 12).stroke(Theme.line))
                                }
                            }
                        }
                        .padding()
                    }
                } else if let error {
                    ContentUnavailableView {
                        Label("Хичээл бэлдэж чадсангүй", systemImage: "exclamationmark.triangle")
                    } description: {
                        Text(error)
                    } actions: {
                        Button("Дахин оролдох") { Task { await load() } }
                    }
                } else {
                    VStack(spacing: 14) {
                        ProgressView().controlSize(.large)
                        Text("«\(topic.topic)» сэдвээр хичээл бэлдэж байна…").multilineTextAlignment(.center).foregroundStyle(.secondary)
                    }
                    .padding()
                }
            }
            .appScreen()
            .toolbar { ToolbarItem(placement: .topBarTrailing) { Button("Хаах") { dismiss() } } }
            .navigationBarTitleDisplayMode(.inline)
        }
        .tint(brand)
        .task { await load() }
    }

    private func load() async {
        error = nil
        do {
            lesson = try await QuizAPI.explain(topic: topic, quiz: quiz)
        } catch {
            self.error = error.localizedDescription
        }
    }
}

// MARK: - Shared bits

private struct BusyOverlay: View {
    let text: String
    var body: some View {
        ZStack {
            Rectangle().fill(.ultraThinMaterial).ignoresSafeArea()
            VStack(spacing: 16) {
                ProgressView().controlSize(.large)
                Text(text).font(.headline).multilineTextAlignment(.center)
                Text("Энэ хэсэг 30–60 секунд үргэлжилж болно.").font(.caption).foregroundStyle(.secondary)
            }
            .padding(28)
        }
    }
}

struct CameraPicker: UIViewControllerRepresentable {
    let onImage: (UIImage) -> Void
    @Environment(\.dismiss) private var dismiss

    func makeUIViewController(context: Context) -> UIImagePickerController {
        let picker = UIImagePickerController()
        picker.sourceType = UIImagePickerController.isSourceTypeAvailable(.camera) ? .camera : .photoLibrary
        picker.delegate = context.coordinator
        return picker
    }

    func updateUIViewController(_ controller: UIImagePickerController, context: Context) {}

    func makeCoordinator() -> Coordinator { Coordinator(self) }

    final class Coordinator: NSObject, UIImagePickerControllerDelegate, UINavigationControllerDelegate {
        let parent: CameraPicker
        init(_ parent: CameraPicker) { self.parent = parent }

        func imagePickerController(_ picker: UIImagePickerController, didFinishPickingMediaWithInfo info: [UIImagePickerController.InfoKey: Any]) {
            if let image = info[.originalImage] as? UIImage { parent.onImage(image) }
            parent.dismiss()
        }

        func imagePickerControllerDidCancel(_ picker: UIImagePickerController) { parent.dismiss() }
    }
}
