import AppKit
import Combine
import RealityKit

@MainActor
final class ModelCanvas: NSView {
  private let arView: ARView
  private let camera = PerspectiveCamera()
  private var load: AnyCancellable?
  private var target = SIMD3<Float>.zero
  private var distance: Float = 1
  private var yaw: Float = 0.6
  private var pitch: Float = 0.45

  override var acceptsFirstResponder: Bool { true }

  override init(frame frameRect: NSRect) {
    arView = ARView(frame: frameRect)
    super.init(frame: frameRect)
    wantsLayer = true
    setAccessibilityElement(true)
    setAccessibilityRole(.group)
    setAccessibilityLabel("3D model preview")
    arView.environment.background = .color(NSColor.windowBackgroundColor)
    arView.autoresizingMask = [.width, .height]
    addSubview(arView)
    arView.addGestureRecognizer(NSPanGestureRecognizer(target: self, action: #selector(orbit(_:))))
    arView.addGestureRecognizer(NSMagnificationGestureRecognizer(target: self, action: #selector(zoom(_:))))
  }

  required init?(coder: NSCoder) { nil }

  func load(_ url: URL, completion: @escaping (Error?) -> Void) {
    load?.cancel()
    load = Entity.loadAsync(contentsOf: url).sink(
      receiveCompletion: { result in
        if case .failure(let error) = result { completion(error) }
      },
      receiveValue: { [weak self] entity in
        guard let self else { return }
        arView.scene.anchors.removeAll()
        let modelAnchor = AnchorEntity(world: .zero)
        modelAnchor.addChild(entity)
        arView.scene.anchors.append(modelAnchor)

        let bounds = entity.visualBounds(relativeTo: nil)
        let center = (bounds.min + bounds.max) * 0.5
        let diagonal = simd_length(bounds.max - bounds.min)
        guard center.x.isFinite, center.y.isFinite, center.z.isFinite, diagonal.isFinite, diagonal > .ulpOfOne else {
          completion(TauQuickLookError.invalidInput("The converted model has no finite visible bounds"))
          return
        }
        target = center
        distance = min(max(diagonal * 1.35, 0.1), 1_000_000)
        camera.camera = PerspectiveCameraComponent(near: max(distance / 10_000, 0.001), far: distance * 100)
        let cameraAnchor = AnchorEntity(world: .zero)
        cameraAnchor.addChild(camera)
        arView.scene.anchors.append(cameraAnchor)
        updateCamera()
        completion(nil)
      }
    )
  }

  func snapshot(completion: @escaping (NSImage?) -> Void) {
    layoutSubtreeIfNeeded()
    arView.snapshot(saveToHDR: false, completion: completion)
  }

  @objc private func orbit(_ gesture: NSPanGestureRecognizer) {
    guard gesture.state == .changed else { return }
    let translation = gesture.translation(in: arView)
    if NSEvent.modifierFlags.contains(.shift) {
      pan(x: Float(translation.x), y: Float(translation.y))
      gesture.setTranslation(.zero, in: arView)
      return
    }
    yaw -= Float(translation.x) * 0.008
    pitch = min(max(pitch - Float(translation.y) * 0.008, -1.45), 1.45)
    gesture.setTranslation(.zero, in: arView)
    updateCamera()
  }

  override func keyDown(with event: NSEvent) {
    switch event.keyCode {
    case 123: yaw += 0.08
    case 124: yaw -= 0.08
    case 125: pitch = max(pitch - 0.08, -1.45)
    case 126: pitch = min(pitch + 0.08, 1.45)
    case 24, 69: distance = max(distance * 0.9, 0.001)
    case 27, 78: distance = min(distance * 1.1, 1_000_000)
    default:
      super.keyDown(with: event)
      return
    }
    updateCamera()
  }

  @objc private func zoom(_ gesture: NSMagnificationGestureRecognizer) {
    guard gesture.state == .changed else { return }
    distance = min(max(distance * Float(1 - gesture.magnification), 0.001), 1_000_000)
    gesture.magnification = 0
    updateCamera()
  }

  private func updateCamera() {
    let horizontal = cos(pitch)
    let direction = SIMD3<Float>(horizontal * sin(yaw), sin(pitch), horizontal * cos(yaw))
    camera.look(at: target, from: target + direction * distance, relativeTo: nil)
  }

  private func pan(x: Float, y: Float) {
    let direction = simd_normalize(camera.position(relativeTo: nil) - target)
    let right = simd_normalize(simd_cross(SIMD3<Float>(0, 1, 0), direction))
    let up = simd_normalize(simd_cross(direction, right))
    target += (right * -x + up * y) * distance * 0.002
    updateCamera()
  }
}
