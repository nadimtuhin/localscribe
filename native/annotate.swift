// Draw on screen while recording: a transparent, click-through overlay that the screen recording captures.
// Usage: localscribe-annotate [--parent-pid N] [--demo-stroke]
// Ctrl+Opt+D toggles draw mode (Esc also leaves it), Ctrl+Opt+C clears.
// Drag = red pen, Shift-drag = arrow, Opt-drag = rectangle. Stop with SIGINT/SIGTERM.
// --demo-stroke (or env LOCALSCRIBE_DEMO_STROKE) draws a fixed diagonal line at launch (smoke tests).
import AppKit
import Carbon.HIToolbox

enum Tool { case pen, arrow, rectangle }

struct Stroke {
  var tool: Tool
  var points: [NSPoint]
}

final class CanvasView: NSView {
  var strokes: [Stroke] = []
  var drawing = false { didSet { window?.invalidateCursorRects(for: self) } }
  var onEscape: () -> Void = {}

  override var acceptsFirstResponder: Bool { true }
  override func resetCursorRects() { if drawing { addCursorRect(bounds, cursor: .crosshair) } }

  override func keyDown(with event: NSEvent) {
    if event.keyCode == UInt16(kVK_Escape) { onEscape() }
  }

  override func mouseDown(with event: NSEvent) {
    guard drawing else { return }
    var tool = Tool.pen
    if event.modifierFlags.contains(.shift) { tool = .arrow }
    else if event.modifierFlags.contains(.option) { tool = .rectangle }
    strokes.append(Stroke(tool: tool, points: [convert(event.locationInWindow, from: nil)]))
  }

  override func mouseDragged(with event: NSEvent) {
    guard drawing, !strokes.isEmpty else { return }
    let point = convert(event.locationInWindow, from: nil)
    if strokes[strokes.count - 1].tool == .pen { strokes[strokes.count - 1].points.append(point) }
    else { strokes[strokes.count - 1].points = [strokes[strokes.count - 1].points[0], point] }
    needsDisplay = true
  }

  override func draw(_ dirtyRect: NSRect) {
    NSColor.systemRed.setStroke()
    for stroke in strokes {
      guard let first = stroke.points.first else { continue }
      let path = NSBezierPath()
      path.lineWidth = 4
      path.lineCapStyle = .round
      path.lineJoinStyle = .round
      let last = stroke.points.last!
      switch stroke.tool {
      case .pen:
        path.move(to: first)
        stroke.points.dropFirst().forEach { path.line(to: $0) }
      case .rectangle:
        path.appendRect(NSRect(x: min(first.x, last.x), y: min(first.y, last.y), width: abs(last.x - first.x), height: abs(last.y - first.y)))
      case .arrow:
        path.move(to: first)
        path.line(to: last)
        let angle = atan2(last.y - first.y, last.x - first.x)
        for side in [CGFloat.pi * 5 / 6, -CGFloat.pi * 5 / 6] {
          path.move(to: last)
          path.line(to: NSPoint(x: last.x + 20 * cos(angle + side), y: last.y + 20 * sin(angle + side)))
        }
      }
      path.stroke()
    }
  }
}

final class OverlayWindow: NSWindow {
  override var canBecomeKey: Bool { true }
}

final class Overlay {
  let window: OverlayWindow
  let canvas: CanvasView

  init(screen: NSScreen) {
    window = OverlayWindow(contentRect: screen.frame, styleMask: .borderless, backing: .buffered, defer: false)
    window.level = .screenSaver
    window.backgroundColor = .clear
    window.isOpaque = false
    window.hasShadow = false
    window.ignoresMouseEvents = true
    window.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary, .stationary]
    canvas = CanvasView(frame: NSRect(origin: .zero, size: screen.frame.size))
    window.contentView = canvas
    canvas.onEscape = { [unowned self] in setDrawMode(false) }
    window.orderFrontRegardless()
  }

  func setDrawMode(_ on: Bool) {
    canvas.drawing = on
    window.ignoresMouseEvents = !on
    if on {
      NSApp.activate(ignoringOtherApps: true)
      window.makeKeyAndOrderFront(nil)
      window.makeFirstResponder(canvas)
    }
  }

  func toggleDrawMode() { setDrawMode(!canvas.drawing) }

  func clear() {
    canvas.strokes.removeAll()
    canvas.needsDisplay = true
  }
}

func fail(_ message: String) -> Never {
  FileHandle.standardError.write((message + "\n").data(using: .utf8)!)
  exit(1)
}

// Carbon hotkeys need no Accessibility permission, unlike a CGEventTap.
var hotKeyActions: [UInt32: () -> Void] = [:]

func registerHotKey(id: UInt32, keyCode: Int, action: @escaping () -> Void) {
  var ref: EventHotKeyRef?
  let hotKeyID = EventHotKeyID(signature: OSType(0x4C534341), id: id)
  let status = RegisterEventHotKey(UInt32(keyCode), UInt32(controlKey | optionKey), hotKeyID, GetApplicationEventTarget(), 0, &ref)
  if status != noErr { fail("could not register hotkey \(id): OSStatus \(status)") }
  hotKeyActions[id] = action
}

func installHotKeyHandler() {
  var spec = EventTypeSpec(eventClass: OSType(kEventClassKeyboard), eventKind: UInt32(kEventHotKeyPressed))
  InstallEventHandler(GetApplicationEventTarget(), { _, event, _ in
    var hotKeyID = EventHotKeyID()
    GetEventParameter(event, EventParamName(kEventParamDirectObject), EventParamType(typeEventHotKeyID), nil, MemoryLayout<EventHotKeyID>.size, nil, &hotKeyID)
    hotKeyActions[hotKeyID.id]?()
    return noErr
  }, 1, &spec, nil, nil)
}

let arguments = CommandLine.arguments
let app = NSApplication.shared
app.setActivationPolicy(.accessory)

guard let screen = NSScreen.main else { fail("no display found") }
let overlay = Overlay(screen: screen)

installHotKeyHandler()
registerHotKey(id: 1, keyCode: kVK_ANSI_D) { overlay.toggleDrawMode() }
registerHotKey(id: 2, keyCode: kVK_ANSI_C) { overlay.clear() }

if arguments.contains("--demo-stroke") || ProcessInfo.processInfo.environment["LOCALSCRIBE_DEMO_STROKE"] != nil {
  let size = screen.frame.size
  overlay.canvas.strokes.append(Stroke(tool: .pen, points: [NSPoint(x: size.width * 0.2, y: size.height * 0.2), NSPoint(x: size.width * 0.8, y: size.height * 0.8)]))
  overlay.canvas.needsDisplay = true
}

var keepAlive: [Any] = []
for sig in [SIGINT, SIGTERM] {
  signal(sig, SIG_IGN)
  let source = DispatchSource.makeSignalSource(signal: sig, queue: .main)
  source.setEventHandler { exit(0) }
  source.resume()
  keepAlive.append(source)
}

if let flag = arguments.firstIndex(of: "--parent-pid"), flag + 1 < arguments.count, let parent = pid_t(arguments[flag + 1]) {
  let timer = DispatchSource.makeTimerSource(queue: .main)
  timer.schedule(deadline: .now() + 1, repeating: 1)
  timer.setEventHandler { if kill(parent, 0) != 0 && errno == ESRCH { exit(0) } }
  timer.resume()
  keepAlive.append(timer)
}

app.run()
