import SceneKit
import SpriteKit
import SwiftUI

// «Блок ертөнц»: a small walkable 3D world in an original blocky style (built from
// boxes only, no outside art). The learner walks a medic with the joystick, looks
// around by dragging, and examines the patient when close. Two places:
// the crash site at night and the hospital emergency room.

enum BlockLocation: Equatable { case road, hospital }

/// Joystick and camera input, written by SwiftUI and read every frame by SceneKit.
final class WorldInput {
    var move = SIMD2<Float>(0, 0)   // x: right, y: forward (-1…1)
    var yaw: Float = 0.35           // camera angle around the player
}

/// State the overlay needs: is the medic close enough to examine the patient?
final class BlockWorldModel: ObservableObject {
    @Published var nearPatient = false
    let input = WorldInput()
}

struct BlockWorldView: View {
    let location: BlockLocation
    var danger: Double = 0
    /// Called when the medic examines the patient (button or tap on the patient).
    var onExamine: () -> Void

    @StateObject private var model = BlockWorldModel()
    @State private var stick = CGSize.zero
    @State private var lookStart: Float?

    var body: some View {
        ZStack {
            BlockSceneHost(location: location, danger: danger, model: model, onExamine: onExamine)
                .gesture(
                    DragGesture(minimumDistance: 4)
                        .onChanged { g in
                            if lookStart == nil { lookStart = model.input.yaw }
                            model.input.yaw = (lookStart ?? 0) - Float(g.translation.width) * 0.008
                        }
                        .onEnded { _ in lookStart = nil }
                )

            VStack {
                Spacer()
                HStack(alignment: .bottom) {
                    joystick
                    Spacer()
                    if model.nearPatient {
                        Button(action: onExamine) {
                            Label("Үзлэг хийх", systemImage: "stethoscope")
                                .font(.headline)
                                .foregroundStyle(.white)
                                .padding(.horizontal, 18).padding(.vertical, 14)
                                .background(Theme.accentGradient, in: Capsule())
                                .shadow(color: Theme.accent.opacity(0.5), radius: 10)
                        }
                        .transition(.scale.combined(with: .opacity))
                    } else {
                        Label(location == .road ? "Өвчтөн рүү алх" : "Орон руу алх", systemImage: "figure.walk")
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(.white)
                            .padding(.horizontal, 12).padding(.vertical, 8)
                            .background(.black.opacity(0.45), in: Capsule())
                    }
                }
                .padding(.horizontal, 18)
                .padding(.bottom, 14)
            }
            .animation(.snappy, value: model.nearPatient)
        }
        .sensoryFeedback(.impact(weight: .light), trigger: model.nearPatient)
    }

    /// Virtual thumb stick: the knob follows the finger inside a 120 pt ring.
    private var joystick: some View {
        let radius: CGFloat = 46
        return ZStack {
            Circle().fill(.black.opacity(0.32)).overlay(Circle().stroke(.white.opacity(0.5), lineWidth: 1.5))
                .frame(width: radius * 2 + 24, height: radius * 2 + 24)
            Circle().fill(.white.opacity(0.9)).frame(width: 52, height: 52)
                .shadow(radius: 4)
                .offset(stick)
        }
        .contentShape(Circle())
        .highPriorityGesture(
            DragGesture(minimumDistance: 0)
                .onChanged { g in
                    var v = g.translation
                    let len = sqrt(v.width * v.width + v.height * v.height)
                    if len > radius { v = CGSize(width: v.width / len * radius, height: v.height / len * radius) }
                    stick = v
                    model.input.move = SIMD2(Float(v.width / radius), Float(-v.height / radius))
                }
                .onEnded { _ in
                    withAnimation(.spring(duration: 0.25)) { stick = .zero }
                    model.input.move = .zero
                }
        )
        .accessibilityLabel("Алхах джойстик")
    }
}

// MARK: - SceneKit host

private struct BlockSceneHost: UIViewRepresentable {
    let location: BlockLocation
    let danger: Double
    let model: BlockWorldModel
    let onExamine: () -> Void

    func makeCoordinator() -> BlockWorldEngine { BlockWorldEngine(model: model) }

    func makeUIView(context: Context) -> SCNView {
        let view = SCNView()
        view.backgroundColor = .black
        view.antialiasingMode = .multisampling2X
        view.preferredFramesPerSecond = 60
        view.isPlaying = true
        view.rendersContinuously = true
        view.delegate = context.coordinator
        context.coordinator.onExamine = onExamine
        context.coordinator.load(location, in: view, animated: false)
        let tap = UITapGestureRecognizer(target: context.coordinator, action: #selector(BlockWorldEngine.tapped(_:)))
        view.addGestureRecognizer(tap)
        return view
    }

    func updateUIView(_ view: SCNView, context: Context) {
        context.coordinator.onExamine = onExamine
        if context.coordinator.location != location { context.coordinator.load(location, in: view, animated: true) }
        context.coordinator.setDanger(danger)
    }
}

// MARK: - Engine

final class BlockWorldEngine: NSObject, SCNSceneRendererDelegate {
    private let model: BlockWorldModel
    var onExamine: (() -> Void)?
    private(set) var location: BlockLocation?

    private var player = SCNNode()
    private var legs: [SCNNode] = []
    private var camera = SCNNode()
    private var patient = SCNNode()
    private var marker = SCNNode()
    private var alarm = SCNNode()
    private var monitorScreen: SCNMaterial?
    private var obstacles: [(x: Float, z: Float, r: Float)] = []
    private var bounds: (minX: Float, maxX: Float, minZ: Float, maxZ: Float) = (-20, 20, -10, 10)
    private var examineDistance: Float = 2.4
    private var lastTime: TimeInterval = 0
    private var near = false
    private var heading: Float = 0
    private var markerBase: Float = 2.55

    init(model: BlockWorldModel) { self.model = model }

    func load(_ location: BlockLocation, in view: SCNView, animated: Bool) {
        self.location = location
        let scene = SCNScene()
        obstacles = []
        legs = []
        switch location {
        case .road: buildRoad(scene)
        case .hospital: buildHospital(scene)
        }
        scene.rootNode.addChildNode(camera)
        if animated {
            view.present(scene, with: .fade(with: .black, duration: 1.2), incomingPointOfView: camera, completionHandler: nil)
        } else {
            view.scene = scene
        }
        view.pointOfView = camera
        near = false
        DispatchQueue.main.async { self.model.nearPatient = false }
    }

    func setDanger(_ danger: Double) {
        alarm.light?.intensity = CGFloat(danger) * 900
        monitorScreen?.emission.contents = danger > 0.5 ? UIColor(red: 1, green: 0.25, blue: 0.3, alpha: 1) : UIColor(red: 0.2, green: 1, blue: 0.5, alpha: 1)
    }

    @objc func tapped(_ g: UITapGestureRecognizer) {
        guard let view = g.view as? SCNView else { return }
        let hits = view.hitTest(g.location(in: view), options: [.searchMode: SCNHitTestSearchMode.all.rawValue])
        let onPatient = hits.contains { hit in
            var n: SCNNode? = hit.node
            while let node = n { if node === patient { return true }; n = node.parent }
            return false
        }
        if onPatient && near { onExamine?() }
    }

    // MARK: Frame loop

    func renderer(_ renderer: SCNSceneRenderer, updateAtTime time: TimeInterval) {
        let dt = Float(lastTime == 0 ? 0 : min(0.05, time - lastTime))
        lastTime = time
        let input = model.input
        let yaw = input.yaw

        // Move relative to where the camera looks.
        let fwd = SIMD2<Float>(-sin(yaw), -cos(yaw))
        let right = SIMD2<Float>(cos(yaw), -sin(yaw))
        let dir = right * input.move.x + fwd * input.move.y
        let speed: Float = 4.2
        var p = SIMD2<Float>(player.simdPosition.x, player.simdPosition.z)
        let moving = simd_length(dir) > 0.08
        if moving {
            p += dir * speed * dt
            for o in obstacles {
                let d = p - SIMD2(o.x, o.z)
                let len = simd_length(d)
                if len < o.r && len > 0.0001 { p = SIMD2(o.x, o.z) + d / len * o.r }
            }
            p.x = min(max(p.x, bounds.minX), bounds.maxX)
            p.y = min(max(p.y, bounds.minZ), bounds.maxZ)
            heading = atan2(-dir.x, -dir.y)
        }
        player.simdPosition = SIMD3(p.x, 0, p.y)
        player.simdEulerAngles.y = heading

        // Walk cycle.
        let swing = moving ? sin(Float(time) * 11) * 0.7 : 0
        if legs.count == 2 {
            legs[0].simdEulerAngles.x = swing
            legs[1].simdEulerAngles.x = -swing
        }

        // Third-person camera behind and above the medic.
        let target = SIMD3(p.x, 1.3, p.y)
        let offset = SIMD3<Float>(sin(yaw) * 6.4, 3.4, cos(yaw) * 6.4)
        let want = target + offset
        camera.simdPosition = camera.simdPosition + (want - camera.simdPosition) * min(1, dt * 8)
        camera.simdLook(at: target)

        // Patient marker bobs; proximity check.
        marker.simdPosition.y = markerBase + sin(Float(time) * 3) * 0.12
        let pp = SIMD2(patient.simdWorldPosition.x, patient.simdWorldPosition.z)
        let isNear = simd_distance(pp, p) < examineDistance
        if isNear != near {
            near = isNear
            marker.isHidden = isNear
            DispatchQueue.main.async { self.model.nearPatient = isNear }
        }
    }

    // MARK: Builders

    private func mat(_ hex: UInt32, emissive: Bool = false) -> SCNMaterial {
        let m = SCNMaterial()
        let c = UIColor(hex: hex)
        m.diffuse.contents = c
        m.lightingModel = .lambert
        if emissive { m.emission.contents = c }
        return m
    }

    /// A box whose bottom sits at `y`.
    @discardableResult
    private func block(_ parent: SCNNode, _ x: Float, _ y: Float, _ z: Float, _ w: CGFloat, _ h: CGFloat, _ l: CGFloat, _ hex: UInt32, emissive: Bool = false) -> SCNNode {
        let g = SCNBox(width: w, height: h, length: l, chamferRadius: 0)
        g.materials = [mat(hex, emissive: emissive)]
        let n = SCNNode(geometry: g)
        n.simdPosition = SIMD3(x, y + Float(h) / 2, z)
        parent.addChildNode(n)
        return n
    }

    /// A blocky person. `pose`: standing, sitting or lying.
    private enum Pose { case standing, sitting, lying }
    private func person(skin: UInt32, shirt: UInt32, pants: UInt32, pose: Pose, vest: Bool = false, keepLegs: Bool = false) -> SCNNode {
        let root = SCNNode()
        let body = SCNNode()
        root.addChildNode(body)
        let legL = SCNNode(), legR = SCNNode()
        legL.simdPosition = SIMD3(-0.18, 0.9, 0)
        legR.simdPosition = SIMD3(0.18, 0.9, 0)
        block(legL, 0, -0.9, 0, 0.3, 0.9, 0.32, pants)
        block(legR, 0, -0.9, 0, 0.3, 0.9, 0.32, pants)
        body.addChildNode(legL); body.addChildNode(legR)
        block(body, 0, 0.9, 0, 0.72, 0.85, 0.4, shirt)
        if vest { block(body, 0, 1.25, 0, 0.74, 0.1, 0.42, 0xF2D35B, emissive: true) }
        block(body, -0.48, 1.0, 0, 0.22, 0.75, 0.26, shirt)
        block(body, 0.48, 1.0, 0, 0.22, 0.75, 0.26, shirt)
        block(body, 0, 1.75, 0, 0.5, 0.5, 0.5, skin)
        block(body, 0, 2.2, 0, 0.52, 0.12, 0.52, 0x3B2A20)   // hair
        switch pose {
        case .standing: break
        case .sitting:
            legL.simdEulerAngles.x = -.pi / 2; legR.simdEulerAngles.x = -.pi / 2
            body.simdPosition.y = -0.55
        case .lying:
            body.simdEulerAngles.x = -.pi / 2
            body.simdPosition = SIMD3(0, 0.25, 1.0)
        }
        if keepLegs { legs = [legL, legR] }
        return root
    }

    private func lights(_ scene: SCNScene, ambient: UInt32, ambientIntensity: CGFloat, sun: UInt32, sunIntensity: CGFloat) {
        let a = SCNNode(); a.light = SCNLight(); a.light!.type = .ambient
        a.light!.color = UIColor(hex: ambient); a.light!.intensity = ambientIntensity
        scene.rootNode.addChildNode(a)
        let d = SCNNode(); d.light = SCNLight(); d.light!.type = .directional
        d.light!.color = UIColor(hex: sun); d.light!.intensity = sunIntensity
        d.light!.castsShadow = true; d.light!.shadowMode = .deferred; d.light!.shadowColor = UIColor.black.withAlphaComponent(0.45)
        d.simdEulerAngles = SIMD3(-0.9, 0.6, 0)
        scene.rootNode.addChildNode(d)
    }

    private func addPlayer(_ scene: SCNScene, at x: Float, _ z: Float, facing: Float) {
        player = person(skin: 0xE7B98F, shirt: 0x2E8B57, pants: 0x1F3B2D, pose: .standing, vest: true, keepLegs: true)
        player.simdPosition = SIMD3(x, 0, z)
        heading = facing
        scene.rootNode.addChildNode(player)
        camera = SCNNode()
        camera.camera = SCNCamera()
        camera.camera!.fieldOfView = 62
        camera.camera!.zFar = 200
        camera.camera!.wantsHDR = true
        camera.camera!.bloomIntensity = 0.6
        camera.simdPosition = SIMD3(x + 4, 4, z + 6)
    }

    private func addMarker(above node: SCNNode) {
        marker = SCNNode()
        block(marker, 0, 0, 0, 0.5, 0.16, 0.16, 0xFF3B5C, emissive: true)
        block(marker, 0, -0.17, 0, 0.16, 0.5, 0.16, 0xFF3B5C, emissive: true)
        marker.runAction(.repeatForever(.rotateBy(x: 0, y: .pi * 2, z: 0, duration: 2.5)))
        node.addChildNode(marker)
    }

    private func car(_ parent: SCNNode, x: Float, z: Float, angle: Float, color: UInt32, crashed: Bool) {
        let c = SCNNode()
        block(c, 0, 0.35, 0, 4.0, 0.8, 1.9, color)
        block(c, -0.2, 1.15, 0, 2.2, 0.7, 1.75, 0x9FC3E0)          // glass cabin
        block(c, -0.2, 1.85, 0, 2.2, 0.1, 1.75, color)
        for (wx, wz) in [(-1.3, 0.85), (1.3, 0.85), (-1.3, -0.85), (1.3, -0.85)] as [(Float, Float)] {
            block(c, wx, 0, wz, 0.75, 0.75, 0.3, 0x15151A)
        }
        block(c, 2.02, 0.65, 0.6, 0.06, 0.22, 0.4, 0xFFF3B0, emissive: true)
        block(c, 2.02, 0.65, -0.6, 0.06, 0.22, 0.4, 0xFFF3B0, emissive: true)
        if crashed {
            // Crumpled front + smoke.
            block(c, 1.7, 0.9, 0.2, 0.7, 0.45, 1.4, 0x6E6E78)
            let smoke = SCNParticleSystem()
            smoke.birthRate = 30
            smoke.particleLifeSpan = 2.2
            smoke.particleSize = 0.35
            smoke.particleColor = UIColor(white: 0.75, alpha: 0.35)
            smoke.emittingDirection = SCNVector3(0, 1, 0)
            smoke.spreadingAngle = 25
            smoke.particleVelocity = 0.9
            smoke.blendMode = .alpha
            let emitter = SCNNode(); emitter.simdPosition = SIMD3(1.8, 1.3, 0)
            emitter.addParticleSystem(smoke)
            c.addChildNode(emitter)
        }
        c.simdPosition = SIMD3(x, 0, z)
        c.simdEulerAngles.y = angle
        parent.addChildNode(c)
        obstacles.append((x, z, 2.3))
    }

    private func blinking(_ node: SCNNode, color: UInt32, delay: TimeInterval) {
        let l = SCNLight(); l.type = .omni; l.color = UIColor(hex: color); l.intensity = 0; l.attenuationEndDistance = 14
        node.light = l
        let on = SCNAction.customAction(duration: 0.25) { n, _ in n.light?.intensity = 1600 }
        let off = SCNAction.customAction(duration: 0.25) { n, _ in n.light?.intensity = 0 }
        node.runAction(.sequence([.wait(duration: delay), .repeatForever(.sequence([on, off]))]))
    }

    // Crash site at night: road, two cars, ambulance with beacons, street lights, the patient on the kerb.
    private func buildRoad(_ scene: SCNScene) {
        let root = scene.rootNode
        scene.background.contents = UIColor(hex: 0x0D1230)
        scene.fogStartDistance = 18; scene.fogEndDistance = 45; scene.fogColor = UIColor(hex: 0x0D1230)
        lights(scene, ambient: 0x5560A0, ambientIntensity: 380, sun: 0x9FB4FF, sunIntensity: 420)
        bounds = (-22, 22, -11, 11)
        examineDistance = 2.4

        block(root, 0, -1, 0, 70, 1, 50, 0x23462E)                    // grass
        block(root, 0, -0.02, 0, 70, 0.04, 8, 0x34343E)              // road
        block(root, 0, -0.02, 4.6, 70, 0.18, 1.2, 0x8C8C96)          // kerbs
        block(root, 0, -0.02, -4.6, 70, 0.18, 1.2, 0x8C8C96)
        var dash: Float = -32
        while dash < 33 { block(root, dash, 0, 0, 2, 0.03, 0.22, 0xF2D35B); dash += 4 }

        car(root, x: 1.5, z: -0.8, angle: 0.45, color: 0xC8323C, crashed: true)
        car(root, x: 5.4, z: 1.0, angle: -1.1, color: 0x2F6FD0, crashed: false)
        for (gx, gz) in [(3.2, -0.2), (3.6, 0.5), (2.9, 0.9), (4.0, -0.6), (3.4, 1.3)] as [(Float, Float)] {
            block(root, gx, 0, gz, 0.18, 0.05, 0.12, 0xBFE6FF)        // glass shards
        }
        for cx in [-3.0, -1.5, 8.5] as [Float] {                    // cones
            block(root, cx, 0, 2.6, 0.45, 0.25, 0.45, 0xFF7A1A)
            block(root, cx, 0.25, 2.6, 0.28, 0.45, 0.28, 0xFF7A1A)
            block(root, cx, 0.4, 2.6, 0.3, 0.1, 0.3, 0xFFFFFF, emissive: true)
        }

        // Ambulance.
        let amb = SCNNode()
        block(amb, 0, 0.4, 0, 5.2, 2.2, 2.3, 0xF4F4F8)
        block(amb, 2.95, 0.4, 0, 0.7, 1.5, 2.2, 0xF4F4F8)
        block(amb, 3.0, 1.1, 0, 0.62, 0.6, 2.1, 0x9FC3E0)
        block(amb, 0, 1.2, 1.16, 5.2, 0.28, 0.02, 0xD3202F)
        block(amb, 0, 1.2, -1.16, 5.2, 0.28, 0.02, 0xD3202F)
        block(amb, -0.3, 1.7, 1.17, 0.7, 0.18, 0.02, 0xD3202F); block(amb, -0.3, 1.46, 1.17, 0.18, 0.66, 0.02, 0xD3202F)
        for (wx, wz) in [(-1.7, 1.05), (1.9, 1.05), (-1.7, -1.05), (1.9, -1.05)] as [(Float, Float)] { block(amb, wx, 0, wz, 0.8, 0.8, 0.3, 0x15151A) }
        let red = block(amb, 0.8, 2.6, 0.6, 0.5, 0.25, 0.5, 0xFF2D3D, emissive: true)
        let blue = block(amb, 0.8, 2.6, -0.6, 0.5, 0.25, 0.5, 0x2D7BFF, emissive: true)
        blinking(red, color: 0xFF2D3D, delay: 0)
        blinking(blue, color: 0x2D7BFF, delay: 0.25)
        amb.simdPosition = SIMD3(-8.5, 0, 2.2)
        root.addChildNode(amb)
        obstacles.append((-8.5, 2.2, 3.0)); obstacles.append((-6.5, 2.2, 2.0)); obstacles.append((-10.5, 2.2, 2.0))

        // Street lights and trees along the far side.
        var sx: Float = -20
        while sx <= 20 {
            block(root, sx, 0, -6, 0.22, 5, 0.22, 0x6B6B74)
            block(root, sx, 5, -5.4, 0.25, 0.2, 1.4, 0x6B6B74)
            let head = block(root, sx, 4.8, -4.9, 0.6, 0.18, 0.5, 0xFFE2A8, emissive: true)
            let spot = SCNLight(); spot.type = .spot; spot.color = UIColor(hex: 0xFFD9A0); spot.intensity = 900
            spot.spotOuterAngle = 75; spot.attenuationEndDistance = 12
            head.light = spot; head.simdEulerAngles.x = -.pi / 2
            sx += 10
        }
        for tx in stride(from: Float(-24), through: 24, by: 6) {
            for tz in [Float(-9), 9] {
                let ox = tx + (tz > 0 ? 3 : 0)
                block(root, ox, 0, tz, 0.6, 2.2, 0.6, 0x5A3B24)
                block(root, ox, 2.2, tz, 2.4, 2.0, 2.4, 0x2C6B3A)
                block(root, ox, 4.2, tz, 1.4, 0.9, 1.4, 0x347D44)
            }
        }

        // The patient sits on the kerb, holding his chest.
        patient = person(skin: 0xD9A47A, shirt: 0xEDEDED, pants: 0x34558C, pose: .sitting)
        patient.simdPosition = SIMD3(0.8, 0.4, -4.4)
        patient.simdEulerAngles.y = 0.2
        root.addChildNode(patient)
        addMarker(above: patient)
        markerBase = 2.55
        obstacles.append((0.8, -4.4, 0.9))

        alarm = SCNNode(); alarm.light = SCNLight(); alarm.light!.type = .omni
        alarm.light!.color = UIColor.red; alarm.light!.intensity = 0; alarm.light!.attenuationEndDistance = 6
        alarm.simdPosition = SIMD3(0.8, 2.2, -3.6)
        root.addChildNode(alarm)
        monitorScreen = nil

        addPlayer(scene, at: -6, 0.5, facing: -1.1)
        model.input.yaw = -0.5
    }

    // Hospital emergency room: tiled floor, bed with the patient, monitor, IV pole, a nurse.
    private func buildHospital(_ scene: SCNScene) {
        let root = scene.rootNode
        scene.background.contents = UIColor(hex: 0xDCE6F5)
        lights(scene, ambient: 0xFFFFFF, ambientIntensity: 520, sun: 0xFFFFFF, sunIntensity: 650)
        bounds = (-7, 7, -6, 7)
        examineDistance = 2.8

        for ix in -4..<4 {
            for iz in -4..<4 {
                block(root, Float(ix) * 2 + 1, -0.2, Float(iz) * 2 + 1, 2, 0.2, 2, (ix + iz) % 2 == 0 ? 0xE8EEF7 : 0xD2DCEB)
            }
        }
        block(root, 0, 0, -8, 16, 4, 0.4, 0xC9D7EE)               // back wall
        block(root, -8, 0, 0, 0.4, 4, 16, 0xBFD0EA)               // side walls
        block(root, 8, 0, 0, 0.4, 4, 16, 0xBFD0EA)
        block(root, 0, 1.6, -7.75, 6, 1.4, 0.1, 0x9FC3E0, emissive: true)   // window
        block(root, -5.5, 0, -7.2, 2.6, 0.3, 1, 0x7CC2B5)          // green stripe bench
        for lx in [-3.0, 3.0] as [Float] {
            let lamp = block(root, lx, 3.9, -1, 2, 0.1, 0.6, 0xFFFFFF, emissive: true)
            let l = SCNLight(); l.type = .omni; l.intensity = 700; l.attenuationEndDistance = 10
            lamp.light = l
        }

        // Bed.
        block(root, 0, 0, -3, 2.2, 0.6, 4.2, 0xB7C4D8)
        block(root, 0, 0.6, -3, 2.0, 0.25, 4.0, 0xEAF2FF)
        block(root, 0, 0.85, -4.6, 1.2, 0.2, 0.7, 0xFFFFFF)          // pillow
        obstacles.append((0, -3, 2.0)); obstacles.append((0, -4.5, 1.4)); obstacles.append((0, -1.5, 1.4))

        patient = person(skin: 0xD9A47A, shirt: 0x9EC6E8, pants: 0x9EC6E8, pose: .lying)
        patient.simdPosition = SIMD3(0, 0.85, -3.4)
        root.addChildNode(patient)
        addMarker(above: patient)
        markerBase = 1.5

        // Monitor with a screen that turns red when the patient is in danger.
        block(root, 1.9, 0, -4.3, 0.15, 1.6, 0.15, 0x8C8C96)
        let mon = block(root, 1.9, 1.6, -4.3, 1.1, 0.8, 0.25, 0x1E2230)
        let screen = SCNBox(width: 0.9, height: 0.6, length: 0.02, chamferRadius: 0)
        let sm = mat(0x33FF88, emissive: true); screen.materials = [sm]; monitorScreen = sm
        let sn = SCNNode(geometry: screen); sn.simdPosition = SIMD3(0, 0, 0.14); mon.addChildNode(sn)
        obstacles.append((1.9, -4.3, 0.6))

        block(root, -1.6, 0, -4.4, 0.08, 2.2, 0.08, 0x8C8C96)       // IV pole
        block(root, -1.6, 1.9, -4.4, 0.3, 0.45, 0.12, 0xE8F6FF)
        obstacles.append((-1.6, -4.4, 0.5))

        block(root, 5.5, 0, -6.8, 2.4, 1.8, 1, 0xF4F4F8)             // cabinet
        block(root, 5.5, 1.0, -6.28, 0.3, 0.3, 0.02, 0xD3202F)
        obstacles.append((5.5, -6.8, 1.4))

        let nurse = person(skin: 0xE7B98F, shirt: 0x5AA9E6, pants: 0x5AA9E6, pose: .standing)
        nurse.simdPosition = SIMD3(-3.2, 0, -4.8)
        nurse.simdEulerAngles.y = 0.9
        root.addChildNode(nurse)
        obstacles.append((-3.2, -4.8, 0.8))

        alarm = SCNNode(); alarm.light = SCNLight(); alarm.light!.type = .omni
        alarm.light!.color = UIColor.red; alarm.light!.intensity = 0; alarm.light!.attenuationEndDistance = 6
        alarm.simdPosition = SIMD3(0, 3, -3)
        root.addChildNode(alarm)

        addPlayer(scene, at: 0, 5.5, facing: 0)
        model.input.yaw = 0.25
    }
}
