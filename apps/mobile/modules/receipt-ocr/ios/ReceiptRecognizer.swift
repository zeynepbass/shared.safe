import CoreGraphics
import Foundation
import ImageIO
import Vision

// Reads a receipt photo with Apple's Vision framework, on the device: the pieces of text with
// where they are, and the outline of the paper.
//
// Everything is in fractions of the image (0...1) with the origin at the top left of the image
// as it is displayed, whatever way the phone was held. Nothing here depends on UIKit or Expo, so
// the same file runs on macOS for testing.

struct ReceiptPoint {
  let x: Double
  let y: Double

  var dictionary: [String: Double] { ["x": x, "y": y] }
}

struct ReceiptBlock {
  let text: String
  // The box around the text, sides parallel to the image's.
  let x: Double
  let y: Double
  let width: Double
  let height: Double
  // How the text itself runs: the angle of its baseline in radians (positive when it runs
  // downhill to the right) and the height of its line as a fraction of the image height. On a
  // receipt held at an angle the box is taller than the line, and these tell the rows apart.
  let angle: Double
  let lineHeight: Double

  var dictionary: [String: Any] {
    [
      "text": text, "x": x, "y": y, "width": width, "height": height,
      "angle": angle, "lineHeight": lineHeight
    ]
  }
}

struct ReceiptScan {
  let width: Int
  let height: Int
  let blocks: [ReceiptBlock]
  // Corners of the paper: top left, top right, bottom right, bottom left. Nil if not found.
  let edges: [ReceiptPoint]?

  var dictionary: [String: Any] {
    [
      "width": width,
      "height": height,
      "blocks": blocks.map(\.dictionary),
      // An explicit null: a Swift nil inside a dictionary does not cross to JavaScript.
      "edges": edges.map { $0.map(\.dictionary) as Any } ?? NSNull()
    ]
  }
}

enum ReceiptRecognizerError: Error, LocalizedError {
  case unreadableImage

  var errorDescription: String? { "The image could not be read." }
}

enum ReceiptRecognizer {
  static func url(from uri: String) -> URL {
    if uri.hasPrefix("file://"), let url = URL(string: uri) {
      return url
    }
    return URL(fileURLWithPath: uri)
  }

  static func recognize(uri: String) throws -> ReceiptScan {
    let (image, orientation) = try load(url(from: uri))
    let handler = VNImageRequestHandler(cgImage: image, orientation: orientation)
    let text = textRequest()
    let document = VNDetectDocumentSegmentationRequest()
    try handler.perform([text, document])

    let sideways = [.left, .leftMirrored, .right, .rightMirrored].contains(orientation)
    let width = sideways ? image.height : image.width
    let height = sideways ? image.width : image.height
    return ReceiptScan(
      width: width,
      height: height,
      blocks: blocks(of: text, width: Double(width), height: Double(height)),
      edges: try edges(of: document) ?? rectangle(in: handler)
    )
  }

  static func detectEdges(uri: String) throws -> [ReceiptPoint]? {
    let (image, orientation) = try load(url(from: uri))
    let handler = VNImageRequestHandler(cgImage: image, orientation: orientation)
    let document = VNDetectDocumentSegmentationRequest()
    try handler.perform([document])
    return try edges(of: document) ?? rectangle(in: handler)
  }

  // The image and the way it has to be turned to be upright (photos keep the sensor's
  // orientation and say how the phone was held).
  private static func load(_ url: URL) throws -> (CGImage, CGImagePropertyOrientation) {
    guard
      let source = CGImageSourceCreateWithURL(url as CFURL, nil),
      let image = CGImageSourceCreateImageAtIndex(source, 0, nil)
    else {
      throw ReceiptRecognizerError.unreadableImage
    }
    let properties = CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [CFString: Any]
    let raw = (properties?[kCGImagePropertyOrientation] as? NSNumber)?.uint32Value
    return (image, raw.flatMap(CGImagePropertyOrientation.init(rawValue:)) ?? .up)
  }

  private static func textRequest() -> VNRecognizeTextRequest {
    let request = VNRecognizeTextRequest()
    request.recognitionLevel = .accurate
    // Language correction turns product codes and shop names into dictionary words.
    request.usesLanguageCorrection = false
    // Turkish where this version of the system has it; the letters are Latin either way, and the
    // parser does not rely on diacritics.
    let supported = (try? request.supportedRecognitionLanguages()) ?? []
    let wanted = ["tr-TR", "en-US"].filter(supported.contains)
    if !wanted.isEmpty {
      request.recognitionLanguages = wanted
    }
    return request
  }

  private static func blocks(
    of request: VNRecognizeTextRequest,
    width: Double,
    height: Double
  ) -> [ReceiptBlock] {
    (request.results ?? []).compactMap { observation in
      guard let candidate = observation.topCandidates(1).first else { return nil }
      // Vision measures from the bottom left, in fractions; angles and lengths need pixels.
      let pixel = { (point: CGPoint) in
        CGPoint(x: Double(point.x) * width, y: (1 - Double(point.y)) * height)
      }
      let topLeft = pixel(observation.topLeft)
      let topRight = pixel(observation.topRight)
      let bottomLeft = pixel(observation.bottomLeft)
      let box = observation.boundingBox
      return ReceiptBlock(
        text: candidate.string,
        x: box.minX,
        y: 1 - box.maxY,
        width: box.width,
        height: box.height,
        angle: atan2(topRight.y - topLeft.y, topRight.x - topLeft.x),
        lineHeight: hypot(bottomLeft.x - topLeft.x, bottomLeft.y - topLeft.y) / height
      )
    }
  }

  private static func edges(of request: VNDetectDocumentSegmentationRequest) -> [ReceiptPoint]? {
    request.results?.first.map(corners).flatMap(plausible)
  }

  // When no document stands out from the background (a receipt on a pale table), fall back to
  // the largest rectangle; receipts are long and narrow, so the usual aspect limits are relaxed.
  private static func rectangle(in handler: VNImageRequestHandler) throws -> [ReceiptPoint]? {
    let request = VNDetectRectanglesRequest()
    request.minimumAspectRatio = 0.15
    request.maximumAspectRatio = 1
    request.minimumSize = 0.2
    request.quadratureTolerance = 25
    request.minimumConfidence = 0.6
    request.maximumObservations = 1
    try handler.perform([request])
    return request.results?.first.map(corners).flatMap(plausible)
  }

  // An outline that takes up the whole picture is the picture's own border (a bare table, a
  // wall), and a speck is not a receipt either.
  private static func plausible(_ quad: [ReceiptPoint]) -> [ReceiptPoint]? {
    var twiceArea = 0.0
    for (index, point) in quad.enumerated() {
      let next = quad[(index + 1) % quad.count]
      twiceArea += point.x * next.y - next.x * point.y
    }
    let area = abs(twiceArea) / 2
    return (0.05...0.9).contains(area) ? quad : nil
  }

  private static func corners(_ quad: VNRectangleObservation) -> [ReceiptPoint] {
    [quad.topLeft, quad.topRight, quad.bottomRight, quad.bottomLeft].map {
      ReceiptPoint(x: $0.x, y: 1 - $0.y)
    }
  }
}
