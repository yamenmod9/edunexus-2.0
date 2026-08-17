import 'package:flutter/material.dart';
import 'package:flutter_math_fork/flutter_math.dart';

/// Renders question text containing LaTeX.
///
/// Same authoring convention as the web client: `$…$` inline, `$$…$$` as a
/// display block. A lone `$` stays a literal dollar sign, because "costs $5"
/// turns up far more often in these questions than an unclosed expression.
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

  @override
  Widget build(BuildContext context) {
    final source = text;
    if (source == null || source.isEmpty) return const SizedBox.shrink();

    final effective = style ?? DefaultTextStyle.of(context).style;
    final spans = <InlineSpan>[];
    var index = 0;

    for (final match in _pattern.allMatches(source)) {
      if (match.start > index) {
        spans.add(TextSpan(text: source.substring(index, match.start)));
      }
      final raw = match.group(0)!;
      final display = raw.startsWith(r'$$');
      final expression =
          display ? raw.substring(2, raw.length - 2) : raw.substring(1, raw.length - 1);

      spans.add(
        WidgetSpan(
          alignment: PlaceholderAlignment.middle,
          child: Math.tex(
            expression,
            mathStyle: display ? MathStyle.display : MathStyle.text,
            textStyle: effective,
            onErrorFallback: (_) => Text(raw, style: effective),
          ),
        ),
      );
      index = match.end;
    }

    if (index < source.length) {
      spans.add(TextSpan(text: source.substring(index)));
    }

    final span = TextSpan(style: effective, children: spans);
    return selectable
        ? SelectableText.rich(span, textAlign: textAlign ?? TextAlign.start)
        : Text.rich(span, textAlign: textAlign ?? TextAlign.start);
  }
}
