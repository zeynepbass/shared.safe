import ExpoModulesCore

// Text recognition for receipt photos, on the device. The work is in ReceiptRecognizer; this
// only hands it to JavaScript. Both functions take the path or file URL of an image.
public class ReceiptOcrModule: Module {
  public func definition() -> ModuleDefinition {
    Name("ReceiptOcr")

    // → { width, height, blocks: [{ text, x, y, width, height, angle, lineHeight }], edges }
    AsyncFunction("recognize") { (uri: String) -> [String: Any] in
      try ReceiptRecognizer.recognize(uri: uri).dictionary
    }

    // → the four corners of the paper, or null when no receipt stands out.
    AsyncFunction("detectEdges") { (uri: String) -> [[String: Double]]? in
      try ReceiptRecognizer.detectEdges(uri: uri)?.map(\.dictionary)
    }
  }
}
