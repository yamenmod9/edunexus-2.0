import 'package:edunexus_mobile/main.dart' as app;
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';

/// Drives the real app against the real API — the "done means run, not
/// compiled" bar from CLAUDE.md section 9.4.
///
/// Run it on whichever platform you want to prove:
///
///   flutter test integration_test/app_test.dart -d windows
///   flutter test integration_test/app_test.dart -d `<android-device>`
///
/// It hits whatever `EDUNEXUS_API_URL` points at (the deployed API by
/// default), so it creates a real account each run. Point it at a local
/// backend to keep production clean:
///
///   flutter test integration_test/app_test.dart -d windows \
///     --dart-define=EDUNEXUS_API_URL=http://127.0.0.1:5055
void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  final email = 'mobile-drive-${DateTime.now().millisecondsSinceEpoch}@example.com';
  const password = 'mobile drive 1';

  /// The app talks to a live server, so waiting a fixed number of frames is
  /// not enough — pump until the thing we are waiting for actually appears.
  Future<void> pumpUntil(
    WidgetTester tester,
    Finder finder, {
    Duration timeout = const Duration(seconds: 30),
  }) async {
    final deadline = DateTime.now().add(timeout);
    while (DateTime.now().isBefore(deadline)) {
      await tester.pump(const Duration(milliseconds: 250));
      if (finder.evaluate().isNotEmpty) return;
    }
    // Dump what IS on screen — a bare "timed out" says nothing about why.
    final visible = find
        .byType(Text)
        .evaluate()
        .map((e) => (e.widget as Text).data)
        .whereType<String>()
        .where((t) => t.trim().isNotEmpty)
        .take(40)
        .toList();
    final buttons = find.byType(FilledButton).evaluate().map((e) {
      final b = e.widget as FilledButton;
      final label = b.child is Text ? (b.child! as Text).data : '?';
      return '$label(${b.onPressed == null ? 'disabled' : 'enabled'})';
    }).toList();
    fail(
      'timed out waiting for: ${finder.describeMatch(Plurality.many)}; '
      'visible text: $visible; '
      'buttons: $buttons',
    );
  }

  testWidgets('register, practise, then run a full adaptive test',
      (tester) async {
    app.main();
    await tester.pumpAndSettle();

    // Tokens live in the platform keystore and survive both app restarts and
    // test runs, so a previous run leaves this signed in. Start from a known
    // state rather than assuming a fresh install.
    await tester.pump(const Duration(seconds: 2));
    final signOut = find.byTooltip('Sign out');
    if (signOut.evaluate().isNotEmpty) {
      await tester.tap(signOut);
      await tester.pumpAndSettle();
    }

    // --- register -----------------------------------------------------
    await pumpUntil(tester, find.text('Sign in'));
    await tester.tap(find.text('No account yet? Create one'));
    await tester.pumpAndSettle();

    await tester.enterText(find.byType(TextFormField).first, email);
    await tester.enterText(find.byType(TextFormField).last, password);
    await tester.tap(find.widgetWithText(FilledButton, 'Create account'));

    await pumpUntil(tester, find.text('Practice tests'));
    expect(find.textContaining(email), findsWidgets);

    // --- practice mode ------------------------------------------------
    await tester.tap(find.text('Practice questions').first);
    await pumpUntil(tester, find.widgetWithText(FilledButton, 'Check'));

    // The bank must not hand a student the key before they answer: the only
    // way to learn it is the check endpoint.
    await tester.tap(find.byType(RadioListTile<String>).first);
    await tester.pumpAndSettle();
    await tester.tap(find.widgetWithText(FilledButton, 'Check'));
    await pumpUntil(
      tester,
      find.byWidgetPredicate((w) =>
          w is Text &&
          (w.data?.contains('Correct.') == true ||
              w.data?.contains('the answer is') == true)),
    );

    await tester.pageBack();
    await tester.pumpAndSettle();

    // --- a full adaptive test ----------------------------------------
    await pumpUntil(tester, find.widgetWithText(FilledButton, 'Start test'));
    await tester.tap(find.widgetWithText(FilledButton, 'Start test').first);
    await pumpUntil(tester, find.widgetWithText(FilledButton, 'Review'));

    for (var module = 0; module < 4; module += 1) {
      // Answer whatever is on screen, then walk forward through the module.
      while (true) {
        final choices = find.byType(RadioListTile<String>);
        if (choices.evaluate().isNotEmpty) {
          await tester.tap(choices.at(1)); // "B" in the seeded demo bank
          await tester.pumpAndSettle();
        }
        // byTooltip resolves to the Tooltip, not the button inside it.
        final next = find.descendant(
          of: find.byTooltip('Next question'),
          matching: find.byType(IconButton),
        );
        final enabled = next.evaluate().isNotEmpty &&
            tester.widget<IconButton>(next.first).onPressed != null;
        if (!enabled) break;
        await tester.tap(next.first);
        await tester.pumpAndSettle();
      }

      await tester.tap(find.widgetWithText(FilledButton, 'Review'));
      await tester.pumpAndSettle();

      final finish = find.widgetWithText(FilledButton, 'Finish test');
      final submit = find.widgetWithText(FilledButton, 'Submit module');
      await tester.tap(finish.evaluate().isNotEmpty ? finish : submit);

      if (module < 3) {
        await pumpUntil(tester, find.widgetWithText(FilledButton, 'Review'));
      }
    }

    // --- the score report --------------------------------------------
    await pumpUntil(tester, find.text('Score report'),
        timeout: const Duration(seconds: 45));

    // A score is never shown without the caveat the API attaches to it.
    expect(find.text('These scores are an approximation'), findsOneWidget);
    expect(find.text('TOTAL'), findsOneWidget);
    expect(find.text('READING & WRITING'), findsOneWidget);
    expect(find.text('MATH'), findsOneWidget);

    // Routing happened server-side and is reported after the fact. The module
    // cards sit below the fold, and a ListView builds its children lazily, so
    // scroll them into existence rather than asserting on an unbuilt widget.
    await tester.scrollUntilVisible(
      // Not .first — that throws while the target has not been built yet,
      // which is precisely the state this call exists to resolve.
      find.textContaining('Routed to the'),
      300,
      scrollable: find.byType(Scrollable).first,
      maxScrolls: 60,
    );
    await tester.pumpAndSettle();
    expect(find.textContaining('Routed to the'), findsWidgets);
  });
}
