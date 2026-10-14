// Captures system audio with ScreenCaptureKit and writes rolling 16 kHz mono WAV segments for live transcription.
// Usage: livesys <output-dir> [segment-seconds] [--parent-pid N]   Writes <dir>/them_00001.wav, them_00002.wav, ...
// With --parent-pid it finishes and exits once that process is gone.
// Each segment appears atomically (.part then rename). Stop with SIGINT/SIGTERM.
import AVFoundation
import ScreenCaptureKit

func fail(_ message: String) -> Never {
  FileHandle.standardError.write((message + "\n").data(using: .utf8)!)
  exit(1)
}

func wavData(samples: [Int16]) -> Data {
  var data = Data()
  func put32(_ v: UInt32) { var x = v.littleEndian; data.append(Data(bytes: &x, count: 4)) }
  func put16(_ v: UInt16) { var x = v.littleEndian; data.append(Data(bytes: &x, count: 2)) }
  let bytes = UInt32(samples.count * 2)
  data.append("RIFF".data(using: .ascii)!); put32(36 + bytes)
  data.append("WAVEfmt ".data(using: .ascii)!); put32(16)
  put16(1); put16(1); put32(16_000); put32(32_000); put16(2); put16(16)
  data.append("data".data(using: .ascii)!); put32(bytes)
  samples.withUnsafeBufferPointer { data.append(Data(buffer: $0)) }
  return data
}

// All state is touched only on `queue`.
final class SegmentWriter: NSObject, SCStreamOutput, SCStreamDelegate, @unchecked Sendable {
  private let dir: URL
  private let segmentSamples: Int
  private var samples: [Int16] = []
  private var sequence = 1
  private var stream: SCStream?
  private let queue = DispatchQueue(label: "livesys")

  init(dir: URL, seconds: Int) {
    self.dir = dir
    self.segmentSamples = seconds * 16_000
  }

  func start() async throws {
    let content = try await SCShareableContent.excludingDesktopWindows(false, onScreenWindowsOnly: false)
    guard let display = content.displays.first else { fail("no display found") }
    let config = SCStreamConfiguration()
    config.capturesAudio = true
    config.sampleRate = 16_000
    config.channelCount = 1
    config.excludesCurrentProcessAudio = true
    config.width = 2
    config.height = 2
    config.minimumFrameInterval = CMTime(value: 1, timescale: 1)
    let stream = SCStream(filter: SCContentFilter(display: display, excludingWindows: []), configuration: config, delegate: self)
    try stream.addStreamOutput(self, type: .audio, sampleHandlerQueue: queue)
    try await stream.startCapture()
    self.stream = stream
  }

  func stream(_ stream: SCStream, didOutputSampleBuffer buffer: CMSampleBuffer, of type: SCStreamOutputType) {
    guard type == .audio, buffer.isValid, let block = CMSampleBufferGetDataBuffer(buffer) else { return }
    var floats = [Float](repeating: 0, count: CMBlockBufferGetDataLength(block) / MemoryLayout<Float>.size)
    guard !floats.isEmpty, CMBlockBufferCopyDataBytes(block, atOffset: 0, dataLength: floats.count * MemoryLayout<Float>.size, destination: &floats) == kCMBlockBufferNoErr else { return }
    for f in floats { samples.append(Int16(max(-1, min(1, f)) * 32_767)) }
    while samples.count >= segmentSamples {
      write(Array(samples.prefix(segmentSamples)))
      samples.removeFirst(segmentSamples)
    }
  }

  func stream(_ stream: SCStream, didStopWithError error: Error) {
    FileHandle.standardError.write("capture stopped: \(error.localizedDescription)\n".data(using: .utf8)!)
    DispatchQueue.main.async { finishAndExit(code: 1) }
  }

  private func write(_ segment: [Int16]) {
    let name = String(format: "them_%05d.wav", sequence)
    sequence += 1
    let final = dir.appendingPathComponent(name)
    let part = dir.appendingPathComponent(name + ".part")
    do {
      try wavData(samples: segment).write(to: part)
      try? FileManager.default.removeItem(at: final)
      try FileManager.default.moveItem(at: part, to: final)
    } catch {
      FileHandle.standardError.write("cannot write \(name): \(error.localizedDescription)\n".data(using: .utf8)!)
    }
  }

  func finish() async {
    try? await stream?.stopCapture()
    await withCheckedContinuation { done in
      queue.async {
        if self.samples.count >= 16_000 { self.write(self.samples) }
        self.samples = []
        done.resume()
      }
    }
  }
}

guard CommandLine.arguments.count >= 2 else { fail("usage: livesys <output-dir> [segment-seconds]") }
let outputDir = URL(fileURLWithPath: CommandLine.arguments[1])
try? FileManager.default.createDirectory(at: outputDir, withIntermediateDirectories: true)
let seconds = CommandLine.arguments.count > 2 ? Int(CommandLine.arguments[2]) ?? 6 : 6
let writer = SegmentWriter(dir: outputDir, seconds: seconds)

var stopping = false
func finishAndExit(code: Int32) {
  guard !stopping else { return }
  stopping = true
  Task {
    await writer.finish()
    exit(code)
  }
}

var signalSources: [DispatchSourceSignal] = []
var parentWatchdog: DispatchSourceTimer?
for sig in [SIGINT, SIGTERM] {
  signal(sig, SIG_IGN)
  let source = DispatchSource.makeSignalSource(signal: sig, queue: .main)
  source.setEventHandler { finishAndExit(code: 0) }
  source.resume()
  signalSources.append(source)
}

if let flag = CommandLine.arguments.firstIndex(of: "--parent-pid"), flag + 1 < CommandLine.arguments.count, let parent = pid_t(CommandLine.arguments[flag + 1]) {
  let timer = DispatchSource.makeTimerSource(queue: .main)
  timer.schedule(deadline: .now() + 2, repeating: 2)
  timer.setEventHandler { if kill(parent, 0) != 0 && errno == ESRCH { finishAndExit(code: 0) } }
  timer.resume()
  parentWatchdog = timer
}

Task {
  do {
    try await writer.start()
  } catch {
    fail("cannot start capture (grant Screen Recording permission?): \(error.localizedDescription)")
  }
}
dispatchMain()
