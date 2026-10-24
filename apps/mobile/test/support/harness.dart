import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:material_ui/material_ui.dart';
import 'package:netfly/api/generated/models/user.dart';
import 'package:netfly/core/http.dart';
import 'package:netfly/core/public_config.dart';
import 'package:netfly/core/session.dart';
import 'package:netfly/core/theme.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'fakes.dart';

/// A signed-in session that never touches the network or the keystore.
class FakeSession extends SessionController {
  FakeSession(this.user);

  final User? user;

  @override
  Future<Session?> build() async =>
      user == null ? null : Session(user: user!, access: 'a', expiresAt: DateTime.now().add(const Duration(hours: 1)));
}

/// Pumps [child] the way the app renders it: theme tokens from [config], a fake API, a session.
Future<FakeServer> pumpScreen(
  WidgetTester tester,
  Widget child, {
  Map<String, Object?> config = const {},
  Map<String, Object?>? user,
  (int, Object?) Function(RequestOptions request)? api,
  Size size = const Size(390, 844),
  bool brandFonts = false,
}) async {
  tester.view.physicalSize = size * 3;
  tester.view.devicePixelRatio = 3;
  addTearDown(tester.view.reset);
  SharedPreferences.setMockInitialValues({});
  final prefs = await SharedPreferences.getInstance();
  final server = FakeServer((r) {
    if (r.path == '/api/public/config') return (200, {'values': config});
    return api?.call(r) ?? (404, {'code': 'not_found', 'message': "We couldn't find that."});
  });
  final dio = Dio(BaseOptions(baseUrl: 'http://api.test'))..httpClientAdapter = server;
  await tester.pumpWidget(
    ProviderScope(
      retry: (_, _) => null,
      overrides: [
        sharedPreferencesProvider.overrideWithValue(prefs),
        publicDioProvider.overrideWithValue(dio),
        dioProvider.overrideWithValue(dio),
        secureStorageProvider.overrideWithValue(FakeSecureStorage()),
        sessionProvider.overrideWith(() => FakeSession(User.fromJson(user ?? userJson()))),
      ],
      // Like NetflyApp: the theme follows the live public config (which keeps it loaded).
      child: Consumer(
        builder: (context, ref, _) => MaterialApp(
          debugShowCheckedModeBanner: false,
          theme: buildTheme(NetflyTheme.fromConfig(ref.watch(publicConfigProvider)), brandFonts: brandFonts),
          home: child,
        ),
      ),
    ),
  );
  await tester.pumpAndSettle();
  return server;
}
