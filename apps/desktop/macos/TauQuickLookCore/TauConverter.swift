import Foundation
import WebKit

enum TauQuickLookError: LocalizedError {
  case cancelled
  case conversion(String)
  case invalidInput(String)
  case resourceLimit(String)
  case security(String)

  var errorDescription: String? {
    switch self {
    case .cancelled: "Quick Look conversion was cancelled"
    case .conversion(let message), .invalidInput(let message), .resourceLimit(let message), .security(let message):
      message
    }
  }
}

private struct ConversionFile: Encodable {
  let path: String
  let base64: String
}

private struct ConversionRequest: Encodable {
  let id: String
  let entry: String
  let files: [ConversionFile]
  let target: String
  let width: Int?
  let height: Int?
}

struct ConversionOptions: Sendable {
  let target: String
  let width: Int?
  let height: Int?

  static let preview = ConversionOptions(target: "usdz", width: nil, height: nil)

  static func thumbnail(size: CGSize, scale: CGFloat) -> ConversionOptions {
    let pixels = { (value: CGFloat) in min(4096, max(16, Int(ceil(value * scale)))) }
    return ConversionOptions(target: "png", width: pixels(size.width), height: pixels(size.height))
  }
}

private final class BundleSchemeHandler: NSObject, WKURLSchemeHandler {
  private let mimeTypes = [
    "html": "text/html",
    "js": "text/javascript",
    "map": "application/json",
    "ttf": "font/ttf",
    "wasm": "application/wasm",
  ]

  func webView(_ webView: WKWebView, start task: WKURLSchemeTask) {
    guard
      let url = task.request.url,
      url.scheme == "tau-resource",
      url.host == "runtime",
      !url.pathComponents.contains(".."),
      let root = Bundle(for: TauConverter.self).resourceURL?.appendingPathComponent("runtime", isDirectory: true)
    else {
      task.didFailWithError(URLError(.unsupportedURL))
      return
    }
    let resource = root.appendingPathComponent(String(url.path.drop(while: { $0 == "/" }))).standardizedFileURL
    let prefix = root.standardizedFileURL.path + "/"
    guard resource.path.hasPrefix(prefix), let data = try? Data(contentsOf: resource, options: .mappedIfSafe) else {
      task.didFailWithError(URLError(.fileDoesNotExist))
      return
    }
    let mimeType = mimeTypes[resource.pathExtension.lowercased()] ?? "application/octet-stream"
    guard let response = HTTPURLResponse(
      url: url,
      statusCode: 200,
      httpVersion: "HTTP/1.1",
      headerFields: [
        "Access-Control-Allow-Origin": "tau-resource://runtime",
        "Content-Length": String(data.count),
        "Content-Type": mimeType,
      ]
    ) else {
      task.didFailWithError(URLError(.badServerResponse))
      return
    }
    task.didReceive(response)
    task.didReceive(data)
    task.didFinish()
  }

  func webView(_ webView: WKWebView, stop task: WKURLSchemeTask) {}
}

@MainActor
final class TauConverter: NSObject, WKNavigationDelegate, WKScriptMessageHandler {
  private let schemeHandler = BundleSchemeHandler()
  private let requestID = UUID().uuidString
  private var completion: ((Result<URL, Error>) -> Void)?
  private var request: ConversionRequest?
  private var temporaryDirectory: URL?
  private var timeout: DispatchWorkItem?
  private var webView: WKWebView?

  func convert(
    _ sourceURL: URL,
    options: ConversionOptions = .preview,
    completion: @escaping (Result<URL, Error>) -> Void
  ) {
    guard self.completion == nil else {
      completion(.failure(TauQuickLookError.conversion("A Quick Look conversion is already running")))
      return
    }
    self.completion = completion

    DispatchQueue.global(qos: .userInitiated).async { [requestID] in
      let result = Result { try Self.readRequest(sourceURL, id: requestID, options: options) }
      DispatchQueue.main.async { [weak self] in
        guard let self else { return }
        switch result {
        case .success(let request): self.start(request)
        case .failure(let error): self.finish(.failure(error))
        }
      }
    }
  }

  func cancel() {
    if let request = request {
      webView?.evaluateJavaScript("window.tauQuickLook?.cancel(\(Self.javascriptString(request.id)))")
    }
    if completion == nil {
      cleanup()
    } else {
      finish(.failure(TauQuickLookError.cancelled))
    }
  }

  func cleanup() {
    if let temporaryDirectory {
      try? FileManager.default.removeItem(at: temporaryDirectory)
      self.temporaryDirectory = nil
    }
  }

  private func start(_ request: ConversionRequest) {
    guard let indexURL = URL(string: "tau-resource://runtime/index.html") else {
      finish(.failure(TauQuickLookError.conversion("The bundled Tau converter is missing")))
      return
    }
    self.request = request
    let controller = WKUserContentController()
    controller.add(self, name: "tauQuickLook")
    let configuration = WKWebViewConfiguration()
    configuration.userContentController = controller
    configuration.websiteDataStore = .nonPersistent()
    configuration.preferences.javaScriptCanOpenWindowsAutomatically = false
    configuration.setURLSchemeHandler(schemeHandler, forURLScheme: "tau-resource")
    let webView = WKWebView(frame: .zero, configuration: configuration)
    webView.navigationDelegate = self
    self.webView = webView
    webView.load(URLRequest(url: indexURL))

    let timeout = DispatchWorkItem { [weak self] in
      self?.finish(.failure(TauQuickLookError.resourceLimit("Quick Look conversion timed out")))
    }
    self.timeout = timeout
    DispatchQueue.main.asyncAfter(
      deadline: .now() + .milliseconds(TauQuickLookManifest.timeoutMilliseconds),
      execute: timeout
    )
  }

  private func sendRequest(to webView: WKWebView) {
    guard let request else { return }
    do {
      let data = try JSONEncoder().encode(request)
      guard let json = String(data: data, encoding: .utf8) else {
        throw TauQuickLookError.conversion("Could not encode the Quick Look request")
      }
      webView.evaluateJavaScript("window.tauQuickLook.convert(\(json))") { [weak self] _, error in
        if let error {
          let detail = (error as NSError).userInfo["WKJavaScriptExceptionMessage"] as? String
          self?.finish(.failure(TauQuickLookError.conversion(detail ?? error.localizedDescription)))
        }
      }
    } catch {
      finish(.failure(error))
    }
  }

  func webView(
    _ webView: WKWebView,
    decidePolicyFor navigationAction: WKNavigationAction,
    decisionHandler: @escaping (WKNavigationActionPolicy) -> Void
  ) {
    decisionHandler(navigationAction.request.url?.scheme == "tau-resource" ? .allow : .cancel)
  }

  func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
    finish(.failure(error))
  }

  func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
    finish(.failure(error))
  }

  func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
    finish(.failure(TauQuickLookError.conversion("The Quick Look converter process terminated")))
  }

  func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
    guard let body = message.body as? [String: Any] else {
      finish(.failure(TauQuickLookError.conversion("The Quick Look converter returned an invalid reply")))
      return
    }
    if body["type"] as? String == "ready" {
      if let webView { sendRequest(to: webView) }
      return
    }
    guard
      body["id"] as? String == requestID,
      let success = body["success"] as? Bool
    else {
      finish(.failure(TauQuickLookError.conversion("The Quick Look converter returned an invalid reply")))
      return
    }
    guard success else {
      finish(.failure(TauQuickLookError.conversion(body["error"] as? String ?? "USDZ export failed")))
      return
    }
    guard let request else {
      finish(.failure(TauQuickLookError.conversion("The Quick Look converter lost its request")))
      return
    }
    let isUSDZ = request.target == "usdz"
    let expectedHeader: [UInt8] = isUSDZ
      ? [0x50, 0x4b, 0x03, 0x04]
      : [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
    guard
      let base64 = body["base64"] as? String,
      let data = Data(base64Encoded: base64),
      !data.isEmpty,
      data.count <= TauQuickLookManifest.maxOutputBytes,
      data.starts(with: expectedHeader)
    else {
      finish(.failure(TauQuickLookError.conversion("The Quick Look converter returned invalid (request.target.uppercased()) data")))
      return
    }
    do {
      let directory = FileManager.default.temporaryDirectory
        .appendingPathComponent("tau-quick-look", isDirectory: true)
        .appendingPathComponent(requestID, isDirectory: true)
      try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
      let output = directory.appendingPathComponent("preview.\(request.target)")
      try data.write(to: output, options: .atomic)
      temporaryDirectory = directory
      finish(.success(output), keepTemporaryFiles: true)
    } catch {
      finish(.failure(error))
    }
  }

  private func finish(_ result: Result<URL, Error>, keepTemporaryFiles: Bool = false) {
    guard let completion else { return }
    self.completion = nil
    timeout?.cancel()
    timeout = nil
    webView?.configuration.userContentController.removeScriptMessageHandler(forName: "tauQuickLook")
    webView?.stopLoading()
    webView = nil
    request = nil
    if !keepTemporaryFiles { cleanup() }
    completion(result)
  }

  nonisolated private static func readRequest(
    _ sourceURL: URL,
    id: String,
    options: ConversionOptions
  ) throws -> ConversionRequest {
    let didAccess = sourceURL.startAccessingSecurityScopedResource()
    defer { if didAccess { sourceURL.stopAccessingSecurityScopedResource() } }

    let source = sourceURL.resolvingSymlinksInPath().standardizedFileURL
    let root = source.deletingLastPathComponent()
    let sourceValues = try source.resourceValues(forKeys: [.isRegularFileKey, .fileSizeKey])
    guard sourceValues.isRegularFile == true else {
      throw TauQuickLookError.invalidInput("Quick Look can only preview regular files")
    }
    guard let sourceSize = sourceValues.fileSize, sourceSize > 0, sourceSize <= TauQuickLookManifest.maxSourceBytes else {
      throw TauQuickLookError.resourceLimit("The source file exceeds the Quick Look size limit")
    }
    guard let format = TauQuickLookManifest.formats.first(where: { format in
      format.extensions.contains(where: { source.lastPathComponent.lowercased().hasSuffix(".\($0)") })
    }) else {
      throw TauQuickLookError.invalidInput("Tau does not support this file type in Quick Look")
    }

    var candidates = [source]
    if format.includesSidecars {
      let enumerator = FileManager.default.enumerator(
        at: root,
        includingPropertiesForKeys: [.isRegularFileKey, .isHiddenKey, .fileSizeKey],
        options: [.skipsHiddenFiles, .skipsPackageDescendants]
      )
      if let enumerator {
        for case let candidate as URL in enumerator {
          if enumerator.level > TauQuickLookManifest.maxDepth {
            enumerator.skipDescendants()
            continue
          }
          if candidate.resolvingSymlinksInPath().standardizedFileURL != source {
            candidates.append(candidate)
          }
        }
      }
    }
    var total = 0
    var files: [ConversionFile] = []
    for candidateURL in candidates {
      let candidate = candidateURL.resolvingSymlinksInPath().standardizedFileURL
      let prefix = root.path.hasSuffix("/") ? root.path : root.path + "/"
      guard candidate.path == source.path || candidate.path.hasPrefix(prefix) else {
        throw TauQuickLookError.security("A model sidecar escaped its source directory")
      }
      let values: URLResourceValues
      do {
        values = try candidate.resourceValues(forKeys: [.isRegularFileKey, .isHiddenKey, .fileSizeKey])
      } catch {
        if candidate == source { throw error }
        continue
      }
      guard values.isRegularFile == true, values.isHidden != true else { continue }
      guard let size = values.fileSize, size <= TauQuickLookManifest.maxSidecarBytes || candidate == source else {
        throw TauQuickLookError.resourceLimit("A model sidecar exceeds the Quick Look size limit")
      }
      guard files.count < TauQuickLookManifest.maxFiles else {
        throw TauQuickLookError.resourceLimit("The model directory exceeds the Quick Look file-count limit")
      }
      let data: Data
      do {
        data = try Data(contentsOf: candidate, options: .mappedIfSafe)
      } catch {
        if candidate == source { throw error }
        continue
      }
      guard data.count <= (candidate == source ? TauQuickLookManifest.maxSourceBytes : TauQuickLookManifest.maxSidecarBytes) else {
        throw TauQuickLookError.resourceLimit("A model file grew beyond the Quick Look size limit")
      }
      if candidate == source {
        try validateContent(data.prefix(512), extension: source.lastPathComponent.lowercased())
      }
      total += data.count
      guard total <= TauQuickLookManifest.maxTotalBytes else {
        throw TauQuickLookError.resourceLimit("The model and its sidecars exceed the Quick Look total-size limit")
      }
      let relative = candidate == source ? source.lastPathComponent : String(candidate.path.dropFirst(prefix.count))
      files.append(ConversionFile(path: relative, base64: data.base64EncodedString()))
    }
    guard files.contains(where: { $0.path == source.lastPathComponent }) else {
      throw TauQuickLookError.invalidInput("The source file could not be read")
    }
    return ConversionRequest(
      id: id,
      entry: source.lastPathComponent,
      files: files,
      target: options.target,
      width: options.width,
      height: options.height
    )
  }

  nonisolated private static func javascriptString(_ value: String) -> String {
    let data = try? JSONEncoder().encode(value)
    return data.flatMap { String(data: $0, encoding: .utf8) } ?? "\"\""
  }

  nonisolated private static func validateContent(_ prefix: Data.SubSequence, extension name: String) throws {
    let bytes = Data(prefix)
    if name.hasSuffix(".glb") {
      guard bytes.starts(with: [0x67, 0x6c, 0x54, 0x46]) else {
        throw TauQuickLookError.invalidInput("The .glb file does not contain a glTF binary header")
      }
      return
    }
    if name.hasSuffix(".3mf") || name.hasSuffix(".usdz") {
      guard bytes.starts(with: [0x50, 0x4b, 0x03, 0x04]) else {
        throw TauQuickLookError.invalidInput("The archive-backed model has an invalid ZIP header")
      }
      return
    }
    let textExtensions: Set<String> = [
      "gltf", "step", "stp", "iges", "igs", "brep", "ac", "amf", "ase", "bvh", "dae", "dxf", "ifc",
      "md5mesh", "mesh.xml", "nff", "obj", "off", "ogex", "smd", "usda", "wrl", "x3d", "x3dv", "xgl",
    ]
    guard textExtensions.contains(where: { name.hasSuffix(".\($0)") }) else { return }
    let body = bytes.starts(with: [0xef, 0xbb, 0xbf]) ? bytes.dropFirst(3) : bytes[...]
    guard !body.contains(0), String(data: Data(body), encoding: .utf8) != nil else {
      throw TauQuickLookError.invalidInput("The text model contains binary data inconsistent with its file type")
    }
  }
}
