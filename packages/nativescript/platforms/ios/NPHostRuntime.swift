import Foundation

enum NPHostRuntime {
    static func accepts(kind: String) -> Bool { kind == "nativescript" }
    static func reload() { /* NativeScript activation requires a cold process launch. */ }
}
