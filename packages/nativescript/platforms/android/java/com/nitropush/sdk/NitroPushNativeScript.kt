package com.nitropush.sdk

import android.content.Context
import android.content.pm.PackageManager
import android.os.Handler
import android.os.Looper
import java.io.File
import java.util.concurrent.Executors
import org.json.JSONObject

class NitroPushNativeScript private constructor() {
    private val executor = Executors.newSingleThreadExecutor()
    private val main = Handler(Looper.getMainLooper())
    private var configured = false
    @Volatile private var applicationRoot = ""

    companion object {
        private val instance = NitroPushNativeScript()
        @JvmStatic fun getInstance() = instance

        /** Injected after APK extraction, before AppConfig and Runtime initialization. */
        @JvmStatic fun selectRoot(context: Context, embeddedRoot: File): File {
            instance.applicationRoot = File(embeddedRoot, "app").absolutePath
            if ((context.applicationInfo.flags and android.content.pm.ApplicationInfo.FLAG_DEBUGGABLE) != 0) return embeddedRoot
            return runCatching {
                val metadata = context.packageManager.getApplicationInfo(context.packageName, PackageManager.GET_META_DATA).metaData
                fun required(name: String) = metadata?.getString(name)?.takeIf { it.isNotBlank() } ?: error("Missing native configuration")
                val runtime = required("NITROPUSH_RUNTIME_VERSION")
                check(Regex("^[a-f0-9]{64}$").matches(runtime))
                NitroPushSdk.install(context)
                NitroPushSdk.shared.configure(NPConfig(
                    deploymentKey = required("NITROPUSH_DEPLOYMENT_KEY"),
                    appVersion = runtime,
                    bundlePublicKey = required("NITROPUSH_BUNDLE_PUBLIC_KEY"),
                ))
                instance.configured = true
                val root = NitroPushSdk.shared.verifiedApplicationRoot(embeddedRoot)
                if (root == null) {
                    if (NitroPushSdk.shared.getCurrentPackage() != null) NitroPushSdk.shared.clearUpdates()
                    embeddedRoot
                } else {
                    // These runtime-owned files always come from this APK, never from OTA.
                    for (name in listOf("internal", "metadata")) {
                        val source = File(embeddedRoot, name)
                        if (source.exists()) check(source.copyRecursively(File(root, name), overwrite = true))
                    }
                    instance.applicationRoot = File(root, "app").absolutePath
                    root
                }
            }.getOrElse { instance.configured = false; embeddedRoot }
        }
    }

    /** NativeScript's JS file APIs otherwise keep resolving ~/ against filesDir/app. */
    fun getApplicationRoot(): String = applicationRoot

    fun execute(operation: String, callback: NitroPushCallback) {
        executor.execute {
            var result: String? = null
            var error: String? = null
            var phase = "check"
            try {
                check(configured) { "NitroPush bootstrap/configuration is missing" }
                val core = NitroPushSdk.shared
                result = when (operation) {
                    "ready" -> { core.notifyAppReady(); "null" }
                    "current" -> json(core.getCurrentPackage())
                    "pending" -> json(core.getPendingPackage())
                    "clearPending" -> { core.clearPendingUpdate(); "null" }
                    "sync" -> {
                        if (core.getPendingPackage() != null) "{\"status\":\"UPDATE_INSTALLED\"}"
                        else {
                            val remote = core.checkForUpdate()
                            if (remote == null) "{\"status\":\"UP_TO_DATE\"}"
                            else {
                                phase = "download/verification"
                                val local = core.downloadUpdate(remote)
                                phase = "install"
                                core.installUpdate(local, NPInstallMode.ON_NEXT_RESTART, 0.0)
                                "{\"status\":\"UPDATE_INSTALLED\"}"
                            }
                        }
                    }
                    else -> error("Unsupported NitroPush operation")
                }
            } catch (_: Throwable) {
                error = if (!configured) "NitroPush bootstrap/configuration is missing; rebuild the native app"
                else "Update $phase failed. Check the deployment key, connection, signing public key and runtime version."
            }
            main.post { callback.complete(result, error) }
        }
    }

    private fun json(pkg: NPLocalPackage?): String = if (pkg == null) "null" else JSONObject()
        .put("releaseId", pkg.releaseId).put("label", pkg.label)
        .put("appVersion", pkg.appVersion).put("isPending", pkg.isPending).toString()
}
