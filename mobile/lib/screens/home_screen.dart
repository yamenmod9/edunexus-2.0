import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../api/api_client.dart';
import '../state/app_state.dart';
import '../widgets/common.dart';
import 'practice_screen.dart';
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
                      padding: const EdgeInsets.all(16),
                      children: [
                        Text(
                          state.user?['email'] as String? ?? '',
                          style: Theme.of(context).textTheme.bodySmall,
                        ),
                        const SizedBox(height: 12),
                        if (_error != null) Notice(message: _error!),

                        if (_openAttempt != null) _resumeCard(),

                        Text('Practice tests',
                            style: Theme.of(context).textTheme.titleMedium),
                        const SizedBox(height: 8),
                        if (_forms.isEmpty)
                          const Notice(
                            tone: NoticeTone.info,
                            message:
                                'No tests are available yet. An administrator '
                                'needs to assemble one from the question bank.',
                          ),
                        for (final form in _forms)
                          _formCard(form as Map<String, dynamic>),

                        if (_history.isNotEmpty) ...[
                          const SizedBox(height: 16),
                          Text('Past attempts',
                              style: Theme.of(context).textTheme.titleMedium),
                          const SizedBox(height: 8),
                          for (final attempt in _history)
                            _historyTile(attempt as Map<String, dynamic>),
                        ],

                        const SizedBox(height: 16),
                        Card(
                          child: ListTile(
                            leading: const Icon(Icons.school_outlined),
                            title: const Text('Practice questions'),
                            subtitle: const Text(
                              'Single questions with the explanation after you '
                              'answer.',
                            ),
                            trailing: const Icon(Icons.chevron_right),
                            onTap: () => Navigator.of(context).push(
                              MaterialPageRoute(
                                  builder: (_) => const PracticeScreen()),
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
          ),
        ],
      ),
    );
  }

  Widget _resumeCard() {
    final attempt = _openAttempt!;
    final module = attempt['current_module'] as Map<String, dynamic>?;
    return Card(
      color: const Color(0xFFEFF6FF),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text('You have a test in progress',
                style: TextStyle(fontWeight: FontWeight.bold)),
            const SizedBox(height: 4),
            Text(
              '${attempt['form_name']} — ${humanize(module?['section'] as String?)} '
              'module ${module?['sequence']}. The clock is still running.',
            ),
            const SizedBox(height: 12),
            FilledButton(
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
          ],
        ),
      ),
    );
  }

  Widget _formCard(Map<String, dynamic> form) {
    final blocked = _openAttempt != null;
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(form['name'] as String,
                style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 16)),
            if (form['description'] != null) ...[
              const SizedBox(height: 4),
              Text(form['description'] as String),
            ],
            const SizedBox(height: 6),
            Text(
              '${_questionCount(form)} questions · about ${_minutes(form)} minutes',
              style: Theme.of(context).textTheme.bodySmall,
            ),
            const SizedBox(height: 12),
            FilledButton(
              onPressed: blocked || _starting == form['id']
                  ? null
                  : () => _start(form['id'] as String),
              child: Text(_starting == form['id'] ? 'Starting…' : 'Start test'),
            ),
            if (blocked)
              Padding(
                padding: const EdgeInsets.only(top: 6),
                child: Text(
                  'Finish or end your test in progress first.',
                  style: Theme.of(context).textTheme.bodySmall,
                ),
              ),
          ],
        ),
      ),
    );
  }

  Widget _historyTile(Map<String, dynamic> attempt) {
    final started = DateTime.tryParse('${attempt['started_at']}Z')?.toLocal();
    return Card(
      child: ListTile(
        title: Text(attempt['form_name'] as String),
        subtitle: Text(
          '${started == null ? '' : '${started.day}/${started.month}/${started.year}'}'
          ' · ${attempt['status']}',
        ),
        trailing: const Icon(Icons.chevron_right),
        onTap: () => Navigator.of(context).push(
          MaterialPageRoute(
            builder: (_) => ResultScreen(attemptId: attempt['id'] as String),
          ),
        ),
      ),
    );
  }
}
