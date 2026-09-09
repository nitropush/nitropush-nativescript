import Foundation

@objc(NitroPushNativeScript)
public final class NitroPushNativeScript: NSObject {
    @objc public static let shared = NitroPushNativeScript()
    private let queue = DispatchQueue(label: "org.nitropush.nativescript")
    private var configured = false

    /// Called by the generated main before allocating NativeScript/V8.
    @objc public static func selectRoot(_ embeddedRoot: String) -> String {
        let bridge = shared
        do {
            func required(_ name: String) throws -> String {
                guard let value = Bundle.main.object(forInfoDictionaryKey: name) as? String, !value.isEmpty else {
                    throw NSError(domain: "NitroPush", code: 1, userInfo: nil)
                }
                return value
            }
            let runtime = try required("NITROPUSH_RUNTIME_VERSION")
            guard runtime.range(of: "^[a-f0-9]{64}$", options: .regularExpression) != nil else { return embeddedRoot }
            try NitroPushSdk.shared.configure(NPConfig(
                deploymentKey: try required("NITROPUSH_DEPLOYMENT_KEY"),
                appVersion: runtime,
                bundlePublicKey: try required("NITROPUSH_BUNDLE_PUBLIC_KEY")
            ))
            bridge.configured = true
            let root = NitroPushSdk.shared.verifiedApplicationRoot(embeddedRoot: URL(fileURLWithPath: embeddedRoot))
            if let root = root { return root.path }
            if NitroPushSdk.shared.getCurrentPackage() != nil {
                // No unverified selection may be reported healthy by the embedded app.
                NitroPushSdk.shared.clearUpdates()
            }
        } catch { bridge.configured = false }
        return embeddedRoot
    }

    @objc public func execute(_ operation: String, completion: @escaping (String?, String?) -> Void) {
        queue.async {
            guard self.configured else {
                DispatchQueue.main.async { completion(nil, "NitroPush bootstrap/configuration is missing; rebuild the native app") }
                return
            }
            func done(_ result: String?, _ error: String? = nil) {
                DispatchQueue.main.async { completion(result, error) }
            }
            switch operation {
            case "ready": NitroPushSdk.shared.notifyAppReady(); done("null")
            case "current": done(self.json(NitroPushSdk.shared.getCurrentPackage()))
            case "pending": done(self.json(NitroPushSdk.shared.getPendingPackage()))
            case "clearPending": NitroPushSdk.shared.clearPendingUpdate(); done("null")
            case "sync":
                let semaphore = DispatchSemaphore(value: 0)
                Task {
                    defer { semaphore.signal() }
                    do {
                        if NitroPushSdk.shared.getPendingPackage() != nil {
                            done("{\"status\":\"UPDATE_INSTALLED\"}"); return
                        }
                        guard let remote = try await NitroPushSdk.shared.checkForUpdate(deploymentKeyOverride: nil) else {
                            done("{\"status\":\"UP_TO_DATE\"}"); return
                        }
                        let local = try await NitroPushSdk.shared.downloadUpdate(remote)
                        try await NitroPushSdk.shared.installUpdate(pkg: local, installMode: .onNextRestart, minimumBackgroundDuration: 0)
                        done("{\"status\":\"UPDATE_INSTALLED\"}")
                    } catch { done(nil, "NitroPush update failed verification or download") }
                }
                semaphore.wait()
            default: done(nil, "Unsupported NitroPush operation")
            }
        }
    }

    private func json(_ package: NPLocalPackage?) -> String {
        guard let package = package else { return "null" }
        let value: [String: Any] = ["releaseId": package.releaseId, "label": package.label,
            "appVersion": package.appVersion, "isPending": package.isPending]
        guard let data = try? JSONSerialization.data(withJSONObject: value) else { return "null" }
        return String(data: data, encoding: .utf8) ?? "null"
    }
}
