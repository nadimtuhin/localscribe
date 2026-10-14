// Records system audio with ScreenCaptureKit into an AAC .m4a file.
// Usage: sysaudio <output.m4a>   Stop with SIGINT/SIGTERM; the file is finalized before exit.
import AVFoundation
import ScreenCaptureKit

func fail(_ message: String) -> Never {
  FileHandle.standardError.write((message + "\n").data(using: .utf8)!)
  exit(1)
}

// Writer state is only touched on `queue`, so cross-thread use is safe.
final class SystemAudioRecorder: NSObject, SCStreamOutput, SCStreamDelegate, @unchecked Sendable {
  private let writer: AVAssetWriter
  private let input: AVAssetWriterInput
  private var stream: SCStream?
  private var sessionStart: CMTime?
  private var finishing = false
  private let queue = DispatchQueue(label: "sysaudio")

  init(outputURL: URL) throws {
    try? FileManager.default.removeItem(at: outputURL)
    writer = try AVAssetWriter(outputURL: outputURL, fileType: .m4a)
    input = AVAssetWriterInput(mediaType: .audio, outputSettings: [
      AVFormatIDKey: kAudioFormatMPEG4AAC,
      AVSampleRateKey: 48_000,
      AVNumberOfChannelsKey: 2,
      AVEncoderBitRateKey: 160_000,
    ])
    input.expectsMediaDataInRealTime = true
    writer.add(input)
  }

  func start() async throws {
    let content = try await SCShareableContent.excludingDesktopWindows(false, onScreenWindowsOnly: false)
    guard let display = content.displays.first else { fail("no display found") }

    let config = SCStreamConfiguration()
    config.capturesAudio = true
    config.sampleRate = 48_000
    config.channelCount = 2
    config.excludesCurrentProcessAudio = true
    // Video is required by the API but unused; keep it tiny and slow.
    config.width = 2
    config.height = 2
    config.minimumFrameInterval = CMTime(value: 1, timescale: 1)

    let filter = SCContentFilter(display: display, excludingWindows: [])
    let stream = SCStream(filter: filter, configuration: config, delegate: self)
    try stream.addStreamOutput(self, type: .audio, sampleHandlerQueue: queue)
    writer.startWriting()
    // Anchor the file at "now" on the host clock (which ScreenCaptureKit timestamps use),
    // so leading silence is kept and audio stays aligned with the video's start.
    let now = CMClockGetTime(CMClockGetHostTimeClock())
    queue.sync {
      writer.startSession(atSourceTime: now)
      sessionStart = now
    }
    try await stream.startCapture()
    self.stream = stream
  }

  func stream(_ stream: SCStream, didOutputSampleBuffer buffer: CMSampleBuffer, of type: SCStreamOutputType) {
    guard type == .audio, buffer.isValid, !finishing, let start = sessionStart else { return }
    guard buffer.presentationTimeStamp >= start else { return }
    if input.isReadyForMoreMediaData { input.append(buffer) }
  }

  func stream(_ stream: SCStream, didStopWithError error: Error) {
    // Display sleep or a revoked permission: save what was recorded instead of leaving a broken file.
    FileHandle.standardError.write("capture stopped: \(error.localizedDescription)\n".data(using: .utf8)!)
    DispatchQueue.main.async { finishAndExit(code: 1) }
  }

  func finish() async {
    try? await stream?.stopCapture()
    await withCheckedContinuation { done in
      queue.async {
        guard !self.finishing else { return done.resume() }
        self.finishing = true
        self.input.markAsFinished()
        self.writer.finishWriting { done.resume() }
      }
    }
  }
}

guard CommandLine.arguments.count == 2 else { fail("usage: sysaudio <output.m4a>") }
let recorder: SystemAudioRecorder
do {
  recorder = try SystemAudioRecorder(outputURL: URL(fileURLWithPath: CommandLine.arguments[1]))
} catch {
  fail("cannot create output: \(error.localizedDescription)")
}

// Runs once on the main queue; later signals are ignored so the file is finalized exactly once.
var stopping = false
func finishAndExit(code: Int32) {
  guard !stopping else { return }
  stopping = true
  Task {
    await recorder.finish()
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
    try await recorder.start()
  } catch {
    fail("cannot start capture (grant Screen Recording permission?): \(error.localizedDescription)")
  }
}
dispatchMain()
