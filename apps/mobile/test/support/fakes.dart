import 'dart:convert';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:mocktail/mocktail.dart';

/// A scripted server: each request is answered by [handler] (path, body, headers) → (status, json).
class FakeServer implements HttpClientAdapter {
  FakeServer(this.handler);

  final (int, Object?) Function(RequestOptions request) handler;
  final requests = <RequestOptions>[];

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? requestStream,
    Future<void>? cancelFuture,
  ) async {
    requests.add(options);
    final (status, body) = handler(options);
    return ResponseBody.fromString(
      body == null ? '' : jsonEncode(body),
      status,
      headers: {
        Headers.contentTypeHeader: [Headers.jsonContentType],
      },
    );
  }

  List<RequestOptions> to(String path) => requests.where((r) => r.path == path).toList();

  @override
  void close({bool force = false}) {}
}

/// An in-memory keystore.
class FakeSecureStorage extends Mock implements FlutterSecureStorage {
  FakeSecureStorage([Map<String, String>? initial]) {
    if (initial != null) values.addAll(initial);
    when(() => read(key: any(named: 'key'))).thenAnswer((i) async => values[i.namedArguments[#key] as String]);
    when(
      () => write(
        key: any(named: 'key'),
        value: any(named: 'value'),
      ),
    ).thenAnswer((i) async {
      final value = i.namedArguments[#value] as String?;
      final key = i.namedArguments[#key] as String;
      if (value == null) {
        values.remove(key);
      } else {
        values[key] = value;
      }
    });
    when(() => delete(key: any(named: 'key'))).thenAnswer((i) async {
      values.remove(i.namedArguments[#key] as String);
    });
  }

  final values = <String, String>{};
}

Map<String, Object?> userJson({
  String username = 'viewer_one',
  bool? autoplayPreviews = true,
  bool? autoplayNext = true,
}) => {
  'id': 1,
  'username': username,
  'full_name': 'Viewer One',
  'is_staff': false,
  'role': '',
  'created_at': '2026-01-01T00:00:00Z',
  'translation_mode': 'translated',
  'preferred_quality': 'auto',
  'autoplay_next': autoplayNext,
  'autoplay_previews': autoplayPreviews,
  'subtitles_language': '',
  'email': null,
  'email_verified': false,
  'phone': null,
  'phone_verified': false,
};

Map<String, Object?> sessionJson({String access = 'access-1', String refresh = 'refresh-1', int expiresIn = 900}) => {
  'access': access,
  'expires_in': expiresIn,
  'refresh': refresh,
  'user': userJson(),
};
