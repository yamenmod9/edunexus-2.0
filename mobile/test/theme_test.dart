import 'package:edunexus_mobile/theme.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// The theme layer is new surface with real state in it — a stored preference
/// that has to survive a restart, and two palettes that the whole app now
/// reads through. Both are worth pinning.
void main() {
  group('buildTheme', () {
    test('registers the matching palette for each brightness', () {
      final light = buildTheme(Brightness.light);
      final dark = buildTheme(Brightness.dark);

      expect(light.extension<ExamColors>(), same(ExamColors.light));
      expect(dark.extension<ExamColors>(), same(ExamColors.dark));

      // The scaffold has to paint the palette's page colour, or every screen
      // sits on Material's default grey and the theme only half applies.
      expect(light.scaffoldBackgroundColor, ExamColors.light.page);
      expect(dark.scaffoldBackgroundColor, ExamColors.dark.page);
    });

    test('dark is not an inversion — the accent is re-solved, not flipped', () {
      // The navy accent is unreadable on a dark ground. If these ever became
      // the same value, dark mode would have been built by inverting the
      // light palette, which is the mistake this asserts against.
      expect(ExamColors.dark.accent, isNot(ExamColors.light.accent));
      expect(ExamColors.dark.page.computeLuminance(),
          lessThan(ExamColors.light.page.computeLuminance()));
      expect(ExamColors.dark.ink.computeLuminance(),
          greaterThan(ExamColors.light.ink.computeLuminance()));
    });

    test('muted ink clears WCAG AA against its own page in both themes', () {
      // The first cut of this palette shipped #8B93A1 on #FCFCFD, which is
      // 3.01:1 — a real failure, caught by axe on the web client. The fix has
      // to hold on mobile too, where nothing scans it automatically.
      double contrast(Color a, Color b) {
        final la = a.computeLuminance();
        final lb = b.computeLuminance();
        final hi = la > lb ? la : lb;
        final lo = la > lb ? lb : la;
        return (hi + 0.05) / (lo + 0.05);
      }

      for (final palette in [ExamColors.light, ExamColors.dark]) {
        expect(contrast(palette.inkFaint, palette.page), greaterThanOrEqualTo(4.5));
        expect(contrast(palette.inkSoft, palette.surface), greaterThanOrEqualTo(4.5));
        expect(contrast(palette.ink, palette.page), greaterThanOrEqualTo(4.5));
      }
    });
  });

  group('ThemeController', () {
    test('defaults to following the device', () async {
      SharedPreferences.setMockInitialValues({});
      final controller = ThemeController(await SharedPreferences.getInstance());
      await controller.load();
      expect(controller.mode, ThemeMode.system);
    });

    test('stores the choice as light/dark/system, never a resolved boolean',
        () async {
      // A boolean would freeze someone who picked "match my device" into
      // whichever mode the device was in, and stop them following it after.
      SharedPreferences.setMockInitialValues({});
      final prefs = await SharedPreferences.getInstance();
      final controller = ThemeController(prefs);
      await controller.load();

      await controller.setMode(ThemeMode.dark);
      expect(prefs.getString(ThemeController.storageKey), 'dark');

      await controller.setMode(ThemeMode.system);
      expect(prefs.getString(ThemeController.storageKey), 'system');
    });

    test('reloads what was stored', () async {
      SharedPreferences.setMockInitialValues({
        ThemeController.storageKey: 'light',
      });
      final controller = ThemeController(await SharedPreferences.getInstance());
      await controller.load();
      expect(controller.mode, ThemeMode.light);
    });

    test('an unrecognised stored value falls back to system', () async {
      SharedPreferences.setMockInitialValues({
        ThemeController.storageKey: 'sepia',
      });
      final controller = ThemeController(await SharedPreferences.getInstance());
      await controller.load();
      expect(controller.mode, ThemeMode.system);
    });

    test('cycles light -> dark -> system and notifies each time', () async {
      SharedPreferences.setMockInitialValues({
        ThemeController.storageKey: 'light',
      });
      final controller = ThemeController(await SharedPreferences.getInstance());
      await controller.load();

      var notifications = 0;
      controller.addListener(() => notifications += 1);

      await controller.cycle();
      expect(controller.mode, ThemeMode.dark);
      await controller.cycle();
      expect(controller.mode, ThemeMode.system);
      await controller.cycle();
      expect(controller.mode, ThemeMode.light);
      expect(notifications, 3);
    });
  });
}
