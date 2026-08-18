import 'dart:async';
import 'dart:convert';

import 'package:http/http.dart' as http;

import 'token_store.dart';

/// Thrown for any non-2xx response. [status] is the HTTP status; [payload] is
/// the decoded body when there was one.
class ApiException implements Exception {
  ApiException(this.message, {this.status, this.payload});

  final String message;
  final int? status;
  final Map<String, dynamic>? payload;

  /// Field-level validation errors, as marshmallow returns them.
  Map<String, dynamic>? get fieldErrors =>
      payload?['errors'] is Map<String, dynamic>
          ? payload!['errors'] as Map<String, dynamic>
          : null;

  bool get isOffline => status == null;

  @override
  String toString() => message;
}

/// Talks to the EduNexus API.
///
/// Mirrors `web/src/api/client.js`, and for the same reason its refresh is
/// single-flight: the backend ROTATES refresh tokens, so refreshing revokes
/// the token you presented. If two requests 401 at once and each starts its
/// own refresh, the second presents a token the first already revoked, that
/// refresh fails, and the student is signed out mid-test. On mobile this is
/// more likely than on the web, not less — coming back from a tunnel or a
/// locked screen tends to fire several stale-token requests at once.
class ApiClient {
  ApiClient({
    required this.baseUrl,
    required this.tokens,
    http.Client? httpClient,
  }) : _http = httpClient ?? http.Client();

  final String baseUrl;
  final TokenStore tokens;
  final http.Client _http;

  Future<String>? _refreshInFlight;
  final _sessionEnded = StreamController<void>.broadcast();

  /// Emits when the session cannot be recovered and the app should sign out.
  Stream<void> get onSessionEnded => _sessionEnded.stream;

  void dispose() {
    _sessionEnded.close();
    _http.close();
  }

  Uri _uri(String path, [Map<String, dynamic>? query]) {
    final cleaned = query?..removeWhere(
        (_, value) => value == null || value.toString().isEmpty);
    return Uri.parse('$baseUrl$path').replace(
      queryParameters: cleaned?.isEmpty ?? true
          ? null
          : cleaned!.map((k, v) => MapEntry(k, v.toString())),
    );
  }

  Future<http.Response> _send(
    String method,
    Uri uri, {
    Object? body,
    String? token,
  }) {
    final headers = <String, String>{
      if (body != null) 'Content-Type': 'application/json',
      if (token != null) 'Authorization': 'Bearer $token',
    };
    final encoded = body == null ? null : jsonEncode(body);

    switch (method) {
      case 'GET':
        return _http.get(uri, headers: headers);
      case 'POST':
        return _http.post(uri, headers: headers, body: encoded);
      case 'PUT':
        return _http.put(uri, headers: headers, body: encoded);
      case 'PATCH':
        return _http.patch(uri, headers: headers, body: encoded);
      case 'DELETE':
        return _http.delete(uri, headers: headers);
      default:
        throw ArgumentError('unsupported method $method');
    }
  }

  Map<String, dynamic>? _decode(http.Response response) {
    if (response.statusCode == 204 || response.body.isEmpty) return null;
    try {
      final decoded = jsonDecode(response.body);
      if (decoded is Map<String, dynamic>) return decoded;
      return {'items': decoded};
    } catch (_) {
      return {'error': response.body};
    }
  }

  String _message(Map<String, dynamic>? payload, int status) {
    if (payload == null) return 'Request failed ($status)';
    final error = payload['error'];
    if (error is String) return error;
    final errors = payload['errors'];
    if (errors is Map && errors.isNotEmpty) {
      final entry = errors.entries.first;
      final detail = entry.value is List
          ? (entry.value as List).first
          : entry.value;
      return '${entry.key}: $detail';
    }
    return 'Request failed ($status)';
  }

  /// Refreshes the token pair. Concurrent callers share one in-flight request;
  /// see the note on this class.
  Future<String> _refresh() {
    final existing = _refreshInFlight;
    if (existing != null) return existing;

    final future = () async {
      final refresh = tokens.refreshToken;
      if (refresh == null || refresh.isEmpty) {
        throw ApiException('No session', status: 401);
      }
      final response = await _send(
        'POST',
        _uri('/api/auth/refresh'),
        body: {'refresh_token': refresh},
      );
      final payload = _decode(response);
      if (response.statusCode >= 400) {
        throw ApiException(
          _message(payload, response.statusCode),
          status: response.statusCode,
          payload: payload,
        );
      }
      await tokens.save(
        access: payload!['access_token'] as String,
        refresh: payload['refresh_token'] as String,
      );
      return payload['access_token'] as String;
    }();

    _refreshInFlight = future;
    // Clear the slot however it settles, so a later 401 can refresh again.
    future.whenComplete(() => _refreshInFlight = null).catchError((_) => '');
    return future;
  }

  Future<Map<String, dynamic>?> request(
    String method,
    String path, {
    Object? body,
    Map<String, dynamic>? query,
    bool auth = true,
  }) async {
    final uri = _uri(path, query);
    http.Response response;

    try {
      response = await _send(method, uri,
          body: body, token: auth ? tokens.accessToken : null);
    } catch (error) {
      // No status: the request never reached the server. Callers distinguish
      // this from a rejection so the test player can hold answers rather than
      // discard them.
      throw ApiException('Cannot reach EduNexus. Check your connection.');
    }

    if (response.statusCode == 401 && auth && tokens.hasSession) {
      try {
        final token = await _refresh();
        response = await _send(method, uri, body: body, token: token);
      } on ApiException {
        await tokens.clear();
        if (!_sessionEnded.isClosed) _sessionEnded.add(null);
      }
    }

    final payload = _decode(response);
    if (response.statusCode >= 400) {
      if (response.statusCode == 401 && auth) {
        await tokens.clear();
        if (!_sessionEnded.isClosed) _sessionEnded.add(null);
      }
      throw ApiException(
        _message(payload, response.statusCode),
        status: response.statusCode,
        payload: payload,
      );
    }
    return payload;
  }

  Future<Map<String, dynamic>> requireJson(
    String method,
    String path, {
    Object? body,
    Map<String, dynamic>? query,
    bool auth = true,
  }) async {
    final payload =
        await request(method, path, body: body, query: query, auth: auth);
    if (payload == null) {
      throw ApiException('Expected a response body', status: 500);
    }
    return payload;
  }

  // --- endpoints ---------------------------------------------------------

  Future<Map<String, dynamic>> register(String email, String password) =>
      requireJson('POST', '/api/auth/register',
          body: {'email': email, 'password': password}, auth: false);

  Future<Map<String, dynamic>> login(String email, String password) =>
      requireJson('POST', '/api/auth/login',
          body: {'email': email, 'password': password}, auth: false);

  Future<Map<String, dynamic>> me() => requireJson('GET', '/api/auth/me');

  Future<void> logout(String refreshToken) async {
    await request('POST', '/api/auth/logout',
        body: {'refresh_token': refreshToken}, auth: false);
  }

  Future<Map<String, dynamic>> taxonomy() =>
      requireJson('GET', '/api/taxonomy');

  Future<Map<String, dynamic>> questions(Map<String, dynamic> filters) =>
      requireJson('GET', '/api/questions', query: filters);

  /// Grades one practice answer. [secondsSpent] is recorded as a practice
  /// response server-side; omit it and only the grade comes back.
  Future<Map<String, dynamic>> checkAnswer(
    String questionId,
    String answer, {
    int? secondsSpent,
  }) =>
      requireJson('POST', '/api/questions/$questionId/check', body: {
        'answer': answer,
        'seconds_spent': ?secondsSpent,
      });

  Future<Map<String, dynamic>> forms() => requireJson('GET', '/api/forms');

  Future<Map<String, dynamic>> startAttempt(String formId) =>
      requireJson('POST', '/api/attempts', body: {'form_id': formId});

  Future<Map<String, dynamic>> currentAttempt() =>
      requireJson('GET', '/api/attempts/current');

  Future<Map<String, dynamic>> attempt(String id) =>
      requireJson('GET', '/api/attempts/$id');

  Future<Map<String, dynamic>> attemptList() =>
      requireJson('GET', '/api/attempts');

  Future<Map<String, dynamic>> respond(
    String attemptId,
    String questionId,
    Map<String, dynamic> payload,
  ) =>
      requireJson('PUT', '/api/attempts/$attemptId/responses/$questionId',
          body: payload);

  Future<Map<String, dynamic>> completeModule(String attemptId) =>
      requireJson('POST', '/api/attempts/$attemptId/module/complete');

  Future<Map<String, dynamic>> submitAttempt(String attemptId) =>
      requireJson('POST', '/api/attempts/$attemptId/submit');

  Future<Map<String, dynamic>> review(String attemptId) =>
      requireJson('GET', '/api/attempts/$attemptId/review');

  Future<Map<String, dynamic>> analyticsDashboard() =>
      requireJson('GET', '/api/analytics/dashboard');

  Future<Map<String, dynamic>> score(String attemptId) =>
      requireJson('GET', '/api/attempts/$attemptId/score');
}
