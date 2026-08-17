import 'dart:async';
import 'dart:convert';

import 'package:edunexus_mobile/api/api_client.dart';
import 'package:edunexus_mobile/api/token_store.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;

/// Records requests and replays scripted responses.
class RecordingClient extends http.BaseClient {
  RecordingClient(this.handler);

  final Future<http.Response> Function(http.Request request) handler;
  final List<http.Request> requests = [];

  @override
  Future<http.StreamedResponse> send(http.BaseRequest request) async {
    final typed = request as http.Request;
    requests.add(typed);
    final response = await handler(typed);
    return http.StreamedResponse(
      Stream.value(utf8.encode(response.body)),
      response.statusCode,
      headers: response.headers,
    );
  }
}

http.Response json(int status, Object body) => http.Response(
      jsonEncode(body),
      status,
      headers: {'content-type': 'application/json'},
    );

Future<(ApiClient, TokenStore, RecordingClient)> build(
  Future<http.Response> Function(http.Request) handler, {
  String? access,
  String? refresh,
}) async {
  final data = <String, String>{
    'edunexus.access_token': ?access,
    'edunexus.refresh_token': ?refresh,
  };
  final tokens = TokenStore(storage: InMemoryStore(data));
  await tokens.load();
  final recorder = RecordingClient(handler);
  final client = ApiClient(
    baseUrl: 'https://api.test',
    tokens: tokens,
    httpClient: recorder,
  );
  return (client, tokens, recorder);
}

String? authOf(http.Request request) => request.headers['Authorization'];

void main() {
  group('requests', () {
    test('sends the access token as a bearer header', () async {
      final (client, _, recorder) = await build(
        (_) async => json(200, {'ok': true}),
        access: 'access-1',
        refresh: 'refresh-1',
      );

      await client.request('GET', '/api/thing');

      expect(authOf(recorder.requests.single), 'Bearer access-1');
    });

    test('omits the token when auth is disabled', () async {
      final (client, _, recorder) = await build(
        (_) async => json(200, {}),
        access: 'access-1',
        refresh: 'refresh-1',
      );

      await client.login('a@b.c', 'pw');

      expect(authOf(recorder.requests.single), isNull);
    });

    test('returns null for a 204', () async {
      final (client, _, _) = await build(
        (_) async => http.Response('', 204),
        access: 'a',
        refresh: 'r',
      );

      expect(await client.request('DELETE', '/api/thing'), isNull);
    });

    test('throws ApiException with the status and message', () async {
      final (client, _, _) = await build(
        (_) async => json(404, {'error': 'question not found'}),
        access: 'a',
        refresh: 'r',
      );

      final error = await client
          .request('GET', '/api/questions/nope')
          .then<Object?>((_) => null, onError: (e) => e);

      expect(error, isA<ApiException>());
      expect((error as ApiException).status, 404);
      expect(error.message, 'question not found');
    });

    test('surfaces the first field error rather than an object', () async {
      final (client, _, _) = await build(
        (_) async => json(422, {
          'errors': {
            'password': ['too short'],
          },
        }),
      );

      final error = await client
          .register('a@b.c', 'x')
          .then<Object?>((_) => null, onError: (e) => e);

      expect((error as ApiException).message, 'password: too short');
      expect(error.fieldErrors, containsPair('password', ['too short']));
    });

    test('drops empty query parameters', () async {
      final (client, _, recorder) = await build(
        (_) async => json(200, {'items': []}),
        access: 'a',
        refresh: 'r',
      );

      await client.questions({'section': 'math', 'domain': '', 'skill': null});

      final uri = recorder.requests.single.url;
      expect(uri.queryParameters['section'], 'math');
      expect(uri.queryParameters.containsKey('domain'), isFalse);
      expect(uri.queryParameters.containsKey('skill'), isFalse);
    });

    test('a transport failure is reported as offline, with no status',
        () async {
      final (client, _, _) = await build(
        (_) async => throw const SocketExceptionStub(),
        access: 'a',
        refresh: 'r',
      );

      final error = await client
          .request('GET', '/api/thing')
          .then<Object?>((_) => null, onError: (e) => e);

      expect(error, isA<ApiException>());
      expect((error as ApiException).isOffline, isTrue);
      expect(error.status, isNull);
    });
  });

  group('token refresh', () {
    test('refreshes on 401 and replays the request', () async {
      var calls = 0;
      final (client, tokens, recorder) = await build(
        (request) async {
          calls += 1;
          if (request.url.path.endsWith('/refresh')) {
            return json(200, {
              'access_token': 'fresh',
              'refresh_token': 'refresh-2',
            });
          }
          return authOf(request) == 'Bearer fresh'
              ? json(200, {'items': []})
              : json(401, {'error': 'token has expired'});
        },
        access: 'stale',
        refresh: 'refresh-1',
      );

      final result = await client.request('GET', '/api/questions');

      expect(result, {'items': []});
      expect(calls, 3);
      expect(tokens.accessToken, 'fresh');
      // Rotation: the new refresh token must have replaced the old one.
      expect(tokens.refreshToken, 'refresh-2');
    });

    test('refreshes only once for concurrent 401s', () async {
      // The backend revokes a refresh token when it is used, so a second
      // concurrent refresh would present a revoked token and sign the student
      // out mid-test.
      var refreshCalls = 0;
      final (client, _, _) = await build(
        (request) async {
          if (request.url.path.endsWith('/refresh')) {
            refreshCalls += 1;
            await Future<void>.delayed(const Duration(milliseconds: 20));
            return json(200, {
              'access_token': 'fresh',
              'refresh_token': 'refresh-2',
            });
          }
          return authOf(request) == 'Bearer fresh'
              ? json(200, {'ok': true})
              : json(401, {'error': 'token has expired'});
        },
        access: 'stale',
        refresh: 'refresh-1',
      );

      final results = await Future.wait([
        client.request('GET', '/api/a'),
        client.request('GET', '/api/b'),
        client.request('GET', '/api/c'),
      ]);

      expect(refreshCalls, 1);
      expect(results.every((r) => r?['ok'] == true), isTrue);
    });

    test('a later 401 can refresh again', () async {
      var refreshCalls = 0;
      var accepted = false;
      final (client, _, _) = await build(
        (request) async {
          if (request.url.path.endsWith('/refresh')) {
            refreshCalls += 1;
            accepted = true;
            return json(200, {
              'access_token': 'fresh-$refreshCalls',
              'refresh_token': 'refresh-$refreshCalls',
            });
          }
          if (accepted) {
            accepted = false; // next request goes stale again
            return json(200, {'ok': true});
          }
          return json(401, {});
        },
        access: 'stale',
        refresh: 'refresh-0',
      );

      await client.request('GET', '/api/a');
      await client.request('GET', '/api/b');

      expect(refreshCalls, 2);
    });

    test('signals the end of the session when the refresh is rejected',
        () async {
      final (client, tokens, _) = await build(
        (request) async => request.url.path.endsWith('/refresh')
            ? json(401, {'error': 'refresh token has been revoked'})
            : json(401, {}),
        access: 'stale',
        refresh: 'revoked',
      );

      final ended = client.onSessionEnded.first;

      await expectLater(
        client.request('GET', '/api/questions'),
        throwsA(isA<ApiException>()),
      );
      await ended.timeout(const Duration(seconds: 1));
      expect(tokens.hasSession, isFalse);
    });

    test('does not try to refresh without a refresh token', () async {
      var calls = 0;
      final (client, _, _) = await build(
        (_) async {
          calls += 1;
          return json(401, {'error': 'authorization required'});
        },
      );

      await expectLater(
        client.request('GET', '/api/questions'),
        throwsA(isA<ApiException>()),
      );
      expect(calls, 1);
    });

    test('does not refresh on 403, which a new token would not fix', () async {
      var calls = 0;
      final (client, _, _) = await build(
        (_) async {
          calls += 1;
          return json(403, {'error': 'administrator access required'});
        },
        access: 'good',
        refresh: 'refresh-1',
      );

      await expectLater(
        client.request('POST', '/api/questions'),
        throwsA(isA<ApiException>()),
      );
      expect(calls, 1);
    });
  });
}

/// Stands in for a real socket failure without importing dart:io, so this
/// test file also runs unchanged on a web target.
class SocketExceptionStub implements Exception {
  const SocketExceptionStub();
}
