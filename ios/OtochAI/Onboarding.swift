import SwiftUI

/// First launch: what Otech AI is → who you are (not health-only any more) →
/// sign in or sign up inside the app (practice results and the team need an account).
struct OnboardingView: View {
    let onFinish: (UserRole) -> Void
    @State private var step = 0
    @State private var role: UserRole?

    var body: some View {
        ZStack {
            AppBackground()
            switch step {
            case 0: welcome.transition(.opacity)
            case 1: rolePicker.transition(.move(edge: .trailing).combined(with: .opacity))
            default:
                SignInSheet(onDone: finish, onCancel: finish, cancelTitle: "Дараа")
                    .transition(.move(edge: .trailing).combined(with: .opacity))
            }
        }
        .animation(.snappy(duration: 0.35), value: step)
        .preferredColorScheme(.dark)
    }

    private func finish() {
        onFinish(role ?? .learner)
    }

    // MARK: 1. What it is

    private var welcome: some View {
        VStack(spacing: 22) {
            Spacer(minLength: 20)
            Orb(size: 190)
            VStack(spacing: 10) {
                Text("OTech AI").font(.system(size: 40, weight: .bold)).foregroundStyle(Theme.ink)
                Text("Жинхэнэ хүн дээр алдахаас өмнө\nAI дээр дадлагажуул.")
                    .font(.title3.weight(.medium))
                    .foregroundStyle(Theme.muted)
                    .multilineTextAlignment(.center)
            }
            VStack(spacing: 12) {
                feature("person.wave.2.fill", "AI дасгалжуулагч", "Үйлчлүүлэгч, өвчтөн, сурагч, дуудлага өгөгч болж видео эсвэл утсаар ярина")
                feature("list.clipboard.fill", "Сорил", "Материалаа зураг, PDF-ээр оруулаад тест, бодлого, аман шалгалт өг")
                feature("chart.bar.doc.horizontal.fill", "Дүгнэлт", "Хийсэн бүхэнд тань оноо, «ингэж хэлбэл илүү» санал")
            }
            Spacer(minLength: 10)
            Button { step = 1 } label: { Text("Эхлэх") }
                .buttonStyle(.primary)
                .glowEdge(radius: 30)
        }
        .padding(24)
    }

    private func feature(_ icon: String, _ title: String, _ detail: String) -> some View {
        HStack(alignment: .top, spacing: 14) {
            Image(systemName: icon)
                .font(.title3)
                .foregroundStyle(Theme.accentDeep)
                .frame(width: 44, height: 44)
                .background(Theme.accentSoft, in: RoundedRectangle(cornerRadius: 14))
            VStack(alignment: .leading, spacing: 3) {
                Text(title).font(.headline).foregroundStyle(Theme.ink)
                Text(detail).font(.caption).foregroundStyle(Theme.muted)
            }
            Spacer(minLength: 0)
        }
        .card(padding: 12, radius: 20)
    }

    // MARK: 2. Who you are

    private var rolePicker: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                VStack(alignment: .leading, spacing: 6) {
                    Text("Та юунд бэлдэж байна вэ?").font(.system(size: 28, weight: .bold)).foregroundStyle(Theme.ink)
                    Text("Сонголтоос тань хамаарч AI дасгалжуулагч, сорилын асуулт, нүүр хуудас өөрчлөгдөнө. Дараа нь сольж болно.")
                        .font(.subheadline).foregroundStyle(Theme.muted)
                }
                .padding(.top, 24)

                ForEach(UserRole.pickable) { r in
                    Button { role = r } label: {
                        HStack(spacing: 14) {
                            Image(systemName: r.icon)
                                .font(.title3)
                                .foregroundStyle(role == r ? .white : Theme.accentDeep)
                                .frame(width: 50, height: 50)
                                .background(role == r ? AnyShapeStyle(Theme.accentGradient) : AnyShapeStyle(Theme.accentSoft), in: RoundedRectangle(cornerRadius: 15))
                            VStack(alignment: .leading, spacing: 3) {
                                Text(r.title).font(.headline).foregroundStyle(Theme.ink)
                                Text(r.detail).font(.caption).foregroundStyle(Theme.muted).multilineTextAlignment(.leading)
                            }
                            Spacer()
                            Image(systemName: role == r ? "checkmark.circle.fill" : "circle")
                                .font(.title3)
                                .foregroundStyle(role == r ? Theme.accentDeep : Theme.subtle)
                        }
                        .card(padding: 14, radius: 20)
                        .overlay {
                            if role == r {
                                RoundedRectangle(cornerRadius: 20, style: .continuous).stroke(Theme.glowBorder, lineWidth: 1.4)
                            }
                        }
                    }
                    .buttonStyle(.plain)
                }

                Button { step = 2 } label: { Text("Үргэлжлүүлэх") }
                    .buttonStyle(.primary)
                    .disabled(role == nil)
                    .padding(.top, 6)
            }
            .padding(20)
        }
        .scrollContentBackground(.hidden)
    }
}
