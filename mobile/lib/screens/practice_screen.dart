import 'dart:async';

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../api/api_client.dart';
import '../state/app_state.dart';
import '../theme.dart';
import '../timing.dart';
import '../widgets/common.dart';
import '../widgets/math_text.dart';

/// Practice mode: single questions from the bank, graded server-side.
///
/// The bank never sends `correct_answer` to a student, so the only way to learn
/// an answer is `POST /api/questions/<id>/check` — which refuses any question
/// that is live in the student's own test attempt.
class PracticeScreen extends StatefulWidget {
  const PracticeScreen({super.key});

  @override
  State<PracticeScreen> createState() => _PracticeScreenState();
}

class _PracticeScreenState extends State<PracticeScreen> {
  Map<String, dynamic>? _taxonomy;
  List<dynamic> _questions = [];
  int _index = 0;
  int _page = 1;
  int _pages = 1;
  bool _loading = true;
  String? _error;

  String? _section;
  String? _domain;
  String? _difficulty;

  // Per-question answer state, keyed by question id so paging back and forth
  // does not lose what the student already did.
  final Map<String, String> _answers = {};
  final Map<String, Map<String, dynamic>> _results = {};
  bool _checking = false;

  /// A stopwatch per question, shown to the student and reported on check.
  ///
  /// Practice is untimed on purpose — this is a study statistic, not a limit.
  /// Unlike the web client, which lists five questions at once and so can only
  /// start a clock on first interaction, this screen shows exactly one, so the
  /// clock can honestly start the moment the question appears.
  final QuestionStopwatch _stopwatch = QuestionStopwatch();
  String? _timedQuestionId;
  Timer? _ticker;

  @override
  void initState() {
    super.initState();
    _loadTaxonomy();
    _load();
    // The stopwatch reads a monotonic clock; this only repaints it.
    _ticker = Timer.periodic(const Duration(seconds: 1), (_) {
      if (mounted && _stopwatch.isRunning) setState(() {});
    });
  }

  @override
  void dispose() {
    _ticker?.cancel();
    super.dispose();
  }

  /// Points the stopwatch at whichever question is on screen, and stops it once
  /// that question has been graded.
  void _syncStopwatch(String? questionId, {required bool graded}) {
    if (questionId != _timedQuestionId) {
      _timedQuestionId = questionId;
      _stopwatch.reset();
    }
    if (graded || questionId == null) {
      _stopwatch.stop();
    } else if (!_stopwatch.isRunning) {
      _stopwatch.start();
    }
  }

  Future<void> _loadTaxonomy() async {
    try {
      final taxonomy = await context.read<AppState>().client.taxonomy();
      if (mounted) setState(() => _taxonomy = taxonomy);
    } on ApiException {
      // Filters degrade to "any"; the question list still works.
    }
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final result = await context.read<AppState>().client.questions({
        'section': _section,
        'domain': _domain,
        'difficulty': _difficulty,
        'page': _page,
        'per_page': 10,
      });
      if (!mounted) return;
      setState(() {
        _questions = result['items'] as List<dynamic>;
        _pages = (result['pages'] as num?)?.toInt() ?? 1;
        _index = 0;
        _loading = false;
      });
    } on ApiException catch (error) {
      if (!mounted) return;
      setState(() {
        _error = error.message;
        _loading = false;
      });
    }
  }

  List<dynamic> get _domains {
    final sections = (_taxonomy?['sections'] as List<dynamic>?) ?? const [];
    final match = sections.firstWhere(
      (s) => s['value'] == _section,
      orElse: () => null,
    );
    return (match?['domains'] as List<dynamic>?) ?? const [];
  }

  Future<void> _check(Map<String, dynamic> question) async {
    final id = question['id'] as String;
    final answer = _answers[id];
    if (answer == null || answer.isEmpty) return;

    setState(() => _checking = true);
    // Read the clock before awaiting, so network time is not charged to the
    // student's thinking time.
    _stopwatch.stop();
    final secondsSpent = _stopwatch.takeDelta();
    try {
      final result = await context
          .read<AppState>()
          .client
          .checkAnswer(id, answer, secondsSpent: secondsSpent);
      if (mounted) setState(() => _results[id] = result);
    } on ApiException catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(error.message)));
      }
    } finally {
      if (mounted) setState(() => _checking = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Practice')),
      body: Column(
        children: [
          const ConnectionBar(),
          _filters(),
          const Divider(height: 1),
          Expanded(child: _body()),
        ],
      ),
    );
  }

  /// The web client parks these in a rail that stays visible while you work.
  /// A phone has no room for a rail, so they stay a row under the app bar —
  /// the same controls, the only layout a 390pt viewport allows.
  Widget _filters() {
    final c = context.exam;

    Widget dropdown({
      required String label,
      required String? value,
      required List<dynamic> options,
      required ValueChanged<String?> onChanged,
      bool enabled = true,
    }) {
      return Expanded(
        child: DropdownButtonFormField<String?>(
          initialValue: value,
          isExpanded: true,
          style: TextStyle(fontSize: 13, color: c.ink),
          decoration: InputDecoration(
            labelText: label,
            isDense: true,
            // The ring goes accent once a value is set, so which filters are
            // narrowing the pool reads at a glance.
            enabledBorder: OutlineInputBorder(
              borderRadius: const BorderRadius.all(Radius.circular(6)),
              borderSide: BorderSide(
                color: value == null ? c.lineStrong : c.accent,
              ),
            ),
          ),
          items: [
            const DropdownMenuItem(value: null, child: Text('Any')),
            ...options.map(
              (o) => DropdownMenuItem(
                value: o['value'] as String,
                child: Text(o['label'] as String, overflow: TextOverflow.ellipsis),
              ),
            ),
          ],
          onChanged: enabled ? onChanged : null,
        ),
      );
    }

    return Padding(
      padding: const EdgeInsets.fromLTRB(12, 12, 12, 14),
      child: Row(
        children: [
          dropdown(
            label: 'Section',
            value: _section,
            options: (_taxonomy?['sections'] as List<dynamic>?) ?? const [],
            onChanged: (v) {
              setState(() {
                _section = v;
                _domain = null; // a domain from another section returns nothing
                _page = 1;
              });
              _load();
            },
          ),
          const SizedBox(width: 8),
          dropdown(
            label: 'Domain',
            value: _domain,
            options: _domains,
            enabled: _section != null,
            onChanged: (v) {
              setState(() {
                _domain = v;
                _page = 1;
              });
              _load();
            },
          ),
          const SizedBox(width: 8),
          dropdown(
            label: 'Level',
            value: _difficulty,
            options: (_taxonomy?['difficulties'] as List<dynamic>?) ?? const [],
            onChanged: (v) {
              setState(() {
                _difficulty = v;
                _page = 1;
              });
              _load();
            },
          ),
        ],
      ),
    );
  }

  Widget _body() {
    final c = context.exam;
    if (_loading) return const Loading(label: 'Loading questions');
    if (_error != null) {
      return Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          children: [
            Notice(message: _error!),
            FilledButton(onPressed: _load, child: const Text('Try again')),
          ],
        ),
      );
    }
    if (_questions.isEmpty) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Text(
            'No questions match these filters.',
            style: TextStyle(color: c.inkFaint),
          ),
        ),
      );
    }

    final question = _questions[_index] as Map<String, dynamic>;
    final id = question['id'] as String;
    final result = _results[id];
    _syncStopwatch(id, graded: result != null);

    return Column(
      children: [
        Expanded(
          child: SingleChildScrollView(
            padding: const EdgeInsets.fromLTRB(16, 18, 16, 24),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // Section, domain and skill as one recessive metadata run,
                // with difficulty pushed to the far edge — taxonomy is context
                // for the question, never a competitor to it.
                Row(
                  children: [
                    Expanded(
                      child: Eyebrow(
                        '${humanize(question['section'] as String?)} · '
                        '${humanize(question['domain'] as String?)}',
                      ),
                    ),
                    Pill(humanize(question['difficulty'] as String?)),
                    const SizedBox(width: 8),
                    Semantics(
                      label: result == null
                          ? 'Time on this question ${formatClock(_stopwatch.seconds)}'
                          : 'Answered in ${formatClock(_stopwatch.seconds)}',
                      child: Text(
                        formatClock(_stopwatch.seconds),
                        style: TextStyle(
                          fontSize: 11.5,
                          fontFeatures: const [FontFeature.tabularFigures()],
                          color: _stopwatch.isRunning ? c.inkSoft : c.inkFaint,
                        ),
                      ),
                    ),
                  ],
                ),
                if (question['skill'] != null) ...[
                  const SizedBox(height: 5),
                  Text(
                    question['skill'] as String,
                    style: TextStyle(fontSize: 11.5, color: c.inkFaint),
                  ),
                ],
                const SizedBox(height: 16),

                if (question['stimulus'] != null)
                  Container(
                    margin: const EdgeInsets.only(bottom: 16),
                    padding: const EdgeInsets.only(left: 14),
                    decoration: BoxDecoration(
                      border: Border(
                        left: BorderSide(color: c.line, width: 2),
                      ),
                    ),
                    child: MathText(
                      question['stimulus'] as String?,
                      style: serif(size: 15, height: 1.6, color: c.inkSoft),
                      selectable: true,
                    ),
                  ),
                MathText(
                  question['stem'] as String?,
                  style: serif(size: 17, height: 1.6, color: c.ink),
                  selectable: true,
                ),
                const SizedBox(height: 20),
                _answerControls(question, result),

                if (result != null) ...[
                  const SizedBox(height: 20),
                  _whyBlock(result),
                ],
              ],
            ),
          ),
        ),
        const Divider(height: 1),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
          child: Row(
            children: [
              Text(
                '${_index + 1} / ${_questions.length}'
                '${_pages > 1 ? '  ·  page $_page of $_pages' : ''}',
                style: TextStyle(fontSize: 12, color: c.inkFaint),
              ),
              const Spacer(),
              IconButton(
                tooltip: 'Previous question',
                onPressed: _index > 0 ? () => setState(() => _index -= 1) : null,
                icon: const Icon(Icons.chevron_left),
              ),
              if (result == null)
                FilledButton(
                  onPressed: (_answers[id]?.isNotEmpty ?? false) && !_checking
                      ? () => _check(question)
                      : null,
                  child: Text(_checking ? 'Checking…' : 'Check'),
                )
              else if (_index < _questions.length - 1)
                FilledButton(
                  onPressed: () => setState(() => _index += 1),
                  child: const Text('Next'),
                )
              else if (_page < _pages)
                FilledButton(
                  onPressed: () {
                    setState(() => _page += 1);
                    _load();
                  },
                  child: const Text('More questions'),
                ),
              IconButton(
                tooltip: 'Next question',
                onPressed: _index < _questions.length - 1
                    ? () => setState(() => _index += 1)
                    : null,
                icon: const Icon(Icons.chevron_right),
              ),
            ],
          ),
        ),
      ],
    );
  }

  /// The verdict and the reasoning as one block.
  ///
  /// Two separate boxes let a student read the mark and skip the explanation,
  /// which is the half that teaches anything. Same treatment as the web client.
  Widget _whyBlock(Map<String, dynamic> result) {
    final c = context.exam;
    final correct = result['is_correct'] == true;
    final tint = correct ? c.good : c.bad;
    return Container(
      padding: const EdgeInsets.only(left: 14),
      decoration: BoxDecoration(
        border: Border(left: BorderSide(color: tint, width: 2)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Eyebrow(
            correct
                ? 'Correct'
                : 'Not quite — the answer is ${result['correct_answer']}',
            color: tint,
          ),
          if (result['rationale'] != null) ...[
            const SizedBox(height: 7),
            MathText(
              result['rationale'] as String?,
              style: TextStyle(fontSize: 13.5, height: 1.6, color: c.inkSoft),
              selectable: true,
            ),
          ],
        ],
      ),
    );
  }

  Widget _answerControls(Map<String, dynamic> question, Map<String, dynamic>? result) {
    final id = question['id'] as String;
    final locked = result != null;

    if (question['question_type'] == 'grid_in') {
      return TextField(
        enabled: !locked,
        decoration: const InputDecoration(labelText: 'Your answer'),
        keyboardType: TextInputType.text,
        onChanged: (v) => setState(() => _answers[id] = v),
      );
    }

    final choices = (question['choices'] as List<dynamic>?) ?? const [];
    // RadioGroup, not per-tile groupValue/onChanged: those are deprecated in
    // Flutter 3.44 and the deprecated path no longer delivers taps, which made
    // answers unselectable. Caught by driving the app, not by any unit test.
    return RadioGroup<String>(
      groupValue: _answers[id],
      onChanged: locked ? (_) {} : (v) => setState(() => _answers[id] = v ?? ''),
      child: Column(
        children: [
          for (final choice in choices)
            _choiceTile(
              choice: choice as Map<String, dynamic>,
              selected: _answers[id] == choice['id'],
              locked: locked,
              isKey: result != null && result['correct_answer'] == choice['id'],
            ),
        ],
      ),
    );
  }

  Widget _choiceTile({
    required Map<String, dynamic> choice,
    required bool selected,
    required bool locked,
    required bool isKey,
  }) {
    final wrongPick = locked && selected && !isKey;
    final tone = isKey
        ? ChoiceTone.good
        : wrongPick
            ? ChoiceTone.bad
            : selected
                ? ChoiceTone.picked
                : ChoiceTone.idle;
    final colors = choiceColors(context, tone);

    // The colour goes on a Material, not on a Container wrapping the tile:
    // ListTile paints its ink splash and selection highlight on the nearest
    // Material ancestor, so a coloured DecoratedBox in between hides them.
    // Flutter asserts about this in debug, which is how it was caught.
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Material(
        color: colors.row,
        borderRadius: BorderRadius.circular(6),
        child: RadioListTile<String>(
          // The lettered pip leads and the radio trails: the pip carries which
          // choice this is, the radio carries whether it is chosen. The web
          // client folds both into the pip because a mouse does not need a
          // separate hit target; a thumb does.
          controlAffinity: ListTileControlAffinity.trailing,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(6),
            side: BorderSide(
              color: colors.ring,
              width: tone == ChoiceTone.idle ? 1 : 1.5,
            ),
          ),
          value: choice['id'] as String,
          enabled: !locked,
          title: Row(
            children: [
              ChoicePip(letter: choice['id'] as String, tone: tone),
              const SizedBox(width: 12),
              Expanded(child: MathText(choice['text'] as String?)),
              if (isKey)
                Text(
                  'Correct answer',
                  style: TextStyle(
                    fontSize: 11.5,
                    fontWeight: FontWeight.w600,
                    color: colors.ring,
                  ),
                )
              else if (wrongPick)
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
        ),
      ),
    );
  }
}
