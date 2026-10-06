import Foundation
import UniformTypeIdentifiers

// Prints the content type Launch Services assigns to each path, one per line.
// Spotlight's kMDItemContentType can predate the app's registration; this
// asks Launch Services directly.
guard CommandLine.arguments.count > 1 else {
  fputs("usage: content-type-probe <path>...\n", stderr)
  exit(64)
}

for path in CommandLine.arguments.dropFirst() {
  do {
    let values = try URL(fileURLWithPath: path).resourceValues(forKeys: [.contentTypeKey])
    print(values.contentType?.identifier ?? "")
  } catch {
    fputs("\(path): \(error)\n", stderr)
    exit(1)
  }
}
