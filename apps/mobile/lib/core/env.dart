/// Build-time configuration. The API base URL is the app's one bootstrap value (the web's
/// `NETFLY_API_URL`); everything else comes from `GET /api/public/config` at runtime.
///
///   flutter run --dart-define=NETFLY_API_URL=https://netfly.example
abstract final class Env {
  static const apiUrl = String.fromEnvironment('NETFLY_API_URL', defaultValue: 'https://netflyapi.schoolsoft.online');

  /// The public web origin for share links and App Links.
  static const webUrl = String.fromEnvironment(
    'NETFLY_WEB_URL',
    defaultValue: 'https://netflyclient.schoolsoft.online',
  );
}
