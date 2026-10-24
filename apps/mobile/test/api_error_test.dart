import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:netfly/core/api_error.dart';

void main() {
  final request = RequestOptions(path: '/x');

  test('network failures have a human message, like the web', () {
    final offline = ApiError.from(DioException.connectionError(requestOptions: request, reason: 'no route'));
    expect(offline.code, 'offline');
    expect(offline.isOffline, isTrue);
    final slow = ApiError.from(DioException.receiveTimeout(timeout: Duration.zero, requestOptions: request));
    expect(slow.code, 'timeout');
  });

  test('bodies without {code, message} fall back to the status', () {
    ApiError status(int code) => ApiError.from(
      DioException.badResponse(
        statusCode: code,
        requestOptions: request,
        response: Response(requestOptions: request, statusCode: code, data: '<html>'),
      ),
    );
    expect(status(429).code, 'throttled');
    expect(status(502).code, 'unavailable');
    expect(status(404).code, 'not_found');
    expect(status(418).code, 'unknown');
  });

  test('anything else is "Something went wrong"', () {
    expect(ApiError.from(StateError('x')).message, 'Something went wrong. Try again.');
  });
}
