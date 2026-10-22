import AppKit

final class NotificationDelegate: NSObject, NSUserNotificationCenterDelegate {
    let filePath: String
    init(filePath: String) {
        self.filePath = filePath
    }
    func userNotificationCenter(_ center: NSUserNotificationCenter, didActivate notification: NSUserNotification) {
        let url = URL(fileURLWithPath: filePath)
        NSWorkspace.shared.open(url)
        exit(0)
    }
    func userNotificationCenter(_ center: NSUserNotificationCenter, shouldPresent notification: NSUserNotification) -> Bool {
        return true
    }
}

let args = CommandLine.arguments
let title = args.count > 1 ? args[1] : "Localscribe"
let path = args.count > 2 ? args[2] : ""

if !path.isEmpty {
    let center = NSUserNotificationCenter.default
    let delegate = NotificationDelegate(filePath: path)
    center.delegate = delegate

    let notif = NSUserNotification()
    notif.title = title
    notif.subtitle = "Recording saved"
    notif.informativeText = "Tap to open: " + (path as NSString).lastPathComponent
    notif.userInfo = ["path": path]
    notif.hasActionButton = true
    notif.actionButtonTitle = "Open"

    center.deliver(notif)
    RunLoop.current.run(until: Date().addingTimeInterval(60))
}
