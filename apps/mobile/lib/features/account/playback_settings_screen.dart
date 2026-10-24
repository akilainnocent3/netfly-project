import 'dart:async';

import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:material_ui/material_ui.dart';

import '../../api/generated/models/patched_user_request.dart';
import '../../api/generated/models/user.dart';
import '../../brand/netfly_loader.dart';
import '../../core/api_error.dart';
import '../../core/http.dart';
import '../../core/public_config.dart';
import '../../core/session.dart';
import '../../core/theme.dart';
import '../../core/viewer_prefs.dart';
import '../../widgets/confirm_dialog.dart';

/// The web's quality options (Account → Playback).
const qualities = [
  ('auto', 'Auto — highest quality'),
  ('2160', '4K (2160p)'),
  ('1080', 'Full HD (1080p)'),
  ('720', 'HD (720p)'),
  ('480', '480p'),
  ('data_saver', 'Data saver'),
];

const subtitleLanguages = [('', 'Off'), ('en', 'English'), ('sw', 'Swahili'), ('fr', 'French')];

/// Saves one account preference (PATCH /auth/me) and updates the session's user — the web's
/// `useSavePref`. Returns false when it failed (the error is shown with a Retry).
Future<bool> savePreference(BuildContext context, WidgetRef ref, PatchedUserRequest patch) async {
  final messenger = ScaffoldMessenger.of(context);
  try {
    final user = await ref.read(apiProvider).auth.authMeUpdate(body: patch);
    ref.read(sessionProvider.notifier).updateUser(user);
    messenger.showSnackBar(const SnackBar(content: Text('Saved'), duration: Duration(milliseconds: 1800)));
    return true;
  } catch (e) {
    messenger.showSnackBar(
      SnackBar(
        content: Text(ApiError.from(e).message),
        action: context.mounted
            ? SnackBarAction(label: 'Retry', onPressed: () => savePreference(context, ref, patch))
            : null,
      ),
    );
    return false;
  }
}

/// Account → Playback: autoplay (per account — every profile), Data saver (this device only),
/// default quality and subtitles. Turning autoplay **on** asks first and says what it costs in
/// mobile data; the MB figures come from the live bitrate ladder (`/api/public/config`), never a
/// hard-coded number. Turning anything off saves at once.
class PlaybackSettingsScreen extends ConsumerStatefulWidget {
  const PlaybackSettingsScreen({super.key});

  @override
  ConsumerState<PlaybackSettingsScreen> createState() => _PlaybackSettingsScreenState();
}

class _PlaybackSettingsScreenState extends ConsumerState<PlaybackSettingsScreen> {
  /// The preference being saved: its control is disabled and shows the loader.
  String? _saving;

  Future<void> _save(String key, PatchedUserRequest patch) async {
    if (_saving != null) return;
    setState(() => _saving = key);
    await savePreference(context, ref, patch);
    if (mounted) setState(() => _saving = null);
  }

  String _usage({required bool previews}) {
    final config = ref.read(publicConfigProvider);
    final mb = config.number(previews ? 'playback.preview_mb_per_minute' : 'playback.episode_mb_per_minute', 0);
    if (mb <= 0) return '';
    final n = mb == mb.roundToDouble() ? mb.toInt().toString() : mb.toStringAsFixed(1);
    return previews ? ' (about $n MB per minute of preview)' : ' (up to about $n MB per minute of video)';
  }

  Future<void> _autoplay(String key, bool on) async {
    unawaited(HapticFeedback.selectionClick());
    final previews = key == 'autoplay_previews';
    if (on) {
      final ok = await confirm(
        context,
        title: previews ? 'Turn on autoplay previews?' : 'Turn on autoplay next episode?',
        body: 'Autoplay plays video automatically and uses mobile data${_usage(previews: previews)}. Turn on?',
        confirmLabel: 'Turn on',
      );
      if (!ok || !mounted) return;
    }
    await _save(key, previews ? PatchedUserRequest(autoplayPreviews: on) : PatchedUserRequest(autoplayNext: on));
  }

  Future<void> _dataSaver(bool on) async {
    unawaited(HapticFeedback.selectionClick());
    if (!on) {
      final ok = await confirm(
        context,
        title: 'Autoplay on mobile data?',
        body: 'With Data saver off, autoplay also runs on mobile data${_usage(previews: true)}. Turn Data saver off?',
        confirmLabel: 'Turn off',
      );
      if (!ok || !mounted) return;
    }
    ref.read(viewerPrefsProvider.notifier).setDataSaver(on);
  }

  Future<void> _pick(String key, String title, List<(String, String)> options, String current) async {
    final t = NetflyTheme.of(context);
    final picked = await showModalBottomSheet<String>(
      context: context,
      backgroundColor: t.elevated,
      showDragHandle: true,
      builder: (context) => SafeArea(
        child: RadioGroup<String>(
          groupValue: current,
          onChanged: (v) => Navigator.of(context).pop(v),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Padding(
                padding: const EdgeInsets.fromLTRB(24, 0, 24, 8),
                child: Align(
                  alignment: Alignment.centerLeft,
                  child: Text(title, style: NetflyType.h2.copyWith(color: t.text)),
                ),
              ),
              for (final (value, label) in options)
                RadioListTile<String>(value: value, title: Text(label), activeColor: t.accent),
              const SizedBox(height: 8),
            ],
          ),
        ),
      ),
    );
    if (picked == null || picked == current || !mounted) return;
    await _save(
      key,
      key == 'preferred_quality'
          ? PatchedUserRequest(preferredQuality: picked)
          : PatchedUserRequest(subtitlesLanguage: picked),
    );
  }

  @override
  Widget build(BuildContext context) {
    final t = NetflyTheme.of(context);
    final User? user = ref.watch(userProvider);
    final dataSaver = ref.watch(viewerPrefsProvider.select((p) => p.dataSaver));
    if (user == null) return const Scaffold(body: LoaderScreen());
    final quality = user.preferredQuality?.isNotEmpty == true ? user.preferredQuality! : 'auto';
    final subtitles = user.subtitlesLanguage ?? '';
    String labelOf(List<(String, String)> options, String value) =>
        options.firstWhere((o) => o.$1 == value, orElse: () => options.first).$2;

    return Scaffold(
      appBar: AppBar(title: const Text('Playback')),
      body: ListView(
        padding: const EdgeInsets.only(bottom: 32),
        children: [
          const _Section('Autoplay'),
          _Switch(
            title: 'Autoplay next episode',
            subtitle: 'Start the next episode automatically after a countdown.',
            value: user.autoplayNext ?? true,
            saving: _saving == 'autoplay_next',
            enabled: _saving == null,
            onChanged: (v) => _autoplay('autoplay_next', v),
          ),
          _Switch(
            title: 'Autoplay previews',
            subtitle: 'Play trailers on browse and in title details (muted).',
            value: user.autoplayPreviews ?? true,
            saving: _saving == 'autoplay_previews',
            enabled: _saving == null,
            onChanged: (v) => _autoplay('autoplay_previews', v),
          ),
          _Switch(
            title: 'Data saver: autoplay on Wi-Fi only',
            subtitle: 'On this device, previews and the next episode start by themselves only on Wi-Fi.',
            value: dataSaver,
            saving: false,
            enabled: true,
            onChanged: _dataSaver,
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(NetflySpace.gutter, 4, NetflySpace.gutter, 8),
            child: Text(
              'Autoplay settings apply to every profile on your account. Data saver applies to this device.',
              style: NetflyType.meta.copyWith(color: t.muted),
            ),
          ),
          const _Section('Video and subtitles'),
          _Choice(
            title: 'Default quality',
            value: labelOf(qualities, quality),
            saving: _saving == 'preferred_quality',
            onTap: _saving == null ? () => _pick('preferred_quality', 'Default quality', qualities, quality) : null,
          ),
          _Choice(
            title: 'Subtitles by default',
            value: labelOf(subtitleLanguages, subtitles),
            saving: _saving == 'subtitles_language',
            onTap: _saving == null
                ? () => _pick('subtitles_language', 'Subtitles by default', subtitleLanguages, subtitles)
                : null,
          ),
        ],
      ),
    );
  }
}

class _Section extends StatelessWidget {
  const _Section(this.label);

  final String label;

  @override
  Widget build(BuildContext context) {
    final t = NetflyTheme.of(context);
    return Padding(
      padding: const EdgeInsets.fromLTRB(NetflySpace.gutter, 24, NetflySpace.gutter, 8),
      child: Semantics(
        header: true,
        child: Text(
          label.toUpperCase(),
          style: NetflyType.caption.copyWith(color: t.muted, fontWeight: FontWeight.w700, letterSpacing: 1),
        ),
      ),
    );
  }
}

class _Switch extends StatelessWidget {
  const _Switch({
    required this.title,
    required this.subtitle,
    required this.value,
    required this.saving,
    required this.enabled,
    required this.onChanged,
  });

  final String title;
  final String subtitle;
  final bool value;
  final bool saving;
  final bool enabled;
  final ValueChanged<bool> onChanged;

  @override
  Widget build(BuildContext context) {
    final t = NetflyTheme.of(context);
    return SwitchListTile(
      contentPadding: const EdgeInsets.symmetric(horizontal: NetflySpace.gutter),
      value: value,
      onChanged: enabled ? onChanged : null,
      activeThumbColor: t.accentFg,
      activeTrackColor: t.accent,
      title: Row(
        children: [
          Flexible(
            child: Text(
              title,
              style: NetflyType.body.copyWith(color: t.text, fontWeight: FontWeight.w600),
            ),
          ),
          if (saving) ...[const SizedBox(width: 8), const NetflyLoader(size: LoaderSize.sm, label: 'Saving')],
        ],
      ),
      subtitle: Text(subtitle, style: NetflyType.meta.copyWith(color: t.muted)),
    );
  }
}

class _Choice extends StatelessWidget {
  const _Choice({required this.title, required this.value, required this.saving, required this.onTap});

  final String title;
  final String value;
  final bool saving;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final t = NetflyTheme.of(context);
    return ListTile(
      contentPadding: const EdgeInsets.symmetric(horizontal: NetflySpace.gutter),
      minTileHeight: 56,
      onTap: onTap,
      title: Text(
        title,
        style: NetflyType.body.copyWith(color: t.text, fontWeight: FontWeight.w600),
      ),
      subtitle: Text(value, style: NetflyType.meta.copyWith(color: t.muted)),
      trailing: saving
          ? const NetflyLoader(size: LoaderSize.sm, label: 'Saving')
          : Icon(Icons.chevron_right_rounded, color: t.muted),
    );
  }
}
