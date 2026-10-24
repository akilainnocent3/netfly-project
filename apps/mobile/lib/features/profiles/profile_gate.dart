import 'dart:async';

import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:material_ui/material_ui.dart';

import '../../api/generated/models/avatar_key_enum.dart';
import '../../api/generated/models/patched_profile_request.dart';
import '../../api/generated/models/profile.dart';
import '../../api/generated/models/profile_list.dart';
import '../../api/generated/models/profile_request.dart';
import '../../brand/logo_mark.dart';
import '../../brand/netfly_loader.dart';
import '../../core/api_error.dart';
import '../../core/http.dart';
import '../../core/theme.dart';
import '../../core/viewer_prefs.dart';
import '../../widgets/avatar.dart';
import '../../widgets/buttons.dart';
import '../../widgets/form.dart';
import '../../widgets/state_message.dart';

final profilesProvider = FutureProvider.autoDispose<ProfileList>(
  (ref) => ref.watch(apiProvider).profiles.profilesList(),
);

/// "Who's watching?" (`features.profiles_enabled`). Picking a profile grows its avatar, then the
/// app continues as that profile (`X-Profile` on every call — decision 28).
class ProfileGate extends ConsumerStatefulWidget {
  const ProfileGate({super.key, this.next});
  final String? next;

  @override
  ConsumerState<ProfileGate> createState() => _ProfileGateState();
}

class _ProfileGateState extends ConsumerState<ProfileGate> {
  bool _manage = false;
  int? _picked;

  Future<void> _pick(Profile p) async {
    unawaited(HapticFeedback.mediumImpact());
    setState(() => _picked = p.id);
    await Future<void>.delayed(const Duration(milliseconds: 420)); // the avatar grows
    ref.read(viewerPrefsProvider.notifier).setProfile(p.id);
    if (mounted) context.go(widget.next ?? '/home');
  }

  @override
  Widget build(BuildContext context) {
    final t = NetflyTheme.of(context);
    final profiles = ref.watch(profilesProvider);
    return Scaffold(
      appBar: AppBar(
        title: const LogoMark(size: 28),
        centerTitle: true,
        actions: [
          TextButton(onPressed: () => setState(() => _manage = !_manage), child: Text(_manage ? 'Done' : 'Edit')),
        ],
      ),
      body: switch (profiles) {
        AsyncData(:final value) => Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(24),
            child: Column(
              children: [
                Semantics(
                  header: true,
                  child: Text(
                    _manage ? 'Manage profiles' : "Who's watching?",
                    style: NetflyType.h1.copyWith(color: t.text),
                  ),
                ),
                const SizedBox(height: 28),
                Wrap(
                  spacing: 20,
                  runSpacing: 24,
                  alignment: WrapAlignment.center,
                  children: [
                    for (final p in value.results)
                      _ProfileTile(
                        profile: p,
                        picked: _picked == p.id,
                        dimmed: _picked != null && _picked != p.id,
                        manage: _manage,
                        onTap: () => _manage ? _edit(context, p) : _pick(p),
                      ),
                    if (value.results.length < value.maxProfiles)
                      Semantics(
                        button: true,
                        label: 'Add profile',
                        excludeSemantics: true,
                        child: GestureDetector(
                          onTap: () => _edit(context, null),
                          child: Column(
                            children: [
                              Container(
                                width: 96,
                                height: 96,
                                decoration: BoxDecoration(
                                  border: Border.all(color: t.subtle, width: 2),
                                  borderRadius: BorderRadius.circular(6),
                                ),
                                child: Icon(Icons.add_rounded, size: 48, color: t.muted),
                              ),
                              const SizedBox(height: 8),
                              Text('Add profile', style: NetflyType.body.copyWith(color: t.muted)),
                            ],
                          ),
                        ),
                      ),
                  ],
                ),
              ],
            ),
          ),
        ),
        AsyncError(:final error) => StateMessage.error(error, onRetry: () => ref.invalidate(profilesProvider)),
        _ => const LoaderScreen(label: 'Loading profiles…'),
      },
    );
  }

  Future<void> _edit(BuildContext context, Profile? profile) async {
    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      useRootNavigator: true,
      builder: (_) => _ProfileEditor(profile: profile, onSaved: () => ref.invalidate(profilesProvider)),
    );
  }
}

class _ProfileTile extends StatelessWidget {
  const _ProfileTile({
    required this.profile,
    required this.picked,
    required this.dimmed,
    required this.manage,
    required this.onTap,
  });

  final Profile profile;
  final bool picked;
  final bool dimmed;
  final bool manage;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final t = NetflyTheme.of(context);
    return Semantics(
      button: true,
      label: manage ? 'Edit ${profile.name}' : profile.name,
      excludeSemantics: true,
      child: GestureDetector(
        onTap: onTap,
        child: AnimatedOpacity(
          duration: NetflyMotion.base,
          opacity: dimmed ? 0.2 : 1,
          child: Column(
            children: [
              AnimatedScale(
                scale: picked ? 1.18 : 1,
                duration: const Duration(milliseconds: 380),
                curve: NetflyMotion.easeOutExpo,
                child: Stack(
                  children: [
                    ProfileAvatar(avatarKey: profile.avatarKey?.json),
                    if (manage)
                      Positioned.fill(
                        child: Container(color: Colors.black54, child: const Icon(Icons.edit_outlined, size: 32)),
                      ),
                  ],
                ),
              ),
              const SizedBox(height: 8),
              Text(profile.name, style: NetflyType.body.copyWith(color: t.muted)),
              if (profile.isKids ?? false)
                Text(
                  'Kids',
                  style: NetflyType.caption.copyWith(color: t.accent, fontWeight: FontWeight.w700),
                ),
            ],
          ),
        ),
      ),
    );
  }
}

class _ProfileEditor extends ConsumerStatefulWidget {
  const _ProfileEditor({required this.profile, required this.onSaved});
  final Profile? profile;
  final VoidCallback onSaved;

  @override
  ConsumerState<_ProfileEditor> createState() => _ProfileEditorState();
}

class _ProfileEditorState extends ConsumerState<_ProfileEditor> {
  late final _name = TextEditingController(text: widget.profile?.name ?? '');
  late AvatarKeyEnum _avatar = widget.profile?.avatarKey ?? AvatarKeyEnum.values.first;
  late bool _kids = widget.profile?.isKids ?? false;
  ApiError? _error;

  @override
  void dispose() {
    _name.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    final api = ref.read(apiProvider).profiles;
    try {
      if (widget.profile == null) {
        await api.profilesCreate(
          body: ProfileRequest(name: _name.text.trim(), avatarKey: _avatar, isKids: _kids),
        );
      } else {
        await api.profilesUpdate(
          id: widget.profile!.id,
          body: PatchedProfileRequest(name: _name.text.trim(), avatarKey: _avatar, isKids: _kids),
        );
      }
      widget.onSaved();
      if (mounted) Navigator.pop(context);
    } catch (e) {
      setState(() => _error = ApiError.from(e));
    }
  }

  Future<void> _delete() async {
    await ref.read(apiProvider).profiles.profilesDelete(id: widget.profile!.id);
    if (ref.read(viewerPrefsProvider).profileId == widget.profile!.id) {
      ref.read(viewerPrefsProvider.notifier).setProfile(null);
    }
    widget.onSaved();
    if (mounted) Navigator.pop(context);
  }

  @override
  Widget build(BuildContext context) {
    final avatars = AvatarKeyEnum.values.where((a) => a.json != null).toList();
    return Padding(
      padding: EdgeInsets.fromLTRB(20, 20, 20, 20 + MediaQuery.viewInsetsOf(context).bottom),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(widget.profile == null ? 'Add profile' : 'Edit profile', style: NetflyType.h3),
          const SizedBox(height: 14),
          FormError(_error?.fields.isEmpty ?? true ? _error?.message : null),
          NetflyField(
            label: 'Name',
            controller: _name,
            error: _error?.fields['name'],
            autofocus: widget.profile == null,
          ),
          const SizedBox(height: 14),
          SizedBox(
            height: 64,
            child: ListView.separated(
              scrollDirection: Axis.horizontal,
              itemCount: avatars.length,
              separatorBuilder: (_, _) => const SizedBox(width: 10),
              itemBuilder: (_, i) => Semantics(
                button: true,
                selected: avatars[i] == _avatar,
                label: 'Avatar ${i + 1}',
                excludeSemantics: true,
                child: GestureDetector(
                  onTap: () => setState(() => _avatar = avatars[i]),
                  child: Container(
                    decoration: BoxDecoration(
                      border: Border.all(color: avatars[i] == _avatar ? Colors.white : Colors.transparent, width: 2),
                      borderRadius: BorderRadius.circular(6),
                    ),
                    child: ProfileAvatar(avatarKey: avatars[i].json, size: 56),
                  ),
                ),
              ),
            ),
          ),
          SwitchListTile(
            contentPadding: EdgeInsets.zero,
            value: _kids,
            onChanged: (v) => setState(() => _kids = v),
            title: const Text('Kids profile'),
            subtitle: const Text('Only titles rated for children.'),
          ),
          const SizedBox(height: 8),
          NetflyButton(label: 'Save', expand: true, onPressed: _save),
          if (widget.profile != null) ...[
            const SizedBox(height: 8),
            NetflyButton(label: 'Delete profile', expand: true, variant: NetflyButtonVariant.ghost, onPressed: _delete),
          ],
        ],
      ),
    );
  }
}
