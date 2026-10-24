import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

/// lib/brand/geometry.brand.dart is generated from the web's brand geometry; it must not drift.
void main() {
  test('brand geometry is up to date with packages/ui', () async {
    final result = await Process.run('dart', ['run', 'tool/sync_brand.dart', '--check']);
    expect(result.exitCode, 0, reason: '${result.stderr}');
  }, timeout: const Timeout(Duration(minutes: 2)));
}
