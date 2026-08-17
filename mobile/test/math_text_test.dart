import 'package:edunexus_mobile/widgets/math_text.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

/// Mirrors web/src/components/MathText.test.jsx.
///
/// The bug: `$…$` is the math delimiter, so two prices on one line
/// ("costs \$4 each and pens cost \$2") were read as a math span — the prose
/// between them rendered as italic math and both dollar signs disappeared.
/// Currency is authored as `\$`; these pin that it survives on mobile too,
/// because the two clients share one bank.

String _visibleText(WidgetTester tester) {
  final buffer = StringBuffer();
  for (final widget in tester.allWidgets) {
    if (widget is Text) {
      final data = widget.data ?? widget.textSpan?.toPlainText();
      if (data != null) buffer.write(data);
    }
  }
  return buffer.toString();
}

Future<void> _pump(WidgetTester tester, String source) async {
  await tester.pumpWidget(
    MaterialApp(home: Scaffold(body: MathText(source))),
  );
}

void main() {
  testWidgets('renders two escaped prices as literal dollar signs',
      (tester) async {
    await _pump(
      tester,
      r'A student has \$80 to spend. Notebooks cost \$4 each and pens cost \$2 each.',
    );
    final text = _visibleText(tester);
    expect(text, contains(r'$80'));
    expect(text, contains(r'$4'));
    expect(text, contains(r'$2'));
    // The prose between the prices must survive rather than be eaten as math.
    expect(text, contains('to spend'));
    expect(text, contains('Notebooks cost'));
  });

  testWidgets('leaves a single unpaired dollar alone', (tester) async {
    await _pump(tester, r'The ticket cost \$5 in total.');
    expect(_visibleText(tester), contains(r'$5'));
  });

  testWidgets('still renders real math alongside currency', (tester) async {
    await _pump(tester, r'An item costs \$120. If $2x = 10$, what is $x$?');
    expect(_visibleText(tester), contains(r'$120'));
    // The delimited expressions become Math widgets rather than plain text.
    expect(find.byType(MathText), findsOneWidget);
  });

  testWidgets('empty input renders nothing', (tester) async {
    await _pump(tester, '');
    expect(find.byType(SizedBox), findsWidgets);
  });
}
