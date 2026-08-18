import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// The "Exam Calm" palette, carried over from the web client.
///
/// The hex values are deliberately identical to the CSS variables in
/// `web/src/index.css`: a student who practises on the phone and reviews on
/// the laptop should not experience two different products. Anything that
/// changes here has to change there too.
///
/// Material's [ColorScheme] covers roughly half of what these screens need —
/// it has no vocabulary for "the recessive rule between two rows" or "the
/// tint behind a flagged question" — so the rest lives in this extension
/// rather than being spelled as raw hex at each use, which is what the app
/// did before and what made a second theme impossible.
@immutable
class ExamColors extends ThemeExtension<ExamColors> {
  const ExamColors({
    required this.page,
    required this.surface,
    required this.sunken,
    required this.ink,
    required this.inkSoft,
    required this.inkFaint,
    required this.line,
    required this.lineStrong,
    required this.accent,
    required this.accentHover,
    required this.accentSoft,
    required this.onAccent,
    required this.good,
    required this.goodSoft,
    required this.bad,
    required this.badSoft,
    required this.flag,
    required this.flagSoft,
  });

  final Color page;
  final Color surface;
  final Color sunken;
  final Color ink;
  final Color inkSoft;
  final Color inkFaint;
  final Color line;
  final Color lineStrong;
  final Color accent;
  final Color accentHover;
  final Color accentSoft;
  final Color onAccent;
  final Color good;
  final Color goodSoft;
  final Color bad;
  final Color badSoft;
  final Color flag;
  final Color flagSoft;

  static const light = ExamColors(
    page: Color(0xFFFCFCFD),
    surface: Color(0xFFFFFFFF),
    sunken: Color(0xFFF6F7F9),
    ink: Color(0xFF16181D),
    inkSoft: Color(0xFF4A5260),
    // Solved for 4.5:1 against `page`. The direction's original #8B93A1 came
    // out at 3.01:1, which is a WCAG AA failure, not a taste question.
    inkFaint: Color(0xFF696F7D),
    line: Color(0xFFE4E6EA),
    lineStrong: Color(0xFFD7DADE),
    accent: Color(0xFF1F3A5F),
    accentHover: Color(0xFF16293F),
    accentSoft: Color(0xFFEEF2F7),
    onAccent: Color(0xFFFFFFFF),
    good: Color(0xFF1D6B4F),
    goodSoft: Color(0xFFEAF4EF),
    bad: Color(0xFFA12D2D),
    badSoft: Color(0xFFFBECEB),
    flag: Color(0xFF96661A),
    flagSoft: Color(0xFFFDF4E3),
  );

  /// Not an inversion of [light]: the navy accent is unreadable on a dark
  /// ground, so dark lifts it to a paler blue and re-solves the muted inks
  /// against the darker page.
  static const dark = ExamColors(
    page: Color(0xFF101216),
    surface: Color(0xFF171A1F),
    sunken: Color(0xFF1C2027),
    ink: Color(0xFFE8EAED),
    inkSoft: Color(0xFFB3BAC5),
    inkFaint: Color(0xFF848C9B),
    line: Color(0xFF262B33),
    lineStrong: Color(0xFF333A44),
    accent: Color(0xFF7AA2D1),
    accentHover: Color(0xFF9ABCE0),
    accentSoft: Color(0xFF1A2432),
    onAccent: Color(0xFF0D1420),
    good: Color(0xFF4EA87F),
    goodSoft: Color(0xFF14261E),
    bad: Color(0xFFD1706B),
    badSoft: Color(0xFF2A1717),
    flag: Color(0xFFD0A355),
    flagSoft: Color(0xFF2A2214),
  );

  @override
  ExamColors copyWith({
    Color? page,
    Color? surface,
    Color? sunken,
    Color? ink,
    Color? inkSoft,
    Color? inkFaint,
    Color? line,
    Color? lineStrong,
    Color? accent,
    Color? accentHover,
    Color? accentSoft,
    Color? onAccent,
    Color? good,
    Color? goodSoft,
    Color? bad,
    Color? badSoft,
    Color? flag,
    Color? flagSoft,
  }) {
    return ExamColors(
      page: page ?? this.page,
      surface: surface ?? this.surface,
      sunken: sunken ?? this.sunken,
      ink: ink ?? this.ink,
      inkSoft: inkSoft ?? this.inkSoft,
      inkFaint: inkFaint ?? this.inkFaint,
      line: line ?? this.line,
      lineStrong: lineStrong ?? this.lineStrong,
      accent: accent ?? this.accent,
      accentHover: accentHover ?? this.accentHover,
      accentSoft: accentSoft ?? this.accentSoft,
      onAccent: onAccent ?? this.onAccent,
      good: good ?? this.good,
      goodSoft: goodSoft ?? this.goodSoft,
      bad: bad ?? this.bad,
      badSoft: badSoft ?? this.badSoft,
      flag: flag ?? this.flag,
      flagSoft: flagSoft ?? this.flagSoft,
    );
  }

  @override
  ExamColors lerp(ExamColors? other, double t) {
    if (other == null) return this;
    Color mix(Color a, Color b) => Color.lerp(a, b, t)!;
    return ExamColors(
      page: mix(page, other.page),
      surface: mix(surface, other.surface),
      sunken: mix(sunken, other.sunken),
      ink: mix(ink, other.ink),
      inkSoft: mix(inkSoft, other.inkSoft),
      inkFaint: mix(inkFaint, other.inkFaint),
      line: mix(line, other.line),
      lineStrong: mix(lineStrong, other.lineStrong),
      accent: mix(accent, other.accent),
      accentHover: mix(accentHover, other.accentHover),
      accentSoft: mix(accentSoft, other.accentSoft),
      onAccent: mix(onAccent, other.onAccent),
      good: mix(good, other.good),
      goodSoft: mix(goodSoft, other.goodSoft),
      bad: mix(bad, other.bad),
      badSoft: mix(badSoft, other.badSoft),
      flag: mix(flag, other.flag),
      flagSoft: mix(flagSoft, other.flagSoft),
    );
  }
}

/// `context.exam.inkFaint` rather than
/// `Theme.of(context).extension<ExamColors>()!.inkFaint` at ~200 call sites.
extension ExamTheme on BuildContext {
  ExamColors get exam =>
      Theme.of(this).extension<ExamColors>() ?? ExamColors.light;
}

/// Serif carries anything a student *reads*: titles, passages, question stems,
/// score numerals. Sans carries anything they *operate*.
///
/// Flutter resolves font families through the host platform, and no single
/// name exists everywhere — Georgia ships on iOS, macOS and Windows but not on
/// stock Android, where the generic `serif` maps to Noto Serif. The stack
/// covers all four targets, so no font has to be bundled.
const List<String> serifStack = <String>[
  'Georgia',
  'Iowan Old Style',
  'Times New Roman',
  'Noto Serif',
  'serif',
];

const TextStyle _serif = TextStyle(
  fontFamily: 'Georgia',
  fontFamilyFallback: serifStack,
);

/// A serif style for read content, at the given size and weight.
TextStyle serif({
  required double size,
  FontWeight weight = FontWeight.w400,
  double? height,
  Color? color,
  double? letterSpacing,
}) {
  return _serif.copyWith(
    fontSize: size,
    fontWeight: weight,
    height: height,
    color: color,
    letterSpacing: letterSpacing,
  );
}

ThemeData buildTheme(Brightness brightness) {
  final c = brightness == Brightness.dark ? ExamColors.dark : ExamColors.light;

  final scheme = ColorScheme(
    brightness: brightness,
    primary: c.accent,
    onPrimary: c.onAccent,
    primaryContainer: c.accentSoft,
    onPrimaryContainer: c.accent,
    secondary: c.accent,
    onSecondary: c.onAccent,
    error: c.bad,
    // The page colour, not white: dark mode's bad is a light red, and white on
    // it is unreadable. Same reasoning as the web client's `text-page` pips.
    onError: c.page,
    errorContainer: c.badSoft,
    onErrorContainer: c.bad,
    surface: c.surface,
    onSurface: c.ink,
    surfaceContainerHighest: c.sunken,
    onSurfaceVariant: c.inkSoft,
    outline: c.lineStrong,
    outlineVariant: c.line,
  );

  return ThemeData(
    brightness: brightness,
    colorScheme: scheme,
    scaffoldBackgroundColor: c.page,
    extensions: <ThemeExtension<dynamic>>[c],
    // Cards are a hairline ring on a flat ground, never a shadow: elevation
    // implies a stack of surfaces this design does not have.
    cardTheme: CardThemeData(
      elevation: 0,
      color: c.surface,
      surfaceTintColor: Colors.transparent,
      margin: const EdgeInsets.only(bottom: 12),
      shape: RoundedRectangleBorder(
        borderRadius: const BorderRadius.all(Radius.circular(10)),
        side: BorderSide(color: c.line),
      ),
    ),
    appBarTheme: AppBarTheme(
      backgroundColor: c.surface,
      foregroundColor: c.ink,
      surfaceTintColor: Colors.transparent,
      elevation: 0,
      scrolledUnderElevation: 0,
      shape: Border(bottom: BorderSide(color: c.line)),
      titleTextStyle: serif(size: 19, weight: FontWeight.w700, color: c.ink),
    ),
    dividerTheme: DividerThemeData(color: c.line, thickness: 1, space: 1),
    textTheme: Typography.material2021(platform: TargetPlatform.android)
        .black
        .apply(bodyColor: c.ink, displayColor: c.ink)
        .copyWith(
          // Headings are read, so they are serif.
          headlineSmall: serif(
            size: 26,
            weight: FontWeight.w700,
            letterSpacing: -0.5,
            color: c.ink,
          ),
          titleLarge: serif(size: 20, weight: FontWeight.w700, color: c.ink),
          titleMedium: const TextStyle(fontSize: 15, fontWeight: FontWeight.w600),
          bodyMedium: TextStyle(fontSize: 14, color: c.ink),
          bodySmall: TextStyle(fontSize: 12.5, color: c.inkFaint),
          labelLarge: const TextStyle(fontSize: 14, fontWeight: FontWeight.w500),
        ),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        backgroundColor: c.accent,
        foregroundColor: c.onAccent,
        disabledBackgroundColor: c.lineStrong,
        disabledForegroundColor: c.inkFaint,
        shape: const RoundedRectangleBorder(
          borderRadius: BorderRadius.all(Radius.circular(6)),
        ),
        padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 14),
        textStyle: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600),
      ),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(
        foregroundColor: c.ink,
        side: BorderSide(color: c.lineStrong),
        shape: const RoundedRectangleBorder(
          borderRadius: BorderRadius.all(Radius.circular(6)),
        ),
        padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 14),
        textStyle: const TextStyle(fontSize: 14, fontWeight: FontWeight.w500),
      ),
    ),
    textButtonTheme: TextButtonThemeData(
      style: TextButton.styleFrom(foregroundColor: c.accent),
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: c.surface,
      contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
      border: OutlineInputBorder(
        borderRadius: const BorderRadius.all(Radius.circular(6)),
        borderSide: BorderSide(color: c.lineStrong),
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: const BorderRadius.all(Radius.circular(6)),
        borderSide: BorderSide(color: c.lineStrong),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: const BorderRadius.all(Radius.circular(6)),
        borderSide: BorderSide(color: c.accent, width: 1.5),
      ),
      labelStyle: TextStyle(color: c.inkSoft),
      hintStyle: TextStyle(color: c.inkFaint),
    ),
    radioTheme: RadioThemeData(
      fillColor: WidgetStateProperty.resolveWith(
        (states) => states.contains(WidgetState.selected) ? c.accent : c.lineStrong,
      ),
    ),
    progressIndicatorTheme: ProgressIndicatorThemeData(
      color: c.accent,
      linearTrackColor: c.line,
    ),
    snackBarTheme: SnackBarThemeData(
      backgroundColor: c.ink,
      contentTextStyle: TextStyle(color: c.page),
    ),
  );
}

/// The student's theme preference.
///
/// Three-valued rather than a boolean on purpose: storing a resolved
/// light/dark would freeze someone who picked "match my device" into whichever
/// mode the device happened to be in, and stop them following it when it
/// changes. The web client makes the same distinction, for the same reason.
class ThemeController extends ChangeNotifier {
  /// The store is a positional optional rather than a named one because Dart
  /// forbids private named parameters, and `prefer_initializing_formals` wants
  /// the formal to write the field directly.
  ThemeController([this._prefs]);

  static const storageKey = 'edunexus.theme';

  SharedPreferences? _prefs;
  ThemeMode _mode = ThemeMode.system;

  ThemeMode get mode => _mode;

  Future<void> load() async {
    _prefs ??= await SharedPreferences.getInstance();
    _mode = _parse(_prefs?.getString(storageKey));
    notifyListeners();
  }

  Future<void> setMode(ThemeMode mode) async {
    if (mode == _mode) return;
    _mode = mode;
    notifyListeners();
    _prefs ??= await SharedPreferences.getInstance();
    await _prefs?.setString(storageKey, mode.name);
  }

  /// Steps light -> dark -> system, the order the single-button control cycles.
  Future<void> cycle() => setMode(switch (_mode) {
        ThemeMode.light => ThemeMode.dark,
        ThemeMode.dark => ThemeMode.system,
        ThemeMode.system => ThemeMode.light,
      });

  static ThemeMode _parse(String? stored) => switch (stored) {
        'light' => ThemeMode.light,
        'dark' => ThemeMode.dark,
        _ => ThemeMode.system,
      };
}
