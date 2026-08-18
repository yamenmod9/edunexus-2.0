import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../api/api_client.dart';
import '../state/app_state.dart';
import '../theme.dart';
import '../widgets/common.dart';
import '../widgets/math_text.dart';

class ResultScreen extends StatefulWidget {
  const ResultScreen({super.key, required this.attemptId});

  final String attemptId;

  @override
  State<ResultScreen> createState() => _ResultScreenState();
}

class _ResultScreenState extends State<ResultScreen> {
  Map<String, dynamic>? _review;
  String? _error;
  int? _openModule;

  static const _months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final review =
          await context.read<AppState>().client.review(widget.attemptId);
      if (mounted) setState(() => _review = review);
    } on ApiException catch (error) {
      if (mounted) setState(() => _error = error.message);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Score report')),
      body: _error != null
          ? Padding(padding: const EdgeInsets.all(16), child: Notice(message: _error!))
          : _review == null
              ? const Loading(label: 'Loading your results')
              : _body(),
    );
  }

  Widget _body() {
    final c = context.exam;
    final review = _review!;
    final score = review['score'] as Map<String, dynamic>;
    final total = score['total'] as Map<String, dynamic>;
    final sections = score['sections'] as List<dynamic>;
    final submitted =
        DateTime.tryParse('${review['submitted_at']}Z')?.toLocal();

    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 20, 16, 32),
      children: [
        Eyebrow('Score report · ${review['form_name']}'),
        const SizedBox(height: 6),
        Row(
          children: [
            Expanded(
              child: Text(
                submitted == null
                    ? 'Not submitted'
                    : 'Submitted ${submitted.day} ${_months[submitted.month - 1]}',
                style: serif(
                  size: 25,
                  weight: FontWeight.w700,
                  letterSpacing: -0.5,
                  color: c.ink,
                ),
              ),
            ),
            if (review['status'] != 'submitted') Pill(review['status'] as String),
          ],
        ),
        const SizedBox(height: 24),

        // The figure, then immediately the caveat — never one without the
        // other (CLAUDE.md section 7).
        Container(
          padding: const EdgeInsets.fromLTRB(20, 22, 20, 22),
          decoration: BoxDecoration(
            color: c.surface,
            borderRadius: BorderRadius.circular(10),
            border: Border.all(color: c.line),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Eyebrow('Total'),
              const SizedBox(height: 6),
              Row(
                crossAxisAlignment: CrossAxisAlignment.baseline,
                textBaseline: TextBaseline.alphabetic,
                children: [
                  Text(
                    (total['scaled_score'] as int?)?.toString() ?? '—',
                    style: serif(
                      size: 58,
                      weight: FontWeight.w700,
                      height: 1,
                      letterSpacing: -2,
                      color: c.ink,
                    ),
                  ),
                  const SizedBox(width: 10),
                  Text(
                    total['complete'] == true
                        ? 'out of ${total['max']}'
                        : 'incomplete',
                    style: TextStyle(fontSize: 12.5, color: c.inkFaint),
                  ),
                ],
              ),
              const SizedBox(height: 22),
              for (final section in sections) ...[
                _sectionScore(section as Map<String, dynamic>),
                const SizedBox(height: 18),
              ],
            ],
          ),
        ),
        const SizedBox(height: 12),

        _caveat(score['approximation_note'] as String),
        const SizedBox(height: 28),

        _breakdown('By domain', score['domains'] as List<dynamic>, 'domain'),
        _breakdown(
            'By difficulty', score['difficulty'] as List<dynamic>, 'difficulty'),

        const SectionLabel('Modules'),
        for (final module in review['modules'] as List<dynamic>)
          _moduleRow(module as Map<String, dynamic>),

        const SizedBox(height: 28),
        OutlinedButton(
          onPressed: () => Navigator.of(context).popUntil((route) => route.isFirst),
          child: const Text('Back to the dashboard'),
        ),
      ],
    );
  }

  Widget _sectionScore(Map<String, dynamic> section) {
    final c = context.exam;
    final value = section['scaled_score'] as int?;
    final fraction = value == null ? 0.0 : (value - 200) / 600;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Eyebrow(humanize(section['section'] as String?)),
        const SizedBox(height: 5),
        Text(
          value?.toString() ?? '—',
          style: serif(
            size: 28,
            weight: FontWeight.w700,
            height: 1,
            letterSpacing: -0.8,
            color: c.ink,
          ),
        ),
        const SizedBox(height: 8),
        Meter(value: fraction, width: 132),
        const SizedBox(height: 7),
        Text(
          section['complete'] == true
              ? '${section['raw_correct']} of ${section['raw_possible']} correct'
              : (section['incomplete_reason'] as String? ?? ''),
          style: TextStyle(fontSize: 12, color: c.inkSoft),
        ),
      ],
    );
  }

  Widget _caveat(String note) {
    final c = context.exam;
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: c.flagSoft,
        borderRadius: BorderRadius.circular(6),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(Icons.info_outline, size: 16, color: c.flag),
          const SizedBox(width: 10),
          Expanded(
            child: Text.rich(
              TextSpan(
                children: [
                  TextSpan(
                    text: 'These scores are an approximation. ',
                    style: TextStyle(
                      fontWeight: FontWeight.w600,
                      color: c.ink,
                    ),
                  ),
                  TextSpan(text: note),
                ],
              ),
              style: TextStyle(fontSize: 12.5, height: 1.55, color: c.inkSoft),
            ),
          ),
        ],
      ),
    );
  }

  Widget _breakdown(String title, List<dynamic> rows, String labelKey) {
    if (rows.isEmpty) return const SizedBox.shrink();
    final c = context.exam;
    return Padding(
      padding: const EdgeInsets.only(bottom: 28),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SectionLabel(title),
          for (final row in rows)
            Container(
              padding: const EdgeInsets.symmetric(vertical: 10),
              decoration: BoxDecoration(
                border: Border(bottom: BorderSide(color: c.line)),
              ),
              child: Row(
                children: [
                  Expanded(
                    child: Text.rich(
                      TextSpan(
                        text: humanize(row[labelKey] as String?),
                        style: const TextStyle(fontSize: 13),
                        children: [
                          // Accuracy counts answered questions only, so the
                          // fraction beside it must too — otherwise "2/4"
                          // next to "100%" reads as a contradiction. Skips
                          // are called out separately instead.
                          if ((row['delivered'] as int) > (row['answered'] as int))
                            TextSpan(
                              text:
                                  '  (${(row['delivered'] as int) - (row['answered'] as int)} skipped)',
                              style: TextStyle(fontSize: 11, color: c.inkFaint),
                            ),
                        ],
                      ),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Meter(
                    value: (row['accuracy'] as num?)?.toDouble(),
                    graded: true,
                    width: 62,
                  ),
                  const SizedBox(width: 12),
                  SizedBox(
                    width: 44,
                    child: Text(
                      '${row['correct']}/${row['answered']}',
                      textAlign: TextAlign.right,
                      style: TextStyle(
                        fontFamily: 'monospace',
                        fontSize: 12,
                        color: c.inkSoft,
                      ),
                    ),
                  ),
                ],
              ),
            ),
        ],
      ),
    );
  }

  Widget _moduleRow(Map<String, dynamic> module) {
    final c = context.exam;
    final routing = module['routing'] as Map<String, dynamic>?;
    final open = _openModule == module['order_index'];

    return Container(
      padding: const EdgeInsets.symmetric(vertical: 12),
      decoration: BoxDecoration(
        border: Border(bottom: BorderSide(color: c.line)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  '${humanize(module['section'] as String?)} · Module '
                  '${module['sequence']}',
                  style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w500),
                ),
              ),
              Text(
                '${module['raw_correct']}/${module['question_count']}',
                style: TextStyle(
                  fontFamily: 'monospace',
                  fontSize: 12,
                  color: c.inkSoft,
                ),
              ),
            ],
          ),
          const SizedBox(height: 3),
          Text(
            routing == null
                ? 'Standard module, taken by everyone'
                : 'Routed to the ${module['variant']} module '
                    '(${routing['raw_correct']}/${routing['total']} on module 1)',
            style: TextStyle(fontSize: 11.5, color: c.inkFaint),
          ),
          Align(
            alignment: Alignment.centerLeft,
            child: TextButton(
              style: TextButton.styleFrom(
                padding: const EdgeInsets.symmetric(vertical: 4),
                minimumSize: Size.zero,
                tapTargetSize: MaterialTapTargetSize.shrinkWrap,
              ),
              onPressed: () => setState(
                  () => _openModule = open ? null : module['order_index'] as int),
              child: Text(open ? 'Hide questions' : 'Review questions'),
            ),
          ),
          if (open)
            Padding(
              padding: const EdgeInsets.only(top: 10),
              child: Column(
                children: [
                  for (final entry in module['questions'] as List<dynamic>)
                    _reviewQuestion(entry as Map<String, dynamic>),
                ],
              ),
            ),
        ],
      ),
    );
  }

  Widget _reviewQuestion(Map<String, dynamic> entry) {
    final c = context.exam;
    final question = entry['question'] as Map<String, dynamic>;
    final correct = entry['is_correct'] == true;
    final answer = entry['answer'] as String?;

    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: c.surface,
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: c.line),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Wrap(
            spacing: 6,
            runSpacing: 6,
            crossAxisAlignment: WrapCrossAlignment.center,
            children: [
              Text('Q${entry['position']}',
                  style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600)),
              correct
                  ? Pill.good('Correct')
                  : answer == null
                      ? Pill('Skipped')
                      : Pill.bad('Incorrect'),
              Pill(humanize(question['difficulty'] as String?)),
              if (entry['flagged'] == true) Pill.info('Flagged'),
            ],
          ),
          const SizedBox(height: 12),
          if (question['stimulus'] != null)
            Container(
              margin: const EdgeInsets.only(bottom: 12),
              padding: const EdgeInsets.only(left: 12),
              decoration: BoxDecoration(
                border: Border(left: BorderSide(color: c.line, width: 2)),
              ),
              child: MathText(
                question['stimulus'] as String?,
                style: serif(size: 14, height: 1.6, color: c.inkSoft),
              ),
            ),
          MathText(
            question['stem'] as String?,
            style: serif(size: 15.5, height: 1.6, color: c.ink),
          ),
          const SizedBox(height: 12),
          if (question['choices'] != null)
            for (final choice in question['choices'] as List<dynamic>)
              _reviewChoice(
                choice as Map<String, dynamic>,
                isKey: choice['id'] == question['correct_answer'],
                isPick: choice['id'] == answer,
              )
          else
            Text(
              'Your answer: ${answer ?? '—'}  ·  '
              'Correct: ${question['correct_answer']}',
              style: const TextStyle(fontSize: 13),
            ),
          if (question['rationale'] != null) ...[
            const SizedBox(height: 12),
            Container(
              padding: const EdgeInsets.only(left: 12),
              decoration: BoxDecoration(
                border: Border(left: BorderSide(color: c.good, width: 2)),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Eyebrow('Why', color: c.good),
                  const SizedBox(height: 5),
                  MathText(
                    question['rationale'] as String?,
                    style: TextStyle(fontSize: 13, height: 1.6, color: c.inkSoft),
                  ),
                ],
              ),
            ),
          ],
        ],
      ),
    );
  }

  Widget _reviewChoice(
    Map<String, dynamic> choice, {
    required bool isKey,
    required bool isPick,
  }) {
    final tone = isKey
        ? ChoiceTone.good
        : isPick
            ? ChoiceTone.bad
            : ChoiceTone.idle;
    final colors = choiceColors(context, tone);
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.all(11),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(6),
        border: Border.all(
          color: colors.ring,
          width: tone == ChoiceTone.idle ? 1 : 1.5,
        ),
        color: colors.row,
      ),
      child: Row(
        children: [
          ChoicePip(letter: choice['id'] as String, tone: tone),
          const SizedBox(width: 11),
          Expanded(child: MathText(choice['text'] as String?)),
          if (isKey)
            Text(
              'Correct',
              style: TextStyle(
                fontSize: 11.5,
                fontWeight: FontWeight.w600,
                color: colors.ring,
              ),
            )
          else if (isPick)
            Text(
              'Your answer',
              style: TextStyle(
                fontSize: 11.5,
                fontWeight: FontWeight.w600,
                color: colors.ring,
              ),
            ),
        ],
      ),
    );
  }
}
