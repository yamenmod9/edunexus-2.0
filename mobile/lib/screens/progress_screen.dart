import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../api/api_client.dart';
import '../state/app_state.dart';
import '../theme.dart';
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
    final c = context.exam;
    final dashboard = _dashboard!;
    final attemptsAnalyzed = dashboard['attempts_analyzed'] as int;

    if (attemptsAnalyzed == 0) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(32),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                'Nothing to show yet',
                textAlign: TextAlign.center,
                style: serif(size: 22, weight: FontWeight.w700, color: c.ink),
              ),
              const SizedBox(height: 10),
              Text(
                'Finish a full adaptive test to start seeing your score history '
                'and accuracy breakdown here. Practice questions are not '
                'counted — only full tests are.',
                textAlign: TextAlign.center,
                style: TextStyle(fontSize: 13, height: 1.6, color: c.inkSoft),
              ),
              const SizedBox(height: 22),
              FilledButton(
                onPressed: () => Navigator.of(context).pop(),
                child: const Text('Take a test'),
              ),
            ],
          ),
        ),
      );
    }

    final history = dashboard['score_history'] as List<dynamic>;
    final minSample = dashboard['min_sample_size'] as int;

    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(
        padding: const EdgeInsets.fromLTRB(16, 18, 16, 32),
        children: [
          Text(
            'Based on $attemptsAnalyzed finished '
            '${attemptsAnalyzed == 1 ? 'attempt' : 'attempts'}. Practice-mode '
            "questions aren't tracked here — only full tests are.",
            style: TextStyle(fontSize: 12.5, height: 1.5, color: c.inkFaint),
          ),
          const SizedBox(height: 24),

          _ScoreTrend(history: history),
          const SizedBox(height: 28),

          _barSection(
            'Weakest domains',
            dashboard['weak_domains'] as List<dynamic>,
            (row) => '${humanize(row['section'] as String?)} · '
                '${humanize(row['domain'] as String?)}',
            'Not enough answered questions yet in any one domain '
            '(need $minSample+).',
            minSample,
          ),
          _barSection(
            'Weakest skills',
            dashboard['weak_skills'] as List<dynamic>,
            (row) => row['skill'] as String,
            'Not enough answered questions yet in any one skill '
            '(need $minSample+).',
            minSample,
          ),

          _accuracySection('By domain', dashboard['domains'] as List<dynamic>,
              (row) => '${humanize(row['section'] as String?)} · '
                  '${humanize(row['domain'] as String?)}'),
          _accuracySection(
              'By difficulty',
              dashboard['difficulty'] as List<dynamic>,
              (row) => humanize(row['difficulty'] as String?)),
          _accuracySection('By skill', dashboard['skills'] as List<dynamic>,
              (row) => row['skill'] as String),

          const SectionLabel('Test history'),
          for (final entry in history.reversed)
            _historyRow(entry as Map<String, dynamic>),
        ],
      ),
    );
  }

  Widget _barSection(
    String title,
    List<dynamic> rows,
    String Function(Map<String, dynamic>) labelFor,
    String emptyNote,
    int minSample,
  ) {
    final c = context.exam;
    return Padding(
      padding: const EdgeInsets.only(bottom: 28),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SectionLabel(title),
          // The ranking note only makes sense above an actual ranking -
          // printed over the empty state it contradicts the sentence below it.
          if (rows.isEmpty)
            Text(emptyNote, style: TextStyle(fontSize: 13, color: c.inkFaint))
          else ...[
            Padding(
              padding: const EdgeInsets.only(bottom: 12),
              child: Text(
                'Ranked by accuracy, minimum $minSample answered.',
                style: TextStyle(fontSize: 11.5, color: c.inkFaint),
              ),
            ),
            for (final entry in rows)
              _barRow(labelFor(entry as Map<String, dynamic>), entry),
          ],
        ],
      ),
    );
  }

  Widget _barRow(String label, Map<String, dynamic> row) {
    final c = context.exam;
    final accuracy = (row['accuracy'] as num?)?.toDouble();
    return Padding(
      padding: const EdgeInsets.only(bottom: 14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.baseline,
            textBaseline: TextBaseline.alphabetic,
            children: [
              Expanded(child: Text(label, style: const TextStyle(fontSize: 13))),
              Text(
                accuracy == null ? '—' : '${(accuracy * 100).round()}%',
                style: TextStyle(
                  fontFamily: 'monospace',
                  fontSize: 12,
                  color: c.inkSoft,
                ),
              ),
              const SizedBox(width: 10),
              Text(
                '${row['correct']}/${row['answered']}',
                style: TextStyle(fontSize: 11.5, color: c.inkFaint),
              ),
            ],
          ),
          const SizedBox(height: 6),
          Meter(value: accuracy),
        ],
      ),
    );
  }

  Widget _accuracySection(
    String title,
    List<dynamic> rows,
    String Function(Map<String, dynamic>) labelFor,
  ) {
    if (rows.isEmpty) return const SizedBox.shrink();
    return Padding(
      padding: const EdgeInsets.only(bottom: 28),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SectionLabel(title),
          for (final entry in rows)
            _accuracyRow(labelFor(entry as Map<String, dynamic>), entry),
        ],
      ),
    );
  }

  /// Accuracy is correct/answered, never correct/delivered — the server drops
  /// skipped questions on purpose, so running out of time must not read as
  /// being inaccurate on questions never seen. Skips are reported separately.
  Widget _accuracyRow(String label, Map<String, dynamic> row) {
    final c = context.exam;
    final delivered = row['delivered'] as int;
    final answered = row['answered'] as int;
    final skipped = delivered - answered;
    final accuracy = (row['accuracy'] as num?)?.toDouble();
    return Container(
      padding: const EdgeInsets.symmetric(vertical: 10),
      decoration: BoxDecoration(
        border: Border(bottom: BorderSide(color: c.line)),
      ),
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
                      style: TextStyle(fontSize: 11, color: c.inkFaint),
                    ),
                ],
              ),
            ),
          ),
          const SizedBox(width: 12),
          Meter(value: accuracy, graded: true, width: 62),
          const SizedBox(width: 12),
          SizedBox(
            width: 44,
            child: Text(
              '${row['correct']}/$answered',
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
    );
  }

  Widget _historyRow(Map<String, dynamic> entry) {
    final c = context.exam;
    final submitted = DateTime.tryParse('${entry['submitted_at']}Z')?.toLocal();
    return InkWell(
      onTap: () => Navigator.of(context).push(
        MaterialPageRoute(
          builder: (_) => ResultScreen(attemptId: entry['attempt_id'] as String),
        ),
      ),
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 12),
        decoration: BoxDecoration(
          border: Border(bottom: BorderSide(color: c.line)),
        ),
        child: Row(
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(entry['form_name'] as String,
                      style: const TextStyle(fontSize: 14)),
                  const SizedBox(height: 2),
                  Text(
                    '${submitted == null ? '' : '${submitted.day}/${submitted.month}/${submitted.year}'}'
                    ' · ${entry['status']}',
                    style: TextStyle(fontSize: 11.5, color: c.inkFaint),
                  ),
                ],
              ),
            ),
            Text(
              '${entry['total_scaled_score'] ?? '—'}',
              style: serif(size: 19, weight: FontWeight.w700, color: c.ink),
            ),
            const SizedBox(width: 6),
            Icon(Icons.chevron_right, size: 18, color: c.inkFaint),
          ],
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
    final c = context.exam;
    final points = <(String, int)>[];
    for (final entry in history) {
      final map = entry as Map<String, dynamic>;
      final score = map['total_scaled_score'] as int?;
      if (score != null) points.add((map['form_name'] as String, score));
    }

    if (points.isEmpty) {
      return Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const SectionLabel('Total score'),
          Text('No completed attempts yet.',
              style: TextStyle(fontSize: 13, color: c.inkFaint)),
        ],
      );
    }

    // One point is not a trend, so it renders as the figure itself.
    if (points.length == 1) {
      final (formName, score) = points.single;
      return Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const SectionLabel('Latest total score'),
          Text(
            '$score',
            style: serif(
              size: 44,
              weight: FontWeight.w700,
              letterSpacing: -1,
              color: c.ink,
            ),
          ),
          const SizedBox(height: 8),
          Text(
            '$formName · one more finished test will start a trend line',
            style: TextStyle(fontSize: 12.5, color: c.inkFaint),
          ),
        ],
      );
    }

    final delta = points.last.$2 - points.first.$2;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            const Expanded(child: SectionLabel('Total score')),
            if (delta != 0)
              Padding(
                padding: const EdgeInsets.only(bottom: 12, left: 12),
                child: Text(
                  '${delta > 0 ? '+' : ''}$delta since your first test',
                  style: TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.w500,
                    color: delta > 0 ? c.good : c.bad,
                  ),
                ),
              ),
          ],
        ),
        SizedBox(
          height: 160,
          width: double.infinity,
          child: CustomPaint(
            painter: _ScoreTrendPainter(
              points: points,
              grid: c.line,
              label: c.inkFaint,
              line: c.accent,
              dotRing: c.page,
              ink: c.ink,
            ),
          ),
        ),
        const SizedBox(height: 6),
        Text(
          'Full values for every attempt are in the test history list below.',
          style: TextStyle(fontSize: 12, color: c.inkFaint),
        ),
      ],
    );
  }
}

class _ScoreTrendPainter extends CustomPainter {
  _ScoreTrendPainter({
    required this.points,
    required this.grid,
    required this.label,
    required this.line,
    required this.dotRing,
    required this.ink,
  });

  final List<(String, int)> points;
  // A painter sits outside the widget tree, so it cannot read the theme
  // itself — the palette has to be handed in, or the chart silently stays
  // light when everything around it goes dark.
  final Color grid;
  final Color label;
  final Color line;
  final Color dotRing;
  final Color ink;

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
      ..color = grid
      ..strokeWidth = 1;
    final labelStyle = TextStyle(fontSize: 9, color: label);
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
      ..color = line
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

    final dotFill = Paint()..color = line;
    final dotStroke = Paint()
      ..color = dotRing
      ..strokeWidth = 2
      ..style = PaintingStyle.stroke;
    for (var i = 0; i < points.length; i += 1) {
      final offset = Offset(xFor(i), yFor(points[i].$2));
      canvas.drawCircle(offset, i == points.length - 1 ? 4.5 : 3.5, dotFill);
      canvas.drawCircle(offset, i == points.length - 1 ? 4.5 : 3.5, dotStroke);
    }

    // The most recent point is labelled directly; the rest are in the list.
    final last = points.last;
    final lastPainter = TextPainter(
      text: TextSpan(
        text: '${last.$2}',
        style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: ink),
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
      oldDelegate.points != points || oldDelegate.line != line;
}
