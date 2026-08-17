import 'dart:convert';

import 'package:edunexus_mobile/api/answer_queue.dart';
import 'package:edunexus_mobile/api/api_client.dart';
import 'package:edunexus_mobile/api/token_store.dart';
import 'package:edunexus_mobile/screens/practice_screen.dart';
import 'package:edunexus_mobile/state/app_state.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Regression guard for the bug that shipped past 32 unit tests, a clean
/// `flutter analyze` and two successful platform builds: answer choices were
/// not selectable at all.
///
/// Flutter 3.44 deprecated `groupValue`/`onChanged` on `RadioListTile`, and the
/// deprecated path no longer delivers taps — the selection has to come from a
/// `RadioGroup` ancestor. Nothing in the type system or the analyzer says so
/// once the deprecation warning is suppressed, so only a test that actually
/// taps a choice can catch it.

const _question = {
  'id': 'q-1',
  'section': 'math',
  'domain': 'algebra',
  'skill': 'Linear equations',
  'difficulty': 'easy',
  'question_type': 'multiple_choice',
  'stimulus': null,
  'stem': r'If $3x + 7 = 22$, what is x?',
  'choices': [
    {'id': 'A', 'text': '3'},
    {'id': 'B', 'text': '5'},
    {'id': 'C', 'text': '7'},
    {'id': 'D', 'text': '15'},
  ],
  'figure_url': null,
};

class _StubClient extends http.BaseClient {
  final List<String> paths = [];

  @override
  Future<http.StreamedResponse> send(http.BaseRequest request) async {
    paths.add(request.url.path);
    final path = request.url.path;

    Object body;
    if (path.endsWith('/api/taxonomy')) {
      body = {
        'sections': [
          {
            'value': 'math',
            'label': 'Math',
            'domains': [
              {'value': 'algebra', 'label': 'Algebra', 'skills': <String>[]},
            ],
          },
        ],
        'difficulties': [
          {'value': 'easy', 'label': 'Easy'},
        ],
        'question_types': <dynamic>[],
        'sources': <dynamic>[],
      };
    } else if (path.endsWith('/check')) {
      body = {
        'question_id': 'q-1',
        'answer': 'B',
        'is_correct': true,
        'correct_answer': 'B',
        'rationale': 'Because B.',
      };
    } else {
      body = {'items': [_question], 'page': 1, 'per_page': 10, 'total': 1, 'pages': 1};
    }

    return http.StreamedResponse(
      Stream.value(utf8.encode(jsonEncode(body))),
      200,
    );
  }
}

Future<(_StubClient, Widget)> buildScreen() async {
  SharedPreferences.setMockInitialValues({});
  final stub = _StubClient();
  final tokens = TokenStore(
    storage: InMemoryStore({
      'edunexus.access_token': 'a',
      'edunexus.refresh_token': 'r',
    }),
  );
  await tokens.load();
  final client = ApiClient(
    baseUrl: 'https://api.test',
    tokens: tokens,
    httpClient: stub,
  );
  final queue = AnswerQueue(client);
  await queue.load();
  // Not booted: boot() reaches for connectivity plugins that do not exist in a
  // widget test, and nothing here needs them.
  final state = AppState(client: client, tokens: tokens, queue: queue);

  return (
    stub,
    ChangeNotifierProvider<AppState>.value(
      value: state,
      child: const MaterialApp(home: PracticeScreen()),
    ),
  );
}

void main() {
  testWidgets('tapping a choice selects it and enables Check', (tester) async {
    final (stub, widget) = await buildScreen();
    await tester.pumpWidget(widget);
    await tester.pumpAndSettle();

    expect(find.byType(RadioListTile<String>), findsNWidgets(4));

    // Nothing chosen yet, so there is nothing to check.
    var check = tester.widget<FilledButton>(
      find.widgetWithText(FilledButton, 'Check'),
    );
    expect(check.onPressed, isNull, reason: 'Check should start disabled');

    // Scroll the choice into view first: the stimulus and stem push the
    // choices below the fold on a small viewport, and a tap on an off-screen
    // widget silently lands on the scroll view instead.
    await tester.ensureVisible(find.byType(RadioListTile<String>).at(1));
    await tester.pumpAndSettle();
    await tester.tap(find.byType(RadioListTile<String>).at(1)); // choice B
    await tester.pumpAndSettle();

    // The heart of it: the tap must have registered a selection.
    final group = tester.widget<RadioGroup<String>>(
      find.byType(RadioGroup<String>),
    );
    expect(group.groupValue, 'B', reason: 'the tap must select choice B');

    check = tester.widget<FilledButton>(
      find.widgetWithText(FilledButton, 'Check'),
    );
    expect(
      check.onPressed,
      isNotNull,
      reason: 'selecting an answer must enable Check — this is the regression',
    );
  });

  testWidgets('checking an answer calls the server and shows the result',
      (tester) async {
    final (stub, widget) = await buildScreen();
    await tester.pumpWidget(widget);
    await tester.pumpAndSettle();

    await tester.ensureVisible(find.byType(RadioListTile<String>).at(1));
    await tester.pumpAndSettle();
    await tester.tap(find.byType(RadioListTile<String>).at(1));
    await tester.pumpAndSettle();
    await tester.tap(find.widgetWithText(FilledButton, 'Check'));
    await tester.pumpAndSettle();

    // Grading happens server-side; the bank never hands the client the key.
    expect(stub.paths.any((p) => p.endsWith('/check')), isTrue);
    expect(find.text('Correct.'), findsOneWidget);
    expect(find.text('Explanation'), findsOneWidget);
  });

  testWidgets('choices lock once the answer has been checked', (tester) async {
    final (_, widget) = await buildScreen();
    await tester.pumpWidget(widget);
    await tester.pumpAndSettle();

    await tester.ensureVisible(find.byType(RadioListTile<String>).at(1));
    await tester.pumpAndSettle();
    await tester.tap(find.byType(RadioListTile<String>).at(1));
    await tester.pumpAndSettle();
    await tester.tap(find.widgetWithText(FilledButton, 'Check'));
    await tester.pumpAndSettle();

    final radio = tester.widget<RadioListTile<String>>(
      find.byType(RadioListTile<String>).first,
    );
    expect(radio.enabled, isFalse, reason: 'answered questions must not change');
  });
}
