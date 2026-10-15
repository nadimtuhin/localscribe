// swift-tools-version:5.9
import PackageDescription

let package = Package(
    name: "LocalscribeBar",
    platforms: [.macOS(.v13)],
    targets: [
        .target(name: "BarCore"),
        .executableTarget(name: "LocalscribeBar", dependencies: ["BarCore"]),
        .testTarget(name: "BarCoreTests", dependencies: ["BarCore"]),
    ]
)
