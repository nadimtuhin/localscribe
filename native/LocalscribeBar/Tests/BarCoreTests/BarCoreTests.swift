import XCTest
@testable import BarCore

final class StartArgumentsTests: XCTestCase {
    func testDefaultsDetachOnly() {
        XCTAssertEqual(BarOptions().startArguments(), ["start", "-d"])
    }

    func testNameArgument() {
        var options = BarOptions()
        options.name = "Sprint Retro"
        XCTAssertEqual(options.startArguments(), ["start", "-d", "--name", "Sprint Retro"])
    }

    func testVideoSources() {
        var options = BarOptions()
        options.source = .window(4242)
        XCTAssertEqual(options.startArguments(), ["start", "-d", "--window", "4242"])
        options.source = .windowPick
        XCTAssertEqual(options.startArguments(), ["start", "-d", "--window", "pick"])
        options.source = .areaPick
        XCTAssertEqual(options.startArguments(), ["start", "-d", "--area", "pick"])
        options.source = .display(2)
        XCTAssertEqual(options.startArguments(), ["start", "-d", "--display", "2"])
    }

    func testMicrophoneAndSystemAudio() {
        var options = BarOptions()
        options.mic = .none
        options.systemAudio = false
        XCTAssertEqual(options.startArguments(), ["start", "-d", "--no-mic", "--no-system-audio"])
        options.mic = .device(1)
        XCTAssertEqual(options.startArguments(), ["start", "-d", "--mic", "1", "--no-system-audio"])
    }

    func testToggles() {
        var options = BarOptions()
        options.transcribe = true
        options.notes = true
        options.draw = true
        XCTAssertEqual(options.startArguments(), ["start", "-d", "--transcribe", "--notes", "--draw", "--lang", "english"])
    }

    func testLanguageFollowsTranscription() {
        var options = BarOptions()
        options.language = .bangla
        XCTAssertEqual(options.startArguments(), ["start", "-d"])
        options.transcribe = true
        XCTAssertEqual(options.startArguments(), ["start", "-d", "--transcribe", "--lang", "bangla"])
        options.language = .auto
        XCTAssertEqual(options.startArguments(), ["start", "-d", "--transcribe", "--lang", "auto"])
    }

    func testRoleOnlyWithLive() {
        var options = BarOptions()
        options.role = .interviewer
        XCTAssertEqual(options.startArguments(), ["start", "-d"])
        options.live = true
        XCTAssertEqual(options.startArguments(), ["start", "-d", "--live", "--lang", "english", "--role", "interviewer"])
    }
}

final class StatusTests: XCTestCase {
    func testParsesRecording() {
        let json = #"{"recording":true,"file":"/r/a.mp4","startedAt":"2026-10-14T22:00:00.000Z","elapsedMs":65000}"#
        let status = RecordingStatus.parse(Data(json.utf8))
        XCTAssertTrue(status.isRecording)
        XCTAssertEqual(status.file, "/r/a.mp4")
        XCTAssertEqual(status.elapsedText, "1m05s")
    }

    func testParsesIdle() {
        let status = RecordingStatus.parse(Data(#"{"recording":false}"#.utf8))
        XCTAssertFalse(status.isRecording)
        XCTAssertNil(status.file)
    }

    func testGarbageIsIdle() {
        XCTAssertFalse(RecordingStatus.parse(Data("not recording".utf8)).isRecording)
    }
}

final class DevicesTests: XCTestCase {
    let json = """
    {"displays":[{"id":1,"name":"Built-in","width":1512,"height":982,"scale":2}],
     "windows":[{"id":4242,"app":"Safari","title":"GitHub"},{"id":7,"app":"Finder","title":""}],
     "microphones":[{"device":0,"name":"MacBook Pro Microphone"}]}
    """

    func testDecodesAndLabels() throws {
        let report = try DeviceReport.parse(Data(json.utf8))
        XCTAssertEqual(report.displays[0].label, "Built-in (1512x982)")
        XCTAssertEqual(report.windows.map(\.label), ["Safari - GitHub", "Finder"])
        XCTAssertEqual(report.microphones[0].device, 0)
    }

    func testBadJSONThrows() {
        XCTAssertThrowsError(try DeviceReport.parse(Data("oops".utf8)))
    }
}

final class CliLocationTests: XCTestCase {
    func resolve(env: [String: String] = [:], files: Set<String>) -> CliCommand? {
        CliCommand.resolve(env: env, home: "/h", executablePath: "/repo/native/LocalscribeBar/.build/release/LocalscribeBar", cwd: "/elsewhere") { files.contains($0) }
    }

    func testFindsRepoByWalkingUpFromExecutable() {
        let command = resolve(files: ["/repo/src/cli.ts", "/h/.bun/bin/bun"])
        XCTAssertEqual(command, CliCommand(executable: "/h/.bun/bin/bun", prefix: ["/repo/src/cli.ts"]))
    }

    func testEnvOverridesScriptAndBun() {
        let env = ["LOCALSCRIBE_CLI": "/x/cli.ts", "LOCALSCRIBE_BUN": "/y/bun"]
        XCTAssertEqual(resolve(env: env, files: []), CliCommand(executable: "/y/bun", prefix: ["/x/cli.ts"]))
    }

    func testNonTypeScriptEnvRunsDirectly() {
        XCTAssertEqual(resolve(env: ["LOCALSCRIBE_CLI": "/usr/local/bin/localscribe"], files: []), CliCommand(executable: "/usr/local/bin/localscribe", prefix: []))
    }

    func testFallsBackToHomebrewBun() {
        let command = resolve(files: ["/repo/src/cli.ts", "/opt/homebrew/bin/bun"])
        XCTAssertEqual(command?.executable, "/opt/homebrew/bin/bun")
    }

    func testNilWhenNothingFound() {
        XCTAssertNil(resolve(files: []))
        XCTAssertNil(resolve(files: ["/repo/src/cli.ts"]))
    }
}

final class HelpersTests: XCTestCase {
    func testLiveTerminalScriptQuotesTheCommand() {
        let command = CliCommand(executable: "/b/bun", prefix: ["/my repo/cli.ts"])
        let args = command.liveTerminalOsascriptArguments()
        XCTAssertEqual(args[0], "-e")
        XCTAssertEqual(args[1], #"tell application "Terminal" to do script "'/b/bun' '/my repo/cli.ts' live""#)
        XCTAssertEqual(args.last, #"tell application "Terminal" to activate"#)
    }

    func testNewestNotesFile() {
        let files = [
            (name: "a.notes.md", modified: Date(timeIntervalSince1970: 10)),
            (name: "b.notes.md", modified: Date(timeIntervalSince1970: 30)),
            (name: "c.transcript.md", modified: Date(timeIntervalSince1970: 99)),
        ]
        XCTAssertEqual(newestNotesFile(files), "b.notes.md")
        XCTAssertNil(newestNotesFile([]))
    }
}
