import AppKit
import BarCore
import Foundation

@MainActor
final class BarModel: ObservableObject {
    @Published var options = BarOptions()
    @Published var status = RecordingStatus.idle
    @Published var devices = DeviceReport(displays: [], windows: [], microphones: [])
    @Published var message: String?
    @Published var busy = false

    private let recordingsDir = NSHomeDirectory() + "/Movies/localscribe"
    private var timer: Timer?

    init() {
        Task { await refreshDevices() }
        Task { await refreshStatus() }
        timer = Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { [weak self] _ in
            Task { @MainActor in await self?.refreshStatus() }
        }
    }

    var menuTitle: String { status.isRecording ? status.elapsedText : "" }

    var statusLine: String {
        if let message { return message }
        guard status.isRecording else { return "Not recording" }
        let name = status.file.map { ($0 as NSString).lastPathComponent } ?? "recording"
        return "Recording \(name) (\(status.elapsedText))"
    }

    func refreshStatus() async {
        status = RecordingStatus.parse(await Cli.run(["status", "--json"]).stdout)
    }

    func refreshDevices() async {
        let result = await Cli.run(["devices", "--json"])
        if let report = try? DeviceReport.parse(result.stdout) { devices = report }
        else { message = firstLine(result.stderr, fallback: "devices failed") }
    }

    func start() async {
        busy = true
        message = [.windowPick, .areaPick].contains(options.source) ? "Pick on screen..." : "Starting..."
        let result = await Cli.run(options.startArguments())
        busy = false
        message = result.code == 0 ? nil : firstLine(result.stderr, fallback: "start failed")
        await refreshStatus()
        if result.code == 0, options.live { openLiveView() }
    }

    func stop() async {
        busy = true
        message = "Stopping..."
        let result = await Cli.run(["stop"])
        busy = false
        message = result.code == 0 ? nil : firstLine(result.stderr, fallback: "stop failed")
        await refreshStatus()
    }

    func openLiveView() {
        guard let command = Cli.command else { return }
        Process.launchedProcess(launchPath: "/usr/bin/osascript", arguments: command.liveTerminalOsascriptArguments())
    }

    func openRecordingsFolder() {
        NSWorkspace.shared.open(URL(fileURLWithPath: recordingsDir))
    }

    func showLastNotes() {
        let names = (try? FileManager.default.contentsOfDirectory(atPath: recordingsDir)) ?? []
        let files = names.map { name -> (name: String, modified: Date) in
            let attrs = try? FileManager.default.attributesOfItem(atPath: "\(recordingsDir)/\(name)")
            return (name, (attrs?[.modificationDate] as? Date) ?? .distantPast)
        }
        guard let newest = newestNotesFile(files) else { message = "No notes yet"; return }
        NSWorkspace.shared.activateFileViewerSelecting([URL(fileURLWithPath: "\(recordingsDir)/\(newest)")])
    }

    private func firstLine(_ text: String, fallback: String) -> String {
        text.split(separator: "\n").first.map(String.init) ?? fallback
    }
}
