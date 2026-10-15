import BarCore
import Foundation

struct CliResult {
    var code: Int32
    var stdout: Data
    var stderr: String
}

enum Cli {
    static let command: CliCommand? = CliCommand.resolve(
        env: ProcessInfo.processInfo.environment,
        home: NSHomeDirectory(),
        executablePath: Bundle.main.executablePath ?? CommandLine.arguments[0],
        cwd: FileManager.default.currentDirectoryPath,
        exists: { FileManager.default.isExecutableFile(atPath: $0) || FileManager.default.fileExists(atPath: $0) }
    )

    /// Runs the CLI off the main thread and returns once it exits.
    static func run(_ arguments: [String]) async -> CliResult {
        guard let command else {
            return CliResult(code: 127, stdout: Data(), stderr: "localscribe CLI not found: set LOCALSCRIBE_CLI to src/cli.ts")
        }
        return await runProcess(command.executable, command.prefix + arguments)
    }

    static func runProcess(_ executable: String, _ arguments: [String]) async -> CliResult {
        await withCheckedContinuation { continuation in
            DispatchQueue.global().async {
                let process = Process()
                process.executableURL = URL(fileURLWithPath: executable)
                process.arguments = arguments
                var env = ProcessInfo.processInfo.environment
                env["PATH"] = (env["PATH"] ?? "/usr/bin:/bin") + ":/opt/homebrew/bin:/usr/local/bin"
                process.environment = env
                let out = Pipe(), err = Pipe()
                process.standardOutput = out
                process.standardError = err
                do {
                    try process.run()
                } catch {
                    continuation.resume(returning: CliResult(code: 127, stdout: Data(), stderr: "\(error)"))
                    return
                }
                // Read before waiting so a full pipe never blocks the child.
                let data = out.fileHandleForReading.readDataToEndOfFile()
                let errData = err.fileHandleForReading.readDataToEndOfFile()
                process.waitUntilExit()
                continuation.resume(returning: CliResult(code: process.terminationStatus, stdout: data, stderr: String(decoding: errData, as: UTF8.self)))
            }
        }
    }
}
