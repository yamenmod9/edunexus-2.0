import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../api/api_client.dart';
import '../state/app_state.dart';
import '../widgets/common.dart';
import 'result_screen.dart';

/// Cross-attempt analytics (CLAUDE.md build-roadmap Phase 7), consuming the
/// same `/api/analytics/dashboard` endpoint as `web/src/pages/ProgressPage.jsx`.
/// Mirrors that page's structure and design choices so a student sees the same
/// story on both platforms - a fixed 400-1600 score axis, one accent hue for
/// magnitude (weak-area bars), and every chart backed by a plain-text
/// equivalent (the test history list stands in for the trend chart's tooltip,
/// since a touch surface has no hover to gate detail behind).
class ProgressScreen extends StatefulWidget {
  const ProgressScreen({super.key});

  @override
  State<ProgressScreen> createState() => _ProgressScreenState();
}

class _ProgressScreenState extends State<ProgressScreen> {
  Map<String, dynamic>? _dashboard;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _error = null);
    try {
      final dashboard =
          await context.read<AppState>().client.analyticsDashboard();
      if (mounted) setState(() => _dashboard = dashboard);
    } on ApiException catch (error) {
      if (mounted) setState(() => _error = error.message);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Your progress')),
      body: _error != null
          ? Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Notice(message: _error!),
                  FilledButton(onPressed: _load, child: const Text('Try again')),
                ],
              ),
            )
          : _dashboard == null
              ? const Loading(label: 'Loading your progress')
              : _body(),
    );
  }

  Widget _body() {
    final dashboard = _dashboard!;
    final attemptsAnalyzed = dashboard['attempts_analyzed'] as int;

    if (attemptsAnalyzed == 0) {
      return Padding(
        padding: const EdgeInsets.all(16),
        child: Card(
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  'Finish a full adaptive test to start seeing your score '
                  'history and accuracy breakdown here.',
                ),
                const SizedBox(height: 12),
                OutlinedButton(
                  onPressed: () => Navigator.of(context).pop(),
                  child: const Text('Take a test'),
                ),
              ],
            ),
          ),
        ),
      );
    }

    final history = dashboard['score_history'] as List<dynamic>;
    final minSample = dashboard['min_sample_size'] as int;

    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Text(
            'Based on $attemptsAnalyzed finished '
            '${attemptsAnalyzed == 1 ? 'attempt' : 'attempts'}. Practice-mode '
            "questions aren't tracked here — only full tests are.",
            style: Theme.of(context).textTheme.bodySmall,
          ),
          const SizedBox(height: 12),

          Card(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: _ScoreTrend(history: history),
            ),
          ),

          _barCard('Weakest domains', dashboard['weak_domains'] as List<dynamic>,
              (row) => '${humanize(row['section'] as String?)} · '
                  '${humanize(row['domain'] as String?)}',
              'Not enough answered questions yet in any one domain '
              '(need $minSample+).'),
          _barCard('Weakest skills', dashboard['weak_skills'] as List<dynamic>,
              (row) => row['skill'] as String,
              'Not enough answered questions yet in any one skill '
              '(need $minSample+).'),

          _tableCard('By domain', dashboard['domains'] as List<dynamic>,
              (row) => '${humanize(row['section'] as String?)} · '
                  '${humanize(row['domain'] as String?)}'),
          _tableCard('By difficulty', dashboard['difficulty'] as List<dynamic>,
              (row) => humanize(row['difficulty'] as String?)),
          _tableCard('By skill', dashboard['skills'] as List<dynamic>,
              (row) => row['skill'] as String),

          Text('Test history', style: Theme.of(context).textTheme.titleMedium),
          const SizedBox(height: 8),
          for (final entry in history.reversed)
            _historyTile(entry as Map<String, dynamic>),
        ],
      ),
    );
  }

  Widget _barCard(
    String title,
    List<dynamic> rows,
    String Function(Map<String, dynamic>) labelFor,
    String emptyNote,
  ) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(title, style: Theme.of(context).textTheme.titleMedium),
            const SizedBox(height: 8),
            if (rows.isEmpty)
              Text(emptyNote, style: Theme.of(context).textTheme.bodySmall)
            else
              for (final entry in rows)
                _barRow(labelFor(entry as Map<String, dynamic>), entry),
          ],
        ),
      ),
    );
  }

  Widget _barRow(String label, Map<String, dynamic> row) {
    final accuracy = (row['accuracy'] as num?)?.toDouble();
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(child: Text(label, style: const TextStyle(fontSize: 13))),
              Text(
                accuracy == null
                    ? '—'
                    : '${(accuracy * 100).round()}% (${row['correct']}/${row['answered']})',
                style: Theme.of(context).textTheme.bodySmall,
              ),
            ],
          ),
          const SizedBox(height: 4),
          ClipRRect(
            borderRadius: BorderRadius.circular(4),
            child: LinearProgressIndicator(
              value: (accuracy ?? 0).clamp(0.02, 1.0),
              minHeight: 6,
              backgroundColor: const Color(0xFFE2E8F0),
            ),
          ),
        ],
      ),
    );
  }

  Widget _tableCard(
    String title,
    List<dynamic> rows,
    String Function(Map<String, dynamic>) labelFor,
  ) {
    if (rows.isEmpty) return const SizedBox.shrink();
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(title, style: Theme.of(context).textTheme.titleMedium),
            const SizedBox(height: 8),
            for (final entry in rows) _tableRow(labelFor(entry as Map<String, dynamic>), entry),
          ],
        ),
      ),
    );
  }

  Widget _tableRow(String label, Map<String, dynamic> row) {
    final delivered = row['delivered'] as int;
    final answered = row['answered'] as int;
    final skipped = delivered - answered;
    final accuracy = row['accuracy'] as num?;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        children: [
          Expanded(
            child: Text.rich(
              TextSpan(
                text: label,
                style: const TextStyle(fontSize: 13),
                children: [
                  if (skipped > 0)
                    TextSpan(
                      text: '  ($skipped skipped)',
                      style: const TextStyle(fontSize: 11, color: Color(0xFF64748B)),
                    ),
                ],
              ),
            ),
          ),
          Text('${row['correct']}/$answered', style: const TextStyle(fontSize: 13)),
          const SizedBox(width: 12),
          SizedBox(
            width: 40,
            child: Text(
              accuracy == null ? '—' : '${(accuracy * 100).round()}%',
              textAlign: TextAlign.right,
              style: const TextStyle(fontSize: 13),
            ),
          ),
        ],
      ),
    );
  }

  Widget _historyTile(Map<String, dynamic> entry) {
    final submitted = DateTime.tryParse('${entry['submitted_at']}Z')?.toLocal();
    return Card(
      child: ListTile(
        title: Text(entry['form_name'] as String),
        subtitle: Text(
          '${submitted == null ? '' : '${submitted.day}/${submitted.month}/${submitted.year}'}'
          ' · ${entry['status']}',
        ),
        trailing: Text(
          '${entry['total_scaled_score'] ?? '—'}',
          style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 16),
        ),
        onTap: () => Navigator.of(context).push(
          MaterialPageRoute(
            builder: (_) => ResultScreen(attemptId: entry['attempt_id'] as String),
          ),
        ),
      ),
    );
  }
}

const _totalMin = 400;
const _totalMax = 1600;

class _ScoreTrend extends StatelessWidget {
  const _ScoreTrend({required this.history});

  final List<dynamic> history;

  @override
  Widget build(BuildContext context) {
    final points = <(String, int)>[];
    for (final entry in history) {
      final map = entry as Map<String, dynamic>;
      final score = map['total_scaled_score'] as int?;
      if (score != null) points.add((map['form_name'] as String, score));
    }

    if (points.isEmpty) {
      return const Text('No completed attempts yet.');
    }

    if (points.length == 1) {
      final (formName, score) = points.single;
      return Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'LATEST TOTAL SCORE',
            style: TextStyle(
              fontSize: 11,
              fontWeight: FontWeight.bold,
              letterSpacing: 0.6,
              color: const Color(0xFF64748B),
            ),
          ),
          Text('$score', style: const TextStyle(fontSize: 34, fontWeight: FontWeight.bold)),
          const SizedBox(height: 4),
          Text(
            '$formName · one more finished test will start a trend line',
            style: Theme.of(context).textTheme.bodySmall,
          ),
        ],
      );
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text(
          'TOTAL SCORE BY ATTEMPT',
          style: TextStyle(
            fontSize: 11,
            fontWeight: FontWeight.bold,
            letterSpacing: 0.6,
            color: Color(0xFF64748B),
          ),
        ),
        const SizedBox(height: 8),
        SizedBox(
          height: 160,
          width: double.infinity,
          child: CustomPaint(painter: _ScoreTrendPainter(points)),
        ),
        const SizedBox(height: 4),
        Text(
          'Full values for every attempt are in the test history list below.',
          style: Theme.of(context).textTheme.bodySmall,
        ),
      ],
    );
  }
}

class _ScoreTrendPainter extends CustomPainter {
  _ScoreTrendPainter(this.points);

  final List<(String, int)> points;

  @override
  void paint(Canvas canvas, Size size) {
    const leftPad = 36.0;
    const topPad = 8.0;
    const bottomPad = 8.0;
    final plotWidth = size.width - leftPad;
    final plotHeight = size.height - topPad - bottomPad;

    double yFor(int score) =>
        topPad + plotHeight - ((score - _totalMin) / (_totalMax - _totalMin)) * plotHeight;
    double xFor(int i) => leftPad +
        (points.length <= 1 ? plotWidth / 2 : (i / (points.length - 1)) * plotWidth);

    final gridPaint = Paint()
      ..color = const Color(0xFFE2E8F0)
      ..strokeWidth = 1;
    final labelStyle = TextStyle(fontSize: 9, color: const Color(0xFF64748B));
    for (final tick in [400, 700, 1000, 1300, 1600]) {
      final y = yFor(tick);
      canvas.drawLine(Offset(leftPad, y), Offset(size.width, y), gridPaint);
      final painter = TextPainter(
        text: TextSpan(text: '$tick', style: labelStyle),
        textDirection: TextDirection.ltr,
      )..layout();
      painter.paint(canvas, Offset(leftPad - 8 - painter.width, y - painter.height / 2));
    }

    final linePaint = Paint()
      ..color = const Color(0xFF1D4ED8)
      ..strokeWidth = 2
      ..style = PaintingStyle.stroke
      ..strokeCap = StrokeCap.round
      ..strokeJoin = StrokeJoin.round;
    final path = Path();
    for (var i = 0; i < points.length; i += 1) {
      final offset = Offset(xFor(i), yFor(points[i].$2));
      if (i == 0) {
        path.moveTo(offset.dx, offset.dy);
      } else {
        path.lineTo(offset.dx, offset.dy);
      }
    }
    canvas.drawPath(path, linePaint);

    final dotFill = Paint()..color = const Color(0xFF1D4ED8);
    final dotStroke = Paint()
      ..color = Colors.white
      ..strokeWidth = 2
      ..style = PaintingStyle.stroke;
    for (var i = 0; i < points.length; i += 1) {
      final offset = Offset(xFor(i), yFor(points[i].$2));
      canvas.drawCircle(offset, i == points.length - 1 ? 4.5 : 3.5, dotFill);
      canvas.drawCircle(offset, i == points.length - 1 ? 4.5 : 3.5, dotStroke);
    }

    final last = points.last;
    final lastPainter = TextPainter(
      text: TextSpan(
        text: '${last.$2}',
        style: const TextStyle(
          fontSize: 12,
          fontWeight: FontWeight.w600,
          color: Color(0xFF0F172A),
        ),
      ),
      textDirection: TextDirection.ltr,
    )..layout();
    lastPainter.paint(
      canvas,
      Offset(xFor(points.length - 1) - lastPainter.width, yFor(last.$2) - 16),
    );
  }

  @override
  bool shouldRepaint(covariant _ScoreTrendPainter oldDelegate) =>
      oldDelegate.points != points;
}
