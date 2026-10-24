import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:material_ui/material_ui.dart';

import '../core/public_config.dart';
import '../core/session.dart';
import '../core/viewer_prefs.dart';
import '../features/account/account_screen.dart';
import '../features/account/membership_screen.dart';
import '../features/account/playback_settings_screen.dart';
import '../features/auth/sign_in_screen.dart';
import '../features/auth/sign_up_screen.dart';
import '../features/auth/verify_screen.dart';
import '../features/auth/welcome_screen.dart';
import '../features/billing/checkout_screen.dart';
import '../features/billing/plans_screen.dart';
import '../features/categories/categories_screen.dart';
import '../features/categories/category_screen.dart';
import '../features/home/home_screen.dart';
import '../features/my_list/my_list_screen.dart';
import '../features/new_hot/new_hot_screen.dart';
import '../features/notifications/notifications_screen.dart';
import '../features/player/player_screen.dart';
import '../features/profiles/profile_gate.dart';
import '../features/search/search_screen.dart';
import '../features/shell/shell.dart';
import '../features/start/start_screen.dart';
import '../features/title/title_sheet.dart';

final rootNavigatorKey = GlobalKey<NavigatorState>(debugLabel: 'root');

/// Routes that need an account (everything else can be browsed signed out, like the web —
/// decision 50; an action there opens Welcome with `next`).
const _private = ['/my-list', '/account', '/watch', '/checkout', '/notifications', '/verify'];
const _auth = ['/welcome', '/signin', '/signup'];

/// Re-runs redirects when the session, the active profile or the config changes.
class _RouterRefresh extends ChangeNotifier {
  _RouterRefresh(Ref ref) {
    ref
      ..listen(sessionProvider, (_, _) => notifyListeners())
      ..listen(viewerPrefsProvider.select((p) => p.profileId), (_, _) => notifyListeners())
      ..listen(
        publicConfigProvider.select((c) => c.flag('features.profiles_enabled', false)),
        (_, _) => notifyListeners(),
      );
  }
}

final routerProvider = Provider<GoRouter>((ref) {
  final refresh = _RouterRefresh(ref);
  ref.onDispose(refresh.dispose);
  return GoRouter(
    navigatorKey: rootNavigatorKey,
    initialLocation: '/start',
    refreshListenable: refresh,
    redirect: (context, state) {
      // netfly://title/<slug> arrives with "title" as the host.
      if (state.uri.scheme == 'netfly' && state.uri.host == 'title') return '/title${state.uri.path}';
      final session = ref.read(sessionProvider);
      final path = state.uri.path;
      // Restoring (or offline while restoring): the start screen, which offers "Try again".
      if ((session.isLoading || session.hasError) && !session.hasValue) {
        return path == '/start' ? null : '/start?next=${Uri.encodeComponent(state.uri.toString())}';
      }
      final signedIn = session.value != null;
      if (path == '/start') {
        final next = state.uri.queryParameters['next'];
        if (next != null && next.isNotEmpty && next != '/start') return next;
        return signedIn ? '/home' : '/welcome';
      }
      if (!signedIn && _private.any(path.startsWith)) {
        return '/welcome?next=${Uri.encodeComponent(state.uri.toString())}';
      }
      if (signedIn && _auth.contains(path)) return state.uri.queryParameters['next'] ?? '/home';
      final profilesOn = ref.read(publicConfigProvider).flag('features.profiles_enabled', false);
      final chosen = ref.read(viewerPrefsProvider).profileId != null;
      if (signedIn && profilesOn && !chosen && path != '/profiles' && !path.startsWith('/checkout')) {
        return '/profiles?next=${Uri.encodeComponent(state.uri.toString())}';
      }
      return null;
    },
    routes: [
      GoRoute(path: '/start', builder: (_, _) => const StartScreen()),
      GoRoute(
        path: '/welcome',
        builder: (_, s) => WelcomeScreen(next: s.uri.queryParameters['next']),
      ),
      GoRoute(
        path: '/signin',
        builder: (_, s) => SignInScreen(next: s.uri.queryParameters['next']),
      ),
      GoRoute(
        path: '/signup',
        builder: (_, s) => SignUpScreen(next: s.uri.queryParameters['next']),
      ),
      GoRoute(
        path: '/verify/:channel',
        builder: (_, s) => VerifyScreen(channel: s.pathParameters['channel']!, next: s.uri.queryParameters['next']),
      ),
      GoRoute(
        path: '/profiles',
        pageBuilder: (_, s) => NoTransitionPage(child: ProfileGate(next: s.uri.queryParameters['next'])),
      ),
      GoRoute(
        path: '/plans',
        builder: (_, s) => PlansScreen(from: s.uri.queryParameters['from'], next: s.uri.queryParameters['next']),
      ),
      GoRoute(
        path: '/checkout/:plan',
        builder: (_, s) => CheckoutScreen(
          plan: s.pathParameters['plan']!,
          trial: s.uri.queryParameters['trial'] == '1',
          next: s.uri.queryParameters['next'],
        ),
      ),
      GoRoute(
        path: '/watch/:slug',
        parentNavigatorKey: rootNavigatorKey,
        pageBuilder: (_, s) => CustomTransitionPage(
          child: PlayerScreen(
            slug: s.pathParameters['slug']!,
            episode: int.tryParse(s.uri.queryParameters['episode'] ?? ''),
            autoplayed: s.uri.queryParameters['autoplay'] == '1',
          ),
          transitionsBuilder: (_, animation, _, child) => FadeTransition(opacity: animation, child: child),
        ),
      ),
      // `netfly://title/<slug>` and `https://<domain>/title/<slug>` (App Links / Universal Links).
      GoRoute(
        path: '/title/:slug',
        parentNavigatorKey: rootNavigatorKey,
        pageBuilder: (_, s) => TitleSheetPage(slug: s.pathParameters['slug']!),
      ),
      GoRoute(path: '/genre/:slug', redirect: (_, s) => '/categories/${s.pathParameters['slug']}'),
      GoRoute(path: '/notifications', builder: (_, _) => const NotificationsScreen()),
      StatefulShellRoute.indexedStack(
        builder: (_, _, shell) => AppShell(shell: shell),
        branches: [
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: '/home',
                builder: (_, _) => const HomeScreen(),
                routes: [
                  GoRoute(
                    path: 'series',
                    builder: (_, _) => const HomeScreen(kind: 'series'),
                  ),
                  GoRoute(
                    path: 'films',
                    builder: (_, _) => const HomeScreen(kind: 'movie'),
                  ),
                ],
              ),
              GoRoute(
                path: '/categories',
                builder: (_, _) => const CategoriesScreen(),
                routes: [
                  GoRoute(
                    path: ':slug',
                    builder: (_, s) => CategoryScreen(slug: s.pathParameters['slug']!),
                  ),
                ],
              ),
            ],
          ),
          StatefulShellBranch(
            routes: [GoRoute(path: '/new', builder: (_, _) => const NewHotScreen())],
          ),
          StatefulShellBranch(
            routes: [GoRoute(path: '/search', builder: (_, _) => const SearchScreen())],
          ),
          StatefulShellBranch(
            routes: [GoRoute(path: '/my-list', builder: (_, _) => const MyListScreen())],
          ),
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: '/account',
                builder: (_, _) => const AccountScreen(),
                routes: [
                  GoRoute(path: 'playback', builder: (_, _) => const PlaybackSettingsScreen()),
                  GoRoute(path: 'membership', builder: (_, _) => const MembershipScreen()),
                ],
              ),
            ],
          ),
        ],
      ),
    ],
  );
});
