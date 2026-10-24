/// Build-time configuration. The API base URL is the app's one bootstrap value (the web's
/// `NETFLY_API_URL`); everything else comes from `GET /api/public/config` at runtime.
///
///   flutter run --dart-define=NETFLY_API_URL=https://netfly.example
abstract final class Env {
  static const apiUrl = String.fromEnvironment('NETFLY_API_URL', defaultValue: 'http://10.0.2.2:8000');

  /// The public web origin for share links and App Links (defaults to the API's origin).
  static const webUrl = String.fromEnvironment('NETFLY_WEB_URL', defaultValue: apiUrl);
}
