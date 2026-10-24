import 'dart:async';
import 'dart:convert';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'http.dart';

/// `GET /api/public/config` — branding, feature flags and player settings, the same values the
/// web reads. Cached on the device so a cold start (or an offline one) renders in the right
/// colours at once, then refreshed in the background.
class PublicConfig {
  const PublicConfig(this.values);

  static const empty = PublicConfig({});

  final Map<String, Object?> values;

  String str(String key, String fallback) {
    final value = values[key];
    return value is String && value.isNotEmpty ? value : fallback;
  }

  num number(String key, num fallback) {
    final value = values[key];
    return value is num ? value : fallback;
  }

  int integer(String key, int fallback) => number(key, fallback).round();

  bool flag(String key, bool fallback) {
    final value = values[key];
    return value is bool ? value : fallback;
  }

  List<String> list(String key) {
    final value = values[key];
    return value is List ? value.map((e) => '$e').toList() : const [];
  }

  String get siteName => str('branding.site_name', 'NETFLY');
}

const _cacheKey = 'netfly.public_config.v1';

final sharedPreferencesProvider = Provider<SharedPreferences>(
  (ref) => throw UnimplementedError('Overridden in main() after SharedPreferences.getInstance()'),
);

class PublicConfigController extends Notifier<PublicConfig> {
  Timer? _timer;

  @override
  PublicConfig build() {
    ref.onDispose(() => _timer?.cancel());
    final prefs = ref.read(sharedPreferencesProvider);
    final cached = prefs.getString(_cacheKey);
    unawaited(refresh());
    // Settings apply within seconds on the web; the app re-reads them every few minutes.
    _timer = Timer.periodic(const Duration(minutes: 5), (_) => unawaited(refresh()));
    if (cached != null) {
      try {
        return PublicConfig(Map<String, Object?>.from(jsonDecode(cached) as Map));
      } catch (_) {
        // A corrupt cache is ignored; the fetch below replaces it.
      }
    }
    return PublicConfig.empty;
  }

  Future<void> refresh() async {
    try {
      final response = await ref.read(publicDioProvider).get<Map<String, Object?>>('/api/public/config');
      final values = response.data?['values'];
      if (values is! Map) return;
      final next = PublicConfig(Map<String, Object?>.from(values));
      state = next;
      await ref.read(sharedPreferencesProvider).setString(_cacheKey, jsonEncode(next.values));
    } catch (_) {
      // Offline: keep the cached values.
    }
  }
}

final publicConfigProvider = NotifierProvider<PublicConfigController, PublicConfig>(PublicConfigController.new);
