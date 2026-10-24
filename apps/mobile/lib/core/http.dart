import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/generated/netfly_api.dart';
import 'api_error.dart';
import 'env.dart';
import 'session.dart';
import 'viewer_prefs.dart';

BaseOptions _options() => BaseOptions(
  baseUrl: Env.apiUrl,
  connectTimeout: const Duration(seconds: 10),
  receiveTimeout: const Duration(seconds: 20),
  headers: {'Accept': 'application/json', 'X-Netfly-Client': 'mobile'},
);

/// Unauthenticated calls (public config, auth endpoints themselves).
final publicDioProvider = Provider<Dio>((ref) {
  final dio = Dio(_options());
  dio.interceptors.add(_ErrorInterceptor());
  return dio;
});

/// The viewer's API: bearer access token (kept in memory only), `X-Profile` when profiles are
/// on (as the web sends it), and one transparent refresh + retry when the access token expired.
final dioProvider = Provider<Dio>((ref) {
  final dio = Dio(_options());
  dio.interceptors
    ..add(
      QueuedInterceptorsWrapper(
        onRequest: (options, handler) {
          final session = ref.read(sessionProvider).value;
          if (session != null) options.headers['Authorization'] = 'Bearer ${session.access}';
          final profile = ref.read(viewerPrefsProvider).profileId;
          if (profile != null) options.headers['X-Profile'] = '$profile';
          handler.next(options);
        },
        onError: (error, handler) async {
          final retried = error.requestOptions.extra['netfly_retried'] == true;
          if (error.response?.statusCode != 401 || retried || ref.read(sessionProvider).value == null) {
            return handler.next(error);
          }
          final fresh = await ref.read(sessionProvider.notifier).refresh();
          if (fresh == null) return handler.next(error);
          final options = error.requestOptions
            ..headers['Authorization'] = 'Bearer ${fresh.access}'
            ..extra['netfly_retried'] = true;
          try {
            handler.resolve(await dio.fetch<Object?>(options));
          } on DioException catch (e) {
            handler.next(e);
          }
        },
      ),
    )
    ..add(_ErrorInterceptor());
  return dio;
});

/// The generated, typed client (`lib/api/generated`, from packages/api-client/openapi.json).
final apiProvider = Provider<NetflyApi>((ref) => NetflyApi(ref.watch(dioProvider)));

/// Turns every failure into an [ApiError] (`{code, message}`), so screens show one kind of error.
class _ErrorInterceptor extends Interceptor {
  @override
  void onError(DioException err, ErrorInterceptorHandler handler) {
    handler.next(err.copyWith(error: ApiError.from(err)));
  }
}
