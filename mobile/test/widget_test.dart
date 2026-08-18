import 'package:edunexus_mobile/widgets/common.dart';
import 'package:edunexus_mobile/widgets/math_text.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

Widget wrap(Widget child) => MaterialApp(home: Scaffold(body: child));

void main() {
  group('MathText', () {
    testWidgets('renders plain text unchanged', (tester) async {
      await tester.pumpWidget(wrap(const MathText('If 3x + 7 = 22, find x.')));
      expect(find.textContaining('If 3x + 7 = 22'), findsOneWidget);
    });

    testWidgets('renders nothing for null or empty text', (tester) async {
      await tester.pumpWidget(wrap(const MathText(null)));
      expect(find.byType(SelectableText), findsNothing);

      await tester.pumpWidget(wrap(const MathText('')));
      expect(find.byType(SelectableText), findsNothing);
    });

    testWidgets('splits inline math out of the surrounding text',
        (tester) async {
      await tester.pumpWidget(wrap(const MathText(r'Solve $x^2 = 9$ for x.')));
      await tester.pumpAndSettle();

      // The prose survives, and the expression became a widget span rather
      // than literal dollar-sign text.
      expect(find.textContaining('Solve'), findsOneWidget);
      expect(find.textContaining(r'$x^2'), findsNothing);
    });

    testWidgets('a lone dollar sign stays literal', (tester) async {
      // "costs $5" is far more common in these questions than an unclosed
      // expression, so it must not be treated as math.
      await tester.pumpWidget(wrap(const MathText(r'The book costs $5 today.')));
      await tester.pumpAndSettle();
      expect(find.textContaining(r'$5'), findsOneWidget);
    });

    testWidgets('unparseable math falls back to its source, not a crash',
        (tester) async {
      await tester.pumpWidget(wrap(const MathText(r'Broken $\frac{1}{$ here')));
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull);
      expect(find.textContaining('Broken'), findsOneWidget);
    });
  });

  group('helpers', () {
    test('humanize makes taxonomy values readable', () {
      expect(humanize('reading_writing'), 'Reading & Writing');
      // CLAUDE.md section 5 fixes the domain names exactly. Title-casing the
      // enum drops the hyphen and the ampersand, which is what this used to
      // do - and what the redesign's metadata line made visible.
      expect(humanize('problem_solving_data_analysis'),
          'Problem-Solving & Data Analysis');
      expect(humanize('craft_structure'), 'Craft & Structure');
      expect(humanize('geometry_trigonometry'), 'Geometry & Trigonometry');
      // Anything not in the table still title-cases.
      expect(humanize('math'), 'Math');
      expect(humanize('linear_equations'), 'Linear Equations');
      expect(humanize(null), '');
    });

    test('formatClock pads and never goes negative', () {
      expect(formatClock(0), '00:00');
      expect(formatClock(9), '00:09');
      expect(formatClock(75), '01:15');
      expect(formatClock(1920), '32:00');
      // A clock that has overrun should read 00:00, not a negative time.
      expect(formatClock(-5), '00:00');
      expect(formatClock(null), '00:00');
    });
  });

  group('Notice', () {
    testWidgets('shows a title and message', (tester) async {
      await tester.pumpWidget(wrap(
        const Notice(title: 'Heads up', message: 'Something happened'),
      ));
      expect(find.text('Heads up'), findsOneWidget);
      expect(find.text('Something happened'), findsOneWidget);
    });

    testWidgets('offers a dismiss button only when there is a handler',
        (tester) async {
      await tester.pumpWidget(wrap(const Notice(message: 'x')));
      expect(find.byIcon(Icons.close), findsNothing);

      var dismissed = false;
      await tester.pumpWidget(wrap(
        Notice(message: 'x', onDismiss: () => dismissed = true),
      ));
      await tester.tap(find.byIcon(Icons.close));
      expect(dismissed, isTrue);
    });
  });
}
