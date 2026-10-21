public enum VideoSource: Hashable {
    case defaultDisplay
    case display(Int)
    case window(Int)
    case windowPick
    case areaPick
}

public enum Microphone: Hashable {
    case systemDefault
    case none
    case device(Int)
}

public enum Language: String, CaseIterable {
    case english, bangla, auto
}

public enum Role: String, CaseIterable {
    case candidate, interviewer, meeting
}

/// What the user picked in the menu; turns into `localscribe start` arguments.
public struct BarOptions: Equatable {
    public var name: String = ""
    public var source: VideoSource = .defaultDisplay
    public var mic: Microphone = .systemDefault
    public var systemAudio = true
    public var transcribe = false
    public var notes = false
    public var live = false
    public var draw = false
    public var language: Language = .english
    public var role: Role = .candidate

    public init() {}

    public func startArguments() -> [String] {
        var args = ["start", "-d"]
        if !name.isEmpty {
            args += ["--name", name]
        }
        switch source {
        case .defaultDisplay: break
        case .display(let id): args += ["--display", String(id)]
        case .window(let id): args += ["--window", String(id)]
        case .windowPick: args += ["--window", "pick"]
        case .areaPick: args += ["--area", "pick"]
        }
        switch mic {
        case .systemDefault: break
        case .none: args.append("--no-mic")
        case .device(let device): args += ["--mic", String(device)]
        }
        if !systemAudio { args.append("--no-system-audio") }
        if transcribe { args.append("--transcribe") }
        if notes { args.append("--notes") }
        if live { args.append("--live") }
        if draw { args.append("--draw") }
        if transcribe || notes || live { args += ["--lang", language.rawValue] }
        if live { args += ["--role", role.rawValue] }
        return args
    }
}
