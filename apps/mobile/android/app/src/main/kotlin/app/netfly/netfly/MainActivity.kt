package app.netfly.netfly

import android.app.PictureInPictureParams
import android.content.pm.PackageManager
import android.content.res.Configuration
import android.os.Build
import android.util.Rational
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel

/**
 * Picture-in-Picture for the player (lib/features/player/pip.dart, channel `app.netfly/pip`):
 * `setAutoEnter(bool)` while a title plays, `enter({aspect})` from the PiP button, and
 * `pipChanged(bool)` back to Dart so the player hides its controls in the small window.
 */
class MainActivity : FlutterActivity() {
    private var channel: MethodChannel? = null
    private var autoEnter = false
    private var aspect = Rational(16, 9)

    private val pipSupported: Boolean
        get() = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O &&
            packageManager.hasSystemFeature(PackageManager.FEATURE_PICTURE_IN_PICTURE)

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
        channel = MethodChannel(flutterEngine.dartExecutor.binaryMessenger, "app.netfly/pip").apply {
            setMethodCallHandler { call, result ->
                when (call.method) {
                    "setAutoEnter" -> {
                        autoEnter = call.arguments == true
                        applyParams()
                        result.success(null)
                    }
                    "enter" -> {
                        (call.argument<Double>("aspect"))?.let { aspect = rationalFor(it) }
                        result.success(enter())
                    }
                    else -> result.notImplemented()
                }
            }
        }
    }

    /** Clamped to what Android accepts (between 1:2.39 and 2.39:1). */
    private fun rationalFor(value: Double): Rational {
        val clamped = value.coerceIn(0.42, 2.39)
        return Rational((clamped * 1000).toInt(), 1000)
    }

    private fun params(): PictureInPictureParams? {
        if (!pipSupported) return null
        val builder = PictureInPictureParams.Builder().setAspectRatio(aspect)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            builder.setAutoEnterEnabled(autoEnter).setSeamlessResizeEnabled(true)
        }
        return builder.build()
    }

    private fun applyParams() {
        params()?.let { setPictureInPictureParams(it) }
    }

    private fun enter(): Boolean {
        val p = params() ?: return false
        return try {
            enterPictureInPictureMode(p)
        } catch (_: IllegalStateException) {
            false
        }
    }

    /** Android 8–11: no auto-enter flag, so leaving the app while playing enters PiP here. */
    override fun onUserLeaveHint() {
        super.onUserLeaveHint()
        if (autoEnter && Build.VERSION.SDK_INT < Build.VERSION_CODES.S) enter()
    }

    override fun onPictureInPictureModeChanged(isInPictureInPictureMode: Boolean, newConfig: Configuration) {
        super.onPictureInPictureModeChanged(isInPictureInPictureMode, newConfig)
        channel?.invokeMethod("pipChanged", isInPictureInPictureMode)
    }
}
