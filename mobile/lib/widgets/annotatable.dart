import 'package:flutter/material.dart';

import '../theme.dart';

/// Bluebook's highlight-and-note tool, over a block of passage text.
///
/// Annotations are stored as character offsets into the passage string, not as
/// anything the render tree owns: the widget tree is rebuilt constantly and
/// thrown away on every resume, and an offset into the source text is the only
/// anchor that survives that. It is also the same shape the web client writes
/// (`web/src/components/Annotatable.jsx`), so a highlight made on a laptop
/// shows up on the phone — the server stores the list and deliberately never
/// interprets it (see `backend/app/models/attempt.py`).
///
/// Selection here comes from the platform text-selection toolbar rather than a
/// custom popover: on a phone that toolbar is the gesture people already know,
/// and reimplementing it badly is worse than not having it.
///
/// Consequence worth knowing: this renders plain text, so it does not run
/// MathText. Reading passages are prose, and the maths questions that would
/// need LaTeX carry no passage at all — so the two never have to meet.

class HighlightColour {
  const HighlightColour(this.id, this.label);
  final String id;
  final String label;
}

const highlightColours = <HighlightColour>[
  HighlightColour('yellow', 'Yellow'),
  HighlightColour('blue', 'Blue'),
  HighlightColour('green', 'Green'),
];

Color highlightTint(BuildContext context, String? id) {
  final c = context.exam;
  switch (id) {
    case 'blue':
      return c.accentSoft;
    case 'green':
      return c.goodSoft;
    default:
      return c.flagSoft;
  }
}

/// One stretch of [text] and the annotation covering it, if any.
class AnnotationRun {
  const AnnotationRun(this.from, this.to, this.text, this.annotation);
  final int from;
  final int to;
  final String text;
  final Map<String, dynamic>? annotation;
}

/// Splits [text] into runs, each carrying the annotation covering it.
///
/// Where two highlights overlap the last one wins — the same rule as painting
/// over a mark with a fresh one, which is what the student just did.
List<AnnotationRun> toRuns(String text, List<Map<String, dynamic>> annotations) {
  final boundaries = <int>{0, text.length};
  for (final a in annotations) {
    boundaries.add((a['start'] as int).clamp(0, text.length));
    boundaries.add((a['end'] as int).clamp(0, text.length));
  }
  final points = boundaries.toList()..sort();

  final runs = <AnnotationRun>[];
  for (var i = 0; i < points.length - 1; i += 1) {
    final from = points[i];
    final to = points[i + 1];
    if (from == to) continue;
    Map<String, dynamic>? covering;
    for (final a in annotations) {
      if ((a['start'] as int) <= from && (a['end'] as int) >= to) covering = a;
    }
    runs.add(AnnotationRun(from, to, text.substring(from, to), covering));
  }
  return runs;
}

class Annotatable extends StatelessWidget {
  const Annotatable({
    super.key,
    required this.text,
    required this.annotations,
    this.onChanged,
    this.style,
    this.readOnly = false,
  });

  final String text;
  final List<Map<String, dynamic>> annotations;
  final ValueChanged<List<Map<String, dynamic>>>? onChanged;
  final TextStyle? style;
  final bool readOnly;

  void _add(String colour, TextSelection selection) {
    final start = selection.start.clamp(0, text.length);
    final end = selection.end.clamp(0, text.length);
    if (start >= end) return;
    onChanged?.call([
      ...annotations,
      // `kind` because the same column also carries crossed-out choices; the
      // player splits them apart before either tool sees the other's marks.
      {'kind': 'highlight', 'start': start, 'end': end, 'colour': colour},
    ]);
  }

  void _remove(Map<String, dynamic> annotation) {
    onChanged?.call(
      annotations.where((a) => !identical(a, annotation)).toList(),
    );
  }

  void _setNote(Map<String, dynamic> annotation, String note) {
    onChanged?.call([
      for (final a in annotations)
        if (identical(a, annotation))
          {
            ...a,
            if (note.trim().isNotEmpty) 'note': note.trim(),
          }
        else
          a,
    ]);
  }

  Future<void> _editNote(
    BuildContext context,
    Map<String, dynamic> annotation,
  ) async {
    final controller =
        TextEditingController(text: annotation['note'] as String? ?? '');
    final action = await showModalBottomSheet<String>(
      context: context,
      isScrollControlled: true,
      builder: (sheet) => Padding(
        padding: EdgeInsets.only(
          left: 16,
          right: 16,
          top: 16,
          bottom: MediaQuery.of(sheet).viewInsets.bottom + 16,
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              '“${text.substring(annotation['start'] as int, annotation['end'] as int)}”',
              style: serif(size: 15, color: context.exam.inkSoft),
              maxLines: 3,
              overflow: TextOverflow.ellipsis,
            ),
            const SizedBox(height: 12),
            TextField(
              controller: controller,
              autofocus: true,
              maxLines: 3,
              decoration: const InputDecoration(
                labelText: 'Note',
                border: OutlineInputBorder(),
              ),
            ),
            const SizedBox(height: 12),
            Row(
              children: [
                TextButton(
                  onPressed: () => Navigator.pop(sheet, 'remove'),
                  style: TextButton.styleFrom(
                    foregroundColor: context.exam.bad,
                  ),
                  child: const Text('Remove highlight'),
                ),
                const Spacer(),
                FilledButton(
                  onPressed: () => Navigator.pop(sheet, 'save'),
                  child: const Text('Save'),
                ),
              ],
            ),
          ],
        ),
      ),
    );

    if (action == 'remove') {
      _remove(annotation);
    } else if (action == 'save') {
      _setNote(annotation, controller.text);
    }
    controller.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final c = context.exam;
    final effective = style ?? DefaultTextStyle.of(context).style;
    final runs = toRuns(text, annotations);
    final noted = annotations.where((a) => a['note'] != null).toList();

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        SelectableText.rich(
          TextSpan(
            style: effective,
            children: [
              for (final run in runs)
                TextSpan(
                  text: run.text,
                  style: run.annotation == null
                      ? null
                      : TextStyle(
                          backgroundColor:
                              highlightTint(context, run.annotation!['colour'] as String?),
                        ),
                ),
            ],
          ),
          contextMenuBuilder: readOnly
              ? null
              : (menuContext, state) {
                  final selection = state.textEditingValue.selection;
                  return AdaptiveTextSelectionToolbar(
                    anchors: state.contextMenuAnchors,
                    children: [
                      for (var i = 0; i < highlightColours.length; i += 1)
                        TextSelectionToolbarTextButton(
                          padding: TextSelectionToolbarTextButton.getPadding(
                            i,
                            highlightColours.length,
                          ),
                          onPressed: () {
                            _add(highlightColours[i].id, selection);
                            state.hideToolbar();
                          },
                          child: Text(highlightColours[i].label),
                        ),
                    ],
                  );
                },
        ),
        if (noted.isNotEmpty || annotations.isNotEmpty) ...[
          const SizedBox(height: 12),
          Divider(color: c.line, height: 1),
          const SizedBox(height: 8),
          // The marks are listed rather than tapped in place: a tap target
          // inside selectable text fights the selection gesture, and on a
          // phone the selection gesture has to win.
          for (final annotation in annotations)
            InkWell(
              onTap: readOnly ? null : () => _editNote(context, annotation),
              child: Padding(
                padding: const EdgeInsets.symmetric(vertical: 5),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Container(
                      margin: const EdgeInsets.only(top: 2, right: 8),
                      padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 1),
                      color: highlightTint(context, annotation['colour'] as String?),
                      child: Text(
                        _excerpt(annotation),
                        style: TextStyle(fontSize: 11.5, color: c.ink),
                      ),
                    ),
                    Expanded(
                      child: Text(
                        annotation['note'] as String? ?? 'Add a note',
                        style: TextStyle(
                          fontSize: 11.5,
                          color: annotation['note'] == null ? c.inkFaint : c.inkSoft,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ),
        ],
      ],
    );
  }

  String _excerpt(Map<String, dynamic> annotation) {
    final start = (annotation['start'] as int).clamp(0, text.length);
    final end = (annotation['end'] as int).clamp(0, text.length);
    final slice = text.substring(start, end);
    return slice.length > 24 ? '${slice.substring(0, 24)}…' : slice;
  }
}
