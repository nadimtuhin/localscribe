// localscribe-capture: ScreenCaptureKit helper (macOS 14+).
//   --list --json                     displays and windows as JSON
//   --pick window|area                click / drag overlay, prints the choice as JSON (nothing if cancelled)
//   [--display ID | --window ID | --area x,y,w,h [--display ID]] [--fps N] --out video.mp4 [--system-audio sys.m4a]
// Capture stops on SIGINT/SIGTERM; both files are finalized before exit.
import AppKit
import AVFoundation
import ScreenCaptureKit

func fail(_ message: String) -> Never {
  FileHandle.standardError.write((message + "\n").data(using: .utf8)!)
  exit(1)
}

struct Options {
  var list = false
  var pick: String?
  var display: CGDirectDisplayID?
  var window: CGWindowID?
  var area: CGRect?
  var fps = 30
  var out: String?
  var systemAudio: String?
}

func parseOptions(_ args: [String]) -> Options {
  var options = Options()
  var i = 0
  func value() -> String {
    i += 1
    guard i < args.count else { fail("missing value for \(args[i - 1])") }
    return args[i]
  }
  while i < args.count {
    switch args[i] {
    case "--list": options.list = true
    case "--json": break
    case "--pick": options.pick = value()
    case "--display": options.display = CGDirectDisplayID(value())
    case "--window": options.window = CGWindowID(value())
    case "--area":
      let n = value().split(separator: ",").compactMap { Double($0) }
      guard n.count == 4 else { fail("--area expects x,y,w,h") }
      options.area = CGRect(x: n[0], y: n[1], width: n[2], height: n[3])
    case "--fps": options.fps = Int(value()) ?? 30
    case "--out": options.out = value()
    case "--system-audio": options.systemAudio = value()
    default: fail("unknown argument \(args[i])")
    }
    i += 1
  }
  return options
}

func screenNumber(_ screen: NSScreen) -> CGDirectDisplayID? {
  screen.deviceDescription[NSDeviceDescriptionKey("NSScreenNumber")] as? CGDirectDisplayID
}

// Window ids from the window server, frontmost first.
func onScreenWindowIDsFrontToBack() -> [CGWindowID] {
  let info = CGWindowListCopyWindowInfo([.optionOnScreenOnly, .excludeDesktopElements], kCGNullWindowID) as? [[String: Any]] ?? []
  return info.compactMap { ($0[kCGWindowNumber as String] as? NSNumber)?.uint32Value }
}

func listSources() async throws -> Data {
  let content = try await SCShareableContent.excludingDesktopWindows(true, onScreenWindowsOnly: true)
  let displays = content.displays.map { display -> [String: Any] in
    let name = NSScreen.screens.first { screenNumber($0) == display.displayID }?.localizedName ?? "Display \(display.displayID)"
    let pixelWidth = CGDisplayCopyDisplayMode(display.displayID).map { Double($0.pixelWidth) } ?? Double(display.width)
    return ["id": display.displayID, "name": name, "width": display.width, "height": display.height, "scale": pixelWidth / Double(display.width)]
  }
  let order = onScreenWindowIDsFrontToBack()
  let windows = content.windows
    .filter { $0.windowLayer == 0 && $0.isOnScreen && $0.owningApplication != nil && $0.frame.width > 50 && $0.frame.height > 50 }
    .sorted { (order.firstIndex(of: $0.windowID) ?? .max) < (order.firstIndex(of: $1.windowID) ?? .max) }
    .map { ["id": $0.windowID, "app": $0.owningApplication?.applicationName ?? "", "title": $0.title ?? ""] as [String: Any] }
  return try JSONSerialization.data(withJSONObject: ["displays": displays, "windows": windows])
}

// MARK: - Picker overlay (AppKit; not unit testable, verified by hand)

final class PickWindow: NSWindow {
  override var canBecomeKey: Bool { true }
}

final class PickView: NSView {
  let kind: String
  let screen: NSScreen
  var dragStart: NSPoint?
  var selection: NSRect?
  var hoveredWindow: (id: CGWindowID, rect: NSRect)?

  init(kind: String, screen: NSScreen) {
    self.kind = kind
    self.screen = screen
    super.init(frame: NSRect(origin: .zero, size: screen.frame.size))
  }
  required init?(coder: NSCoder) { fatalError() }

  override var acceptsFirstResponder: Bool { true }

  override func draw(_ dirtyRect: NSRect) {
    NSColor.black.withAlphaComponent(0.25).setFill()
    bounds.fill()
    guard let hole = selection ?? hoveredWindow?.rect else { return }
    NSColor.clear.setFill()
    hole.fill(using: .copy)
    NSColor.systemBlue.setStroke()
    let border = NSBezierPath(rect: hole)
    border.lineWidth = 2
    border.stroke()
  }

  override func keyDown(with event: NSEvent) {
    if event.keyCode == 53 { exit(0) }  // Esc: cancelled, prints nothing
  }

  // Window server (top-left origin, global) <-> this view (bottom-left origin, this screen).
  private var primaryHeight: CGFloat { NSScreen.screens[0].frame.height }

  private func windowUnderCursor(at viewPoint: NSPoint) -> (id: CGWindowID, rect: NSRect)? {
    let global = NSPoint(x: screen.frame.minX + viewPoint.x, y: primaryHeight - (screen.frame.minY + viewPoint.y))
    let info = CGWindowListCopyWindowInfo([.optionOnScreenOnly, .excludeDesktopElements], kCGNullWindowID) as? [[String: Any]] ?? []
    for entry in info {
      guard (entry[kCGWindowLayer as String] as? Int) == 0,
        (entry[kCGWindowOwnerPID as String] as? Int32) != getpid(),
        let boundsDict = entry[kCGWindowBounds as String] as? NSDictionary,
        let bounds = CGRect(dictionaryRepresentation: boundsDict),
        bounds.contains(global),
        let id = (entry[kCGWindowNumber as String] as? NSNumber)?.uint32Value
      else { continue }
      let rect = NSRect(x: bounds.minX - screen.frame.minX, y: primaryHeight - bounds.maxY - screen.frame.minY, width: bounds.width, height: bounds.height)
      return (id, rect)
    }
    return nil
  }

  override func mouseMoved(with event: NSEvent) {
    guard kind == "window" else { return }
    hoveredWindow = windowUnderCursor(at: convert(event.locationInWindow, from: nil))
    needsDisplay = true
  }

  override func mouseDown(with event: NSEvent) {
    let point = convert(event.locationInWindow, from: nil)
    if kind == "window" {
      guard let hit = windowUnderCursor(at: point) else { return }
      print("{\"window\":\(hit.id)}")
      exit(0)
    }
    dragStart = point
  }

  override func mouseDragged(with event: NSEvent) {
    guard let start = dragStart else { return }
    let p = convert(event.locationInWindow, from: nil)
    selection = NSRect(x: min(start.x, p.x), y: min(start.y, p.y), width: abs(p.x - start.x), height: abs(p.y - start.y))
    needsDisplay = true
  }

  override func mouseUp(with event: NSEvent) {
    guard kind == "area", let rect = selection, rect.width >= 4, rect.height >= 4 else { return }
    let displayId = screenNumber(screen) ?? CGMainDisplayID()
    let y = screen.frame.height - rect.maxY
    print("{\"displayId\":\(displayId),\"x\":\(Int(rect.minX)),\"y\":\(Int(y)),\"w\":\(Int(rect.width)),\"h\":\(Int(rect.height))}")
    exit(0)
  }
}

func runPicker(kind: String) -> Never {
  guard kind == "window" || kind == "area" else { fail("--pick expects window or area") }
  let app = NSApplication.shared
  app.setActivationPolicy(.accessory)
  let screen = NSScreen.screens.first { NSMouseInRect(NSEvent.mouseLocation, $0.frame, false) } ?? NSScreen.screens[0]
  let window = PickWindow(contentRect: screen.frame, styleMask: .borderless, backing: .buffered, defer: false)
  window.level = .screenSaver
  window.isOpaque = false
  window.backgroundColor = .clear
  window.acceptsMouseMovedEvents = true
  let view = PickView(kind: kind, screen: screen)
  window.contentView = view
  window.makeKeyAndOrderFront(nil)
  window.makeFirstResponder(view)
  app.activate(ignoringOtherApps: true)
  NSCursor.crosshair.push()
  app.run()
  exit(0)
}

// MARK: - Capture

// Writer state is only touched on `queue`, so cross-thread use is safe.
final class Capture: NSObject, SCStreamOutput, SCStreamDelegate, @unchecked Sendable {
  private let options: Options
  private let videoWriter: AVAssetWriter
  private var videoInput: AVAssetWriterInput?
  private var audioWriter: AVAssetWriter?
  private var audioInput: AVAssetWriterInput?
  private var audioSamples = 0
  private var stream: SCStream?
  private var sessionStart: CMTime?
  private var finishing = false
  private let queue = DispatchQueue(label: "capture")

  init(options: Options) throws {
    self.options = options
    let videoURL = URL(fileURLWithPath: options.out!)
    try? FileManager.default.removeItem(at: videoURL)
    videoWriter = try AVAssetWriter(outputURL: videoURL, fileType: .mp4)
    if let path = options.systemAudio {
      let url = URL(fileURLWithPath: path)
      try? FileManager.default.removeItem(at: url)
      let writer = try AVAssetWriter(outputURL: url, fileType: .m4a)
      let input = AVAssetWriterInput(mediaType: .audio, outputSettings: [
        AVFormatIDKey: kAudioFormatMPEG4AAC, AVSampleRateKey: 48_000, AVNumberOfChannelsKey: 2, AVEncoderBitRateKey: 160_000,
      ])
      input.expectsMediaDataInRealTime = true
      writer.add(input)
      audioWriter = writer
      audioInput = input
    }
  }

  func start() async throws {
    let content = try await SCShareableContent.excludingDesktopWindows(true, onScreenWindowsOnly: false)
    let filter: SCContentFilter
    if let id = options.window {
      guard let window = content.windows.first(where: { $0.windowID == id }) else { fail("window \(id) not found") }
      filter = SCContentFilter(desktopIndependentWindow: window)
    } else {
      let wanted = options.display ?? CGMainDisplayID()
      guard let display = content.displays.first(where: { $0.displayID == wanted }) ?? content.displays.first else { fail("display \(wanted) not found") }
      filter = SCContentFilter(display: display, excludingWindows: [])
    }

    // Output is the selected region in points times the point-to-pixel scale; H.264 wants even sizes.
    let info = SCShareableContent.info(for: filter)
    let scale = Double(info.pointPixelScale)
    let region = options.area?.size ?? info.contentRect.size
    let width = Int(region.width * scale) & ~1
    let height = Int(region.height * scale) & ~1

    let config = SCStreamConfiguration()
    config.width = width
    config.height = height
    if let area = options.area { config.sourceRect = area }
    config.minimumFrameInterval = CMTime(value: 1, timescale: CMTimeScale(options.fps))
    config.pixelFormat = kCVPixelFormatType_32BGRA
    config.showsCursor = true
    config.queueDepth = 6
    if audioWriter != nil {
      config.capturesAudio = true
      config.sampleRate = 48_000
      config.channelCount = 2
      config.excludesCurrentProcessAudio = true
    }

    let input = AVAssetWriterInput(mediaType: .video, outputSettings: [
      AVVideoCodecKey: AVVideoCodecType.h264,
      AVVideoWidthKey: width,
      AVVideoHeightKey: height,
      AVVideoCompressionPropertiesKey: [
        AVVideoAverageBitRateKey: max(2_000_000, width * height * 4),
        AVVideoExpectedSourceFrameRateKey: options.fps,
      ],
    ])
    input.expectsMediaDataInRealTime = true
    videoWriter.add(input)
    videoInput = input

    let stream = SCStream(filter: filter, configuration: config, delegate: self)
    try stream.addStreamOutput(self, type: .screen, sampleHandlerQueue: queue)
    if audioWriter != nil { try stream.addStreamOutput(self, type: .audio, sampleHandlerQueue: queue) }
    videoWriter.startWriting()
    audioWriter?.startWriting()
    // Anchor both files at "now" on the host clock (ScreenCaptureKit's clock) so they share one origin.
    let now = CMClockGetTime(CMClockGetHostTimeClock())
    queue.sync {
      videoWriter.startSession(atSourceTime: now)
      audioWriter?.startSession(atSourceTime: now)
      sessionStart = now
    }
    try await stream.startCapture()
    self.stream = stream
  }

  func stream(_ stream: SCStream, didOutputSampleBuffer buffer: CMSampleBuffer, of type: SCStreamOutputType) {
    guard buffer.isValid, !finishing, let start = sessionStart, buffer.presentationTimeStamp >= start else { return }
    switch type {
    case .screen:
      // Idle / blank frames carry no image; only complete frames are written.
      let attachments = CMSampleBufferGetSampleAttachmentsArray(buffer, createIfNecessary: false) as? [[SCStreamFrameInfo: Any]]
      guard let status = attachments?.first?[.status] as? Int, status == SCFrameStatus.complete.rawValue else { return }
      if let input = videoInput, input.isReadyForMoreMediaData { input.append(buffer) }
    case .audio:
      if let input = audioInput, input.isReadyForMoreMediaData {
        input.append(buffer)
        audioSamples += 1
      }
    default:
      break
    }
  }

  func stream(_ stream: SCStream, didStopWithError error: Error) {
    FileHandle.standardError.write("capture stopped: \(error.localizedDescription)\n".data(using: .utf8)!)
    DispatchQueue.main.async { finishAndExit(code: 1) }
  }

  func finish() async {
    try? await stream?.stopCapture()
    await withCheckedContinuation { done in
      queue.async {
        guard !self.finishing else { return done.resume() }
        self.finishing = true
        let end = CMClockGetTime(CMClockGetHostTimeClock())
        self.videoInput?.markAsFinished()
        // Static content produces few frames; extend the video to the real stop time.
        self.videoWriter.endSession(atSourceTime: end)
        self.videoWriter.finishWriting {
          // No system sound played: leave no audio file, the recorder then keeps the video as is.
          guard let writer = self.audioWriter, self.audioSamples > 0 else {
            self.audioWriter?.cancelWriting()
            return done.resume()
          }
          self.audioInput?.markAsFinished()
          writer.finishWriting { done.resume() }
        }
      }
    }
  }
}

let options = parseOptions(Array(CommandLine.arguments.dropFirst()))

if let kind = options.pick { runPicker(kind: kind) }

if options.list {
  Task {
    do {
      FileHandle.standardOutput.write(try await listSources())
      exit(0)
    } catch {
      fail("cannot list sources (grant Screen Recording permission?): \(error.localizedDescription)")
    }
  }
  dispatchMain()
}

guard options.out != nil else { fail("usage: localscribe-capture --list --json | --pick window|area | [target] --out video.mp4 [--system-audio sys.m4a]") }
// Connects to the window server; SCShareableContent.info(for:) asserts without it.
_ = NSApplication.shared
let capture: Capture
do {
  capture = try Capture(options: options)
} catch {
  fail("cannot create output: \(error.localizedDescription)")
}

// Runs once on the main queue; later signals are ignored so files are finalized exactly once.
var stopping = false
func finishAndExit(code: Int32) {
  guard !stopping else { return }
  stopping = true
  Task {
    await capture.finish()
    exit(code)
  }
}

var signalSources: [DispatchSourceSignal] = []
for sig in [SIGINT, SIGTERM] {
  signal(sig, SIG_IGN)
  let source = DispatchSource.makeSignalSource(signal: sig, queue: .main)
  source.setEventHandler { finishAndExit(code: 0) }
  source.resume()
  signalSources.append(source)
}

Task {
  do {
    try await capture.start()
  } catch {
    fail("cannot start capture (grant Screen Recording permission?): \(error.localizedDescription)")
  }
}
dispatchMain()
