import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../state/app_state.dart';
import '../theme.dart';

/// snake_case taxonomy values are for the API; humans get the display name.
///
/// Mirrors DISPLAY_NAMES in `backend/app/models/question.py` and the same map
/// in `web/src/components/ui.jsx`. Title-casing the enum is not enough:
/// CLAUDE.md section 5 fixes these names exactly, and 'craft_structure' loses
/// the ampersand that is part of the name. Anything unlisted title-cases.
const Map<String, String> displayNames = {
  'reading_writing': 'Reading & Writing',
  'advanced_math': 'Advanced Math',
  'problem_solving_data_analysis': 'Problem-Solving & Data Analysis',
  'geometry_trigonometry': 'Geometry & Trigonometry',
  'information_ideas': 'Information & Ideas',
  'craft_structure': 'Craft & Structure',
  'expression_of_ideas': 'Expression of Ideas',
  'standard_english_conventions': 'Standard English Conventions',
  'official_qb': 'Official QB',
};

String humanize(String? value) {
  if (value == null || value.isEmpty) return '';
  final display = displayNames[value];
  if (display != null) return display;
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
    final c = context.exam;
    final colors = switch (tone) {
      PillTone.good => (c.goodSoft, c.good),
      PillTone.bad => (c.badSoft, c.bad),
      PillTone.info => (c.accentSoft, c.accent),
      PillTone.neutral => (c.sunken, c.inkSoft),
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
    final c = context.exam;
    // Ground, marker: the tint carries the tone and the title carries the
    // colour. Body text stays ink so it never has to fight the tinted ground
    // for contrast.
    final colors = switch (tone) {
      NoticeTone.error => (c.badSoft, c.bad),
      NoticeTone.warn => (c.flagSoft, c.flag),
      NoticeTone.info => (c.accentSoft, c.accent),
      NoticeTone.success => (c.goodSoft, c.good),
    };
    return Container(
      width: double.infinity,
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: colors.$1,
        borderRadius: BorderRadius.circular(6),
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
                      fontWeight: FontWeight.w600,
                      color: colors.$2,
                    ),
                  ),
                Text(
                  message,
                  style: TextStyle(fontSize: 13, height: 1.5, color: c.inkSoft),
                ),
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

/// The small uppercase caption above a value or beside a metadata run.
class Eyebrow extends StatelessWidget {
  const Eyebrow(this.text, {super.key, this.color});

  final String text;
  final Color? color;

  @override
  Widget build(BuildContext context) => Text(
        text.toUpperCase(),
        style: TextStyle(
          fontSize: 11,
          fontWeight: FontWeight.w600,
          letterSpacing: 1.1,
          color: color ?? context.exam.inkFaint,
        ),
      );
}

/// A section heading with a hairline running to the edge — the Exam Calm rule.
class SectionLabel extends StatelessWidget {
  const SectionLabel(this.text, {super.key});

  final String text;

  @override
  Widget build(BuildContext context) {
    final c = context.exam;
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          Semantics(header: true, child: Eyebrow(text)),
          const SizedBox(width: 12),
          Expanded(child: Container(height: 1, color: c.line)),
        ],
      ),
    );
  }
}

/// A hairline magnitude bar.
///
/// `graded` banks the fill through red/accent/green by accuracy — an ordinal
/// encoding of the number the bar already shows, never a categorical one. Every
/// caller prints the fraction beside it, so colour is not the sole carrier.
class Meter extends StatelessWidget {
  const Meter({super.key, required this.value, this.graded = false, this.width});

  final double? value;
  final bool graded;
  final double? width;

  @override
  Widget build(BuildContext context) {
    final c = context.exam;
    final ratio = (value ?? 0).clamp(0.0, 1.0);
    final fill = !graded
        ? c.accent
        : ratio >= 0.75
            ? c.good
            : ratio >= 0.55
                ? c.accent
                : c.bad;
    return SizedBox(
      width: width,
      child: ClipRRect(
        borderRadius: BorderRadius.circular(3),
        child: Container(
          height: 5,
          // Track is `line`, not `sunken`: sunken against a card is very
          // nearly invisible, so an empty meter read as no meter at all.
          color: c.line,
          child: FractionallySizedBox(
            alignment: Alignment.centerLeft,
            widthFactor: ratio,
            child: Container(color: fill),
          ),
        ),
      ),
    );
  }
}

/// Answer-choice tones, shared by the player, practice and review so the three
/// screens cannot drift apart. The pip foreground is the page colour, not
/// white: dark mode's good and bad are light hues.
enum ChoiceTone { idle, picked, good, bad }

({Color row, Color ring, Color pipBg, Color pipFg}) choiceColors(
  BuildContext context,
  ChoiceTone tone,
) {
  final c = context.exam;
  return switch (tone) {
    ChoiceTone.idle => (
        row: c.surface,
        ring: c.lineStrong,
        pipBg: Colors.transparent,
        pipFg: c.inkFaint
      ),
    ChoiceTone.picked => (
        row: c.accentSoft,
        ring: c.accent,
        pipBg: c.accent,
        pipFg: c.onAccent
      ),
    ChoiceTone.good =>
      (row: c.goodSoft, ring: c.good, pipBg: c.good, pipFg: c.page),
    ChoiceTone.bad => (row: c.badSoft, ring: c.bad, pipBg: c.bad, pipFg: c.page),
  };
}

/// The lettered circle in front of an answer choice.
class ChoicePip extends StatelessWidget {
  const ChoicePip({super.key, required this.letter, this.tone = ChoiceTone.idle});

  final String letter;
  final ChoiceTone tone;

  @override
  Widget build(BuildContext context) {
    final colors = choiceColors(context, tone);
    return Container(
      height: 24,
      width: 24,
      alignment: Alignment.center,
      decoration: BoxDecoration(
        color: colors.pipBg,
        shape: BoxShape.circle,
        border: Border.all(
          color: tone == ChoiceTone.idle ? colors.ring : colors.pipBg,
        ),
      ),
      child: Text(
        letter,
        style: TextStyle(
          fontSize: 12,
          fontWeight: FontWeight.w600,
          color: colors.pipFg,
        ),
      ),
    );
  }
}

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

    final c = context.exam;
    final offline = !state.online;
    final pending = state.pendingAnswers;
    return Container(
      width: double.infinity,
      color: offline ? c.flagSoft : c.accentSoft,
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      child: Row(
        children: [
          Icon(
            offline ? Icons.cloud_off : Icons.cloud_upload,
            size: 16,
            color: offline ? c.flag : c.accent,
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
              style: TextStyle(fontSize: 12, color: c.inkSoft),
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
            const SizedBox(
              height: 20,
              width: 20,
              child: CircularProgressIndicator(strokeWidth: 2),
            ),
            const SizedBox(height: 14),
            Text(label, style: Theme.of(context).textTheme.bodySmall),
          ],
        ),
      );
}

/// Cycles light -> dark -> match system, and says which it is on.
///
/// One button rather than three: a phone app bar has no room for a segmented
/// control, and the tooltip plus the semantic label carry the state that the
/// web client's radio group shows visually.
class ThemeToggleButton extends StatelessWidget {
  const ThemeToggleButton({super.key});

  @override
  Widget build(BuildContext context) {
    final controller = context.watch<ThemeController>();
    final (icon, label) = switch (controller.mode) {
      ThemeMode.light => (Icons.light_mode_outlined, 'Light theme'),
      ThemeMode.dark => (Icons.dark_mode_outlined, 'Dark theme'),
      ThemeMode.system => (Icons.brightness_auto_outlined, 'Theme matches your device'),
    };
    return IconButton(
      icon: Icon(icon),
      tooltip: '$label — tap to change',
      onPressed: controller.cycle,
    );
  }
}

/// Nominative-use trademark disclaimer, matching the web client's footer.
///
/// "SAT" is College Board's registered trademark. Using the name to describe
/// what this app prepares people for is permitted nominative use, but it has
/// to be clear the mark's owner is neither affiliated with nor endorsing this
/// product — the second clause is the part that does the work.
///
/// Scope note: this covers the *name* only. It is not a content licence and
/// says nothing about question provenance — see CLAUDE.md section 6.
class TrademarkNotice extends StatelessWidget {
  const TrademarkNotice({super.key});

  @override
  Widget build(BuildContext context) {
    final c = context.exam;
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 20),
      decoration: BoxDecoration(
        border: Border(top: BorderSide(color: c.line)),
      ),
      child: Text.rich(
        TextSpan(
          children: [
            const TextSpan(text: 'SAT'),
            WidgetSpan(
              alignment: PlaceholderAlignment.top,
              child: Transform.translate(
                offset: const Offset(0, -1),
                child: Text('®', style: TextStyle(fontSize: 8, color: c.inkFaint)),
              ),
            ),
            const TextSpan(
              text: ' is a trademark registered by the College Board, which is '
                  'not affiliated with, and does not endorse, this app.',
            ),
          ],
        ),
        textAlign: TextAlign.center,
        style: TextStyle(fontSize: 11.5, height: 1.5, color: c.inkFaint),
      ),
    );
  }
}
