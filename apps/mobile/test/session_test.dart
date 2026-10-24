import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:netfly/core/http.dart';
import 'package:netfly/core/public_config.dart';
import 'package:netfly/core/session.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'support/fakes.dart';

const refreshKey = 'netfly.refresh_token';

Future<ProviderContainer> container(FakeServer server, FakeSecureStorage storage) async {
  SharedPreferences.setMockInitialValues({});
  final prefs = await SharedPreferences.getInstance();
  final dio = Dio(BaseOptions(baseUrl: 'http://api.test'))..httpClientAdapter = server;
  final c = ProviderContainer(
    retry: (_, _) => null, // the app retries a failed restore; a test wants the failure
    overrides: [
      secureStorageProvider.overrideWithValue(storage),
      publicDioProvider.overrideWithValue(dio),
      sharedPreferencesProvider.overrideWithValue(prefs),
    ],
  );
  addTearDown(c.dispose);
  return c;
}

void main() {
  test('signed out when the keystore has no refresh token', () async {
    final server = FakeServer((_) => (500, null));
    final c = await container(server, FakeSecureStorage());
    expect(await c.read(sessionProvider.future), isNull);
    expect(server.requests, isEmpty);
  });

  test('a stored refresh token is exchanged on start, and the rotated one is kept', () async {
    final server = FakeServer((r) => (200, sessionJson(access: 'a2', refresh: 'r2')));
    final storage = FakeSecureStorage({refreshKey: 'r1'});
    final c = await container(server, storage);
    final session = await c.read(sessionProvider.future);
    expect(session!.access, 'a2');
    expect(session.user.username, 'viewer_one');
    expect(server.requests.single.path, '/api/v1/auth/mobile/refresh');
    expect(server.requests.single.data, {'refresh': 'r1'});
    expect(storage.values[refreshKey], 'r2');
  });

  test('a refused refresh token is deleted and the viewer is signed out', () async {
    final server = FakeServer((_) => (401, {'code': 'refresh_reused', 'message': 'Your session has ended.'}));
    final storage = FakeSecureStorage({refreshKey: 'stolen'});
    final c = await container(server, storage);
    expect(await c.read(sessionProvider.future), isNull);
    expect(storage.values, isEmpty);
  });

  test('offline at start keeps the token for the next try', () async {
    final server = FakeServer((r) => throw DioException.connectionError(requestOptions: r, reason: 'offline'));
    final storage = FakeSecureStorage({refreshKey: 'r1'});
    final c = await container(server, storage);
    await expectLater(c.read(sessionProvider.future), throwsA(anything));
    expect(storage.values[refreshKey], 'r1');
  });

  test('sign in stores the refresh token and keeps the access token in memory only', () async {
    final server = FakeServer((r) => (200, sessionJson(access: 'a1', refresh: 'r1')));
    final storage = FakeSecureStorage();
    final c = await container(server, storage);
    await c.read(sessionProvider.future);
    await c.read(sessionProvider.notifier).signIn(' viewer_one ', 'correct-horse');
    expect(server.requests.single.data, {'username': 'viewer_one', 'password': 'correct-horse'});
    expect(storage.values, {refreshKey: 'r1'});
    expect(c.read(sessionProvider).value!.access, 'a1');
  });

  test('concurrent refreshes share one rotation (a second would look like a replay)', () async {
    var n = 0;
    final server = FakeServer((r) {
      n++;
      return (200, sessionJson(access: 'a$n', refresh: 'r$n'));
    });
    final storage = FakeSecureStorage();
    final c = await container(server, storage);
    await c.read(sessionProvider.future);
    await c.read(sessionProvider.notifier).signIn('viewer_one', 'pw');
    final notifier = c.read(sessionProvider.notifier);
    final results = await Future.wait([notifier.refresh(), notifier.refresh(), notifier.refresh()]);
    expect(server.to('/api/v1/auth/mobile/refresh'), hasLength(1));
    expect(results.map((s) => s!.access).toSet(), {'a2'});
    expect(storage.values[refreshKey], 'r2');
  });

  test('sign out forgets the token locally and revokes it on the server', () async {
    final server = FakeServer((r) => r.path.endsWith('logout') ? (204, null) : (200, sessionJson()));
    final storage = FakeSecureStorage();
    final c = await container(server, storage);
    await c.read(sessionProvider.future);
    await c.read(sessionProvider.notifier).signIn('viewer_one', 'pw');
    await c.read(sessionProvider.notifier).signOut();
    expect(storage.values, isEmpty);
    expect(c.read(sessionProvider).value, isNull);
    expect(server.to('/api/v1/auth/mobile/logout').single.data, {'refresh': 'refresh-1'});
  });
}
