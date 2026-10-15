import Foundation

/// Parsed `localscribe status --json`.
public struct RecordingStatus: Equatable {
    public var isRecording: Bool
    public var file: String?
    public var elapsedMs: Int

    public static let idle = RecordingStatus(isRecording: false, file: nil, elapsedMs: 0)

    private struct Wire: Decodable {
        var recording: Bool
        var file: String?
        var elapsedMs: Int?
    }

    /// Anything that is not a status document (for example the plain "not recording") counts as idle.
    public static func parse(_ data: Data) -> RecordingStatus {
        guard let wire = try? JSONDecoder().decode(Wire.self, from: data), wire.recording else { return .idle }
        return RecordingStatus(isRecording: true, file: wire.file, elapsedMs: wire.elapsedMs ?? 0)
    }

    public var elapsedText: String {
        let seconds = Int((Double(elapsedMs) / 1000).rounded())
        let pad = seconds % 60 < 10 ? "0" : ""
        return "\(seconds / 60)m\(pad)\(seconds % 60)s"
    }
}

/// Parsed `localscribe devices --json`.
public struct DeviceReport: Decodable, Equatable {
    public struct Display: Decodable, Equatable {
        public var id: Int
        public var name: String
        public var width: Int
        public var height: Int
        public var label: String { "\(name) (\(width)x\(height))" }
    }

    public struct Window: Decodable, Equatable {
        public var id: Int
        public var app: String
        public var title: String
        public var label: String { title.isEmpty ? app : "\(app) - \(title)" }
    }

    public struct Mic: Decodable, Equatable {
        public var device: Int
        public var name: String
    }

    public var displays: [Display]
    public var windows: [Window]
    public var microphones: [Mic]

    public init(displays: [Display], windows: [Window], microphones: [Mic]) {
        self.displays = displays
        self.windows = windows
        self.microphones = microphones
    }

    public static func parse(_ data: Data) throws -> DeviceReport {
        try JSONDecoder().decode(DeviceReport.self, from: data)
    }
}

/// The newest `*.notes.md` among the given recordings-folder entries.
public func newestNotesFile(_ files: [(name: String, modified: Date)]) -> String? {
    files.filter { $0.name.hasSuffix(".notes.md") }.max { $0.modified < $1.modified }?.name
}
