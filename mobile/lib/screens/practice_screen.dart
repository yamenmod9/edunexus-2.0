import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../api/api_client.dart';
import '../state/app_state.dart';
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

  @override
  void initState() {
    super.initState();
    _loadTaxonomy();
    _load();
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
    try {
      final result =
          await context.read<AppState>().client.checkAnswer(id, answer);
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

  Widget _filters() {
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
          decoration: InputDecoration(
            labelText: label,
            isDense: true,
            border: const OutlineInputBorder(),
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
      padding: const EdgeInsets.all(12),
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
      return const Center(
        child: Padding(
          padding: EdgeInsets.all(24),
          child: Text('No questions match these filters.'),
        ),
      );
    }

    final question = _questions[_index] as Map<String, dynamic>;
    final id = question['id'] as String;
    final result = _results[id];

    return Column(
      children: [
        Expanded(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Wrap(
                  spacing: 6,
                  runSpacing: 6,
                  children: [
                    Pill.info(humanize(question['section'] as String?)),
                    Pill(humanize(question['domain'] as String?)),
                    Pill(humanize(question['difficulty'] as String?)),
                  ],
                ),
                const SizedBox(height: 12),
                if (question['stimulus'] != null)
                  Container(
                    margin: const EdgeInsets.only(bottom: 12),
                    padding: const EdgeInsets.only(left: 12),
                    decoration: const BoxDecoration(
                      border: Border(
                        left: BorderSide(color: Color(0xFFCBD5E1), width: 3),
                      ),
                    ),
                    child: MathText(
                      question['stimulus'] as String?,
                      style: Theme.of(context).textTheme.bodyMedium,
                      selectable: true,
                    ),
                  ),
                MathText(
                  question['stem'] as String?,
                  style: Theme.of(context)
                      .textTheme
                      .bodyLarge
                      ?.copyWith(fontWeight: FontWeight.w500),
                  selectable: true,
                ),
                const SizedBox(height: 16),
                _answerControls(question, result),
                if (result != null) ...[
                  const SizedBox(height: 16),
                  Notice(
                    tone: result['is_correct'] == true
                        ? NoticeTone.success
                        : NoticeTone.error,
                    message: result['is_correct'] == true
                        ? 'Correct.'
                        : 'Not quite — the answer is ${result['correct_answer']}.',
                  ),
                  if (result['rationale'] != null)
                    Container(
                      padding: const EdgeInsets.all(12),
                      decoration: BoxDecoration(
                        color: const Color(0xFFF8FAFC),
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const Text(
                            'Explanation',
                            style: TextStyle(fontWeight: FontWeight.bold),
                          ),
                          const SizedBox(height: 4),
                          MathText(result['rationale'] as String?, selectable: true),
                        ],
                      ),
                    ),
                ],
              ],
            ),
          ),
        ),
        const Divider(height: 1),
        Padding(
          padding: const EdgeInsets.all(12),
          child: Row(
            children: [
              Text(
                '${_index + 1} / ${_questions.length}'
                '${_pages > 1 ? '  ·  page $_page of $_pages' : ''}',
                style: Theme.of(context).textTheme.bodySmall,
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

  Widget _answerControls(Map<String, dynamic> question, Map<String, dynamic>? result) {
    final id = question['id'] as String;
    final locked = result != null;

    if (question['question_type'] == 'grid_in') {
      return TextField(
        enabled: !locked,
        decoration: const InputDecoration(
          labelText: 'Your answer',
          border: OutlineInputBorder(),
        ),
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
              id: id,
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
    required String id,
    required Map<String, dynamic> choice,
    required bool selected,
    required bool locked,
    required bool isKey,
  }) {
    final wrongPick = locked && selected && !isKey;
    final borderColor = isKey
        ? const Color(0xFF34D399)
        : wrongPick
            ? const Color(0xFFF87171)
            : selected
                ? const Color(0xFF1D4ED8)
                : const Color(0xFFE2E8F0);
    final background = isKey
        ? const Color(0xFFECFDF5)
        : wrongPick
            ? const Color(0xFFFEF2F2)
            : Colors.transparent;

    // The colour goes on a Material, not on a Container wrapping the tile:
    // ListTile paints its ink splash and selection highlight on the nearest
    // Material ancestor, so a coloured DecoratedBox in between hides them.
    // Flutter asserts about this in debug, which is how it was caught.
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Material(
        color: background,
        borderRadius: BorderRadius.circular(8),
        child: RadioListTile<String>(
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(8),
            side: BorderSide(
              color: borderColor,
              width: isKey || wrongPick || selected ? 2 : 1,
            ),
          ),
          value: choice['id'] as String,
          enabled: !locked,
          title: Row(
            children: [
              Text(
                '${choice['id']}. ',
                style: const TextStyle(fontWeight: FontWeight.bold),
              ),
              Expanded(child: MathText(choice['text'] as String?)),
            ],
          ),
        ),
      ),
    );
  }
}
