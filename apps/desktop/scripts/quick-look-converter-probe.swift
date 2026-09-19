// Purpose: Exercise TauQuickLookCore's real WKWebView converter without registering a Quick Look extension.
// Why: Unsigned packages need semantic conversion evidence independent of Launch Services and signing.
// Usage: quick-look-converter-probe <input> <target:usdz|png> <output> <mode:convert|cancel>
// Exit codes: 0 on the requested conversion/cancellation outcome; 64 for invalid arguments; 1 otherwise.

import AppKit
import Foundation

@main
struct QuickLookConverterProbe {
  static func main() {
    guard CommandLine.arguments.count == 5 else {
      fputs(
        "usage: quick-look-converter-probe <input> <target:usdz|png> <output> <mode:convert|cancel>\n",
        stderr)
      exit(64)
    }

    let source = URL(fileURLWithPath: CommandLine.arguments[1])
    let target = CommandLine.arguments[2]
    let output = URL(fileURLWithPath: CommandLine.arguments[3])
    let mode = CommandLine.arguments[4]
    guard target == "usdz" || target == "png", mode == "convert" || mode == "cancel" else {
      fputs("invalid target or mode\n", stderr)
      exit(64)
    }

    NSApplication.shared.setActivationPolicy(.accessory)
    let converter = TauConverter()
    var result: Result<URL, Error>?
    let options =
      target == "usdz"
      ? ConversionOptions.preview
      : ConversionOptions.thumbnail(size: CGSize(width: 128, height: 128), scale: 1)
    converter.convert(source, options: options) { conversion in result = conversion }
    if mode == "cancel" {
      DispatchQueue.main.asyncAfter(deadline: .now() + .milliseconds(1)) { converter.cancel() }
    }

    let deadline = Date().addingTimeInterval(45)
    while result == nil && Date() < deadline {
      RunLoop.current.run(mode: .default, before: Date().addingTimeInterval(0.05))
    }
    guard let result else {
      converter.cancel()
      fputs("conversion timed out\n", stderr)
      exit(1)
    }
    switch result {
    case .success(let converted):
      guard mode == "convert" else {
        converter.cleanup()
        fputs("cancelled conversion unexpectedly succeeded\n", stderr)
        exit(1)
      }
      do {
        try FileManager.default.copyItem(at: converted, to: output)
        converter.cleanup()
      } catch {
        converter.cleanup()
        fputs("\(error.localizedDescription)\n", stderr)
        exit(1)
      }
    case .failure(let error):
      converter.cleanup()
      if mode != "cancel" {
        fputs("\(error.localizedDescription)\n", stderr)
        exit(1)
      }
      guard let quickLookError = error as? TauQuickLookError, case .cancelled = quickLookError
      else {
        fputs("cancellation returned an unexpected error: \(error.localizedDescription)\n", stderr)
        exit(1)
      }
    }
  }
}
