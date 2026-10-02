package expo.modules.receiptocr

import android.content.Context
import android.graphics.Point
import android.graphics.Rect
import android.net.Uri
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.text.Text
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.latin.TextRecognizerOptions
import expo.modules.kotlin.Promise
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File
import kotlin.math.atan2
import kotlin.math.hypot

// Text recognition for receipt photos, on the device, with ML Kit. Returns the same shape as the
// iOS module: fractions of the upright image with the origin at the top left.
//
// ML Kit has no detector for the outline of a sheet of paper (its document scanner is a screen of
// its own), so the "edges" here are the box around all the text that was found, a little wider.
// That is enough to show the user what was picked up; it is not the paper's real outline.
class ReceiptOcrModule : Module() {
  private val context: Context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  override fun definition() = ModuleDefinition {
    Name("ReceiptOcr")

    AsyncFunction("recognize") { uri: String, promise: Promise ->
      read(uri, promise) { text, width, height ->
        mapOf(
          "width" to width,
          "height" to height,
          "blocks" to blocks(text, width, height),
          "edges" to edges(text, width, height)
        )
      }
    }

    AsyncFunction("detectEdges") { uri: String, promise: Promise ->
      read(uri, promise) { text, width, height -> edges(text, width, height) }
    }
  }

  private fun read(uri: String, promise: Promise, result: (Text, Int, Int) -> Any?) {
    val image = try {
      InputImage.fromFilePath(context, fileUri(uri))
    } catch (error: Exception) {
      promise.reject(UnreadableImageException(error))
      return
    }
    // The boxes ML Kit reports are in the upright image; width and height are of the file.
    val sideways = image.rotationDegrees == 90 || image.rotationDegrees == 270
    val width = if (sideways) image.height else image.width
    val height = if (sideways) image.width else image.height

    val recognizer = TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS)
    recognizer.process(image)
      .addOnSuccessListener { text -> promise.resolve(result(text, width, height)) }
      .addOnFailureListener { error -> promise.reject(RecognitionFailedException(error)) }
      .addOnCompleteListener { recognizer.close() }
  }

  private fun fileUri(uri: String): Uri =
    if (uri.startsWith("file://") || uri.startsWith("content://")) Uri.parse(uri)
    else Uri.fromFile(File(uri))

  private fun lines(text: Text): List<Text.Line> = text.textBlocks.flatMap { it.lines }

  private fun blocks(text: Text, width: Int, height: Int): List<Map<String, Any>> =
    lines(text).mapNotNull { line ->
      val box = line.boundingBox ?: return@mapNotNull null
      // Corners run clockwise from the top left of the text, whatever way it is turned.
      val corners = line.cornerPoints
      val topLeft = corners?.getOrNull(0) ?: Point(box.left, box.top)
      val topRight = corners?.getOrNull(1) ?: Point(box.right, box.top)
      val bottomLeft = corners?.getOrNull(3) ?: Point(box.left, box.bottom)
      mapOf(
        "text" to line.text,
        "x" to box.left.toDouble() / width,
        "y" to box.top.toDouble() / height,
        "width" to box.width().toDouble() / width,
        "height" to box.height().toDouble() / height,
        "angle" to atan2(
          (topRight.y - topLeft.y).toDouble(),
          (topRight.x - topLeft.x).toDouble()
        ),
        "lineHeight" to hypot(
          (bottomLeft.x - topLeft.x).toDouble(),
          (bottomLeft.y - topLeft.y).toDouble()
        ) / height
      )
    }

  private fun edges(text: Text, width: Int, height: Int): List<Map<String, Double>>? {
    val boxes = lines(text).mapNotNull { it.boundingBox }
    if (boxes.isEmpty()) return null
    val all = Rect(boxes.first())
    boxes.forEach { all.union(it) }
    val margin = (all.width() * MARGIN).toInt()
    all.inset(-margin, -margin)
    val left = all.left.coerceAtLeast(0).toDouble() / width
    val top = all.top.coerceAtLeast(0).toDouble() / height
    val right = all.right.coerceAtMost(width).toDouble() / width
    val bottom = all.bottom.coerceAtMost(height).toDouble() / height
    return listOf(left to top, right to top, right to bottom, left to bottom)
      .map { (x, y) -> mapOf("x" to x, "y" to y) }
  }

  private companion object {
    const val MARGIN = 0.04
  }
}

internal class UnreadableImageException(cause: Throwable) :
  CodedException("The image could not be read.", cause)

internal class RecognitionFailedException(cause: Throwable) :
  CodedException("Text recognition failed.", cause)
