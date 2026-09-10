package com.nitropush.sdk
// Full-tree NativeScript alpha does not link an untested native patcher.
internal object BspatchJni {
    fun patch(basePath: String, patchPath: String, outPath: String, expectedSize: Long): Int = error("NativeScript delta updates are not enabled")
}
