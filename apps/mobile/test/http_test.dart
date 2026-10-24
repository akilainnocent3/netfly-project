import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:netfly/core/api_error.dart';
import 'package:netfly/core/http.dart';
import 'package:netfly/core/public_config.dart';
import 'package:netfly/core/session.dart';
import 'package:netfly/core/viewer_prefs.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'support/fakes.dart';

void main() {
  late FakeServer server;
  late ProviderContainer c;
  var accessValid = 'a1';

  setUp(() async {
    SharedPreferences.setMockInitialValues({});
    final prefs = await SharedPreferences.getInstance();
    var rotations = 0;
    server = FakeServer((r) {
      if (r.path == '/api/v1/auth/mobile/login') return (200, sessionJson(access: 'a1', refresh: 'r1'));
      if (r.path == '/api/v1/auth/mobile/refresh') {
        rotations++;
        accessValid = 'a${rotations + 1}';
        return (200, sessionJson(access: accessValid, refresh: 'r${rotations + 1}'));
      }
      final auth = r.headers['Authorization'];
      if (auth != 'Bearer $accessValid') return (401, {'code': 'not_authenticated', 'message': 'Please sign in.'});
      if (r.path == '/boom') {
        return (
          400,
          {
            'code': 'validation_error',
            'message': 'Nope.',
            'fields': {
              'name': ['Too long.'],
            },
          },
        );
      }
      return (200, {'ok': true, 'profile': r.headers['X-Profile']});
    });
    final publicDio = Dio(BaseOptions(baseUrl: 'http://api.test'))..httpClientAdapter = server;
    c = ProviderContainer(
      retry: (_, _) => null,
      overrides: [
        secureStorageProvider.overrideWithValue(FakeSecureStorage()),
        publicDioProvider.overrideWithValue(publicDio),
        sharedPreferencesProvider.overrideWithValue(prefs),
      ],
    );
    c.read(dioProvider).httpClientAdapter = server;
    await c.read(sessionProvider.future);
    await c.read(sessionProvider.notifier).signIn('viewer_one', 'pw');
    accessValid = 'a1';
  });

  tearDown(() => c.dispose());

  test('sends the bearer token and the active profile', () async {
    c.read(viewerPrefsProvider.notifier).setProfile(7);
    final response = await c.read(dioProvider).get<Map<String, Object?>>('/api/v1/thing');
    expect(response.data, {'ok': true, 'profile': '7'});
  });

  test('an expired access token is refreshed once and the request retried', () async {
    accessValid = 'expired-on-server';
    final response = await c.read(dioProvider).get<Map<String, Object?>>('/api/v1/thing');
    expect(response.data!['ok'], true);
    expect(server.to('/api/v1/auth/mobile/refresh'), hasLength(1));
    expect(server.to('/api/v1/thing').last.headers['Authorization'], 'Bearer a2');
  });

  test('errors arrive as ApiError {code, message, fields}', () async {
    try {
      await c.read(dioProvider).get<Object?>('/boom');
      fail('expected an error');
    } on DioException catch (e) {
      final error = ApiError.from(e);
      expect(error.code, 'validation_error');
      expect(error.message, 'Nope.');
      expect(error.fields, {'name': 'Too long.'});
    }
  });
}
