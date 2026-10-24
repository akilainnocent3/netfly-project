import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:material_ui/material_ui.dart';

import '../../core/format.dart';
import '../../core/public_config.dart';
import '../../core/session.dart';
import '../../core/theme.dart';
import '../../core/viewer_prefs.dart';
import '../../widgets/avatar.dart';
import '../../widgets/confirm_dialog.dart';
import '../../widgets/skeleton.dart';
import '../profiles/profile_gate.dart';
import '../shell/shell.dart';
import 'membership_screen.dart';

/// The Profile tab (Netflix's "My Netflix" / the web's Account overview at phone width): who is
/// watching (with Switch profile when profiles are on), the membership at a glance, then the
/// account sections and Sign out.
class AccountScreen extends ConsumerStatefulWidget {
  const AccountScreen({super.key});

  @override
  ConsumerState<AccountScreen> createState() => _AccountScreenState();
}

class _AccountScreenState extends ConsumerState<AccountScreen> {
  final _scroll = ScrollController();

  @override
  void dispose() {
    _scroll.dispose();
    super.dispose();
  }

  Future<void> _signOut() async {
    final ok = await confirm(
      context,
      title: 'Sign out?',
      body: 'You can sign back in anytime with your username, email or phone.',
      confirmLabel: 'Sign out',
    );
    if (!ok || !mounted) return;
    ref.read(viewerPrefsProvider.notifier).setProfile(null);
    await ref.read(sessionProvider.notifier).signOut();
    if (mounted) context.go('/welcome');
  }

  @override
  Widget build(BuildContext context) {
    listenForTabReselect(ref, 4, _scroll);
    final t = NetflyTheme.of(context);
    final user = ref.watch(userProvider);
    final profiles = ref.watch(profilesProvider).value;
    final profileId = ref.watch(viewerPrefsProvider.select((p) => p.profileId));
    final profile = profiles?.enabled == true
        ? profiles!.results.where((p) => p.id == profileId).firstOrNull ?? profiles.results.firstOrNull
        : null;
    final membership = ref.watch(membershipProvider);

    return Scaffold(
      appBar: AppBar(title: const Text('My account'), centerTitle: false),
      body: ListView(
        controller: _scroll,
        padding: const EdgeInsets.only(bottom: 32),
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(NetflySpace.gutter, 8, NetflySpace.gutter, 20),
            child: Column(
              children: [
                ProfileAvatar(avatarKey: profile?.avatarKey?.json, size: 88),
                const SizedBox(height: 12),
                Text(
                  profile?.name ?? user?.fullName ?? '',
                  style: NetflyType.h3.copyWith(color: t.text),
                  textAlign: TextAlign.center,
                ),
                if (user != null) Text('@${user.username}', style: NetflyType.meta.copyWith(color: t.muted)),
                if (profiles?.enabled == true) ...[
                  const SizedBox(height: 12),
                  OutlinedButton.icon(
                    onPressed: () => context.push('/profiles'),
                    icon: const Icon(Icons.swap_horiz_rounded, size: 18),
                    label: const Text('Switch profile'),
                    style: OutlinedButton.styleFrom(
                      foregroundColor: t.text,
                      side: BorderSide(color: t.text.withValues(alpha: 0.4)),
                      minimumSize: const Size(0, NetflySpace.touch),
                    ),
                  ),
                ],
              ],
            ),
          ),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: NetflySpace.gutter),
            child: switch (membership.value) {
              final value? => _MembershipSummary(
                plan: value.subscription.plan.name,
                status: statusOf(value.subscription.status),
                next: nextEvent(value.subscription),
                order: value.subscription.plan.order,
              ),
              _ when membership.hasError => const SizedBox.shrink(),
              _ => const Skeleton(height: 96),
            },
          ),
          const SizedBox(height: 12),
          _Row(
            icon: Icons.credit_card_rounded,
            label: 'Membership',
            hint: 'Plan, payments and auto-renew',
            onTap: () => context.push('/account/membership'),
          ),
          _Row(
            icon: Icons.smart_display_outlined,
            label: 'Playback settings',
            hint: 'Autoplay, data saver, subtitles and quality',
            onTap: () => context.push('/account/playback'),
          ),
          _Row(
            icon: Icons.notifications_none_rounded,
            label: 'Notifications',
            onTap: () => context.push('/notifications'),
          ),
          _Row(icon: Icons.category_outlined, label: 'Categories', onTap: () => context.go('/categories')),
          const Divider(height: 32, indent: NetflySpace.gutter, endIndent: NetflySpace.gutter),
          _Row(icon: Icons.logout_rounded, label: 'Sign out', onTap: _signOut),
          Padding(
            padding: const EdgeInsets.fromLTRB(NetflySpace.gutter, 16, NetflySpace.gutter, 0),
            child: Text(
              ref.watch(publicConfigProvider).siteName,
              textAlign: TextAlign.center,
              style: NetflyType.caption.copyWith(color: t.subtle),
            ),
          ),
        ],
      ),
    );
  }
}

class _MembershipSummary extends StatelessWidget {
  const _MembershipSummary({required this.plan, required this.status, required this.next, required this.order});

  final String plan;
  final (String, Color) status;
  final String next;
  final int order;

  @override
  Widget build(BuildContext context) {
    final t = NetflyTheme.of(context);
    return Semantics(
      button: true,
      label: '$plan, ${status.$1}. $next',
      excludeSemantics: true,
      child: Material(
        color: t.surface,
        clipBehavior: Clip.antiAlias,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(NetflySpace.radiusCard)),
        child: InkWell(
          onTap: () => context.push('/account/membership'),
          child: Row(
            children: [
              Container(width: 6, height: 96, decoration: BoxDecoration(gradient: planGradient(order))),
              Expanded(
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(14, 12, 8, 12),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Flexible(
                            child: Text(plan, style: NetflyType.h2.copyWith(color: t.text)),
                          ),
                          const SizedBox(width: 8),
                          Text(
                            status.$1.toUpperCase(),
                            style: NetflyType.caption.copyWith(
                              color: status.$2,
                              fontWeight: FontWeight.w700,
                              letterSpacing: 0.8,
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 4),
                      Text(
                        next,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: NetflyType.meta.copyWith(color: t.muted),
                      ),
                    ],
                  ),
                ),
              ),
              Icon(Icons.chevron_right_rounded, color: t.muted),
              const SizedBox(width: 8),
            ],
          ),
        ),
      ),
    );
  }
}

class _Row extends StatelessWidget {
  const _Row({required this.icon, required this.label, required this.onTap, this.hint});

  final IconData icon;
  final String label;
  final String? hint;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final t = NetflyTheme.of(context);
    return ListTile(
      contentPadding: const EdgeInsets.symmetric(horizontal: NetflySpace.gutter),
      minTileHeight: 56,
      leading: Icon(icon, color: t.text),
      title: Text(
        label,
        style: NetflyType.body.copyWith(color: t.text, fontWeight: FontWeight.w600),
      ),
      subtitle: hint == null ? null : Text(hint!, style: NetflyType.meta.copyWith(color: t.muted)),
      trailing: Icon(Icons.chevron_right_rounded, color: t.muted),
      onTap: onTap,
    );
  }
}
