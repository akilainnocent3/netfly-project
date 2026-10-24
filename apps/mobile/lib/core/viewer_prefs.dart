import 'dart:convert';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'public_config.dart';
import 'session.dart';

/// On-device viewer settings: the active profile (sent as `X-Profile`), the translation mode the
/// viewer picked, Data saver (autoplay on Wi-Fi only — mobile only) and recent searches.
class ViewerPrefs {
  const ViewerPrefs({this.profileId, this.mode, this.dataSaver = true, this.recentSearches = const []});

  final int? profileId;
  final String? mode;
  final bool dataSaver;
  final List<String> recentSearches;

  ViewerPrefs copyWith({
    int? profileId,
    bool clearProfile = false,
    String? mode,
    bool? dataSaver,
    List<String>? recentSearches,
  }) => ViewerPrefs(
    profileId: clearProfile ? null : profileId ?? this.profileId,
    mode: mode ?? this.mode,
    dataSaver: dataSaver ?? this.dataSaver,
    recentSearches: recentSearches ?? this.recentSearches,
  );

  Map<String, Object?> toJson() => {
    'profile': profileId,
    'mode': mode,
    'data_saver': dataSaver,
    'recent': recentSearches,
  };

  static ViewerPrefs fromJson(Map<String, Object?> json) => ViewerPrefs(
    profileId: (json['profile'] as num?)?.toInt(),
    mode: json['mode'] as String?,
    dataSaver: json['data_saver'] as bool? ?? true,
    recentSearches: (json['recent'] as List?)?.map((e) => '$e').toList() ?? const [],
  );
}

const _prefsKey = 'netfly.viewer_prefs.v1';
const translationModes = ['translated', 'not_translated', 'all'];

class ViewerPrefsController extends Notifier<ViewerPrefs> {
  @override
  ViewerPrefs build() {
    final raw = ref.read(sharedPreferencesProvider).getString(_prefsKey);
    if (raw == null) return const ViewerPrefs();
    try {
      return ViewerPrefs.fromJson(Map<String, Object?>.from(jsonDecode(raw) as Map));
    } catch (_) {
      return const ViewerPrefs();
    }
  }

  void _save(ViewerPrefs next) {
    state = next;
    ref.read(sharedPreferencesProvider).setString(_prefsKey, jsonEncode(next.toJson()));
  }

  void setProfile(int? id) => _save(id == null ? state.copyWith(clearProfile: true) : state.copyWith(profileId: id));
  void setMode(String mode) => _save(state.copyWith(mode: mode));
  void setDataSaver(bool on) => _save(state.copyWith(dataSaver: on));

  void rememberSearch(String query) {
    final q = query.trim();
    if (q.length < 2) return;
    final next = [q, ...state.recentSearches.where((s) => s.toLowerCase() != q.toLowerCase())].take(8).toList();
    _save(state.copyWith(recentSearches: next));
  }

  void clearSearches() => _save(state.copyWith(recentSearches: const []));
}

final viewerPrefsProvider = NotifierProvider<ViewerPrefsController, ViewerPrefs>(ViewerPrefsController.new);

/// The translation mode, resolved like the web (decision 20): the viewer's pick on this device →
/// their account's mode → `content.default_translation_mode`.
final translationModeProvider = Provider<String>((ref) {
  final picked = ref.watch(viewerPrefsProvider.select((p) => p.mode));
  if (picked != null && translationModes.contains(picked)) return picked;
  final account = ref.watch(userProvider)?.translationMode;
  if (account != null && translationModes.contains(account)) return account;
  final fallback = ref.watch(publicConfigProvider).str('content.default_translation_mode', 'translated');
  return translationModes.contains(fallback) ? fallback : 'translated';
});
