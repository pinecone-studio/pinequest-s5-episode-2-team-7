import CoreMotion
import SwiftUI

/// Phone tilt as a -1…1 offset relative to how the phone was held when the scene opened.
@MainActor
final class TiltMotion: ObservableObject {
    @Published var x: Double = 0
    @Published var y: Double = 0
    private let manager = CMMotionManager()
    private var reference: CMAttitude?

    func start() {
        guard manager.isDeviceMotionAvailable, !manager.isDeviceMotionActive else { return }
        manager.deviceMotionUpdateInterval = 1 / 50
        manager.startDeviceMotionUpdates(to: .main) { [weak self] motion, _ in
            guard let self, let motion else { return }
            let attitude = motion.attitude
            if self.reference == nil { self.reference = attitude.copy() as? CMAttitude }
            if let reference = self.reference { attitude.multiply(byInverseOf: reference) }
            // ~25° of tilt pans from the centre to the edge.
            let limit = 0.45
            self.x = max(-1, min(1, attitude.roll / limit))
            self.y = max(-1, min(1, attitude.pitch / limit))
        }
    }

    func stop() {
        manager.stopDeviceMotionUpdates()
        reference = nil
    }

    func recenter() { reference = nil }
}

/// «Magic window»: an emergency scene drawn in depth layers. Tilting the phone (or
/// dragging) moves near layers more than far ones, so the screen behaves like a
/// window into the place. Tapping the patient shows what you find on examination.
struct SceneWindow: View {
    let kind: SceneKind
    var danger: Double = 0
    var interactive = true
    var onPatientTap: (() -> Void)? = nil

    @StateObject private var motion = TiltMotion()
    @State private var drag: CGSize = .zero
    @State private var dragBase: CGSize = .zero
    @State private var pulse = false

    var body: some View {
        GeometryReader { geo in
            let w = geo.size.width, h = geo.size.height
            let pan = CGSize(width: (interactive ? motion.x : 0) * w * 0.18 + drag.width,
                             height: (interactive ? motion.y : 0) * h * 0.06 + drag.height * 0.3)
            ZStack {
                layers(w: w, h: h, pan: pan)
                // Deterioration: a red vignette that pulses faster as the patient gets worse.
                RadialGradient(colors: [.clear, Color.red.opacity(0.15 + 0.45 * danger)], center: .center, startRadius: w * 0.2, endRadius: w * 0.9)
                    .opacity(danger > 0.2 ? (pulse ? 1 : 0.4) : 0)
                    .allowsHitTesting(false)
            }
            .frame(width: w, height: h)
            .clipped()
            .contentShape(Rectangle())
            .gesture(DragGesture()
                .onChanged { value in
                    let limit = w * 0.3
                    drag = CGSize(width: max(-limit, min(limit, dragBase.width + value.translation.width)),
                                  height: max(-40, min(40, dragBase.height + value.translation.height)))
                }
                .onEnded { _ in dragBase = drag },
                including: interactive ? .all : .subviews)
        }
        .onAppear {
            if interactive { motion.start() }
            withAnimation(.easeInOut(duration: 0.9).repeatForever(autoreverses: true)) { pulse = true }
        }
        .onDisappear { motion.stop() }
        .accessibilityElement(children: .contain)
    }

    /// `depth` 0 = horizon (barely moves) … 1 = closest (moves the most).
    private func offset(_ pan: CGSize, _ depth: Double) -> CGSize {
        CGSize(width: pan.width * (0.25 + depth), height: pan.height * (0.25 + depth))
    }

    @ViewBuilder
    private func layers(w: CGFloat, h: CGFloat, pan: CGSize) -> some View {
        switch kind {
        case .roadAccident: accident(w: w, h: h, pan: pan)
        case .emergencyRoom: emergencyRoom(w: w, h: h, pan: pan)
        case .clinic: clinic(w: w, h: h, pan: pan)
        }
    }

    // MARK: Road accident at night

    private func accident(w: CGFloat, h: CGFloat, pan: CGSize) -> some View {
        ZStack {
            LinearGradient(colors: [Theme.rgb(0x0B1030), Theme.rgb(0x2A1F5C), Theme.rgb(0x6B4A8E)], startPoint: .top, endPoint: .bottom)
            // Stars and moon (farthest).
            ZStack {
                ForEach(0..<24, id: \.self) { i in
                    Circle().fill(.white.opacity(0.5 + Double(i % 3) * 0.15))
                        .frame(width: CGFloat(1 + i % 3), height: CGFloat(1 + i % 3))
                        .position(x: CGFloat((i * 137) % 100) / 100 * w * 1.6 - w * 0.3, y: CGFloat((i * 59) % 45) / 100 * h)
                }
                Circle().fill(Theme.rgb(0xFFF4D6)).frame(width: 34, height: 34)
                    .shadow(color: Theme.rgb(0xFFF4D6).opacity(0.7), radius: 18)
                    .position(x: w * 0.82, y: h * 0.14)
            }
            .offset(offset(pan, 0))
            // City skyline.
            HStack(alignment: .bottom, spacing: 3) {
                ForEach(0..<18, id: \.self) { i in
                    Rectangle().fill(Theme.rgb(0x1A1440))
                        .frame(width: CGFloat(18 + (i * 7) % 22), height: CGFloat(30 + (i * 23) % 70))
                        .overlay(alignment: .top) {
                            VStack(spacing: 5) {
                                ForEach(0..<2, id: \.self) { _ in Rectangle().fill(Theme.rgb(0xFFD27A).opacity(i % 3 == 0 ? 0.7 : 0.15)).frame(width: 4, height: 4) }
                            }.padding(.top, 8)
                        }
                }
            }
            .frame(width: w * 1.7)
            .position(x: w / 2, y: h * 0.5)
            .offset(offset(pan, 0.15))
            // Road.
            ZStack {
                Rectangle().fill(LinearGradient(colors: [Theme.rgb(0x2B2B38), Theme.rgb(0x15151C)], startPoint: .top, endPoint: .bottom))
                    .frame(width: w * 2, height: h * 0.48)
                HStack(spacing: 36) {
                    ForEach(0..<14, id: \.self) { _ in Capsule().fill(Theme.rgb(0xF2D16B).opacity(0.8)).frame(width: 34, height: 4) }
                }
                .offset(y: -h * 0.04)
            }
            .position(x: w / 2, y: h * 0.8)
            .offset(offset(pan, 0.35))
            // Emergency lights glow.
            HStack(spacing: w * 0.5) {
                Circle().fill(Color.red).frame(width: 90).blur(radius: 40).opacity(pulse ? 0.55 : 0.15)
                Circle().fill(Color.blue).frame(width: 90).blur(radius: 40).opacity(pulse ? 0.15 : 0.55)
            }
            .position(x: w * 0.5, y: h * 0.56)
            .offset(offset(pan, 0.4))
            // Second car and cones.
            ZStack {
                Image(systemName: "car.side.fill").font(.system(size: 64)).foregroundStyle(Theme.rgb(0x8A93A8))
                    .scaleEffect(x: -1).rotationEffect(.degrees(4))
                    .position(x: w * 0.12, y: h * 0.62)
                ForEach(0..<3, id: \.self) { i in
                    Image(systemName: "cone.fill").font(.system(size: 18)).foregroundStyle(Theme.rgb(0xFF8A3D))
                        .position(x: w * (0.36 + CGFloat(i) * 0.08), y: h * 0.7)
                }
            }
            .offset(offset(pan, 0.55))
            // Crashed car with smoke (near).
            ZStack {
                Image(systemName: "cloud.fill").font(.system(size: 70)).foregroundStyle(.gray.opacity(0.55)).blur(radius: 8)
                    .offset(x: 10, y: pulse ? -62 : -50)
                Image(systemName: "car.side.fill").font(.system(size: 96)).foregroundStyle(Theme.rgb(0xC0393B))
                    .rotationEffect(.degrees(-10))
                Image(systemName: "flame.fill").font(.system(size: 22)).foregroundStyle(.orange)
                    .offset(x: 44, y: -12).opacity(pulse ? 1 : 0.5)
            }
            .position(x: w * 0.78, y: h * 0.66)
            .offset(offset(pan, 0.75))
            // Patient (closest, tappable).
            patient(icon: "figure.seated.side", color: .white, size: 54)
                .position(x: w * 0.45, y: h * 0.8)
                .offset(offset(pan, 1))
        }
    }

    // MARK: Emergency department bay

    private func emergencyRoom(w: CGFloat, h: CGFloat, pan: CGSize) -> some View {
        ZStack {
            LinearGradient(colors: [Theme.rgb(0xDCE8F2), Theme.rgb(0xBFD2E2)], startPoint: .top, endPoint: .bottom)
            // Back wall details.
            ZStack {
                RoundedRectangle(cornerRadius: 6).fill(Theme.rgb(0xA9C7E4)).frame(width: w * 0.32, height: h * 0.22)
                    .overlay(RoundedRectangle(cornerRadius: 6).stroke(.white, lineWidth: 4))
                    .position(x: w * 0.2, y: h * 0.25)
                Text("ЯАРАЛТАЙ ТУСЛАМЖ").font(.system(size: 11, weight: .heavy)).foregroundStyle(.white)
                    .padding(.horizontal, 10).padding(.vertical, 5).background(Theme.rgb(0xD64545), in: Capsule())
                    .position(x: w * 0.7, y: h * 0.12)
            }
            .offset(offset(pan, 0.05))
            // Floor.
            Rectangle().fill(Theme.rgb(0x9FB3C4)).frame(width: w * 2, height: h * 0.38).position(x: w / 2, y: h * 0.86)
                .offset(offset(pan, 0.3))
            // Monitor with a live ECG.
            MonitorBox(danger: danger)
                .frame(width: w * 0.3, height: h * 0.22)
                .position(x: w * 0.78, y: h * 0.38)
                .offset(offset(pan, 0.45))
            // IV stand.
            VStack(spacing: 0) {
                Image(systemName: "drop.fill").font(.system(size: 22)).foregroundStyle(Theme.rgb(0x7FB6E8))
                Rectangle().fill(Theme.rgb(0x6B7A89)).frame(width: 3, height: h * 0.35)
            }
            .position(x: w * 0.1, y: h * 0.52)
            .offset(offset(pan, 0.6))
            // Bed with the patient.
            ZStack {
                Image(systemName: "bed.double.fill").font(.system(size: 110)).foregroundStyle(Theme.rgb(0xF5F7FA))
                    .shadow(color: .black.opacity(0.15), radius: 8, y: 6)
                patient(icon: "figure.seated.side", color: Theme.rgb(0x3C5A78), size: 50)
                    .offset(x: -10, y: -34)
            }
            .position(x: w * 0.45, y: h * 0.7)
            .offset(offset(pan, 0.9))
        }
    }

    // MARK: Clinic injection room

    private func clinic(w: CGFloat, h: CGFloat, pan: CGSize) -> some View {
        ZStack {
            LinearGradient(colors: [Theme.rgb(0xF4EEF9), Theme.rgb(0xE3D7F1)], startPoint: .top, endPoint: .bottom)
            ZStack {
                RoundedRectangle(cornerRadius: 8).fill(Theme.rgb(0xCFE6F7)).frame(width: w * 0.36, height: h * 0.26)
                    .overlay(RoundedRectangle(cornerRadius: 8).stroke(.white, lineWidth: 5))
                    .position(x: w * 0.72, y: h * 0.26)
                Image(systemName: "cross.case.fill").font(.system(size: 34)).foregroundStyle(Theme.rgb(0xD64545))
                    .position(x: w * 0.15, y: h * 0.2)
            }
            .offset(offset(pan, 0.05))
            Rectangle().fill(Theme.rgb(0xCDBFDC)).frame(width: w * 2, height: h * 0.36).position(x: w / 2, y: h * 0.87)
                .offset(offset(pan, 0.3))
            // Trolley with the syringe and adrenaline.
            ZStack {
                RoundedRectangle(cornerRadius: 6).fill(.white).frame(width: w * 0.24, height: 10)
                Image(systemName: "syringe.fill").font(.system(size: 28)).foregroundStyle(Theme.rgb(0x6C63C9)).offset(y: -18)
            }
            .position(x: w * 0.82, y: h * 0.62)
            .offset(offset(pan, 0.55))
            ZStack {
                Image(systemName: "chair.fill").font(.system(size: 80)).foregroundStyle(Theme.rgb(0x8C7BB0))
                patient(icon: "figure.seated.side", color: Theme.rgb(0x7A3B5A), size: 58).offset(x: 4, y: -26)
            }
            .position(x: w * 0.42, y: h * 0.7)
            .offset(offset(pan, 0.9))
        }
    }

    /// The patient figure with a pulsing ring that invites a tap.
    private func patient(icon: String, color: Color, size: CGFloat) -> some View {
        Button { onPatientTap?() } label: {
            ZStack {
                if onPatientTap != nil {
                    Circle().stroke(Theme.accent, lineWidth: 2)
                        .frame(width: size * 1.5, height: size * 1.5)
                        .scaleEffect(pulse ? 1.15 : 0.9).opacity(pulse ? 0.2 : 0.9)
                }
                Image(systemName: icon).font(.system(size: size)).foregroundStyle(color)
                    .shadow(color: .black.opacity(0.35), radius: 6, y: 3)
            }
        }
        .buttonStyle(.plain)
        .disabled(onPatientTap == nil)
        .accessibilityLabel("Өвчтөнийг үзэх")
    }
}

/// A small bedside monitor with a moving ECG trace.
struct MonitorBox: View {
    var danger: Double

    var body: some View {
        TimelineView(.animation) { context in
            let t = context.date.timeIntervalSinceReferenceDate
            ZStack {
                RoundedRectangle(cornerRadius: 8).fill(Theme.rgb(0x0E1A24))
                    .overlay(RoundedRectangle(cornerRadius: 8).stroke(Theme.rgb(0x5C6B78), lineWidth: 3))
                ECGLine(phase: t, fast: danger > 0.3)
                    .stroke(danger > 0.5 ? Color.red : Color.green, lineWidth: 2)
                    .padding(8)
            }
        }
    }
}

struct ECGLine: Shape {
    var phase: Double
    var fast: Bool

    func path(in rect: CGRect) -> Path {
        var p = Path()
        let beats = fast ? 4.0 : 2.5
        let steps = 120
        for i in 0...steps {
            let x = rect.minX + rect.width * CGFloat(i) / CGFloat(steps)
            let u = (Double(i) / Double(steps) * beats + phase * (fast ? 1.6 : 1.0)).truncatingRemainder(dividingBy: 1)
            var y = 0.0
            if u > 0.30 && u < 0.34 { y = -0.15 }          // P
            else if u > 0.40 && u < 0.42 { y = 0.2 }       // Q
            else if u >= 0.42 && u < 0.45 { y = -1 }       // R
            else if u >= 0.45 && u < 0.48 { y = 0.35 }     // S
            else if u > 0.6 && u < 0.7 { y = -0.25 }       // T
            let point = CGPoint(x: x, y: rect.midY + CGFloat(y) * rect.height * 0.4)
            if i == 0 { p.move(to: point) } else { p.addLine(to: point) }
        }
        return p
    }
}
