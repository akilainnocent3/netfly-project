import 'dart:async';

import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import '../api/generated/models/user.dart';
import 'api_error.dart';
import 'http.dart';

/// A signed-in viewer: the access token lives in memory only; the rotating refresh token lives in
/// the platform keystore (Keychain / Android Keystore via flutter_secure_storage). The server
/// rotates the refresh token on every use and revokes the whole family if an old one is replayed
/// (DECISIONS 6 and "Mobile auth tokens").
class Session {
  const Session({required this.user, required this.access, required this.expiresAt});

  final User user;
  final String access;
  final DateTime expiresAt;

  Session withUser(User next) => Session(user: next, access: access, expiresAt: expiresAt);
}

const _refreshKey = 'netfly.refresh_token';

final secureStorageProvider = Provider<FlutterSecureStorage>(
  (ref) => const FlutterSecureStorage(
    aOptions: AndroidOptions(),
    iOptions: IOSOptions(accessibility: KeychainAccessibility.first_unlock),
  ),
);

/// `AsyncValue<Session?>`: loading while the stored refresh token is exchanged on start,
/// `null` when signed out.
class SessionController extends AsyncNotifier<Session?> {
  Completer<Session?>? _refreshing;

  FlutterSecureStorage get _storage => ref.read(secureStorageProvider);
  Dio get _dio => ref.read(publicDioProvider);

  @override
  Future<Session?> build() async {
    final stored = await _storage.read(key: _refreshKey);
    if (stored == null) return null;
    try {
      return await _exchange(stored);
    } on ApiError catch (e) {
      if (e.isOffline || e.code == 'timeout' || e.code == 'unavailable') {
        // Keep the token for the next try; the app shows its offline state meanwhile.
        rethrow;
      }
      await _storage.delete(key: _refreshKey);
      return null;
    }
  }

  Future<Session> _exchange(String refresh) async {
    final response = await _post('/api/v1/auth/mobile/refresh', {'refresh': refresh});
    return _store(response);
  }

  Future<Map<String, Object?>> _post(String path, Map<String, Object?> body) async {
    try {
      final response = await _dio.post<Map<String, Object?>>(path, data: body);
      return response.data ?? const {};
    } on DioException catch (e) {
      throw ApiError.from(e);
    }
  }

  Future<Session> _store(Map<String, Object?> data) async {
    final refresh = data['refresh'];
    if (refresh is String) await _storage.write(key: _refreshKey, value: refresh);
    final expiresIn = (data['expires_in'] as num?)?.toInt() ?? 900;
    return Session(
      user: User.fromJson(Map<String, Object?>.from(data['user']! as Map)),
      access: data['access']! as String,
      // Refresh a little early so a request never leaves with a token about to expire.
      expiresAt: DateTime.now().add(Duration(seconds: expiresIn - 30)),
    );
  }

  /// Username, verified email or verified phone — the same identifiers the web accepts.
  Future<void> signIn(String identifier, String password) async {
    final data = await _post('/api/v1/auth/mobile/login', {'username': identifier.trim(), 'password': password});
    state = AsyncData(await _store(data));
  }

  Future<void> signUp({required String username, required String fullName, required String password}) async {
    final data = await _post('/api/v1/auth/mobile/signup', {
      'username': username.trim(),
      'full_name': fullName.trim(),
      'password': password,
    });
    state = AsyncData(await _store(data));
  }

  /// One refresh at a time: concurrent 401s wait for the same rotation (a second rotation with
  /// the already-used token would look like a replay and end the session).
  Future<Session?> refresh() {
    final running = _refreshing;
    if (running != null) return running.future;
    final completer = _refreshing = Completer<Session?>();
    () async {
      try {
        final stored = await _storage.read(key: _refreshKey);
        final next = stored == null ? null : await _exchange(stored);
        state = AsyncData(next);
        completer.complete(next);
      } on ApiError catch (e) {
        if (!e.isOffline) {
          await _storage.delete(key: _refreshKey);
          state = const AsyncData(null);
        }
        completer.complete(null);
      } finally {
        _refreshing = null;
      }
    }();
    return completer.future;
  }

  void updateUser(User user) {
    final current = state.value;
    if (current != null) state = AsyncData(current.withUser(user));
  }

  Future<void> signOut() async {
    final stored = await _storage.read(key: _refreshKey);
    await _storage.delete(key: _refreshKey);
    state = const AsyncData(null);
    if (stored != null) {
      try {
        await _dio.post<void>('/api/v1/auth/mobile/logout', data: {'refresh': stored});
      } catch (_) {
        // Already signed out locally; the token expires on its own if the server is unreachable.
      }
    }
  }
}

final sessionProvider = AsyncNotifierProvider<SessionController, Session?>(SessionController.new);

/// The signed-in user (null when signed out or still restoring).
final userProvider = Provider<User?>((ref) => ref.watch(sessionProvider).value?.user);
