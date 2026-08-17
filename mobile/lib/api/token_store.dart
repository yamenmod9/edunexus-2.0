import 'package:flutter_secure_storage/flutter_secure_storage.dart';

/// The narrow slice of key-value storage this app needs.
///
/// Declared here rather than subclassing [FlutterSecureStorage] in tests: that
/// package's option types change between majors (v11 merged the iOS and macOS
/// options into `AppleOptions`), and a fake that has to mirror the full
/// signature breaks on every upgrade for no benefit. Three methods is the
/// whole contract.
abstract class SecureKeyValueStore {
  Future<String?> read(String key);
  Future<void> write(String key, String value);
  Future<void> delete(String key);
}

/// The real thing: Keychain on iOS, the Android Keystore on Android, DPAPI on
/// Windows.
class PlatformSecureStore implements SecureKeyValueStore {
  PlatformSecureStore([FlutterSecureStorage? storage])
      : _storage = storage ??
            const FlutterSecureStorage(
              // Opt in explicitly: this defaults to false, and without it the
              // tokens are not in Jetpack's EncryptedSharedPreferences.
              aOptions: AndroidOptions(encryptedSharedPreferences: true),
              iOptions: IOSOptions(
                // Tokens are useless while the device is locked, and this
                // keeps them out of iCloud backups and off a new device.
                accessibility: KeychainAccessibility.first_unlock_this_device,
              ),
            );

  final FlutterSecureStorage _storage;

  @override
  Future<String?> read(String key) => _storage.read(key: key);

  @override
  Future<void> write(String key, String value) =>
      _storage.write(key: key, value: value);

  @override
  Future<void> delete(String key) => _storage.delete(key: key);
}

/// Access and refresh tokens, held in the platform keystore.
///
/// The web client keeps these in localStorage because a browser offers nothing
/// better. A native client does, so this uses it — a stray script cannot read
/// the keystore the way it can read localStorage.
class TokenStore {
  TokenStore({SecureKeyValueStore? storage})
      : _storage = storage ?? PlatformSecureStore();

  static const _accessKey = 'edunexus.access_token';
  static const _refreshKey = 'edunexus.refresh_token';

  final SecureKeyValueStore _storage;

  // Cached in memory after load: the test player reads the access token on
  // every answer, and a keystore round trip per keystroke is wasted work.
  String? _access;
  String? _refresh;
  bool _loaded = false;

  Future<void> load() async {
    _access = await _storage.read(_accessKey);
    _refresh = await _storage.read(_refreshKey);
    _loaded = true;
  }

  bool get isLoaded => _loaded;
  String? get accessToken => _access;
  String? get refreshToken => _refresh;
  bool get hasSession => _refresh != null && _refresh!.isNotEmpty;

  Future<void> save({required String access, required String refresh}) async {
    _access = access;
    _refresh = refresh;
    await _storage.write(_accessKey, access);
    await _storage.write(_refreshKey, refresh);
  }

  Future<void> clear() async {
    _access = null;
    _refresh = null;
    await _storage.delete(_accessKey);
    await _storage.delete(_refreshKey);
  }
}

/// In-memory store for tests and for the rare device where the keystore is
/// unavailable.
class InMemoryStore implements SecureKeyValueStore {
  InMemoryStore([Map<String, String>? seed])
      : _data = {...?seed};

  final Map<String, String> _data;

  @override
  Future<String?> read(String key) async => _data[key];

  @override
  Future<void> write(String key, String value) async => _data[key] = value;

  @override
  Future<void> delete(String key) async => _data.remove(key);
}
