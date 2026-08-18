import 'package:edunexus_mobile/screens/test_player_screen.dart';
import 'package:edunexus_mobile/timing.dart';
import 'package:edunexus_mobile/widgets/annotatable.dart';
import 'package:flutter_test/flutter_test.dart';

/// The Bluebook tools, at the level where they are actually decidable: the
/// offset arithmetic behind highlighting, the split between the two tools that
/// share one `annotations` column, and the stopwatch's delta accounting.

void main() {
  group('annotation runs', () {
    const text = 'The quick brown fox jumps over the lazy dog.';

    test('unmarked text is one run', () {
      final runs = toRuns(text, const []);
      expect(runs.length, 1);
      expect(runs.single.text, text);
      expect(runs.single.annotation, isNull);
    });

    test('a highlight splits the text into before, mark and after', () {
      final runs = toRuns(text, [
        {'kind': 'highlight', 'start': 4, 'end': 9, 'colour': 'yellow'},
      ]);

      expect(runs.map((r) => r.text).toList(), [
        'The ',
        'quick',
        ' brown fox jumps over the lazy dog.',
      ]);
      expect(runs[0].annotation, isNull);
      expect(runs[1].annotation!['colour'], 'yellow');
      expect(runs[2].annotation, isNull);
    });

    test('the concatenated runs always reproduce the source exactly', () {
      final runs = toRuns(text, [
        {'kind': 'highlight', 'start': 0, 'end': 3, 'colour': 'yellow'},
        {'kind': 'highlight', 'start': 10, 'end': 19, 'colour': 'blue'},
        {'kind': 'highlight', 'start': 16, 'end': 25, 'colour': 'green'},
      ]);
      expect(runs.map((r) => r.text).join(), text);
    });

    test('the later highlight wins where two overlap', () {
      // Painting over a mark with a fresh one is what the student just did.
      final runs = toRuns(text, [
        {'kind': 'highlight', 'start': 4, 'end': 15, 'colour': 'yellow'},
        {'kind': 'highlight', 'start': 4, 'end': 15, 'colour': 'green'},
      ]);
      final marked = runs.where((r) => r.annotation != null).toList();
      expect(marked.single.annotation!['colour'], 'green');
    });

    test('offsets past the end of the text do not throw', () {
      // Text can change under a stored annotation - an edited question, a
      // truncated payload. A stale offset must degrade, not crash the module.
      final runs = toRuns(text, [
        {'kind': 'highlight', 'start': 40, 'end': 900, 'colour': 'yellow'},
      ]);
      expect(runs.map((r) => r.text).join(), text);
    });
  });

  group('splitAnnotations', () {
    test('separates highlights from crossed-out choices', () {
      final marks = splitAnnotations([
        {'kind': 'highlight', 'start': 0, 'end': 4, 'colour': 'yellow'},
        {'kind': 'eliminated', 'choice': 'A'},
        {'kind': 'eliminated', 'choice': 'C'},
      ]);

      expect(marks.highlights.length, 1);
      expect(marks.eliminated, ['A', 'C']);
    });

    test('a null column is empty, not an error', () {
      final marks = splitAnnotations(null);
      expect(marks.highlights, isEmpty);
      expect(marks.eliminated, isEmpty);
    });

    test('a highlight written without a kind is still a highlight', () {
      // The column is stored opaquely, so it has to tolerate anything that is
      // not explicitly a cross-out.
      final marks = splitAnnotations([
        {'start': 0, 'end': 4, 'colour': 'blue'},
      ]);
      expect(marks.highlights.length, 1);
      expect(marks.eliminated, isEmpty);
    });
  });

  group('QuestionStopwatch', () {
    test('starts at zero and reports nothing', () {
      final watch = QuestionStopwatch();
      expect(watch.seconds, 0);
      expect(watch.takeDelta(), 0);
      expect(watch.isRunning, isFalse);
    });

    test('a delta is never handed out twice', () async {
      final watch = QuestionStopwatch()..start();
      await Future<void>.delayed(const Duration(milliseconds: 1100));
      watch.stop();

      final first = watch.takeDelta();
      expect(first, greaterThanOrEqualTo(1));
      // Nothing elapsed since, so the second call owes nothing.
      expect(watch.takeDelta(), 0);
    });

    test('stopping pauses rather than clearing what was spent', () async {
      final watch = QuestionStopwatch()..start();
      await Future<void>.delayed(const Duration(milliseconds: 1100));
      watch.stop();
      final shown = watch.seconds;

      await Future<void>.delayed(const Duration(milliseconds: 300));
      expect(watch.seconds, shown);
    });

    test('reset clears both the display and what is owed', () async {
      final watch = QuestionStopwatch()..start();
      await Future<void>.delayed(const Duration(milliseconds: 1100));
      watch.reset();

      expect(watch.seconds, 0);
      expect(watch.takeDelta(), 0);
      expect(watch.isRunning, isFalse);
    });
  });
}
