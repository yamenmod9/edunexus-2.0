/// Wall-clock seconds spent on one question.
///
/// Two numbers, for two different jobs. [seconds] is what the student sees.
/// The value [takeDelta] hands back is what gets reported to the server,
/// because a running total from a client only ever goes backwards when the app
/// is reinstalled or the attempt is resumed on another device — the server adds
/// deltas rather than trusting a total (see
/// `backend/app/services/attempt_service.py`).
///
/// Backed by [Stopwatch], which reads a monotonic clock: time the app spends
/// backgrounded still counts, and a device clock change cannot make a question
/// take negative time. Mirrors `web/src/hooks/useQuestionTimer.js`.
class QuestionStopwatch {
  final Stopwatch _watch = Stopwatch();

  /// Seconds already handed to a caller of [takeDelta].
  int _reported = 0;

  bool get isRunning => _watch.isRunning;

  int get seconds => _watch.elapsed.inSeconds;

  void start() => _watch.start();

  void stop() => _watch.stop();

  /// Starts a fresh question. Pausing is [stop]; this is a different question.
  void reset() {
    _watch
      ..stop()
      ..reset();
    _reported = 0;
  }

  /// Seconds elapsed since the last call. Never negative, never double-counted.
  int takeDelta() {
    final total = _watch.elapsed.inSeconds;
    final delta = total - _reported;
    _reported = total;
    return delta;
  }
}
