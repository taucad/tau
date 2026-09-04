import AppKit
import ImageIO
import OSLog
import QuickLookThumbnailing

@MainActor
final class ThumbnailProvider: QLThumbnailProvider {
  private let logger = Logger(subsystem: "com.taucad.tau.desktop", category: "QuickLookThumbnail")

  override func provideThumbnail(
    for request: QLFileThumbnailRequest,
    _ handler: @escaping (QLThumbnailReply?, Error?) -> Void
  ) {
    let converter = TauConverter()
    converter.convert(
      request.fileURL,
      options: .thumbnail(size: request.maximumSize, scale: request.scale)
    ) { [self] result in
      switch result {
      case .failure(let error):
        logger.error("\(error.localizedDescription, privacy: .public)")
        handler(nil, error)
      case .success(let previewURL):
        do {
          let data = try Data(contentsOf: previewURL)
          guard
            let source = CGImageSourceCreateWithData(data as CFData, nil),
            let image = CGImageSourceCreateImageAtIndex(source, 0, nil)
          else {
            throw TauQuickLookError.conversion("The converted thumbnail is not a valid PNG image")
          }
          converter.cleanup()
          let reply = QLThumbnailReply(contextSize: request.maximumSize) { context in
            context.draw(image, in: CGRect(origin: .zero, size: request.maximumSize))
            return true
          }
          reply.extensionBadge = request.fileURL.pathExtension.uppercased()
          handler(reply, nil)
        } catch {
          converter.cleanup()
          logger.error("\(error.localizedDescription, privacy: .public)")
          handler(nil, error)
        }
      }
    }
  }
}
