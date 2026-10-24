import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';

/// Picture-in-Picture. Android: MainActivity enters PiP when the viewer leaves the app while a
/// title plays (onUserLeaveHint), or when asked (the PiP button), and reports changes back.
/// iOS: AVPlayer PiP needs an AVPictureInPictureController on the native player view, which
/// video_player doesn't expose — see apps/mobile/README.md.
abstract final class PictureInPicture {
  static const _channel = MethodChannel('app.netfly/pip');
  static final activeListenable = ValueNotifier<bool>(false);
  static bool _initialised = false;

  static bool get supported => defaultTargetPlatform == TargetPlatform.android;
  static bool get active => activeListenable.value;

  static void _init() {
    if (_initialised) return;
    _initialised = true;
    _channel.setMethodCallHandler((call) async {
      if (call.method == 'pipChanged') activeListenable.value = call.arguments == true;
    });
  }

  /// While playing, leaving the app enters PiP automatically.
  static void setPlaying(bool playing) {
    if (!supported) return;
    _init();
    _channel.invokeMethod<void>('setAutoEnter', playing).catchError((Object _) {});
  }

  static Future<void> enter(double aspectRatio) async {
    if (!supported) return;
    _init();
    try {
      await _channel.invokeMethod<void>('enter', {'aspect': aspectRatio});
    } catch (_) {
      // Devices without PiP support simply ignore it.
    }
  }
}
