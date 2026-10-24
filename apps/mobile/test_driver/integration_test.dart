import 'dart:io';

import 'package:integration_test/integration_test_driver_extended.dart';

/// Saves the run's screenshots to screenshots/android/ and its performance summaries (frame
/// build / raster times per scenario) to build/integration_response_data.json.
Future<void> main() => integrationDriver(
  onScreenshot: (name, bytes, [args]) async {
    final file = File('screenshots/android/$name.png');
    await file.parent.create(recursive: true);
    await file.writeAsBytes(bytes);
    return true;
  },
);
