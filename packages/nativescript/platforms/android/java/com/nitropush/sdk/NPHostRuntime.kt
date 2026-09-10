package com.nitropush.sdk
import android.content.Context
internal object NPHostRuntime {
    fun accepts(kind: String) = kind == "nativescript"
    fun reload(context: Context) { error("NativeScript supports only ON_NEXT_RESTART") }
}
