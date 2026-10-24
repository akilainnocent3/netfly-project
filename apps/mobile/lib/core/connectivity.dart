import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'public_config.dart';
import 'session.dart';
import 'viewer_prefs.dart';

/// The current network types (wifi, mobile, none…), live.
final connectivityProvider = StreamProvider<List<ConnectivityResult>>((ref) async* {
  final connectivity = Connectivity();
  yield await connectivity.checkConnectivity();
  yield* connectivity.onConnectivityChanged;
});

final isOfflineProvider = Provider<bool>((ref) {
  final types = ref.watch(connectivityProvider).value;
  return types != null && types.every((t) => t == ConnectivityResult.none);
});

/// Unmetered networks: Data saver allows autoplay only on these.
final isUnmeteredProvider = Provider<bool>((ref) {
  final types = ref.watch(connectivityProvider).value ?? const [];
  return types.any((t) => t == ConnectivityResult.wifi || t == ConnectivityResult.ethernet);
});

/// May a muted preview (hero trailer, title preview) start by itself? The viewer's "Autoplay
/// previews" (account), then Data saver (this device: Wi-Fi only), then reduced motion (checked
/// by the widget, which has the MediaQuery). Signed out: the Studio default.
final previewAutoplayProvider = Provider<bool>((ref) {
  final user = ref.watch(userProvider);
  final allowed = user?.autoplayPreviews ?? ref.watch(publicConfigProvider).flag('playback.autoplay_default', true);
  if (!allowed) return false;
  if (ref.watch(viewerPrefsProvider.select((p) => p.dataSaver)) && !ref.watch(isUnmeteredProvider)) return false;
  return true;
});

/// May the next episode start by itself after the countdown?
final nextEpisodeAutoplayProvider = Provider<bool>((ref) {
  final user = ref.watch(userProvider);
  if (user?.autoplayNext == false) return false;
  if (ref.watch(viewerPrefsProvider.select((p) => p.dataSaver)) && !ref.watch(isUnmeteredProvider)) return false;
  return true;
});
