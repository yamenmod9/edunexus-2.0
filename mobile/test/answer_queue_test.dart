import 'dart:convert';

import 'package:edunexus_mobile/api/answer_queue.dart';
import 'package:edunexus_mobile/api/api_client.dart';
import 'package:edunexus_mobile/api/token_store.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';

class ScriptedClient extends http.BaseClient {
  ScriptedClient(this.handler);

  final Future<http.Response> Function(http.Request) handler;
  final List<String> paths = [];

  @override
  Future<http.StreamedResponse> send(http.BaseRequest request) async {
    final typed = request as http.Request;
    paths.add(typed.url.path);
    final response = await handler(typed);
    return http.StreamedResponse(
      Stream.value(utf8.encode(response.body)),
      response.statusCode,
    );
  }
}

class Offline implements Exception {
  const Offline();
}

Future<(AnswerQueue, ScriptedClient)> build(
  Future<http.Response> Function(http.Request) handler,
) async {
  SharedPreferences.setMockInitialValues({});
  final tokens = TokenStore(
    storage: InMemoryStore({
      'edunexus.access_token': 'a',
      'edunexus.refresh_token': 'r',
    }),
  );
  await tokens.load();
  final http_ = ScriptedClient(handler);
  final client = ApiClient(
    baseUrl: 'https://api.test',
    tokens: tokens,
    httpClient: http_,
  );
  final queue = AnswerQueue(client);
  await queue.load();
  return (queue, http_);
}

http.Response ok() => http.Response('{}', 200);

void main() {
  test('an answer that reaches the server is not queued', () async {
    final (queue, _) = await build((_) async => ok());

    final delivered = await queue.submit('att-1', 'q-1', {'answer': 'B'});

    expect(delivered, isTrue);
    expect(queue.isEmpty, isTrue);
  });

  test('an answer sent while offline is queued, not lost', () async {
    final (queue, _) = await build((_) async => throw const Offline());

    final delivered = await queue.submit('att-1', 'q-1', {'answer': 'B'});

    expect(delivered, isFalse);
    expect(queue.length, 1);
    expect(queue.pendingFor('att-1')['q-1'], {'answer': 'B'});
  });

  test('a rejection with a status is rethrown, not queued', () async {
    // The server has decided something - the module moved on, time ran out -
    // and retrying will not change its mind.
    final (queue, _) = await build(
      (_) async => http.Response('{"error":"this module is out of time"}', 409),
    );

    await expectLater(
      queue.submit('att-1', 'q-1', {'answer': 'B'}),
      throwsA(isA<ApiException>()),
    );
    expect(queue.isEmpty, isTrue);
  });

  test('changing an answer offline keeps only the newest', () async {
    final (queue, _) = await build((_) async => throw const Offline());

    await queue.submit('att-1', 'q-1', {'answer': 'A'});
    await queue.submit('att-1', 'q-1', {'answer': 'C'});

    expect(queue.length, 1);
    expect(queue.pendingFor('att-1')['q-1'], {'answer': 'C'});
  });

  test('marking a question offline does not unsay the answer', () async {
    // Each tool sends its own one-key payload. Replacing rather than merging
    // would drop the answer the moment the student marked the question for
    // review, and they would never know until the score came back.
    final (queue, _) = await build((_) async => throw const Offline());

    await queue.submit('att-1', 'q-1', {'answer': 'B'});
    await queue.submit('att-1', 'q-1', {'flagged': true});
    await queue.submit('att-1', 'q-1', {
      'annotations': [
        {'kind': 'eliminated', 'choice': 'D'},
      ],
    });

    expect(queue.length, 1);
    expect(queue.pendingFor('att-1')['q-1'], {
      'answer': 'B',
      'flagged': true,
      'annotations': [
        {'kind': 'eliminated', 'choice': 'D'},
      ],
    });
  });

  test('the queue survives a restart', () async {
    // Losing connection and having the app killed tend to happen together on
    // a phone; an in-memory queue would lose real answers.
    SharedPreferences.setMockInitialValues({});
    final tokens = TokenStore(
      storage: InMemoryStore({'edunexus.refresh_token': 'r'}),
    );
    await tokens.load();

    var offline = true;
    final client = ApiClient(
      baseUrl: 'https://api.test',
      tokens: tokens,
      httpClient: ScriptedClient((_) async {
        if (offline) throw const Offline();
        return ok();
      }),
    );

    final first = AnswerQueue(client);
    await first.load();
    await first.submit('att-1', 'q-1', {'answer': 'B'});
    expect(first.length, 1);

    // A brand new queue object, as if the app had been relaunched.
    final second = AnswerQueue(client);
    await second.load();
    expect(second.length, 1);
    expect(second.pendingFor('att-1')['q-1'], {'answer': 'B'});

    offline = false;
    final rejected = await second.flush();
    expect(rejected, isEmpty);
    expect(second.isEmpty, isTrue);
  });

  test('flush sends queued answers oldest first', () async {
    SharedPreferences.setMockInitialValues({});
    final tokens = TokenStore(
      storage: InMemoryStore({'edunexus.refresh_token': 'r'}),
    );
    await tokens.load();

    var offline = true;
    final sent = <String>[];
    final client = ApiClient(
      baseUrl: 'https://api.test',
      tokens: tokens,
      httpClient: ScriptedClient((request) async {
        if (offline) throw const Offline();
        sent.add(request.url.pathSegments.last);
        return ok();
      }),
    );

    final queue = AnswerQueue(client);
    await queue.load();
    await queue.submit('att-1', 'q-1', {'answer': 'A'});
    await queue.submit('att-1', 'q-2', {'answer': 'B'});
    await queue.submit('att-1', 'q-3', {'answer': 'C'});

    offline = false;
    await queue.flush();

    expect(sent, ['q-1', 'q-2', 'q-3']);
    expect(queue.isEmpty, isTrue);
  });

  test('flush stops at the first offline failure and keeps the rest',
      () async {
    SharedPreferences.setMockInitialValues({});
    final tokens = TokenStore(
      storage: InMemoryStore({'edunexus.refresh_token': 'r'}),
    );
    await tokens.load();

    var allowOne = false;
    var delivered = 0;
    final client = ApiClient(
      baseUrl: 'https://api.test',
      tokens: tokens,
      httpClient: ScriptedClient((_) async {
        if (allowOne && delivered < 1) {
          delivered += 1;
          return ok();
        }
        throw const Offline();
      }),
    );

    final queue = AnswerQueue(client);
    await queue.load();
    await queue.submit('att-1', 'q-1', {'answer': 'A'});
    await queue.submit('att-1', 'q-2', {'answer': 'B'});

    allowOne = true;
    await queue.flush();

    // One got through; the other stayed queued rather than being dropped.
    expect(queue.length, 1);
    expect(queue.pendingFor('att-1').keys, ['q-2']);
  });

  test('flush reports answers the server refused rather than hiding them',
      () async {
    SharedPreferences.setMockInitialValues({});
    final tokens = TokenStore(
      storage: InMemoryStore({'edunexus.refresh_token': 'r'}),
    );
    await tokens.load();

    var offline = true;
    final client = ApiClient(
      baseUrl: 'https://api.test',
      tokens: tokens,
      httpClient: ScriptedClient((_) async {
        if (offline) throw const Offline();
        // The module moved on while the student was offline.
        return http.Response('{"error":"not in the current module"}', 404);
      }),
    );

    final queue = AnswerQueue(client);
    await queue.load();
    await queue.submit('att-1', 'q-1', {'answer': 'A'});

    offline = false;
    final rejected = await queue.flush();

    expect(rejected, hasLength(1));
    expect(rejected.single.questionId, 'q-1');
    // Dropped from the queue: a rejection will not become an acceptance.
    expect(queue.isEmpty, isTrue);
  });

  test('a corrupt stored queue does not brick the app on launch', () async {
    SharedPreferences.setMockInitialValues({
      'edunexus.pending_answers': 'not json at all',
    });
    final tokens = TokenStore(storage: InMemoryStore({}));
    await tokens.load();
    final client = ApiClient(
      baseUrl: 'https://api.test',
      tokens: tokens,
      httpClient: ScriptedClient((_) async => ok()),
    );

    final queue = AnswerQueue(client);
    await queue.load();

    expect(queue.isEmpty, isTrue);
  });

  test('pendingFor only returns answers for the attempt asked about',
      () async {
    final (queue, _) = await build((_) async => throw const Offline());

    await queue.submit('att-1', 'q-1', {'answer': 'A'});
    await queue.submit('att-2', 'q-9', {'answer': 'B'});

    expect(queue.pendingFor('att-1').keys, ['q-1']);
    expect(queue.pendingFor('att-2').keys, ['q-9']);
  });
}
