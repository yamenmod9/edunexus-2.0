import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../api/api_client.dart';
import '../state/app_state.dart';
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
    final review = _review!;
    final score = review['score'] as Map<String, dynamic>;
    final total = score['total'] as Map<String, dynamic>;
    final sections = score['sections'] as List<dynamic>;

    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        Row(
          children: [
            Expanded(
              child: Text(
                review['form_name'] as String,
                style: Theme.of(context).textTheme.titleLarge,
              ),
            ),
            Pill(review['status'] as String),
          ],
        ),
        const SizedBox(height: 12),

        // The API marks every score payload as approximate. Showing the number
        // without the caveat is exactly what CLAUDE.md section 7 forbids.
        Notice(
          tone: NoticeTone.warn,
          title: 'These scores are an approximation',
          message: score['approximation_note'] as String,
        ),

        Card(
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              children: [
                _dial(
                  'Total',
                  total['scaled_score'] as int?,
                  total['min'] as int,
                  total['max'] as int,
                  total['complete'] == true ? null : 'Incomplete — no total score',
                ),
                const SizedBox(height: 16),
                for (final section in sections) ...[
                  _dial(
                    humanize(section['section'] as String?),
                    section['scaled_score'] as int?,
                    200,
                    800,
                    section['complete'] == true
                        ? '${section['raw_correct']} of '
                            '${section['raw_possible']} correct'
                        : section['incomplete_reason'] as String?,
                  ),
                  const SizedBox(height: 16),
                ],
              ],
            ),
          ),
        ),
        const SizedBox(height: 8),

        _breakdown('By domain', score['domains'] as List<dynamic>, 'domain'),
        _breakdown(
            'By difficulty', score['difficulty'] as List<dynamic>, 'difficulty'),

        const SizedBox(height: 8),
        Text('Modules', style: Theme.of(context).textTheme.titleMedium),
        const SizedBox(height: 8),
        for (final module in review['modules'] as List<dynamic>)
          _moduleCard(module as Map<String, dynamic>),

        const SizedBox(height: 24),
        OutlinedButton(
          onPressed: () => Navigator.of(context)
              .popUntil((route) => route.isFirst),
          child: const Text('Back to the dashboard'),
        ),
      ],
    );
  }

  Widget _dial(String label, int? value, int min, int max, String? note) {
    final fraction = value == null ? 0.0 : (value - min) / (max - min);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          label.toUpperCase(),
          style: const TextStyle(
            fontSize: 11,
            fontWeight: FontWeight.bold,
            letterSpacing: 0.6,
            color: Color(0xFF64748B),
          ),
        ),
        Row(
          crossAxisAlignment: CrossAxisAlignment.baseline,
          textBaseline: TextBaseline.alphabetic,
          children: [
            Text(
              value?.toString() ?? '—',
              style: const TextStyle(fontSize: 30, fontWeight: FontWeight.bold),
            ),
            if (value != null)
              Text(' / $max',
                  style: const TextStyle(color: Color(0xFF64748B))),
          ],
        ),
        const SizedBox(height: 4),
        ClipRRect(
          borderRadius: BorderRadius.circular(4),
          child: LinearProgressIndicator(
            value: fraction.clamp(0.0, 1.0),
            minHeight: 6,
            backgroundColor: const Color(0xFFE2E8F0),
          ),
        ),
        if (note != null)
          Padding(
            padding: const EdgeInsets.only(top: 4),
            child: Text(note, style: Theme.of(context).textTheme.bodySmall),
          ),
      ],
    );
  }

  Widget _breakdown(String title, List<dynamic> rows, String labelKey) {
    if (rows.isEmpty) return const SizedBox.shrink();
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(title, style: Theme.of(context).textTheme.titleMedium),
            const SizedBox(height: 8),
            for (final row in rows)
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 4),
                child: Row(
                  children: [
                    Expanded(
                      child: Text.rich(
                        TextSpan(
                          text: humanize(row[labelKey] as String?),
                          children: [
                            // Accuracy counts answered questions only, so the
                            // fraction beside it must too — otherwise "2/4"
                            // next to "100%" reads as a contradiction. Skips
                            // are called out separately instead.
                            if ((row['delivered'] as int) >
                                (row['answered'] as int))
                              TextSpan(
                                text:
                                    '  (${(row['delivered'] as int) - (row['answered'] as int)} skipped)',
                                style: const TextStyle(
                                  fontSize: 11,
                                  color: Color(0xFF64748B),
                                ),
                              ),
                          ],
                        ),
                      ),
                    ),
                    Text('${row['correct']}/${row['answered']}'),
                    const SizedBox(width: 16),
                    SizedBox(
                      width: 44,
                      child: Text(
                        row['accuracy'] == null
                            ? '—'
                            : '${((row['accuracy'] as num) * 100).round()}%',
                        textAlign: TextAlign.right,
                      ),
                    ),
                  ],
                ),
              ),
          ],
        ),
      ),
    );
  }

  Widget _moduleCard(Map<String, dynamic> module) {
    final routing = module['routing'] as Map<String, dynamic>?;
    final open = _openModule == module['order_index'];

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        '${humanize(module['section'] as String?)} — Module '
                        '${module['sequence']}',
                        style: const TextStyle(fontWeight: FontWeight.w600),
                      ),
                      Text(
                        '${module['raw_correct']} of ${module['question_count']} '
                        'correct · ${module['status']}',
                        style: Theme.of(context).textTheme.bodySmall,
                      ),
                    ],
                  ),
                ),
                TextButton(
                  onPressed: () => setState(() =>
                      _openModule = open ? null : module['order_index'] as int),
                  child: Text(open ? 'Hide' : 'Review'),
                ),
              ],
            ),
            if (routing != null)
              Padding(
                padding: const EdgeInsets.only(top: 6),
                child: Pill.info(
                  'Routed to the ${module['variant']} module '
                  '(${routing['raw_correct']}/${routing['total']} on module 1)',
                ),
              ),
            if (open)
              Padding(
                padding: const EdgeInsets.only(top: 12),
                child: Column(
                  children: [
                    for (final entry in module['questions'] as List<dynamic>)
                      _reviewQuestion(entry as Map<String, dynamic>),
                  ],
                ),
              ),
          ],
        ),
      ),
    );
  }

  Widget _reviewQuestion(Map<String, dynamic> entry) {
    final question = entry['question'] as Map<String, dynamic>;
    final correct = entry['is_correct'] == true;
    final answer = entry['answer'] as String?;

    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: const Color(0xFFF8FAFC),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Wrap(
            spacing: 6,
            runSpacing: 6,
            children: [
              Text('Q${entry['position']}',
                  style: const TextStyle(fontWeight: FontWeight.bold)),
              correct
                  ? Pill.good('Correct')
                  : answer == null
                      ? Pill('Skipped')
                      : Pill.bad('Incorrect'),
              Pill(humanize(question['difficulty'] as String?)),
            ],
          ),
          const SizedBox(height: 8),
          MathText(question['stem'] as String?),
          const SizedBox(height: 8),
          if (question['choices'] != null)
            for (final choice in question['choices'] as List<dynamic>)
              _reviewChoice(
                choice as Map<String, dynamic>,
                isKey: choice['id'] == question['correct_answer'],
                isPick: choice['id'] == answer,
              )
          else
            Text('Your answer: ${answer ?? '—'}  ·  '
                'Correct: ${question['correct_answer']}'),
          if (question['rationale'] != null) ...[
            const SizedBox(height: 8),
            const Text('Explanation',
                style: TextStyle(fontWeight: FontWeight.bold, fontSize: 13)),
            MathText(
              question['rationale'] as String?,
              style: Theme.of(context).textTheme.bodySmall,
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
    return Container(
      margin: const EdgeInsets.only(bottom: 4),
      padding: const EdgeInsets.all(8),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(6),
        border: Border.all(
          color: isKey
              ? const Color(0xFF34D399)
              : isPick
                  ? const Color(0xFFF87171)
                  : const Color(0xFFE2E8F0),
        ),
        color: isKey
            ? const Color(0xFFECFDF5)
            : isPick
                ? const Color(0xFFFEF2F2)
                : Colors.white,
      ),
      child: Row(
        children: [
          Text('${choice['id']}. ',
              style: const TextStyle(fontWeight: FontWeight.bold)),
          Expanded(child: MathText(choice['text'] as String?)),
          if (isKey)
            const Text('Correct',
                style: TextStyle(fontSize: 11, color: Color(0xFF047857))),
          if (isPick && !isKey)
            const Text('Your answer',
                style: TextStyle(fontSize: 11, color: Color(0xFFB91C1C))),
        ],
      ),
    );
  }
}
