import 'dart:async';

import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:flutter/foundation.dart';

import '../api/answer_queue.dart';
import '../api/api_client.dart';
import '../api/token_store.dart';

/// Session and connectivity, shared by every screen.
class AppState extends ChangeNotifier {
  AppState({
    required this.client,
    required this.tokens,
    required this.queue,
    Connectivity? connectivity,
  }) : _connectivity = connectivity ?? Connectivity() {
    _sessionSub = client.onSessionEnded.listen((_) {
      _user = null;
      notifyListeners();
    });
    _pendingSub = queue.pendingCount.listen((_) => notifyListeners());
  }

  final ApiClient client;
  final TokenStore tokens;
  final AnswerQueue queue;
  final Connectivity _connectivity;

  StreamSubscription<void>? _sessionSub;
  StreamSubscription<int>? _pendingSub;
  StreamSubscription<List<ConnectivityResult>>? _connectivitySub;

  Map<String, dynamic>? _user;
  bool _booting = true;
  bool _online = true;

  Map<String, dynamic>? get user => _user;
  bool get booting => _booting;
  bool get signedIn => _user != null;
  bool get online => _online;
  int get pendingAnswers => queue.length;

  /// Loads stored tokens and, if there is a session, who it belongs to.
  Future<void> boot() async {
    await tokens.load();
    await queue.load();

    if (tokens.hasSession) {
      try {
        _user = await client.me();
      } on ApiException {
        // An expired or revoked session is not an error worth showing on
        // launch; it just means signing in again.
        _user = null;
      }
    }

    _connectivitySub =
        _connectivity.onConnectivityChanged.listen(_onConnectivityChanged);
    final initial = await _connectivity.checkConnectivity();
    _online = _hasConnection(initial);

    _booting = false;
    notifyListeners();
  }

  bool _hasConnection(List<ConnectivityResult> results) =>
      results.any((r) => r != ConnectivityResult.none);

  Future<void> _onConnectivityChanged(List<ConnectivityResult> results) async {
    final wasOffline = !_online;
    _online = _hasConnection(results);
    notifyListeners();

    // Coming back online is the moment to deliver whatever was answered in
    // the meantime.
    if (wasOffline && _online && !queue.isEmpty) {
      final rejected = await queue.flush();
      if (rejected.isNotEmpty) {
        lateAnswers = rejected.length;
        notifyListeners();
      }
    }
  }

  /// Answers the server refused after a reconnect - the module had moved on.
  /// Surfaced once, then cleared, so a student is told rather than left
  /// believing an answer counted.
  int lateAnswers = 0;
  void acknowledgeLateAnswers() {
    lateAnswers = 0;
    notifyListeners();
  }

  Future<void> _adopt(Map<String, dynamic> pair) async {
    await tokens.save(
      access: pair['access_token'] as String,
      refresh: pair['refresh_token'] as String,
    );
    _user = pair['user'] as Map<String, dynamic>?;
    _user ??= await client.me();
    notifyListeners();
  }

  Future<void> signIn(String email, String password) async =>
      _adopt(await client.login(email.trim(), password));

  Future<void> register(String email, String password) async =>
      _adopt(await client.register(email.trim(), password));

  Future<void> signOut() async {
    final refresh = tokens.refreshToken;
    if (refresh != null) {
      // Revoke server-side, but never strand someone on a screen they wanted
      // to leave because the network was down.
      try {
        await client.logout(refresh);
      } on ApiException {
        // ignored on purpose
      }
    }
    await tokens.clear();
    await queue.clear();
    _user = null;
    notifyListeners();
  }

  @override
  void dispose() {
    _sessionSub?.cancel();
    _pendingSub?.cancel();
    _connectivitySub?.cancel();
    super.dispose();
  }
}
