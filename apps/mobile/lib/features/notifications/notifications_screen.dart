import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import 'package:material_ui/material_ui.dart';

import '../../api/generated/models/notification_list.dart';
import '../../brand/netfly_loader.dart';
import '../../core/http.dart';
import '../../core/session.dart';
import '../../core/theme.dart';
import '../../widgets/netfly_image.dart';
import '../../widgets/state_message.dart';
import '../../widgets/title_card.dart';

final notificationsProvider = FutureProvider.autoDispose<NotificationList?>((ref) async {
  if (ref.watch(userProvider) == null) return null;
  return ref.watch(apiProvider).notifications.notifications();
});

/// The bell in the header, with the unread count.
class NotificationsBell extends ConsumerWidget {
  const NotificationsBell({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = NetflyTheme.of(context);
    final unread = ref.watch(notificationsProvider).value?.unread ?? 0;
    return Semantics(
      button: true,
      label: unread > 0 ? 'Notifications, $unread new' : 'Notifications',
      excludeSemantics: true,
      child: InkResponse(
        radius: 24,
        onTap: () => context.push('/notifications'),
        child: SizedBox.square(
          dimension: 44,
          child: Stack(
            alignment: Alignment.center,
            children: [
              const Icon(Icons.notifications_none_rounded, size: 26),
              if (unread > 0)
                Positioned(
                  top: 6,
                  right: 6,
                  child: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 1),
                    decoration: BoxDecoration(color: t.accent, borderRadius: BorderRadius.circular(999)),
                    child: Text(
                      '$unread',
                      style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: t.accentFg),
                    ),
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }
}

class NotificationsScreen extends ConsumerStatefulWidget {
  const NotificationsScreen({super.key});

  @override
  ConsumerState<NotificationsScreen> createState() => _NotificationsScreenState();
}

class _NotificationsScreenState extends ConsumerState<NotificationsScreen> {
  @override
  void initState() {
    super.initState();
    // Opening the list marks everything seen (the badge clears), as on the web.
    Future.microtask(() async {
      try {
        await ref.read(apiProvider).notifications.notificationsSeen();
      } catch (_) {}
    });
  }

  @override
  void dispose() {
    ref.invalidate(notificationsProvider);
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final t = NetflyTheme.of(context);
    final list = ref.watch(notificationsProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('Notifications')),
      body: switch (list) {
        AsyncData(:final value) when (value?.results.isEmpty ?? true) => const StateMessage(
          title: 'No notifications yet',
          body: 'New episodes of shows in My List and titles you asked to be reminded about appear here.',
          icon: Icons.notifications_none_rounded,
        ),
        AsyncData(:final value) => ListView.separated(
          itemCount: value!.results.length,
          separatorBuilder: (_, _) => Divider(color: t.line, height: 1),
          itemBuilder: (context, i) {
            final n = value.results[i];
            return ListTile(
              contentPadding: const EdgeInsets.symmetric(horizontal: NetflySpace.gutter, vertical: 8),
              leading: SizedBox(
                width: 112,
                child: ClipRRect(
                  borderRadius: BorderRadius.circular(4),
                  child: AspectRatio(
                    aspectRatio: 16 / 9,
                    child: NetflyImage(image: n.title.backdrop ?? n.title.poster),
                  ),
                ),
              ),
              title: Text(
                n.title.title,
                style: NetflyType.body.copyWith(fontWeight: n.unread ? FontWeight.w700 : FontWeight.w500),
              ),
              subtitle: Text(
                '${n.message}\n${DateFormat.MMMd().format(n.at.toLocal())}',
                style: NetflyType.meta.copyWith(color: t.muted),
              ),
              isThreeLine: true,
              trailing: n.unread
                  ? Container(
                      width: 8,
                      height: 8,
                      decoration: BoxDecoration(color: t.accent, shape: BoxShape.circle),
                    )
                  : null,
              onTap: () => openTitle(context, n.title, row: 'notifications'),
            );
          },
        ),
        AsyncError(:final error) => StateMessage.error(error, onRetry: () => ref.invalidate(notificationsProvider)),
        _ => const Center(child: NetflyLoader()),
      },
    );
  }
}
