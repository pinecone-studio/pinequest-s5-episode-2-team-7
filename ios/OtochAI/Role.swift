import SwiftUI

/// Who is practising. Chosen on first launch and changeable from «Нүүр».
/// It tailors the home screen, «Сорил» questions (sent to the
/// server as `role`) and the order of the news.
/// Stored in AppStorage "userRole"; raw values are an API contract, do not rename.
enum UserRole: String, CaseIterable, Identifiable {
    // student…ems: the first (health-only) version; kept so saved data and the emergency cases still work.
    case student, doctor, nurse, ems, teacher, service, manager, learner, health, dispatcher

    /// What the «Та хэн бэ?» screen offers now (not health-only any more).
    static let pickable: [UserRole] = [.service, .manager, .teacher, .dispatcher, .health, .learner]

    static let storageKey = "userRole"

    var id: String { rawValue }

    var title: String {
        switch self {
        case .student: return "Оюутан"
        case .doctor: return "Эмч"
        case .nurse: return "Сувилагч"
        case .ems: return "Түргэн тусламж"
        case .teacher: return "Багш"
        case .service: return "Үйлчилгээний ажилтан"
        case .manager: return "Ажил олгогч / менежер"
        case .learner: return "Өөрийгөө хөгжүүлэх"
        case .health: return "Эрүүл мэндийн ажилтан"
        case .dispatcher: return "Яаралтай дуудлага"
        }
    }

    var detail: String {
        switch self {
        case .student: return "Анагаах, сувилахуйн оюутан: OSCE, шалгалтад бэлдэх"
        case .doctor: return "Эмч, резидент: онош, эмчилгээний шийдвэр, багийг удирдах"
        case .nurse: return "Сувилагч: үнэлгээ, эм аюулгүй өгөх, хяналт, мэдээлэх"
        case .ems: return "Түргэн тусламжийн ажилтан: хэргийн газар, тогтворжуулалт, тээвэрлэлт"
        case .teacher: return "Багш: сурагч, эцэг эхтэй хэцүү яриа, анги удирдах"
        case .service: return "Call center, ресепшн, борлуулалт: үйлчлүүлэгчтэй харьцах"
        case .manager: return "Компанийнхаа мэдээллийг оруулаад шинэ ажилтнаа AI-аар сургаж, үр дүнг нь харна"
        case .learner: return "Оюутан, ажилд орох гэж буй хүн: ярилцлага, анхны ажлын өдөрт бэлдэх"
        case .health: return "Эмч, сувилагч: өвчтөн, ар гэртэйгээ харилцах"
        case .dispatcher: return "103, 102, 105: сандарсан дуудлага өгөгчтэй ажиллах"
        }
    }

    var icon: String {
        switch self {
        case .student: return "graduationcap.fill"
        case .doctor: return "stethoscope"
        case .nurse: return "cross.case.fill"
        case .ems: return "staroflife.fill"
        case .teacher: return "studentdesk"
        case .service: return "headphones"
        case .manager: return "briefcase.fill"
        case .learner: return "sparkles"
        case .health: return "stethoscope"
        case .dispatcher: return "phone.connection.fill"
        }
    }

    /// The line under the greeting on «Нүүр».
    var greeting: String {
        switch self {
        case .student: return "Анхны жинхэнэ өвчтөнөөсөө өмнө энд дадлага хий. Өнөөдөр юугаар эхлэх вэ?"
        case .doctor: return "Хурдан, зөв шийдвэр гаргах дадлага. Өнөөдөр ямар тохиолдол үзэх вэ?"
        case .nurse: return "Аюулгүй, нягт сувилгааны дадлага. Өнөөдөр юугаар эхлэх вэ?"
        case .ems: return "Хэргийн газраас эмнэлэг хүртэлх эхний минутуудын дадлага. Бэлэн үү?"
        case .teacher: return "Анхны хэцүү яриагаа жинхэнэ сурагч дээр биш, энд дадлагажуул."
        case .service: return "Уурласан үйлчлүүлэгчтэй анх удаа энд тааралд. AI тань дүгнээд өгнө."
        case .manager: return "Компанийнхаа мэдээллийг оруулаад шинэ ажилтнаа AI дасгалжуулагчаар сургаарай."
        case .learner: return "Ярилцлага, анхны ажлын өдөр, хэцүү яриа: эхлээд AI дээр дадлагажуул."
        case .health: return "Өвчтөнтэй хийх хэцүү яриагаа эхлээд AI дээр давт."
        case .dispatcher: return "Анхны сандарсан дуудлагаа жинхэнэ хүн дээр биш, энд ав."
        }
    }

    /// Health roles see the emergency cases and medical knowledge on «Нүүр».
    var isMedical: Bool { [.student, .doctor, .nurse, .ems, .health].contains(self) }

    /// News categories (pinequest-team7 NEWS_CATEGORIES) shown first for this role.
    var newsCategories: [String] {
        switch self {
        case .student: return ["education", "research", "general"]
        case .doctor: return ["clinical", "research"]
        case .nurse: return ["clinical", "public-health", "education"]
        case .ems: return ["public-health", "clinical", "general"]
        case .teacher, .service, .manager, .learner, .dispatcher: return ["general", "education"]
        case .health: return ["clinical", "public-health"]
        }
    }
}

/// Human labels for pinequest-team7 news categories.
enum NewsCategory {
    static func label(_ category: String) -> String {
        switch category {
        case "research": return "Судалгаа"
        case "public-health": return "Нийгмийн эрүүл мэнд"
        case "clinical": return "Эмнэлзүй"
        case "education": return "Боловсрол"
        default: return "Ерөнхий"
        }
    }
}

/// «Та хэн бэ?»: shown on first launch (cannot be skipped) and from «Нүүр» to switch roles.
struct RolePickerView: View {
    var initial: UserRole?
    let done: (UserRole) -> Void

    @State private var selected: UserRole?

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    VStack(alignment: .leading, spacing: 6) {
                        Text("Та хэн бэ?").font(.system(size: 30, weight: .bold))
                        Text("Сонголтоос тань хамаарч AI дасгалжуулагч, сорилын асуулт, нүүр хуудас өөрчлөгдөнө.")
                            .font(.subheadline)
                            .foregroundStyle(Theme.muted)
                    }
                    .padding(.top, 8)

                    ForEach(UserRole.pickable) { role in
                        Button { selected = role } label: {
                            HStack(spacing: 14) {
                                Image(systemName: role.icon)
                                    .font(.title2)
                                    .foregroundStyle(brand)
                                    .frame(width: 52, height: 52)
                                    .background(Theme.accentSoft, in: RoundedRectangle(cornerRadius: 14))
                                VStack(alignment: .leading, spacing: 3) {
                                    Text(role.title).font(.headline)
                                    Text(role.detail).font(.caption).foregroundStyle(Theme.muted).multilineTextAlignment(.leading)
                                }
                                Spacer()
                                Image(systemName: selected == role ? "checkmark.circle.fill" : "circle")
                                    .font(.title3)
                                    .foregroundStyle(selected == role ? brand : Theme.subtle)
                            }
                            .card(padding: 14, radius: 18)
                            .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous).stroke(selected == role ? brand : .clear, lineWidth: 1.5))
                        }
                        .buttonStyle(.plain)
                    }

                    Button {
                        if let selected { done(selected) }
                    } label: {
                        Text("Үргэлжлүүлэх")
                    }
                    .buttonStyle(.primary)
                    .disabled(selected == nil)
                    .padding(.top, 4)

                    Text("Хүссэн үедээ «Нүүр» хэсгээс сольж болно.")
                        .font(.caption)
                        .foregroundStyle(Theme.subtle)
                        .frame(maxWidth: .infinity)
                }
                .padding()
            }
            .appScreen()
        }
        .tint(brand)
        .onAppear { selected = selected ?? initial }
    }
}
