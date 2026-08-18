import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../api/api_client.dart';
import '../state/app_state.dart';
import '../theme.dart';
import '../widgets/common.dart';
import 'practice_screen.dart';
import 'progress_screen.dart';
import 'result_screen.dart';
import 'test_player_screen.dart';

class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  Map<String, dynamic>? _openAttempt;
  List<dynamic> _forms = [];
  List<dynamic> _history = [];
  bool _loading = true;
  String? _error;
  String? _starting;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    final client = context.read<AppState>().client;
    try {
      final results = await Future.wait([
        client.forms(),
        client.currentAttempt(),
        client.attemptList(),
      ]);
      if (!mounted) return;
      setState(() {
        _forms = results[0]['items'] as List<dynamic>;
        _openAttempt = results[1]['attempt'] as Map<String, dynamic>?;
        _history = (results[2]['items'] as List<dynamic>)
            .where((a) => a['status'] != 'in_progress')
            .toList();
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

  Future<void> _start(String formId) async {
    setState(() => _starting = formId);
    try {
      final attempt = await context.read<AppState>().client.startAttempt(formId);
      if (!mounted) return;
      await Navigator.of(context).push(
        MaterialPageRoute(
          builder: (_) => TestPlayerScreen(attemptId: attempt['id'] as String),
        ),
      );
      if (mounted) _load();
    } on ApiException catch (error) {
      if (!mounted) return;
      setState(() => _error = error.message);
    } finally {
      if (mounted) setState(() => _starting = null);
    }
  }

  int _questionCount(Map<String, dynamic> form) {
    final sections = (form['sections'] as List<dynamic>?) ?? const [];
    return sections.fold<int>(
      0,
      (sum, s) => sum +
          ((s['modules'] as List<dynamic>).fold<int>(
              0, (a, m) => a + (m['question_count'] as int))),
    );
  }

  int _minutes(Map<String, dynamic> form) {
    final sections = (form['sections'] as List<dynamic>?) ?? const [];
    final seconds = sections.fold<int>(
      0,
      (sum, s) => sum +
          ((s['modules'] as List<dynamic>).fold<int>(
              0, (a, m) => a + (m['time_limit_seconds'] as int))),
    );
    return (seconds / 60).round();
  }

  @override
  Widget build(BuildContext context) {
    final state = context.watch<AppState>();
    final c = context.exam;

    return Scaffold(
      appBar: AppBar(
        title: const Text('EduNexus'),
        actions: [
          IconButton(
            tooltip: 'Practice questions',
            icon: const Icon(Icons.school_outlined),
            onPressed: () => Navigator.of(context).push(
              MaterialPageRoute(builder: (_) => const PracticeScreen()),
            ),
          ),
          IconButton(
            tooltip: 'Your progress',
            icon: const Icon(Icons.insights_outlined),
            onPressed: () => Navigator.of(context).push(
              MaterialPageRoute(builder: (_) => const ProgressScreen()),
            ),
          ),
          const ThemeToggleButton(),
          IconButton(
            tooltip: 'Sign out',
            icon: const Icon(Icons.logout),
            onPressed: () => state.signOut(),
          ),
        ],
      ),
      body: Column(
        children: [
          const ConnectionBar(),
          Expanded(
            child: _loading
                ? const Loading(label: 'Loading')
                : RefreshIndicator(
                    onRefresh: _load,
                    child: ListView(
                      padding: const EdgeInsets.fromLTRB(16, 20, 16, 0),
                      children: [
                        if (_error != null) Notice(message: _error!),

                        // One lead action, not three cards of equal weight:
                        // either there is a test running, in which case
                        // resuming it is the only thing that matters, or there
                        // is not, and starting one is.
                        if (_openAttempt != null)
                          _resumeCard()
                        else
                          _leadIn(state),

                        const SizedBox(height: 28),
                        const SectionLabel('Practice tests'),
                        if (_forms.isEmpty)
                          const Notice(
                            tone: NoticeTone.info,
                            message:
                                'No tests are available yet. An administrator '
                                'needs to assemble one from the question bank.',
                          ),
                        for (final form in _forms)
                          _formRow(form as Map<String, dynamic>),

                        if (_history.isNotEmpty) ...[
                          const SizedBox(height: 28),
                          const SectionLabel('Past attempts'),
                          for (final attempt in _history)
                            _historyRow(attempt as Map<String, dynamic>),
                        ],

                        const SizedBox(height: 28),
                        InkWell(
                          onTap: () => Navigator.of(context).push(
                            MaterialPageRoute(
                                builder: (_) => const PracticeScreen()),
                          ),
                          borderRadius: BorderRadius.circular(8),
                          child: Container(
                            padding: const EdgeInsets.all(16),
                            decoration: BoxDecoration(
                              borderRadius: BorderRadius.circular(8),
                              border: Border.all(color: c.line),
                            ),
                            child: Row(
                              children: [
                                Expanded(
                                  child: Column(
                                    crossAxisAlignment: CrossAxisAlignment.start,
                                    children: [
                                      Text(
                                        'Practice questions',
                                        style: serif(
                                          size: 16,
                                          weight: FontWeight.w700,
                                          color: c.ink,
                                        ),
                                      ),
                                      const SizedBox(height: 3),
                                      Text(
                                        'Single questions, untimed, with the '
                                        'explanation after you answer.',
                                        style: TextStyle(
                                          fontSize: 13,
                                          height: 1.45,
                                          color: c.inkSoft,
                                        ),
                                      ),
                                    ],
                                  ),
                                ),
                                Icon(Icons.chevron_right, color: c.inkFaint),
                              ],
                            ),
                          ),
                        ),
                        const SizedBox(height: 24),
                        const TrademarkNotice(),
                      ],
                    ),
                  ),
          ),
        ],
      ),
    );
  }

  /// The signed-out-of-a-test state: who you are, and what to do next.
  Widget _leadIn(AppState state) {
    final c = context.exam;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'Welcome back',
          style: serif(
            size: 27,
            weight: FontWeight.w700,
            letterSpacing: -0.5,
            color: c.ink,
          ),
        ),
        const SizedBox(height: 4),
        Text(
          state.user?['email'] as String? ?? '',
          style: TextStyle(fontSize: 13, color: c.inkFaint),
        ),
      ],
    );
  }

  Widget _resumeCard() {
    final c = context.exam;
    final attempt = _openAttempt!;
    final module = attempt['current_module'] as Map<String, dynamic>?;
    return Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: c.accentSoft,
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: c.accent, width: 1.5),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Eyebrow('Test in progress', color: c.accent),
          const SizedBox(height: 8),
          Text(
            attempt['form_name'] as String,
            style: serif(size: 20, weight: FontWeight.w700, color: c.ink),
          ),
          const SizedBox(height: 4),
          Text(
            '${humanize(module?['section'] as String?)} module '
            '${module?['sequence']}. The clock is still running.',
            style: TextStyle(fontSize: 13, height: 1.45, color: c.inkSoft),
          ),
          const SizedBox(height: 16),
          Align(
            alignment: Alignment.centerLeft,
            child: FilledButton(
              onPressed: () async {
                await Navigator.of(context).push(
                  MaterialPageRoute(
                    builder: (_) =>
                        TestPlayerScreen(attemptId: attempt['id'] as String),
                  ),
                );
                if (mounted) _load();
              },
              child: const Text('Resume test'),
            ),
          ),
        ],
      ),
    );
  }

  Widget _formRow(Map<String, dynamic> form) {
    final c = context.exam;
    final blocked = _openAttempt != null;
    return Container(
      padding: const EdgeInsets.symmetric(vertical: 16),
      decoration: BoxDecoration(
        border: Border(bottom: BorderSide(color: c.line)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            form['name'] as String,
            style: serif(size: 17, weight: FontWeight.w700, color: c.ink),
          ),
          if (form['description'] != null) ...[
            const SizedBox(height: 3),
            Text(
              form['description'] as String,
              style: TextStyle(fontSize: 13, height: 1.45, color: c.inkSoft),
            ),
          ],
          const SizedBox(height: 8),
          Text(
            '${_questionCount(form)} questions · about ${_minutes(form)} minutes',
            style: TextStyle(fontSize: 12, color: c.inkFaint),
          ),
          const SizedBox(height: 14),
          Align(
            alignment: Alignment.centerLeft,
            child: FilledButton(
              onPressed: blocked || _starting == form['id']
                  ? null
                  : () => _start(form['id'] as String),
              child: Text(_starting == form['id'] ? 'Starting…' : 'Start test'),
            ),
          ),
          if (blocked)
            Padding(
              padding: const EdgeInsets.only(top: 8),
              child: Text(
                'Finish or end your test in progress first.',
                style: TextStyle(fontSize: 12, color: c.inkFaint),
              ),
            ),
        ],
      ),
    );
  }

  Widget _historyRow(Map<String, dynamic> attempt) {
    final c = context.exam;
    final started = DateTime.tryParse('${attempt['started_at']}Z')?.toLocal();
    return InkWell(
      onTap: () => Navigator.of(context).push(
        MaterialPageRoute(
          builder: (_) => ResultScreen(attemptId: attempt['id'] as String),
        ),
      ),
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 14),
        decoration: BoxDecoration(
          border: Border(bottom: BorderSide(color: c.line)),
        ),
        child: Row(
          children: [
            Expanded(
              child: Text(
                attempt['form_name'] as String,
                style: const TextStyle(fontSize: 14),
              ),
            ),
            Text(
              started == null
                  ? ''
                  : '${started.day}/${started.month}/${started.year}',
              style: TextStyle(fontSize: 12, color: c.inkFaint),
            ),
            const SizedBox(width: 12),
            SizedBox(
              width: 74,
              child: Text(
                attempt['status'] as String,
                style: TextStyle(fontSize: 12, color: c.inkSoft),
              ),
            ),
            Icon(Icons.chevron_right, size: 18, color: c.inkFaint),
          ],
        ),
      ),
    );
  }
}
