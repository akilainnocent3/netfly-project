import 'package:dio/dio.dart';

/// Every API error is `{code, message}` (plus `fields` for forms). Responses that never reached
/// Django (no network, timeouts, proxy errors) get the same shape with a human message, as on
/// the web (`packages/api-client`).
class ApiError implements Exception {
  const ApiError(this.code, this.message, {this.status, this.fields = const {}, this.extra = const {}});

  factory ApiError.from(Object error) {
    if (error is ApiError) return error;
    if (error is DioException) {
      final inner = error.error;
      if (inner is ApiError) return inner;
      final response = error.response;
      final data = response?.data;
      if (data is Map && data['code'] is String && data['message'] is String) {
        final fields = <String, String>{};
        final raw = data['fields'];
        if (raw is Map) {
          raw.forEach((key, value) {
            fields['$key'] = value is List && value.isNotEmpty ? '${value.first}' : '$value';
          });
        }
        return ApiError(
          data['code'] as String,
          data['message'] as String,
          status: response?.statusCode,
          fields: fields,
          extra: Map<String, Object?>.from(data),
        );
      }
      switch (error.type) {
        case DioExceptionType.connectionError:
        case DioExceptionType.connectionTimeout:
          return const ApiError('offline', "You're offline. Check your connection and try again.");
        case DioExceptionType.receiveTimeout:
        case DioExceptionType.sendTimeout:
          return const ApiError('timeout', 'This is taking too long. Try again.');
        default:
          return ApiError.forStatus(response?.statusCode);
      }
    }
    return const ApiError('unknown', 'Something went wrong. Try again.');
  }

  /// Status-based fallbacks for responses without a body (same wording as the web).
  factory ApiError.forStatus(int? status) => switch (status) {
    401 => const ApiError('not_authenticated', 'Please sign in to continue.', status: 401),
    403 => const ApiError('forbidden', "You don't have access to that.", status: 403),
    404 => const ApiError('not_found', "We couldn't find that.", status: 404),
    429 => const ApiError('throttled', 'Too many tries. Wait a moment and try again.', status: 429),
    502 ||
    503 ||
    504 => ApiError('unavailable', 'NETFLY is having trouble right now. Try again shortly.', status: status),
    _ => ApiError('unknown', 'Something went wrong. Try again.', status: status),
  };

  final String code;
  final String message;
  final int? status;
  final Map<String, String> fields;
  final Map<String, Object?> extra;

  bool get isOffline => code == 'offline';

  @override
  String toString() => 'ApiError($code, $message)';
}
