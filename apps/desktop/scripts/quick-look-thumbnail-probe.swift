import AppKit
import QuickLookThumbnailing

guard CommandLine.arguments.count == 5 || CommandLine.arguments.count == 6 else {
  fputs("usage: quick-look-thumbnail-probe <input> <output.png> <size> <scale> [cancel-after-ms]\n", stderr)
  exit(64)
}

let source = URL(fileURLWithPath: CommandLine.arguments[1])
let output = URL(fileURLWithPath: CommandLine.arguments[2])
guard
  let size = Double(CommandLine.arguments[3]),
  let scale = Double(CommandLine.arguments[4]),
  size > 0,
  scale > 0
else {
  fputs("size and scale must be positive numbers\n", stderr)
  exit(64)
}

let request = QLThumbnailGenerator.Request(
  fileAt: source,
  size: NSSize(width: size, height: size),
  scale: scale,
  representationTypes: .thumbnail
)
var result: Result<Data, Error>?
let cancellationDelay = CommandLine.arguments.count == 6 ? Double(CommandLine.arguments[5]) : nil
if CommandLine.arguments.count == 6 && (cancellationDelay == nil || cancellationDelay! < 0) {
  fputs("cancel-after-ms must be a non-negative number\n", stderr)
  exit(64)
}
QLThumbnailGenerator.shared.generateBestRepresentation(for: request) { representation, error in
  if let error {
    result = .failure(error)
    return
  }
  guard
    let representation,
    let data = NSBitmapImageRep(cgImage: representation.cgImage).representation(using: .png, properties: [:])
  else {
    result = .failure(CocoaError(.fileWriteUnknown))
    return
  }
  result = .success(data)
}

if let cancellationDelay {
  DispatchQueue.main.asyncAfter(deadline: .now() + .milliseconds(Int(cancellationDelay))) {
    QLThumbnailGenerator.shared.cancel(request)
  }
}

let deadline = Date().addingTimeInterval(cancellationDelay == nil ? 45 : 2)
while result == nil && Date() < deadline {
  RunLoop.current.run(mode: .default, before: Date().addingTimeInterval(0.05))
}

switch result {
case .success(let data): try data.write(to: output, options: .atomic)
case .failure(let error):
  if cancellationDelay != nil { exit(0) }
  fputs("\(error.localizedDescription)\n", stderr)
  exit(1)
case nil:
  QLThumbnailGenerator.shared.cancel(request)
  if cancellationDelay != nil { exit(0) }
  fputs("thumbnail request timed out\n", stderr)
  exit(1)
}
