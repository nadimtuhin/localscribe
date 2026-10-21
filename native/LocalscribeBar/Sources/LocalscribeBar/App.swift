import BarCore
import SwiftUI

/// A bare SwiftPM binary has no Info.plist, so ask for menu-bar-only behaviour explicitly.
final class BarDelegate: NSObject, NSApplicationDelegate {
    func applicationWillFinishLaunching(_ notification: Notification) {
        NSApp.setActivationPolicy(.accessory)
    }
}

@main
struct LocalscribeBarApp: App {
    @NSApplicationDelegateAdaptor(BarDelegate.self) private var delegate
    @StateObject private var model = BarModel()

    var body: some Scene {
        MenuBarExtra {
            MenuView(model: model)
        } label: {
            HStack(spacing: 4) {
                Image(systemName: model.status.isRecording && model.isFlashing ? "record.circle.fill" : "record.circle")
                if model.status.isRecording {
                    Text("REC \(model.status.elapsedText)")
                }
            }
        }
        .menuBarExtraStyle(.menu)
    }
}

struct MenuView: View {
    @ObservedObject var model: BarModel

    var body: some View {
        Text(model.statusLine)
        if model.status.isRecording {
            Button("Stop Recording") { Task { await model.stop() } }.disabled(model.busy)
        } else {
            Button("Start Recording") { Task { await model.start() } }.disabled(model.busy)
        }
        Divider()
        Button(model.options.name.isEmpty ? "Name: (Auto-summarize)" : "Name: \(model.options.name)") {
            model.promptForName()
        }
        Divider()
        Picker("Screen / window / area", selection: $model.options.source) {
            Text("Default display").tag(VideoSource.defaultDisplay)
            ForEach(model.devices.displays, id: \.id) { Text("Display: \($0.label)").tag(VideoSource.display($0.id)) }
            Text("Pick a window...").tag(VideoSource.windowPick)
            Text("Pick an area...").tag(VideoSource.areaPick)
            ForEach(model.devices.windows, id: \.id) { Text("Window: \($0.label)").tag(VideoSource.window($0.id)) }
        }
        Picker("Microphone", selection: $model.options.mic) {
            Text("Default").tag(Microphone.systemDefault)
            Text("None").tag(Microphone.none)
            ForEach(model.devices.microphones, id: \.device) { Text($0.name).tag(Microphone.device($0.device)) }
        }
        Toggle("System audio", isOn: $model.options.systemAudio)
        Divider()
        Toggle("Transcribe", isOn: $model.options.transcribe)
        Toggle("Notes", isOn: $model.options.notes)
        Toggle("Live", isOn: $model.options.live)
        Toggle("Draw", isOn: $model.options.draw)
        Picker("Language", selection: $model.options.language) {
            ForEach(Language.allCases, id: \.self) { Text($0.rawValue.capitalized).tag($0) }
        }
        if model.options.live {
            Picker("Role", selection: $model.options.role) {
                ForEach(Role.allCases, id: \.self) { Text($0.rawValue.capitalized).tag($0) }
            }
            Button("Open live view") { model.openLiveView() }
        }
        Divider()
        Button("Refresh sources") { Task { await model.refreshDevices() } }
        Button("Open recordings folder") { model.openRecordingsFolder() }
        Button("Show last notes") { model.showLastNotes() }
        Divider()
        Button("Quit") { NSApplication.shared.terminate(nil) }
    }
}
