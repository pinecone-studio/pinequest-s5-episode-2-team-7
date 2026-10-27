import SwiftUI

/// «Мэдлэг»: short, offline reference articles (body systems, emergency
/// algorithms, normal values) linked to the 3D atlas, the cases and «Сорил».
/// Standard textbook content; to be reviewed by a clinician-teacher.
struct KnowledgeArticle: Identifiable, Hashable {
    enum Kind: String { case anatomy, emergency, reference }

    let id: String
    let kind: Kind
    let title: String
    let icon: String
    let tint: Color
    let summary: String
    let sections: [KnowledgeSection]
    let keyFacts: [String]
    /// Roles this is most useful for first.
    let roles: [UserRole]
    let quizTopic: String
    /// Body systems link to the 3D atlas.
    var hasAtlas: Bool { kind == .anatomy }

    static func find(_ id: String) -> KnowledgeArticle? { all.first { $0.id == id } }

    static func search(_ text: String) -> [KnowledgeArticle] {
        let q = text.trimmingCharacters(in: .whitespaces).lowercased()
        guard !q.isEmpty else { return all }
        return all.filter { a in
            a.title.lowercased().contains(q) || a.summary.lowercased().contains(q)
                || a.keyFacts.contains { $0.lowercased().contains(q) }
                || a.sections.contains { s in s.heading.lowercased().contains(q) || s.points.contains { $0.lowercased().contains(q) } }
        }
    }

    /// One key fact a day for the home screen.
    static func factOfTheDay(date: Date = .now) -> (fact: String, article: KnowledgeArticle) {
        let pairs = all.flatMap { a in a.keyFacts.map { ($0, a) } }
        let day = Calendar.current.ordinality(of: .day, in: .era, for: date) ?? 0
        let pick = pairs[day % pairs.count]
        return (pick.0, pick.1)
    }
}

struct KnowledgeSection: Hashable {
    let heading: String
    let points: [String]
}

extension KnowledgeArticle {
    static let all: [KnowledgeArticle] = anatomy + emergency + reference

    // MARK: Body systems

    static let anatomy: [KnowledgeArticle] = [
        KnowledgeArticle(id: "cardio", kind: .anatomy, title: "Зүрх судасны систем", icon: "heart.fill", tint: Theme.tintPink,
                         summary: "Зүрх 4 хөндийтэй шахуурга: баруун тал уушги руу, зүүн тал бүх бие рүү цус шахна.",
                         sections: [
                            KnowledgeSection(heading: "Бүтэц", points: ["Тосгуур 2, ховдол 2", "Хавхлага: гурван хавтаст, уушгины, хоёр хавтаст (митрал), гол судасны", "Титэм судас: зүүн (урд уруудах, тойрох салаа), баруун"]),
                            KnowledgeSection(heading: "Дамжуулах систем", points: ["Синусын зангилаа → тосгуур ховдлын зангилаа → Гисийн багц → Пуркинье ширхэг", "Хэвийн хэмнэл: синусын, минутад 60–100"]),
                            KnowledgeSection(heading: "Эмнэлзүйн холбоо", points: ["Доод ханын шигдээс (II, III, aVF) ихэвчлэн баруун титэм судаснаас", "Урд ханын шигдээс (V1–V4) зүүн урд уруудах салаанаас"]),
                         ],
                         keyFacts: ["Доод ханын шигдээс (II, III, aVF) ихэвчлэн баруун титэм судасны бөглөрлөөс үүсдэг.", "Зүрхний хэвийн хэмнэлийг синусын зангилаа үүсгэдэг."],
                         roles: [.doctor, .student, .nurse, .ems], quizTopic: "Зүрх судасны системийн анатоми, титэм судас, дамжуулах систем"),
        KnowledgeArticle(id: "respiratory", kind: .anatomy, title: "Амьсгалын систем", icon: "lungs.fill", tint: Theme.tintBlue,
                         summary: "Агаар дээд ба доод амьсгалын замаар уушгины цулцанд хүрч хийн солилцоо явагдана.",
                         sections: [
                            KnowledgeSection(heading: "Бүтэц", points: ["Баруун уушги 3 дэлбэн, зүүн уушги 2 дэлбэн", "Гуурсан хоолой өвчүүний өнцгийн түвшинд (Th4–5) салаална", "Гол амьсгалын булчин: өрц (C3–C5, phrenic мэдрэл)"]),
                            KnowledgeSection(heading: "Хэвийн үзүүлэлт", points: ["Амьсгалын тоо 12–20/мин", "SpO₂ 94–98%"]),
                            KnowledgeSection(heading: "Эмнэлзүйн холбоо", points: ["Даралт ихэссэн пневмоторакс: нэг талд амьсгал сонсогдохгүй, гуурсан хоолой эсрэг тийш хэлбийх, хүзүүний вен хавдах, даралт буурах", "Баруун гол гуурс илүү босоо тул залгисан биет ихэвчлэн баруун тийш ордог"]),
                         ],
                         keyFacts: ["Баруун уушги 3, зүүн уушги 2 дэлбэнтэй.", "Залгисан биет ихэвчлэн баруун гол гуурс руу ордог: тэр нь илүү өргөн, босоо."],
                         roles: [.ems, .doctor, .student, .nurse], quizTopic: "Амьсгалын системийн анатоми, пневмоторакс"),
        KnowledgeArticle(id: "nervous", kind: .anatomy, title: "Мэдрэлийн систем", icon: "brain.head.profile", tint: Theme.tintLilac,
                         summary: "Төв (тархи, нугас) ба захын мэдрэлийн систем биеийн бүх үйлийг зохицуулна.",
                         sections: [
                            KnowledgeSection(heading: "Бүтэц", points: ["Тархины дэлбэн: дух (хөдөлгөөн, зан төлөв), орой (мэдрэхүй), чамархай (сонсгол, ой), дагз (хараа)", "Гавлын мэдрэл 12 хос", "Нугас насанд хүрэгчдэд L1–L2 түвшинд төгсдөг"]),
                            KnowledgeSection(heading: "Үнэлгээ", points: ["Глазгогийн оноо 3–15: нүд 4, хэл яриа 5, хөдөлгөөн 6", "Глазго ≤8 бол амьсгалын замыг хамгаалах шаардлагатай байж болно", "Хүүхэн харааны хэмжээ, тэгш байдал, гэрлийн урвал"]),
                         ],
                         keyFacts: ["Глазгогийн оноо ≤8 бол амьсгалын замыг хамгаалах талаар бод.", "Нугас насанд хүрэгчдэд L1–L2 түвшинд төгсдөг тул нугасны хатгалтыг доор нь хийдэг."],
                         roles: [.doctor, .student, .ems, .nurse], quizTopic: "Мэдрэлийн системийн анатоми, Глазгогийн оноо"),
        KnowledgeArticle(id: "digestive", kind: .anatomy, title: "Хоол боловсруулах систем", icon: "fork.knife", tint: Theme.tintPeach,
                         summary: "Амнаас шулуун гэдэс хүртэлх зам ба элэг, цөс, нойр булчирхай.",
                         sections: [
                            KnowledgeSection(heading: "Байрлал", points: ["Элэг, цөсний хүүдий: хэвлийн баруун дээд хэсэг", "Дэлүү: зүүн дээд хэсэг, 9–11-р хавирганы ард", "Мухар олгой: баруун доод хэсэг (Мак-Бурнейн цэг)"]),
                            KnowledgeSection(heading: "Эмнэлзүйн холбоо", points: ["Зүүн доод хавирганы хугарал + хэвлийн зүүн дээд өвдөлт = дэлүүний гэмтэл сэжиглэ", "Дотор цус алдалтыг орон дээр FAST хэт авиагаар шалгана"]),
                         ],
                         keyFacts: ["Дэлүү 9–11-р хавирганы ард байрладаг тул эдгээр хавирганы гэмтэлд дэлүүг сэжиглэ."],
                         roles: [.student, .doctor, .ems, .nurse], quizTopic: "Хоол боловсруулах системийн анатоми, хэвлийн гэмтэл"),
        KnowledgeArticle(id: "musculoskeletal", kind: .anatomy, title: "Яс, булчингийн систем", icon: "figure.walk", tint: Theme.tintBlue,
                         summary: "Насанд хүрэгчдэд 206 яс, 600 гаруй булчин хөдөлгөөн ба хамгаалалтыг хангана.",
                         sections: [
                            KnowledgeSection(heading: "Нуруу", points: ["Хүзүү 7, цээж 12, бүсэлхий 5, ууц 5 (нийлсэн), сүүж 4", "Хүзүүний гэмтэл сэжигтэй бол хүзүүвчээр тогтворжуул"]),
                            KnowledgeSection(heading: "Эмнэлзүйн холбоо", points: ["Гуяны яс хугарахад 1–1.5 литр цус алдагдаж болно", "Аарцгийн хугарал их хэмжээний цус алдалт өгнө: бүслүүрээр тогтворжуулна"]),
                         ],
                         keyFacts: ["Гуяны ясны хугарал 1–1.5 литр цус алдалт өгч болно."],
                         roles: [.ems, .student, .doctor, .nurse], quizTopic: "Яс булчингийн анатоми, хугарал ба цус алдалт"),
        KnowledgeArticle(id: "renal", kind: .anatomy, title: "Шээс ялгаруулах систем", icon: "drop.fill", tint: Theme.tintLilac,
                         summary: "Бөөр цусыг шүүж, ус, давс, хүчил шүлтийн тэнцвэрийг барина.",
                         sections: [
                            KnowledgeSection(heading: "Бүтэц", points: ["Бөөр хэвлийн арын хөндийд, Th12–L3 түвшинд", "Нэг бөөрөнд ~1 сая нефрон"]),
                            KnowledgeSection(heading: "Хяналт", points: ["Насанд хүрэгчдийн шээсний хэвийн гарц ≥0.5 мл/кг/цаг", "Шээс багасах нь шокийн эрт шинж"]),
                         ],
                         keyFacts: ["Шээсний гарц 0.5 мл/кг/цагаас бага бол эрхтний цусан хангамж муудсаныг сэжиглэ."],
                         roles: [.nurse, .doctor, .student, .ems], quizTopic: "Шээс ялгаруулах системийн анатоми, шээсний гарц"),
    ]

    // MARK: Emergency algorithms

    static let emergency: [KnowledgeArticle] = [
        KnowledgeArticle(id: "abcde", kind: .emergency, title: "ABCDE үнэлгээ", icon: "list.number", tint: Theme.tintPink,
                         summary: "Хүнд өвчтөнийг амь насанд хамгийн аюултайгаас нь эхлэн дарааллаар үнэлж, тэр дор нь засах арга.",
                         sections: [
                            KnowledgeSection(heading: "A · Амьсгалын зам", points: ["Ярьж байна уу? Шуугиан, бөглөрөл бий юу?", "Гэмтэлд хүзүүг тогтворжуул"]),
                            KnowledgeSection(heading: "B · Амьсгал", points: ["Тоо, SpO₂, хоёр талын сонсгол, цээжний хөдөлгөөн", "Хүчилтөрөгч, пневмоторакс бол задлах"]),
                            KnowledgeSection(heading: "C · Цусны эргэлт", points: ["Зүрхний цохилт, даралт, хялгасан судасны дүүрэлт (<2 сек)", "Цус алдалтыг зогсоох, 2 судас, шингэн/цус"]),
                            KnowledgeSection(heading: "D · Мэдрэл", points: ["Глазго эсвэл AVPU, хүүхэн хараа, цусан дахь сахар"]),
                            KnowledgeSection(heading: "E · Ил гаргах", points: ["Бүх биеийг үзэх, дулаалах (гипотерми бүлэгнэлтийг муутгана)"]),
                         ],
                         keyFacts: ["ABCDE-д асуудал илэрвэл дараагийн үсэг рүү шилжихээсээ өмнө тэр дор нь засна.", "Хялгасан судасны дүүрэлт 2 секундээс удаан бол цусны эргэлт муудсаны шинж."],
                         roles: [.ems, .doctor, .nurse, .student], quizTopic: "ABCDE үнэлгээ"),
        KnowledgeArticle(id: "bls", kind: .emergency, title: "Зүрх-уушгины амилуулалт", icon: "heart.text.square.fill", tint: Theme.tintPink,
                         summary: "Насанд хүрэгчдийн үндсэн амилуулалт: эрт дуудах, чанартай шахалт, эрт дефибрилляци.",
                         sections: [
                            KnowledgeSection(heading: "Алхам", points: ["Аюулгүй байдал → хариу урвал шалгах → 103 дуудах, AED авчруулах", "Амьсгал хэвийн биш бол цээжийг даруй шахах"]),
                            KnowledgeSection(heading: "Чанартай шахалт", points: ["Минутад 100–120, гүн 5–6 см", "Цээж бүрэн буцаж тэлэх", "30 шахалт : 2 амьсгал", "Тасалдлыг 10 секундээс бага байлга"]),
                            KnowledgeSection(heading: "Дефибрилляци", points: ["AED ирмэгц наах, заавраар шок өгөх", "Шокийн дараа шахалтыг шууд үргэлжлүүлэх"]),
                         ],
                         keyFacts: ["Цээжийг минутад 100–120 удаа, 5–6 см гүн шахна.", "Монголд түргэн тусламжийн утас: 103."],
                         roles: [.student, .nurse, .ems, .doctor], quizTopic: "Насанд хүрэгчдийн зүрх-уушгины амилуулалт"),
        KnowledgeArticle(id: "shock", kind: .emergency, title: "Шок", icon: "waveform.path.ecg.rectangle", tint: Theme.tintPeach,
                         summary: "Эд эрхтэн хангалттай цусаар хангагдахгүй байх байдал. Шалтгаанаар нь 4 төрөлд хуваана.",
                         sections: [
                            KnowledgeSection(heading: "Төрөл", points: ["Гиповолеми: цус, шингэн алдалт", "Кардиоген: зүрхний шахах чадвар буурах (шигдээс)", "Бөглөрөлт: даралт ихэссэн пневмоторакс, зүрхний тампонад, уушгины эмболи", "Тархмал: сепсис, анафилакси"]),
                            KnowledgeSection(heading: "Шинж", points: ["Тахикарди, арьс хүйтэн чийглэг, хялгасан судасны дүүрэлт удаан", "Шээс багасах, ухаан будилах", "Даралт буурах нь хожуу шинж"]),
                         ],
                         keyFacts: ["Даралт буурах нь шокийн хожуу шинж: тахикарди, хүйтэн арьс эрт гардаг."],
                         roles: [.doctor, .ems, .nurse, .student], quizTopic: "Шокийн төрөл, шинж, эмчилгээ"),
        KnowledgeArticle(id: "anaphylaxis", kind: .emergency, title: "Анафилакси", icon: "allergens", tint: Theme.tintLilac,
                         summary: "Амь насанд аюултай, хурдан явагддаг харшлын урвал. Гол эм нь булчинд тарих адреналин.",
                         sections: [
                            KnowledgeSection(heading: "Таних", points: ["Гэнэт эхэлсэн амьсгалын зам/амьсгал/цусны эргэлтийн асуудал", "Ихэвчлэн арьс, салстын өөрчлөлттэй (тууралт, хаван)"]),
                            KnowledgeSection(heading: "Эмчилгээ", points: ["Шалтгааныг зогсоох, тусламж дуудах", "Адреналин булчинд, гуяны урд-гадна тал: насанд хүрэгчдэд 0.5 мг (1 мг/мл-ээс 0.5 мл)", "Хүүхдэд 0.01 мг/кг (дээд тал нь 0.5 мг)", "5 минутад сайжрахгүй бол давтах", "Хэвтүүлж хөл өргөх, O₂, шингэн"]),
                            KnowledgeSection(heading: "Дараа нь", points: ["Хоёр дахь давалгааны эрсдэлтэй тул ажиглах", "Харшлыг бүртгэх"]),
                         ],
                         keyFacts: ["Анафилаксийн үед адреналиныг булчинд, гуяны урд-гадна талд тарина."],
                         roles: [.nurse, .ems, .doctor, .student], quizTopic: "Анафилакси"),
        KnowledgeArticle(id: "sbar", kind: .emergency, title: "SBAR мэдээлэл", icon: "phone.fill", tint: Theme.tintBlue,
                         summary: "Өвчтөний талаар товч, ойлгомжтой мэдээлэх бүтэц. Мэдээлэл алдагдахаас сэргийлнэ.",
                         sections: [
                            KnowledgeSection(heading: "Бүтэц", points: ["S · Нөхцөл: хэн, юу болж байна", "B · Түүх: онош, эм, харшил, юу хийсэн", "A · Үнэлгээ: амин үзүүлэлт, таны дүгнэлт", "R · Хүсэлт: юу хүсэж байна, хэзээ"]),
                         ],
                         keyFacts: ["SBAR: Нөхцөл, Түүх, Үнэлгээ, Хүсэлт."],
                         roles: [.nurse, .student, .ems, .doctor], quizTopic: "SBAR мэдээлэл дамжуулах"),
        KnowledgeArticle(id: "ecg", kind: .emergency, title: "ЗЦБ (ЭКГ) үндэс", icon: "waveform.path.ecg", tint: Theme.tintPink,
                         summary: "12 холболтын байрлал, зүрхний хэсэг, хэвийн интервалууд.",
                         sections: [
                            KnowledgeSection(heading: "Холболт ба хэсэг", points: ["II, III, aVF: доод хана", "V1–V4: урд хана, таславч", "I, aVL, V5–V6: хажуу хана"]),
                            KnowledgeSection(heading: "Хэвийн хэмжээ", points: ["PR 120–200 мс", "QRS <120 мс", "Цохилт 60–100/мин"]),
                         ],
                         keyFacts: ["II, III, aVF холболт зүрхний доод ханыг харуулдаг."],
                         roles: [.doctor, .student, .nurse, .ems], quizTopic: "ЗЦБ унших үндэс"),
    ]

    // MARK: Reference

    static let reference: [KnowledgeArticle] = [
        KnowledgeArticle(id: "vitals", kind: .reference, title: "Хэвийн үзүүлэлтүүд", icon: "gauge.with.dots.needle.33percent", tint: Theme.tintBlue,
                         summary: "Насанд хүрэгчдийн амин үзүүлэлт ба түгээмэл шинжилгээний ойролцоо хэвийн хэмжээ.",
                         sections: [
                            KnowledgeSection(heading: "Амин үзүүлэлт", points: ["Зүрхний цохилт 60–100/мин", "Артерийн даралт ~90–120 / 60–80 мм МУБ", "Амьсгал 12–20/мин", "SpO₂ 94–98%", "Биеийн халуун 36.5–37.5 °C", "Глазго 15"]),
                            KnowledgeSection(heading: "Шинжилгээ", points: ["Өлөн үеийн сахар 3.9–5.5 ммоль/л", "Шээсний гарц ≥0.5 мл/кг/цаг"]),
                         ],
                         keyFacts: ["Насанд хүрэгчдийн амьсгалын хэвийн тоо минутад 12–20."],
                         roles: [.student, .nurse, .ems, .doctor], quizTopic: "Насанд хүрэгчдийн хэвийн амин үзүүлэлт"),
    ]
}

// MARK: - Views

struct KnowledgeView: View {
    @AppStorage(UserRole.storageKey) private var roleRaw = ""
    @State private var query = ""
    @State private var opened: KnowledgeArticle?
    @State private var showAtlas = false

    private var role: UserRole { UserRole(rawValue: roleRaw) ?? .student }

    private func forRole(_ list: [KnowledgeArticle]) -> [KnowledgeArticle] {
        list.sorted { ($0.roles.firstIndex(of: role) ?? 9) < ($1.roles.firstIndex(of: role) ?? 9) }
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 22) {
                    VStack(alignment: .leading, spacing: 6) {
                        Text("Мэдлэг").font(.system(size: 32, weight: .semibold)).foregroundStyle(.white)
                        Text("Анатоми, яаралтай тусламж, лавлах мэдээлэл").font(.subheadline).foregroundStyle(.white.opacity(0.9))
                    }

                    HStack(spacing: 8) {
                        Image(systemName: "magnifyingglass").foregroundStyle(Theme.muted)
                        TextField("Хайх: зүрх, шок, SpO₂…", text: $query)
                    }
                    .padding(14)
                    .background(Theme.field, in: Capsule())
                    .overlay(Capsule().stroke(Theme.line))

                    if query.trimmingCharacters(in: .whitespaces).isEmpty {
                        atlasCard
                        section("Биеийн системүүд", forRole(KnowledgeArticle.anatomy), grid: true)
                        section("Яаралтай тусламж", forRole(KnowledgeArticle.emergency), grid: false)
                        section("Лавлах", KnowledgeArticle.reference, grid: false)
                    } else {
                        let found = KnowledgeArticle.search(query)
                        if found.isEmpty {
                            Text("Илэрц олдсонгүй.").foregroundStyle(Theme.muted)
                        }
                        ForEach(found) { a in row(a) }
                    }
                    Text("⚠️ Сургалтын товч мэдээлэл. Эмнэлзүйн шийдвэрт албан ёсны заавар, багшийн зөвлөгөөг баримтал.")
                        .font(.caption2).foregroundStyle(Theme.muted)
                }
                .padding(20)
            }
            .scrollDismissesKeyboard(.interactively)
            .appScreen()
            .toolbar(.hidden, for: .navigationBar)
        }
        .tint(brand)
        .sheet(item: $opened) { KnowledgeArticleView(article: $0) }
        .fullScreenCover(isPresented: $showAtlas) { AtlasScreen() }
    }

    private var atlasCard: some View {
        Button { showAtlas = true } label: {
            HStack(spacing: 16) {
                Image(systemName: "figure.stand")
                    .font(.system(size: 40))
                    .foregroundStyle(.white)
                    .frame(width: 76, height: 76)
                    .background(Theme.accentGradient, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
                VStack(alignment: .leading, spacing: 4) {
                    Text("3D Анатоми").font(.title3.weight(.semibold)).foregroundStyle(Theme.ink)
                    Text("2,234 хэсгийг эргүүлж, задалж, монгол нэрээр хайх").font(.caption).foregroundStyle(Theme.muted)
                    Text("Интернэт шаардлагатай").font(.caption2).foregroundStyle(Theme.subtle)
                }
                Spacer()
                Image(systemName: "chevron.right").foregroundStyle(Theme.subtle)
            }
            .card(padding: 14, radius: 26)
        }
        .buttonStyle(.plain)
    }

    private func section(_ title: String, _ items: [KnowledgeArticle], grid: Bool) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(title).font(.title3.weight(.semibold)).foregroundStyle(Theme.ink)
            if grid {
                LazyVGrid(columns: [GridItem(.flexible(), spacing: 12), GridItem(.flexible(), spacing: 12)], spacing: 12) {
                    ForEach(items) { a in
                        Button { opened = a } label: {
                            VStack(alignment: .leading, spacing: 10) {
                                Image(systemName: a.icon).font(.title2).foregroundStyle(brand)
                                    .frame(width: 48, height: 48)
                                    .background(.white.opacity(0.9), in: Circle())
                                Text(a.title).font(.subheadline.weight(.semibold)).foregroundStyle(Theme.ink)
                                    .lineLimit(2, reservesSpace: true)
                            }
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .padding(14)
                            .background(a.tint.opacity(0.9), in: RoundedRectangle(cornerRadius: 22, style: .continuous))
                            .overlay(RoundedRectangle(cornerRadius: 22, style: .continuous).stroke(Theme.line))
                        }
                        .buttonStyle(.plain)
                    }
                }
            } else {
                ForEach(items) { a in row(a) }
            }
        }
    }

    private func row(_ a: KnowledgeArticle) -> some View {
        Button { opened = a } label: {
            HStack(spacing: 12) {
                Image(systemName: a.icon).font(.title3).foregroundStyle(brand)
                    .frame(width: 46, height: 46).background(a.tint, in: Circle())
                VStack(alignment: .leading, spacing: 3) {
                    Text(a.title).font(.headline).foregroundStyle(Theme.ink)
                    Text(a.summary).font(.caption).foregroundStyle(Theme.muted).lineLimit(2)
                }
                Spacer()
                Image(systemName: "chevron.right").font(.footnote).foregroundStyle(Theme.subtle)
            }
            .card(padding: 12, radius: 22)
        }
        .buttonStyle(.plain)
    }
}

/// Full-screen 3D atlas (web, needs the server).
struct AtlasScreen: View {
    @Environment(\.dismiss) private var dismiss
    var body: some View {
        NavigationStack {
            AtlasWeb()
                .ignoresSafeArea(edges: .bottom)
                .navigationTitle("3D Анатоми")
                .navigationBarTitleDisplayMode(.inline)
                .toolbar { ToolbarItem(placement: .topBarLeading) { Button("Хаах") { dismiss() } } }
        }
        .tint(brand)
    }
}

struct KnowledgeArticleView: View {
    let article: KnowledgeArticle
    @Environment(\.dismiss) private var dismiss
    @AppStorage("mainTab") private var tab = AppTab.home
    @AppStorage("quizPrefill") private var quizPrefill = ""
    @State private var showAtlas = false

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    HStack(spacing: 14) {
                        Image(systemName: article.icon).font(.title).foregroundStyle(brand)
                            .frame(width: 64, height: 64).background(article.tint, in: Circle())
                        Text(article.title).font(.title2.weight(.bold))
                    }
                    Text(article.summary).font(.body)

                    ForEach(article.sections, id: \.self) { section in
                        VStack(alignment: .leading, spacing: 8) {
                            Text(section.heading).font(.headline)
                            ForEach(section.points, id: \.self) { point in
                                HStack(alignment: .top, spacing: 8) {
                                    Circle().fill(Theme.accent).frame(width: 6, height: 6).padding(.top, 7)
                                    Text(point).font(.subheadline)
                                }
                            }
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .card(padding: 14, radius: 20)
                    }

                    if !article.keyFacts.isEmpty {
                        VStack(alignment: .leading, spacing: 8) {
                            Label("Санах зүйл", systemImage: "star.fill").font(.headline).foregroundStyle(Theme.warn)
                            ForEach(article.keyFacts, id: \.self) { Text($0).font(.subheadline) }
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(14)
                        .background(Theme.warn.opacity(0.1), in: RoundedRectangle(cornerRadius: 20, style: .continuous))
                    }

                    VStack(spacing: 10) {
                        Button {
                            quizPrefill = article.quizTopic
                            tab = .quiz
                            dismiss()
                        } label: { Label("Энэ сэдвээр Сорил өгөх", systemImage: "list.clipboard") }
                            .buttonStyle(.primary)
                        if article.hasAtlas {
                            Button { showAtlas = true } label: { Label("3D-ээр харах", systemImage: "cube.transparent") }
                                .buttonStyle(.secondary)
                        }
                    }
                }
                .padding(20)
            }
            .foregroundStyle(Theme.ink)
            .appScreen()
            .toolbar { ToolbarItem(placement: .topBarTrailing) { Button("Хаах") { dismiss() } } }
        }
        .tint(brand)
        .fullScreenCover(isPresented: $showAtlas) { AtlasScreen() }
    }
}
