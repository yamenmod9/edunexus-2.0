import 'dart:async';

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../api/api_client.dart';
import '../state/app_state.dart';
import '../widgets/common.dart';
import '../widgets/math_text.dart';
import 'result_screen.dart';

/// The adaptive test player.
///
/// Three rules this screen exists to respect:
///
/// 1. **The server owns the clock.** The countdown re-syncs to
///    `seconds_remaining` on every server response, and when it reaches zero
///    the client does not end the module — it asks the server, which decides.
///    A client that expired its own module would let anyone with a debugger
///    award themselves extra time.
///
/// 2. **The server owns routing.** This screen renders whatever
///    `current_module` comes back and never learns which module 2 variant it
///    was given.
///
/// 3. **An answer is never lost to a dropped connection.** Answers go through
///    [AnswerQueue], which persists anything it cannot deliver and replays it
///    on reconnect.
class TestPlayerScreen extends StatefulWidget {
  const TestPlayerScreen({super.key, required this.attemptId});

  final String attemptId;

  @override
  State<TestPlayerScreen> createState() => _TestPlayerScreenState();
}

class _TestPlayerScreenState extends State<TestPlayerScreen> {
  Map<String, dynamic>? _attempt;
  int _index = 0;
  int _seconds = 0;
  bool _busy = false;
  bool _reviewing = false;
  String? _error;
  Timer? _ticker;
  bool _expiryHandled = false;
  int _zeroTicks = 0;

  @override
  void initState() {
    super.initState();
    _load();
    _ticker = Timer.periodic(const Duration(seconds: 1), (_) => _tick());
  }

  @override
  void dispose() {
    _ticker?.cancel();
    super.dispose();
  }

  Map<String, dynamic>? get _module =>
      _attempt?['current_module'] as Map<String, dynamic>?;

  List<dynamic> get _responses =>
      (_module?['responses'] as List<dynamic>?) ?? const [];

  List<dynamic> get _questions =>
      (_module?['questions'] as List<dynamic>?) ?? const [];

  void _tick() {
    if (_seconds <= 0) {
      // Sitting at 00:00 while the server still considers the module open -
      // sub-second skew between the two clocks. Keep asking rather than
      // stranding the student on a dead timer, but slowly: the server decides
      // when the module ends, and it has not yet.
      _zeroTicks += 1;
      if (_zeroTicks % 5 == 0) _load();
      return;
    }
    setState(() => _seconds -= 1);
    if (_seconds <= 0 && !_expiryHandled) {
      // Out of time by our reckoning. Ask the server what that means rather
      // than deciding here.
      _expiryHandled = true;
      _zeroTicks = 0;
      _load();
    }
  }

  Future<void> _load() async {
    final state = context.read<AppState>();
    try {
      final attempt = await state.client.attempt(widget.attemptId);
      if (!mounted) return;

      final previousModule = _module?['module_attempt_id'];
      final nextModule =
          (attempt['current_module'] as Map<String, dynamic>?)?['module_attempt_id'];

      setState(() {
        _attempt = attempt;
        _error = null;
        _seconds = ((attempt['current_module'] as Map<String, dynamic>?)?[
                    'seconds_remaining'] as num?)
                ?.toInt() ??
            0;
        _expiryHandled = false;
        if (previousModule != nextModule) {
          _zeroTicks = 0;
          _index = 0;
          _reviewing = false;
        }
      });

      if (attempt['status'] != 'in_progress') _goToResult();
    } on ApiException catch (error) {
      if (!mounted) return;
      setState(() => _error = error.message);
    }
  }

  void _goToResult() {
    if (!mounted) return;
    Navigator.of(context).pushReplacement(
      MaterialPageRoute(
        builder: (_) => ResultScreen(attemptId: widget.attemptId),
      ),
    );
  }

  /// Records an answer or a flag. Applies it locally first so the student never
  /// waits on the network to see their own selection, then hands it to the
  /// queue, which delivers it now or later.
  Future<void> _save(String questionId, Map<String, dynamic> payload) async {
    setState(() {
      final updated = _responses.map((r) {
        if (r['question_id'] != questionId) return r;
        final next = Map<String, dynamic>.from(r as Map);
        if (payload.containsKey('answer')) {
          final answer = payload['answer'] as String?;
          next['answer'] = (answer == null || answer.isEmpty) ? null : answer;
          next['answered'] = next['answer'] != null;
        }
        if (payload.containsKey('flagged')) next['flagged'] = payload['flagged'];
        return next;
      }).toList();
      _module!['responses'] = updated;
    });

    final state = context.read<AppState>();
    try {
      await state.queue.submit(widget.attemptId, questionId, payload);
    } on ApiException catch (error) {
      // A rejection with a status means the server moved on — the module ended
      // or the time ran out. Re-read rather than pretend the answer landed.
      if (!mounted) return;
      setState(() => _error = error.message);
      await _load();
    }
  }

  Future<void> _completeModule() async {
    setState(() {
      _busy = true;
      _error = null;
    });
    final state = context.read<AppState>();
    try {
      // Deliver anything queued first, so answers made offline count towards
      // the routing decision this call triggers.
      if (!state.queue.isEmpty && state.online) await state.queue.flush();

      final attempt = await state.client.completeModule(widget.attemptId);
      if (!mounted) return;
      if (attempt['status'] != 'in_progress') {
        _goToResult();
        return;
      }
      setState(() {
        _attempt = attempt;
        _seconds = ((attempt['current_module']
                as Map<String, dynamic>?)?['seconds_remaining'] as num?)
                ?.toInt() ??
            0;
        _index = 0;
        _reviewing = false;
        _expiryHandled = false;
      });
    } on ApiException catch (error) {
      if (!mounted) return;
      setState(() => _error = error.message);
      await _load();
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _endTest() async {
    // Captured before the dialog: after awaiting it this State may be gone,
    // and reading an unmounted context is the bug the analyzer is pointing at.
    final client = context.read<AppState>().client;

    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('End this test?'),
        content: const Text(
          'Your answers so far are kept and scored, but you cannot return to '
          'the test.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Keep going'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('End test'),
          ),
        ],
      ),
    );
    if (confirmed != true || !mounted) return;

    setState(() => _busy = true);
    try {
      await client.submitAttempt(widget.attemptId);
      _goToResult();
    } on ApiException catch (error) {
      if (!mounted) return;
      setState(() {
        _error = error.message;
        _busy = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final state = context.watch<AppState>();

    if (_attempt == null) {
      return Scaffold(
        appBar: AppBar(title: const Text('Test')),
        body: _error != null
            ? Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  children: [
                    Notice(message: _error!),
                    FilledButton(
                      onPressed: _load,
                      child: const Text('Try again'),
                    ),
                  ],
                ),
              )
            : const Loading(label: 'Loading your test'),
      );
    }

    if (_module == null) {
      return const Scaffold(body: Loading(label: 'Moving to the next module'));
    }

    final lowTime = _seconds <= 60;

    return Scaffold(
      appBar: AppBar(
        title: Text(
          '${humanize(_module!['section'] as String?)} — Module '
          '${_module!['sequence']}',
          style: const TextStyle(fontSize: 16),
        ),
        // No back button: leaving a module mid-test is not a thing the adaptive
        // format allows, and the clock keeps running regardless.
        automaticallyImplyLeading: false,
        actions: [
          Container(
            margin: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
            padding: const EdgeInsets.symmetric(horizontal: 10),
            alignment: Alignment.center,
            decoration: BoxDecoration(
              color: lowTime ? const Color(0xFFFEE2E2) : const Color(0xFFF1F5F9),
              borderRadius: BorderRadius.circular(6),
            ),
            child: Text(
              formatClock(_seconds),
              style: TextStyle(
                fontFeatures: const [FontFeature.tabularFigures()],
                fontWeight: FontWeight.bold,
                color: lowTime
                    ? const Color(0xFFB91C1C)
                    : const Color(0xFF0F172A),
              ),
            ),
          ),
        ],
      ),
      body: Column(
        children: [
          const ConnectionBar(),
          if (state.lateAnswers > 0)
            Notice(
              tone: NoticeTone.warn,
              title: 'Some answers arrived too late',
              message:
                  '${state.lateAnswers} answer(s) could not be counted — that '
                  'module had already ended.',
              onDismiss: state.acknowledgeLateAnswers,
            ),
          if (_error != null) Notice(message: _error!),
          Expanded(child: _reviewing ? _reviewPanel() : _questionPanel()),
        ],
      ),
    );
  }

  Widget _questionPanel() {
    final question = _questions[_index] as Map<String, dynamic>;
    final response = _responses[_index] as Map<String, dynamic>;
    final id = question['id'] as String;
    final answered = _responses.where((r) => r['answered'] == true).length;

    return Column(
      children: [
        Expanded(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Question ${_index + 1} of ${_responses.length}'
                  '   ·   $answered answered',
                  style: Theme.of(context).textTheme.bodySmall,
                ),
                const SizedBox(height: 12),
                if (question['stimulus'] != null)
                  Container(
                    margin: const EdgeInsets.only(bottom: 14),
                    padding: const EdgeInsets.only(left: 12),
                    decoration: const BoxDecoration(
                      border: Border(
                        left: BorderSide(color: Color(0xFFCBD5E1), width: 3),
                      ),
                    ),
                    child: MathText(question['stimulus'] as String?),
                  ),
                MathText(
                  question['stem'] as String?,
                  style: Theme.of(context)
                      .textTheme
                      .bodyLarge
                      ?.copyWith(fontWeight: FontWeight.w500),
                ),
                const SizedBox(height: 16),
                if (question['question_type'] == 'grid_in')
                  TextFormField(
                    key: ValueKey('grid-$id'),
                    initialValue: response['answer'] as String? ?? '',
                    decoration: const InputDecoration(
                      labelText: 'Your answer',
                      border: OutlineInputBorder(),
                    ),
                    onChanged: (v) => _save(id, {'answer': v}),
                  )
                else
                  // See practice_screen: the deprecated per-tile radio API
                  // does not deliver taps in Flutter 3.44.
                  RadioGroup<String>(
                    groupValue: response['answer'] as String?,
                    onChanged: (v) => _save(id, {'answer': v}),
                    child: Column(
                      children: [
                        for (final choice
                            in (question['choices'] as List<dynamic>? ?? const []))
                          _choice(choice as Map<String, dynamic>,
                              response['answer'] as String?),
                      ],
                    ),
                  ),
                const SizedBox(height: 8),
                TextButton.icon(
                  onPressed: () =>
                      _save(id, {'flagged': !(response['flagged'] == true)}),
                  icon: Icon(
                    response['flagged'] == true ? Icons.flag : Icons.flag_outlined,
                  ),
                  label: Text(
                    response['flagged'] == true
                        ? 'Flagged for review'
                        : 'Flag for review',
                  ),
                ),
              ],
            ),
          ),
        ),
        const Divider(height: 1),
        _navigator(),
      ],
    );
  }

  Widget _choice(Map<String, dynamic> choice, String? answer) {
    final selected = answer == choice['id'];
    // See practice_screen: the background belongs on a Material, or the tile's
    // ink splash and selection highlight are painted behind it and never seen.
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Material(
        color: selected ? const Color(0xFFDBEAFE) : Colors.transparent,
        borderRadius: BorderRadius.circular(8),
        child: RadioListTile<String>(
          value: choice['id'] as String,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(8),
            side: BorderSide(
              color: selected ? const Color(0xFF1D4ED8) : const Color(0xFFE2E8F0),
              width: selected ? 2 : 1,
            ),
          ),
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

  Widget _navigator() {
    return Padding(
      padding: const EdgeInsets.all(12),
      child: Row(
        children: [
          IconButton(
            tooltip: 'Previous question',
            onPressed: _index > 0 ? () => setState(() => _index -= 1) : null,
            icon: const Icon(Icons.chevron_left),
          ),
          Expanded(
            child: SingleChildScrollView(
              scrollDirection: Axis.horizontal,
              child: Row(
                children: [
                  for (var i = 0; i < _responses.length; i += 1)
                    _navButton(i, _responses[i] as Map<String, dynamic>),
                ],
              ),
            ),
          ),
          IconButton(
            tooltip: 'Next question',
            onPressed: _index < _responses.length - 1
                ? () => setState(() => _index += 1)
                : null,
            icon: const Icon(Icons.chevron_right),
          ),
          const SizedBox(width: 4),
          FilledButton(
            onPressed: () => setState(() => _reviewing = true),
            child: const Text('Review'),
          ),
        ],
      ),
    );
  }

  Widget _navButton(int i, Map<String, dynamic> response) {
    final current = i == _index;
    final flagged = response['flagged'] == true;
    final answered = response['answered'] == true;
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 2),
      child: SizedBox(
        width: 34,
        height: 34,
        child: Semantics(
          selected: current,
          label: 'Question ${i + 1}'
              '${answered ? ', answered' : ', not answered'}'
              '${flagged ? ', flagged' : ''}',
          child: OutlinedButton(
            onPressed: () => setState(() => _index = i),
            style: OutlinedButton.styleFrom(
              padding: EdgeInsets.zero,
              backgroundColor: flagged
                  ? const Color(0xFFFEF3C7)
                  : answered
                      ? const Color(0xFFDBEAFE)
                      : null,
              side: BorderSide(
                color: current ? const Color(0xFF0F172A) : const Color(0xFFCBD5E1),
                width: current ? 2 : 1,
              ),
            ),
            child: Text('${i + 1}', style: const TextStyle(fontSize: 12)),
          ),
        ),
      ),
    );
  }

  Widget _reviewPanel() {
    final answered = _responses.where((r) => r['answered'] == true).length;
    final flagged = _responses.where((r) => r['flagged'] == true).length;
    final isLast =
        _module!['order_index'] == _attempt!['modules_total'];

    return SingleChildScrollView(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('Review this module',
              style: Theme.of(context).textTheme.titleLarge),
          const SizedBox(height: 8),
          Text(
            '$answered of ${_responses.length} answered. $flagged flagged. '
            'You cannot return to this module once you move on.',
          ),
          const SizedBox(height: 16),
          Wrap(
            spacing: 4,
            runSpacing: 4,
            children: [
              for (var i = 0; i < _responses.length; i += 1)
                SizedBox(
                  width: 40,
                  height: 40,
                  child: OutlinedButton(
                    onPressed: () => setState(() {
                      _index = i;
                      _reviewing = false;
                    }),
                    style: OutlinedButton.styleFrom(
                      padding: EdgeInsets.zero,
                      backgroundColor: _responses[i]['flagged'] == true
                          ? const Color(0xFFFEF3C7)
                          : _responses[i]['answered'] == true
                              ? const Color(0xFFDBEAFE)
                              : null,
                    ),
                    child: Text('${i + 1}'),
                  ),
                ),
            ],
          ),
          const SizedBox(height: 24),
          Row(
            children: [
              OutlinedButton(
                onPressed: () => setState(() => _reviewing = false),
                child: const Text('Back to questions'),
              ),
              const SizedBox(width: 8),
              FilledButton(
                onPressed: _busy ? null : _completeModule,
                child: Text(
                  _busy
                      ? 'Submitting…'
                      : isLast
                          ? 'Finish test'
                          : 'Submit module',
                ),
              ),
            ],
          ),
          const SizedBox(height: 32),
          TextButton(
            onPressed: _busy ? null : _endTest,
            child: const Text('End the whole test now'),
          ),
        ],
      ),
    );
  }
}
