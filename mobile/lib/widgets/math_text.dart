import 'package:flutter/material.dart';
import 'package:flutter_math_fork/flutter_math.dart';

/// Renders question text containing LaTeX.
///
/// Same authoring convention as the web client: `$…$` inline, `$$…$$` as a
/// display block. A lone `$` stays a literal dollar sign, because "costs $5"
/// turns up far more often in these questions than an unclosed expression.
///
/// Currency is written `\$`. A lone `$` survives on its own, but two prices on
/// one line would otherwise be read as a math span — "costs \$4 each and pens
/// cost \$2" rendering "4 each and pens cost" as italic math and eating both
/// signs. Escaped dollars are masked out before matching and restored after,
/// mirroring `web/src/components/MathText.jsx` so both clients agree.
///
/// An expression flutter_math cannot parse renders as its own source rather
/// than throwing — a broken question should look wrong, not take the screen
/// down mid-test.
///
/// [selectable] defaults to FALSE on purpose. SelectableText installs its own
/// tap recogniser, which swallows taps before an enclosing InkWell sees them —
/// put it inside a RadioListTile title and the answer choice stops responding
/// to taps on its text, which is exactly where people tap. Opt in only for text
/// that is not inside a tap target, such as a passage or an explanation.
class MathText extends StatelessWidget {
  const MathText(
    this.text, {
    super.key,
    this.style,
    this.textAlign,
    this.selectable = false,
  });

  final String? text;
  final TextStyle? style;
  final TextAlign? textAlign;
  final bool selectable;

  static final _pattern = RegExp(r'(\$\$[\s\S]+?\$\$|\$[^$\n]+?\$)');

  /// A control character that cannot occur in authored content, so the masking
  /// round-trip is lossless.
  static const _escapedDollar = '\u0000';

  static String _mask(String value) => value.replaceAll(r'\$', _escapedDollar);

  static String _unmaskText(String value) =>
      value.replaceAll(_escapedDollar, r'$');

  static String _unmaskMath(String value) =>
      value.replaceAll(_escapedDollar, r'\$');

  @override
  Widget build(BuildContext context) {
    final raw0 = text;
    if (raw0 == null || raw0.isEmpty) return const SizedBox.shrink();
    final source = _mask(raw0);

    final effective = style ?? DefaultTextStyle.of(context).style;
    final spans = <InlineSpan>[];
    var index = 0;

    for (final match in _pattern.allMatches(source)) {
      if (match.start > index) {
        spans.add(
          TextSpan(text: _unmaskText(source.substring(index, match.start))),
        );
      }
      final raw = match.group(0)!;
      final display = raw.startsWith(r'$$');
      final expression = _unmaskMath(
        display ? raw.substring(2, raw.length - 2) : raw.substring(1, raw.length - 1),
      );

      spans.add(
        WidgetSpan(
          alignment: PlaceholderAlignment.middle,
          child: Math.tex(
            expression,
            mathStyle: display ? MathStyle.display : MathStyle.text,
            textStyle: effective,
            onErrorFallback: (_) => Text(_unmaskText(raw), style: effective),
          ),
        ),
      );
      index = match.end;
    }

    if (index < source.length) {
      spans.add(TextSpan(text: _unmaskText(source.substring(index))));
    }

    final span = TextSpan(style: effective, children: spans);
    return selectable
        ? SelectableText.rich(span, textAlign: textAlign ?? TextAlign.start)
        : Text.rich(span, textAlign: textAlign ?? TextAlign.start);
  }
}
