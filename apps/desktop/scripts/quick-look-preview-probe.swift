import AppKit
import QuickLookUI

guard CommandLine.arguments.count == 2 else {
  fputs("usage: quick-look-preview-probe <input>\n", stderr)
  exit(64)
}

let source = URL(fileURLWithPath: CommandLine.arguments[1])
let frame = NSRect(x: 0, y: 0, width: 900, height: 700)
guard let preview = QLPreviewView(frame: frame, style: .normal) else {
  fputs("Quick Look could not create a preview view\n", stderr)
  exit(1)
}

NSApplication.shared.setActivationPolicy(.accessory)
let window = NSWindow(
  contentRect: frame,
  styleMask: [.titled, .closable],
  backing: .buffered,
  defer: false
)
window.contentView = preview
window.center()
window.orderFrontRegardless()
preview.previewItem = source as QLPreviewItem

let deadline = Date().addingTimeInterval(10)
while Date() < deadline {
  RunLoop.current.run(mode: .default, before: Date().addingTimeInterval(0.05))
}

guard window.isVisible, preview.previewItem != nil else {
  fputs("Quick Look did not keep the preview hosted\n", stderr)
  exit(1)
}
window.close()
