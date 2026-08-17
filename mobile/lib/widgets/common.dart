import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../state/app_state.dart';

String humanize(String? value) {
  if (value == null || value.isEmpty) return '';
  if (value == 'reading_writing') return 'Reading & Writing';
  return value
      .split('_')
      .map((w) => w.isEmpty ? w : '${w[0].toUpperCase()}${w.substring(1)}')
      .join(' ');
}

String formatClock(num? seconds) {
  final total = (seconds ?? 0).clamp(0, 1 << 30).floor();
  final m = (total ~/ 60).toString().padLeft(2, '0');
  final s = (total % 60).toString().padLeft(2, '0');
  return '$m:$s';
}

class Pill extends StatelessWidget {
  const Pill(this.label, {super.key, this.tone = PillTone.neutral});

  final String label;
  final PillTone tone;

  static Widget good(String label) => Pill(label, tone: PillTone.good);
  static Widget bad(String label) => Pill(label, tone: PillTone.bad);
  static Widget info(String label) => Pill(label, tone: PillTone.info);

  @override
  Widget build(BuildContext context) {
    final colors = switch (tone) {
      PillTone.good => (const Color(0xFFD1FAE5), const Color(0xFF065F46)),
      PillTone.bad => (const Color(0xFFFEE2E2), const Color(0xFF991B1B)),
      PillTone.info => (const Color(0xFFDBEAFE), const Color(0xFF1E40AF)),
      PillTone.neutral => (const Color(0xFFF1F5F9), const Color(0xFF334155)),
    };
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: colors.$1,
        borderRadius: BorderRadius.circular(4),
      ),
      child: Text(
        label,
        style: TextStyle(
          fontSize: 12,
          fontWeight: FontWeight.w500,
          color: colors.$2,
        ),
      ),
    );
  }
}

enum PillTone { neutral, good, bad, info }

class Notice extends StatelessWidget {
  const Notice({
    super.key,
    required this.message,
    this.title,
    this.tone = NoticeTone.error,
    this.onDismiss,
  });

  final String message;
  final String? title;
  final NoticeTone tone;
  final VoidCallback? onDismiss;

  @override
  Widget build(BuildContext context) {
    final colors = switch (tone) {
      NoticeTone.error => (const Color(0xFFFEF2F2), const Color(0xFF991B1B)),
      NoticeTone.warn => (const Color(0xFFFFFBEB), const Color(0xFF92400E)),
      NoticeTone.info => (const Color(0xFFEFF6FF), const Color(0xFF1E40AF)),
      NoticeTone.success => (const Color(0xFFECFDF5), const Color(0xFF065F46)),
    };
    return Container(
      width: double.infinity,
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: colors.$1,
        borderRadius: BorderRadius.circular(8),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                if (title != null)
                  Text(
                    title!,
                    style: TextStyle(
                      fontWeight: FontWeight.bold,
                      color: colors.$2,
                    ),
                  ),
                Text(message, style: TextStyle(color: colors.$2)),
              ],
            ),
          ),
          if (onDismiss != null)
            IconButton(
              icon: const Icon(Icons.close, size: 18),
              color: colors.$2,
              onPressed: onDismiss,
              tooltip: 'Dismiss',
            ),
        ],
      ),
    );
  }
}

enum NoticeTone { error, warn, info, success }

/// Shows connection state and how many answers are waiting to be delivered.
/// A student who answers with no signal needs to know the answer is safe.
class ConnectionBar extends StatelessWidget {
  const ConnectionBar({super.key});

  @override
  Widget build(BuildContext context) {
    final state = context.watch<AppState>();
    if (state.online && state.pendingAnswers == 0) {
      return const SizedBox.shrink();
    }

    final offline = !state.online;
    final pending = state.pendingAnswers;
    return Container(
      width: double.infinity,
      color: offline ? const Color(0xFFFEF3C7) : const Color(0xFFDBEAFE),
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      child: Row(
        children: [
          Icon(
            offline ? Icons.cloud_off : Icons.cloud_upload,
            size: 16,
            color: const Color(0xFF92400E),
          ),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              offline
                  ? pending > 0
                      ? 'Offline — $pending answer${pending == 1 ? '' : 's'} '
                          'saved on this device and will be sent when you reconnect.'
                      : 'Offline — your answers are saved on this device.'
                  : 'Sending $pending saved answer${pending == 1 ? '' : 's'}…',
              style: const TextStyle(fontSize: 12, color: Color(0xFF92400E)),
            ),
          ),
        ],
      ),
    );
  }
}

class Loading extends StatelessWidget {
  const Loading({super.key, this.label = 'Loading'});
  final String label;

  @override
  Widget build(BuildContext context) => Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const CircularProgressIndicator(),
            const SizedBox(height: 12),
            Text(label, style: Theme.of(context).textTheme.bodySmall),
          ],
        ),
      );
}
