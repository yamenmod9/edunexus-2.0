/// Where the app talks to.
///
/// Defaults to the deployed API so a release build works with no flags.
/// Point it at a local backend with:
///
///   flutter run --dart-define=EDUNEXUS_API_URL=http://10.0.2.2:5055
///
/// (10.0.2.2 is the host machine as seen from the Android emulator;
/// 127.0.0.1 there means the emulator itself.)
class AppConfig {
  static const apiBaseUrl = String.fromEnvironment(
    'EDUNEXUS_API_URL',
    defaultValue: 'https://edunexus-api-production.up.railway.app',
  );
}
