import AppKit
import OSLog
@preconcurrency import QuickLookUI

@MainActor
final class PreviewViewController: NSViewController, @preconcurrency QLPreviewingController {
  private let logger = Logger(subsystem: "com.taucad.tau.desktop", category: "QuickLookPreview")
  private let canvas = ModelCanvas(frame: .zero)
  private var converter: TauConverter?

  override func loadView() {
    view = canvas
    preferredContentSize = NSSize(width: 900, height: 700)
  }

  func preparePreviewOfFile(at url: URL, completionHandler handler: @escaping (Error?) -> Void) {
    converter?.cancel()
    let converter = TauConverter()
    self.converter = converter
    converter.convert(url) { [weak self] result in
      guard let self else { return }
      switch result {
      case .failure(let error):
        logger.error("\(error.localizedDescription, privacy: .public)")
        handler(error)
      case .success(let previewURL):
        canvas.load(previewURL) { error in
          converter.cleanup()
          self.converter = nil
          if let error {
            self.logger.error("\(error.localizedDescription, privacy: .public)")
          } else {
            self.logger.notice("Interactive preview ready")
          }
          handler(error)
        }
      }
    }
  }

  deinit {
    let activeConverter = converter
    Task { @MainActor in activeConverter?.cancel() }
  }
}
