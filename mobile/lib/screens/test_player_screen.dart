import 'dart:async';

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../api/api_client.dart';
import '../state/app_state.dart';
import '../theme.dart';
import '../timing.dart';
import '../widgets/annotatable.dart';
import '../widgets/common.dart';
import '../widgets/math_text.dart';
import '../widgets/reference_sheet.dart';
import 'result_screen.dart';

/// Section directions, as the exam states them.
///
/// Paraphrased rather than transcribed: these describe our own test's rules,
/// which happen to be the same rules, and the student needs them in front of
/// them at the moment they're deciding whether to guess. Kept in step with
/// `web/src/pages/TestPlayerPage.jsx`.
const _directions = <String, String>{
  'reading_writing':
      'The questions in this section address a number of important reading '
          'and writing skills. Each question includes one or more passages, '
          'which may include a table or graph. Read each passage and question '
          'carefully, then choose the best answer to the question based on the '
          'passage or passages.\n\n'
          'All questions in this section are multiple-choice with four answer '
          'options. Each question has a single best answer.',
  'math':
      'The questions in this section address a number of important math '
          'skills. Use of a calculator is permitted for all questions.\n\n'
          'For multiple-choice questions, solve each problem and choose the '
          'correct answer from the choices provided. Each of these questions '
          'has a single correct answer.\n\n'
          'For student-produced response questions, solve each problem and '
          'enter your answer. If a question asks for a value with a unit, '
          'enter only the number.\n\n'
          'Unless otherwise indicated: variables and expressions represent real '
          'numbers, figures are drawn to scale, and the domain of a given '
          'function is the set of all real numbers for which the function is '
          'defined.',
};

/// Splits the shared `annotations` list into the two tools that write into it.
///
/// The server stores the column opaquely and never looks inside (see
/// `backend/app/models/attempt.py`), so the split has to happen client-side.
/// Highlights are keyed by character offset; cross-outs by choice id.
({List<Map<String, dynamic>> highlights, List<String> eliminated})
    splitAnnotations(dynamic annotations) {
  final list = (annotations as List<dynamic>?) ?? const [];
  final marks = list.cast<Map<String, dynamic>>();
  return (
    highlights: marks.where((a) => a['kind'] != 'eliminated').toList(),
    eliminated: marks
        .where((a) => a['kind'] == 'eliminated')
        .map((a) => a['choice'] as String)
        .toList(),
  );
}

/// The adaptive test player, laid out as a Bluebook simulation.
///
/// Four rules this screen exists to respect:
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
///
/// 4. **The tools are the real exam's tools, not the real exam's content.**
///    Directions, the timer toggle, cross-out, the reference sheet,
///    highlighting and the navigator sheet reproduce how Bluebook behaves so
///    practice transfers. Nothing here is copied from College Board
///    (CLAUDE.md section 6). The graphing calculator is web-only for now.
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

  // Tool state. Deliberately client-only: which panels a student opened is not
  // part of their attempt.
  bool _showTimer = true;
  bool _crossOut = false;

  /// Time on the question currently on screen, reported to the server as a
  /// delta whenever the student moves on. Never displayed here — a mock test
  /// shows the module countdown, and a second clock beside it would read as a
  /// per-question limit that does not exist. The stopwatch belongs to practice
  /// mode (see practice_screen.dart).
  final QuestionStopwatch _onQuestion = QuestionStopwatch();
  String? _timedQuestionId;

  /// Held rather than read from the context on demand, because the last timing
  /// report happens in [dispose], and an inherited-widget lookup from a
  /// defunct element is an error — it took down the whole widget tree during
  /// teardown before this was cached.
  ApiClient? _client;

  @override
  void initState() {
    super.initState();
    _load();
    _ticker = Timer.periodic(const Duration(seconds: 1), (_) => _tick());
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _client = context.read<AppState>().client;
  }

  @override
  void dispose() {
    _ticker?.cancel();
    _flushTiming();
    super.dispose();
  }

  Map<String, dynamic>? get _module =>
      _attempt?['current_module'] as Map<String, dynamic>?;

  List<dynamic> get _responses =>
      (_module?['responses'] as List<dynamic>?) ?? const [];

  List<dynamic> get _questions =>
      (_module?['questions'] as List<dynamic>?) ?? const [];

  /// Reports the time banked on the question that was on screen.
  ///
  /// Failures are swallowed on purpose: a lost timing report is a lost study
  /// statistic, not a lost answer, and an error banner over a question the
  /// student answered perfectly well would be the worse bug.
  void _flushTiming() {
    final id = _timedQuestionId;
    final client = _client;
    final delta = _onQuestion.takeDelta();
    if (id == null || client == null || delta <= 0) return;
    unawaited(
      client
          .respond(widget.attemptId, id, {'seconds_spent': delta})
          .catchError((_) => <String, dynamic>{}),
    );
  }

  /// Points the stopwatch at whichever question is on screen now, banking the
  /// time spent on the previous one first.
  void _syncTiming() {
    final questions = _questions;
    final id = (_index < questions.length)
        ? (questions[_index] as Map<String, dynamic>)['id'] as String
        : null;
    if (id == _timedQuestionId && (_onQuestion.isRunning || _reviewing)) return;
    if (id != _timedQuestionId) {
      _flushTiming();
      _onQuestion.reset();
      _timedQuestionId = id;
    }
    if (_reviewing || id == null) {
      _onQuestion.stop();
    } else {
      _onQuestion.start();
    }
  }

  void _goTo(int index) {
    setState(() {
      _index = index;
      _reviewing = false;
    });
    _syncTiming();
  }

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
      _syncTiming();

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

  /// Records an answer, a mark, or a set of annotations. Applies it locally
  /// first so the student never waits on the network to see their own
  /// selection, then hands it to the queue, which delivers it now or later.
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
        if (payload.containsKey('annotations')) {
          next['annotations'] = payload['annotations'];
        }
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
    // Bank the time on the last question before the module goes away.
    _flushTiming();
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
        _crossOut = false;
      });
      _syncTiming();
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
    _flushTiming();
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

  void _showDirections() {
    final section = _module!['section'] as String?;
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      builder: (sheet) => _sheet(
        sheet,
        '${humanize(section)} directions',
        SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(16, 0, 16, 24),
          child: Text(
            _directions[section] ?? '',
            style: TextStyle(
              fontSize: 13.5,
              height: 1.6,
              color: context.exam.inkSoft,
            ),
          ),
        ),
      ),
    );
  }

  void _showReference() {
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      builder: (sheet) => _sheet(
        sheet,
        'Reference sheet',
        const SizedBox(height: 460, child: ReferenceSheet()),
      ),
    );
  }

  /// The navigator: the whole module one tap away, never on screen competing
  /// with the question. Bluebook does the same thing with a popup.
  void _showNavigator() {
    final c = context.exam;
    showModalBottomSheet<void>(
      context: context,
      builder: (sheet) => _sheet(
        sheet,
        'Section questions',
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 0, 16, 24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Wrap(
                spacing: 14,
                runSpacing: 4,
                children: [
                  _legend(c.surface, c.ink, 'Current'),
                  _legend(c.accent, c.accent, 'Answered'),
                  _legend(c.flagSoft, c.flag, 'Marked for review'),
                ],
              ),
              const SizedBox(height: 12),
              Divider(color: c.line, height: 1),
              const SizedBox(height: 12),
              Wrap(
                spacing: 6,
                runSpacing: 6,
                children: [
                  for (var i = 0; i < _responses.length; i += 1)
                    _seat(i, _responses[i] as Map<String, dynamic>, () {
                      Navigator.pop(sheet);
                      _goTo(i);
                    }),
                ],
              ),
              const SizedBox(height: 16),
              SizedBox(
                width: double.infinity,
                child: OutlinedButton(
                  onPressed: () {
                    Navigator.pop(sheet);
                    _flushTiming();
                    setState(() => _reviewing = true);
                    _syncTiming();
                  },
                  child: const Text('Go to review page'),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _legend(Color fill, Color ring, String label) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Container(
          width: 12,
          height: 12,
          decoration: BoxDecoration(
            color: fill,
            border: Border.all(color: ring),
            borderRadius: BorderRadius.circular(2),
          ),
        ),
        const SizedBox(width: 6),
        Text(label, style: TextStyle(fontSize: 11.5, color: context.exam.inkFaint)),
      ],
    );
  }

  Widget _sheet(BuildContext sheet, String title, Widget body) {
    final c = context.exam;
    return SafeArea(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 14, 8, 10),
            child: Row(
              children: [
                Expanded(
                  child: Text(
                    title,
                    style: serif(size: 18, weight: FontWeight.w700, color: c.ink),
                  ),
                ),
                IconButton(
                  tooltip: 'Close',
                  onPressed: () => Navigator.pop(sheet),
                  icon: const Icon(Icons.close, size: 20),
                ),
              ],
            ),
          ),
          Flexible(child: body),
        ],
      ),
    );
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

    final c = context.exam;
    final section = _module!['section'] as String?;
    final isMath = section == 'math';
    // The real exam reveals the timer at five minutes whether or not you hid
    // it, and that is the point at which knowing matters most.
    final warning = _seconds <= 300;
    final lowTime = _seconds <= 60;
    final timerVisible = _showTimer || warning;

    return Scaffold(
      appBar: AppBar(
        titleSpacing: 16,
        title: GestureDetector(
          onTap: _showDirections,
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Flexible(
                child: Text(
                  humanize(section),
                  style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w600),
                  overflow: TextOverflow.ellipsis,
                ),
              ),
              const SizedBox(width: 8),
              Text(
                'Directions',
                style: TextStyle(
                  fontSize: 11.5,
                  color: c.inkSoft,
                  decoration: TextDecoration.underline,
                  decorationStyle: TextDecorationStyle.dotted,
                ),
              ),
              Icon(Icons.expand_more, size: 15, color: c.inkSoft),
            ],
          ),
        ),
        // No back button: leaving a module mid-test is not a thing the adaptive
        // format allows, and the clock keeps running regardless.
        automaticallyImplyLeading: false,
        actions: [
          Semantics(
            label: 'Time remaining ${formatClock(_seconds)}',
            child: GestureDetector(
              onTap: warning ? null : () => setState(() => _showTimer = !_showTimer),
              child: Container(
                margin: const EdgeInsets.symmetric(vertical: 10),
                padding: const EdgeInsets.symmetric(horizontal: 10),
                alignment: Alignment.center,
                decoration: BoxDecoration(
                  color: lowTime ? c.badSoft : c.sunken,
                  borderRadius: BorderRadius.circular(6),
                ),
                child: Text(
                  timerVisible ? formatClock(_seconds) : 'Show',
                  style: TextStyle(
                    fontFeatures: const [FontFeature.tabularFigures()],
                    fontWeight: FontWeight.w600,
                    fontSize: timerVisible ? 14 : 12,
                    color: lowTime ? c.bad : c.ink,
                  ),
                ),
              ),
            ),
          ),
          PopupMenuButton<String>(
            tooltip: 'Test tools',
            icon: const Icon(Icons.more_vert),
            onSelected: (value) {
              switch (value) {
                case 'directions':
                  _showDirections();
                case 'reference':
                  _showReference();
                case 'crossout':
                  setState(() => _crossOut = !_crossOut);
              }
            },
            itemBuilder: (_) => [
              const PopupMenuItem(value: 'directions', child: Text('Directions')),
              if (isMath)
                const PopupMenuItem(
                  value: 'reference',
                  child: Text('Reference sheet'),
                ),
              PopupMenuItem(
                value: 'crossout',
                child: Text(_crossOut ? 'Hide cross out' : 'Cross out'),
              ),
            ],
          ),
        ],
      ),
      body: Column(
        children: [
          // Progress is a hairline, not a labelled bar: it is reassurance, and
          // reassurance must not compete with the question for attention.
          if (_responses.isNotEmpty)
            LinearProgressIndicator(
              value: (_index + 1) / _responses.length,
              minHeight: 2,
              backgroundColor: c.line,
            ),
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
    final c = context.exam;
    final question = _questions[_index] as Map<String, dynamic>;
    final response = _responses[_index] as Map<String, dynamic>;
    final id = question['id'] as String;
    final marked = response['flagged'] == true;
    final marks = splitAnnotations(response['annotations']);

    return Column(
      children: [
        Expanded(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
                      decoration: BoxDecoration(
                        color: c.ink,
                        borderRadius: BorderRadius.circular(4),
                      ),
                      child: Text(
                        '${_index + 1}',
                        style: TextStyle(
                          fontSize: 12,
                          fontWeight: FontWeight.w700,
                          color: c.page,
                        ),
                      ),
                    ),
                    const SizedBox(width: 10),
                    TextButton.icon(
                      onPressed: () => _save(id, {'flagged': !marked}),
                      style: TextButton.styleFrom(
                        foregroundColor: marked ? c.flag : c.inkSoft,
                        padding: const EdgeInsets.symmetric(horizontal: 8),
                        visualDensity: VisualDensity.compact,
                      ),
                      icon: Icon(
                        marked ? Icons.bookmark : Icons.bookmark_border,
                        size: 17,
                      ),
                      label: Text(
                        marked ? 'Marked for Review' : 'Mark for Review',
                        style: const TextStyle(fontSize: 12),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 8),
                Divider(color: c.line, height: 1),
                const SizedBox(height: 16),

                if (question['stimulus'] != null) ...[
                  Eyebrow('Passage'),
                  const SizedBox(height: 8),
                  Annotatable(
                    // Keyed by question: the offsets are into *this* passage,
                    // and a recycled State would carry the previous one's.
                    key: ValueKey('passage-$id'),
                    text: question['stimulus'] as String,
                    annotations: marks.highlights,
                    style: serif(size: 15.5, height: 1.7, color: c.ink),
                    onChanged: (next) => _save(id, {
                      'annotations': [
                        ...next,
                        for (final choice in marks.eliminated)
                          {'kind': 'eliminated', 'choice': choice},
                      ],
                    }),
                  ),
                  const SizedBox(height: 18),
                ],

                MathText(
                  question['stem'] as String?,
                  style: serif(size: 17, height: 1.6, color: c.ink),
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
                          _choice(
                            question,
                            response,
                            choice as Map<String, dynamic>,
                            marks.eliminated,
                          ),
                      ],
                    ),
                  ),
              ],
            ),
          ),
        ),
        const Divider(height: 1),
        _bottomBar(),
      ],
    );
  }

  /// Crosses a choice out, or restores it.
  ///
  /// Crossing out the choice you had selected clears the selection, or the
  /// student ends up submitting an answer they just told us they had ruled out.
  void _toggleEliminated(
    Map<String, dynamic> question,
    Map<String, dynamic> response,
    String choiceId,
  ) {
    final id = question['id'] as String;
    final existing =
        ((response['annotations'] as List<dynamic>?) ?? const []).cast<Map<String, dynamic>>();
    final already = existing
        .any((a) => a['kind'] == 'eliminated' && a['choice'] == choiceId);

    final next = already
        ? existing
            .where((a) => !(a['kind'] == 'eliminated' && a['choice'] == choiceId))
            .toList()
        : [
            ...existing,
            {'kind': 'eliminated', 'choice': choiceId},
          ];

    _save(id, {
      'annotations': next,
      if (!already && response['answer'] == choiceId) 'answer': '',
    });
  }

  Widget _choice(
    Map<String, dynamic> question,
    Map<String, dynamic> response,
    Map<String, dynamic> choice,
    List<String> eliminated,
  ) {
    final c = context.exam;
    final id = choice['id'] as String;
    final struck = eliminated.contains(id);
    final tone = (!struck && response['answer'] == id)
        ? ChoiceTone.picked
        : ChoiceTone.idle;
    final colors = choiceColors(context, tone);

    // See practice_screen: the background belongs on a Material, or the tile's
    // ink splash and selection highlight are painted behind it and never seen.
    final tile = Material(
      color: colors.row,
      borderRadius: BorderRadius.circular(6),
      child: RadioListTile<String>(
        // Lettered pip leading, radio trailing: the pip says which choice
        // this is, the radio says whether it is chosen.
        controlAffinity: ListTileControlAffinity.trailing,
        value: id,
        enabled: !struck,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(6),
          side: BorderSide(
            color: colors.ring,
            width: tone == ChoiceTone.idle ? 1 : 1.5,
          ),
        ),
        title: Row(
          children: [
            ChoicePip(letter: id, tone: tone),
            const SizedBox(width: 12),
            Expanded(
              child: struck
                  ? Text(
                      choice['text'] as String? ?? '',
                      style: TextStyle(
                        color: c.inkFaint,
                        decoration: TextDecoration.lineThrough,
                      ),
                    )
                  : MathText(choice['text'] as String?),
            ),
          ],
        ),
      ),
    );

    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: _crossOut
          ? Row(
              children: [
                Expanded(child: tile),
                const SizedBox(width: 6),
                SizedBox(
                  width: 58,
                  child: OutlinedButton(
                    onPressed: () => _toggleEliminated(question, response, id),
                    style: OutlinedButton.styleFrom(
                      padding: EdgeInsets.zero,
                      foregroundColor: c.inkSoft,
                      side: BorderSide(color: c.lineStrong),
                    ),
                    child: Text(
                      struck ? 'Undo' : id,
                      style: TextStyle(
                        fontSize: 11.5,
                        decoration: struck ? null : TextDecoration.lineThrough,
                      ),
                    ),
                  ),
                ),
              ],
            )
          : tile,
    );
  }

  Widget _bottomBar() {
    final c = context.exam;
    final last = _index >= _responses.length - 1;
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
      child: Row(
        children: [
          IconButton(
            tooltip: 'Previous question',
            onPressed: _index > 0 ? () => _goTo(_index - 1) : null,
            icon: const Icon(Icons.chevron_left),
          ),
          Expanded(
            child: Center(
              child: TextButton.icon(
                onPressed: _showNavigator,
                style: TextButton.styleFrom(
                  backgroundColor: c.ink,
                  foregroundColor: c.page,
                  padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
                ),
                iconAlignment: IconAlignment.end,
                icon: const Icon(Icons.expand_less, size: 16),
                label: Text(
                  'Question ${_index + 1} of ${_responses.length}',
                  style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600),
                ),
              ),
            ),
          ),
          if (last)
            FilledButton(
              onPressed: () {
                _flushTiming();
                setState(() => _reviewing = true);
                _syncTiming();
              },
              child: const Text('Review'),
            )
          else
            FilledButton(
              onPressed: () => _goTo(_index + 1),
              child: const Text('Next'),
            ),
        ],
      ),
    );
  }

  Widget _seat(int i, Map<String, dynamic> response, VoidCallback onTap) {
    final c = context.exam;
    final current = i == _index;
    final marked = response['flagged'] == true;
    final answered = response['answered'] == true;
    return SizedBox(
      width: 40,
      height: 40,
      child: Semantics(
        selected: current,
        label: 'Question ${i + 1}'
            '${answered ? ', answered' : ', unanswered'}'
            '${marked ? ', marked for review' : ''}',
        child: OutlinedButton(
          onPressed: onTap,
          style: OutlinedButton.styleFrom(
            padding: EdgeInsets.zero,
            foregroundColor: marked
                ? c.flag
                : answered
                    ? c.onAccent
                    : c.ink,
            backgroundColor: marked
                ? c.flagSoft
                : answered
                    ? c.accent
                    : null,
            side: BorderSide(
              color: current
                  ? c.ink
                  : marked
                      ? c.flag
                      : answered
                          ? c.accent
                          : c.lineStrong,
              width: current ? 2 : 1,
            ),
          ),
          child: Text('${i + 1}', style: const TextStyle(fontSize: 12)),
        ),
      ),
    );
  }

  Widget _reviewPanel() {
    final c = context.exam;
    final answered = _responses.where((r) => r['answered'] == true).length;
    final marked = _responses.where((r) => r['flagged'] == true).length;
    final isLast = _module!['order_index'] == _attempt!['modules_total'];

    return SingleChildScrollView(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Check your work',
            style: serif(size: 23, weight: FontWeight.w700, color: c.ink),
          ),
          const SizedBox(height: 8),
          Text(
            '$answered of ${_responses.length} answered, $marked marked for '
            'review. You cannot return to this module once you move on.',
            style: TextStyle(fontSize: 13.5, height: 1.55, color: c.inkSoft),
          ),
          const SizedBox(height: 16),
          Wrap(
            spacing: 14,
            runSpacing: 4,
            children: [
              _legend(c.accent, c.accent, 'Answered'),
              _legend(c.flagSoft, c.flag, 'Marked for review'),
              _legend(c.surface, c.lineStrong, 'Unanswered'),
            ],
          ),
          const SizedBox(height: 12),
          Wrap(
            spacing: 6,
            runSpacing: 6,
            children: [
              for (var i = 0; i < _responses.length; i += 1)
                _seat(i, _responses[i] as Map<String, dynamic>, () => _goTo(i)),
            ],
          ),
          const SizedBox(height: 24),
          Row(
            children: [
              OutlinedButton(
                onPressed: () {
                  setState(() => _reviewing = false);
                  _syncTiming();
                },
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
          const SizedBox(height: 36),
          TextButton(
            onPressed: _busy ? null : _endTest,
            style: TextButton.styleFrom(foregroundColor: c.inkFaint),
            child: const Text('End the whole test now'),
          ),
        ],
      ),
    );
  }
}
