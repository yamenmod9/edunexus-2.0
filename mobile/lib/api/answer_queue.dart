import 'dart:async';
import 'dart:convert';

import 'package:shared_preferences/shared_preferences.dart';

import 'api_client.dart';

/// A single answer waiting to reach the server.
class PendingAnswer {
  PendingAnswer({
    required this.attemptId,
    required this.questionId,
    required this.payload,
  });

  final String attemptId;
  final String questionId;
  final Map<String, dynamic> payload;

  Map<String, dynamic> toJson() => {
        'attempt_id': attemptId,
        'question_id': questionId,
        'payload': payload,
      };

  static PendingAnswer fromJson(Map<String, dynamic> json) => PendingAnswer(
        attemptId: json['attempt_id'] as String,
        questionId: json['question_id'] as String,
        payload: Map<String, dynamic>.from(json['payload'] as Map),
      );
}

/// Holds answers that could not be sent, and replays them when the network
/// comes back (roadmap task 6.4).
///
/// Replay is safe because `PUT /responses/<id>` is idempotent - it sets the
/// answer rather than appending one - so sending the same answer twice is
/// indistinguishable from sending it once. One entry is kept per question,
/// with later payloads folded into it field by field (see [_merge]) - a
/// student who changes their mind offline means the earlier answer was never
/// true, but marking a question for review does not unsay the answer.
///
/// The queue survives the app being killed: on a phone, "lost connection" and
/// "the OS reclaimed the app" happen together often enough that keeping this
/// only in memory would lose real answers.
class AnswerQueue {
  AnswerQueue(this._client, {this._prefs});


  static const _storageKey = 'edunexus.pending_answers';

  final ApiClient _client;
  SharedPreferences? _prefs;

  final List<PendingAnswer> _pending = [];
  final _changes = StreamController<int>.broadcast();
  bool _flushing = false;

  /// Emits the pending count whenever it changes, so the UI can show it.
  Stream<int> get pendingCount => _changes.stream;
  int get length => _pending.length;
  bool get isEmpty => _pending.isEmpty;

  Future<void> load() async {
    _prefs ??= await SharedPreferences.getInstance();
    final raw = _prefs!.getString(_storageKey);
    if (raw == null) return;
    try {
      final decoded = jsonDecode(raw) as List<dynamic>;
      _pending
        ..clear()
        ..addAll(decoded
            .map((e) => PendingAnswer.fromJson(Map<String, dynamic>.from(e))));
      _notify();
    } catch (_) {
      // A corrupt queue must not brick the app on launch; drop it and move on.
      await _prefs!.remove(_storageKey);
    }
  }

  void _notify() {
    if (!_changes.isClosed) _changes.add(_pending.length);
  }

  Future<void> _persist() async {
    _prefs ??= await SharedPreferences.getInstance();
    if (_pending.isEmpty) {
      await _prefs!.remove(_storageKey);
    } else {
      await _prefs!.setString(
        _storageKey,
        jsonEncode(_pending.map((e) => e.toJson()).toList()),
      );
    }
  }

  /// Folds a new payload into whatever is already queued for that question.
  ///
  /// Merged, not replaced. One question carries several independent fields —
  /// the answer, the review mark, the highlights and cross-outs — and each
  /// arrives as its own one-key payload. Replacing would mean a student who
  /// answers and then marks the question offline loses the answer: the mark's
  /// payload has no `answer` key, so the server never hears about it. Merging
  /// is safe because `PUT /responses/<id>` sets fields rather than appending,
  /// and a later value for the same field is the one the student meant.
  void _merge(PendingAnswer answer) {
    final index = _pending.indexWhere((e) =>
        e.attemptId == answer.attemptId && e.questionId == answer.questionId);
    if (index < 0) {
      _pending.add(answer);
      return;
    }
    _pending[index] = PendingAnswer(
      attemptId: answer.attemptId,
      questionId: answer.questionId,
      payload: {..._pending[index].payload, ...answer.payload},
    );
  }

  /// Sends an answer, queueing it if the network is unreachable.
  ///
  /// Returns true when the server accepted it. Returns false when it was
  /// queued - the caller should keep showing the answer as chosen, because it
  /// is: it is recorded locally and will reach the server.
  ///
  /// A rejection with a status (410, 404, 409) is NOT queued and is rethrown:
  /// the server has decided something about the attempt - the module moved on,
  /// the time ran out - and retrying cannot change its mind.
  Future<bool> submit(
    String attemptId,
    String questionId,
    Map<String, dynamic> payload,
  ) async {
    final answer = PendingAnswer(
      attemptId: attemptId,
      questionId: questionId,
      payload: payload,
    );

    try {
      await _client.respond(attemptId, questionId, payload);
      return true;
    } on ApiException catch (error) {
      if (!error.isOffline) rethrow;
      _merge(answer);
      await _persist();
      _notify();
      return false;
    }
  }

  /// Replays everything queued, oldest first. Stops at the first offline
  /// failure so ordering is preserved; drops answers the server rejects,
  /// because a rejection will not become an acceptance on the next try.
  ///
  /// Returns the answers the server refused, so the UI can tell the student
  /// their late answers did not count rather than silently discarding them.
  Future<List<PendingAnswer>> flush() async {
    if (_flushing || _pending.isEmpty) return const [];
    _flushing = true;
    final rejected = <PendingAnswer>[];

    try {
      while (_pending.isNotEmpty) {
        final next = _pending.first;
        try {
          await _client.respond(next.attemptId, next.questionId, next.payload);
          _pending.removeAt(0);
        } on ApiException catch (error) {
          if (error.isOffline) break; // still offline; keep the rest queued
          rejected.add(next);
          _pending.removeAt(0);
        }
      }
      await _persist();
      _notify();
    } finally {
      _flushing = false;
    }
    return rejected;
  }

  /// Answers queued for one attempt, so the player can show them as chosen
  /// even before they reach the server.
  Map<String, Map<String, dynamic>> pendingFor(String attemptId) {
    return {
      for (final answer in _pending)
        if (answer.attemptId == attemptId) answer.questionId: answer.payload,
    };
  }

  Future<void> clear() async {
    _pending.clear();
    await _persist();
    _notify();
  }

  void dispose() => _changes.close();
}
