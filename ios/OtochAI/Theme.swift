import SwiftUI
import UIKit

/// Otech AI design (2026-10 redesign): near-black canvas that deepens into
/// violet, dark glass cards with hairline edges, one violet accent, a violet →
/// amber glow around the important inputs, pill buttons and a glass orb that
/// stands for the AI. Dark only (the app forces `.preferredColorScheme(.dark)`).
enum Theme {
    static let canvas = rgb(0x09080F)
    /// Glass fill on top of the canvas (cards, rows).
    static let surface = Color.white.opacity(0.055)
    static let surfaceSolid = rgb(0x17141F)
    static let sunken = rgb(0x110F18)
    /// Text fields, chips and small tiles.
    static let field = Color.white.opacity(0.07)
    static let ink = rgb(0xF4F2FF)
    static let muted = rgb(0xA7A2C3)
    static let subtle = rgb(0x6F6990)
    static let line = Color.white.opacity(0.10)
    static let accent = rgb(0x8B5CF6)
    static let accentDeep = rgb(0xB9A4FF)
    static let accentInk = Color.white
    static let accentSoft = rgb(0x8B5CF6).opacity(0.18)
    static let gold = rgb(0xF2B25C)
    static let alert = rgb(0xF87171)
    static let ok = rgb(0x34D399)
    static let warn = rgb(0xFBBF24)

    /// Tinted dark panels (kept the old names so every screen follows the new look).
    static let tintPink = rgb(0x2A1628)
    static let tintBlue = rgb(0x151D36)
    static let tintLilac = rgb(0x1E1734)
    static let tintPeach = rgb(0x271C22)

    static let shadow = Color.black.opacity(0.45)

    static let accentGradient = LinearGradient(colors: [rgb(0x6D3BFF), rgb(0x9B6BFF)], startPoint: .topLeading, endPoint: .bottomTrailing)
    /// The violet → amber glow around the ask bar and other hero inputs.
    static let glowBorder = LinearGradient(colors: [rgb(0x8B5CF6), rgb(0xC084FC), rgb(0xF2B25C)], startPoint: .leading, endPoint: .trailing)

    static func rgb(_ hex: UInt32) -> Color { Color(UIColor(hex: hex)) }
}

/// The accent everywhere (buttons, icons, selection).
let brand = Theme.accent

extension UIColor {
    convenience init(hex: UInt32, alpha: CGFloat = 1) {
        self.init(red: CGFloat((hex >> 16) & 0xFF) / 255, green: CGFloat((hex >> 8) & 0xFF) / 255, blue: CGFloat(hex & 0xFF) / 255, alpha: alpha)
    }
}

/// Canvas: near-black at the top, a deep violet glow rising from the bottom.
struct AppBackground: View {
    var body: some View {
        ZStack {
            LinearGradient(stops: [
                .init(color: Theme.rgb(0x07060C), location: 0),
                .init(color: Theme.rgb(0x0E0B19), location: 0.45),
                .init(color: Theme.rgb(0x1C1240), location: 0.82),
                .init(color: Theme.rgb(0x3A1F8C), location: 1),
            ], startPoint: .top, endPoint: .bottom)
            GeometryReader { geo in
                let w = geo.size.width
                Circle().fill(Theme.rgb(0x6D3BFF).opacity(0.28))
                    .frame(width: w * 0.9).blur(radius: 90).offset(x: w * 0.45, y: -w * 0.35)
                Circle().fill(Theme.rgb(0xF2B25C).opacity(0.08))
                    .frame(width: w * 0.7).blur(radius: 100).offset(x: -w * 0.35, y: w * 0.9)
            }
        }
        .ignoresSafeArea()
    }
}

extension View {
    /// A dark glass panel: translucent fill, hairline edge, deep shadow.
    func card(padding: CGFloat = 16, radius: CGFloat = 24) -> some View {
        self.padding(padding)
            .background {
                RoundedRectangle(cornerRadius: radius, style: .continuous)
                    .fill(.ultraThinMaterial)
                    .overlay(RoundedRectangle(cornerRadius: radius, style: .continuous).fill(Theme.surface))
            }
            .overlay(RoundedRectangle(cornerRadius: radius, style: .continuous).stroke(Theme.line, lineWidth: 1))
            .shadow(color: Theme.shadow, radius: 18, x: 0, y: 8)
    }

    /// The violet → amber glowing edge (hero inputs, the main call to action).
    func glowEdge(radius: CGFloat = 22) -> some View {
        self.overlay(RoundedRectangle(cornerRadius: radius, style: .continuous).stroke(Theme.glowBorder, lineWidth: 1.4))
            .shadow(color: Theme.accent.opacity(0.35), radius: 14, x: 0, y: 0)
    }

    /// Screen background + navigation bar that blend with the canvas; leaves room for the floating tab bar.
    func appScreen() -> some View {
        self.scrollContentBackground(.hidden)
            .background(AppBackground())
            .toolbarBackground(.hidden, for: .navigationBar)
    }
}

/// Violet pill with white text and a soft glow.
struct PrimaryButtonStyle: ButtonStyle {
    @Environment(\.isEnabled) private var isEnabled

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.headline)
            .foregroundStyle(Theme.accentInk)
            .padding(.vertical, 16)
            .padding(.horizontal, 20)
            .frame(maxWidth: .infinity)
            .background(Theme.accentGradient, in: Capsule())
            .overlay(Capsule().stroke(Color.white.opacity(0.18), lineWidth: 1))
            .shadow(color: Theme.accent.opacity(isEnabled ? 0.5 : 0), radius: 16, x: 0, y: 6)
            .opacity(isEnabled ? (configuration.isPressed ? 0.85 : 1) : 0.4)
    }
}

/// Dark glass pill.
struct SecondaryButtonStyle: ButtonStyle {
    @Environment(\.isEnabled) private var isEnabled

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.subheadline.weight(.semibold))
            .foregroundStyle(Theme.ink.opacity(isEnabled ? 1 : 0.4))
            .padding(.vertical, 14)
            .padding(.horizontal, 18)
            .frame(maxWidth: .infinity)
            .background(Theme.field, in: Capsule())
            .overlay(Capsule().stroke(Theme.line, lineWidth: 1))
            .opacity(configuration.isPressed ? 0.8 : 1)
    }
}

extension ButtonStyle where Self == PrimaryButtonStyle {
    static var primary: PrimaryButtonStyle { PrimaryButtonStyle() }
}

extension ButtonStyle where Self == SecondaryButtonStyle {
    static var secondary: SecondaryButtonStyle { SecondaryButtonStyle() }
}

/// Round frosted icon button (search, bell, back…) with an optional caption underneath.
struct GlassCircle: View {
    let icon: String
    var label: String? = nil
    var size: CGFloat = 52

    var body: some View {
        VStack(spacing: 4) {
            Image(systemName: icon)
                .font(.system(size: size * 0.38, weight: .regular))
                .foregroundStyle(.white)
                .frame(width: size, height: size)
                .background(Color.white.opacity(0.22), in: Circle())
                .overlay(Circle().stroke(Color.white.opacity(0.55), lineWidth: 1))
            if let label {
                Text(label).font(.caption2.weight(.medium)).foregroundStyle(.white)
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(label ?? "")
    }
}

/// The iridescent orb that stands for the AI (pink, lilac, sky and white swirling).
struct Orb: View {
    var size: CGFloat = 200
    var animated = true
    @State private var spin = false

    var body: some View {
        ZStack {
            Circle()
                .fill(AngularGradient(colors: [
                    Theme.rgb(0x6D3BFF), Theme.rgb(0xB18CFF), Theme.rgb(0x5EC8FF),
                    Theme.rgb(0xF2B25C), Theme.rgb(0x9B6BFF), Theme.rgb(0x6D3BFF),
                ], center: .center))
                .rotationEffect(.degrees(spin ? 360 : 0))
                .blur(radius: size * 0.05)
            Circle()
                .fill(RadialGradient(colors: [.white.opacity(0.6), .clear], center: UnitPoint(x: 0.32, y: 0.28), startRadius: 0, endRadius: size * 0.42))
            Circle()
                .stroke(LinearGradient(colors: [.white.opacity(0.9), .white.opacity(0.1)], startPoint: .topLeading, endPoint: .bottomTrailing), lineWidth: max(1, size * 0.012))
        }
        .frame(width: size, height: size)
        .clipShape(Circle())
        .shadow(color: Theme.rgb(0x8B5CF6).opacity(0.55), radius: size * 0.16, x: 0, y: size * 0.04)
        .onAppear {
            guard animated else { return }
            withAnimation(.linear(duration: 14).repeatForever(autoreverses: false)) { spin = true }
        }
        .accessibilityHidden(true)
    }
}
