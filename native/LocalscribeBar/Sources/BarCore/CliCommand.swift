/// How to run the localscribe CLI: an executable plus leading arguments (for example `bun /repo/src/cli.ts`).
public struct CliCommand: Equatable {
    public var executable: String
    public var prefix: [String]

    public init(executable: String, prefix: [String]) {
        self.executable = executable
        self.prefix = prefix
    }

    /// `LOCALSCRIBE_CLI` (a `.ts` script runs under bun, anything else runs directly), else `src/cli.ts`
    /// found by walking up from the app binary and the working directory. `LOCALSCRIBE_BUN` overrides bun.
    public static func resolve(
        env: [String: String], home: String, executablePath: String, cwd: String, exists: (String) -> Bool
    ) -> CliCommand? {
        guard let script = env["LOCALSCRIBE_CLI"] ?? findScript(from: [executablePath, cwd], exists: exists) else { return nil }
        guard script.hasSuffix(".ts") else { return CliCommand(executable: script, prefix: []) }
        let bunCandidates = [env["LOCALSCRIBE_BUN"]].compactMap { $0 } + [
            "\(home)/.bun/bin/bun", "/opt/homebrew/bin/bun", "/usr/local/bin/bun", "\(home)/.local/share/mise/shims/bun",
        ]
        guard let bun = bunCandidates.first(where: exists) ?? env["LOCALSCRIBE_BUN"] else { return nil }
        return CliCommand(executable: bun, prefix: [script])
    }

    private static func findScript(from starts: [String], exists: (String) -> Bool) -> String? {
        for start in starts {
            var parts = start.split(separator: "/").map(String.init)
            while !parts.isEmpty {
                parts.removeLast()
                let candidate = "/" + (parts + ["src", "cli.ts"]).joined(separator: "/")
                if exists(candidate) { return candidate }
            }
        }
        return nil
    }

    /// `osascript` arguments that open Terminal running `localscribe live`.
    public func liveTerminalOsascriptArguments() -> [String] {
        let shell = (([executable] + prefix).map { "'\($0)'" } + ["live"]).joined(separator: " ")
        let escaped = shell.replacingOccurrences(of: "\\", with: "\\\\").replacingOccurrences(of: "\"", with: "\\\"")
        return [
            "-e", "tell application \"Terminal\" to do script \"\(escaped)\"",
            "-e", "tell application \"Terminal\" to activate",
        ]
    }
}
