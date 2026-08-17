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
/// indistinguishable from sending it once. Only the newest answer per question
/// is kept, since a student who changes their mind offline means the earlier
/// answer was never true.
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

  void _replace(PendingAnswer answer) {
    _pending.removeWhere((e) =>
        e.attemptId == answer.attemptId && e.questionId == answer.questionId);
    _pending.add(answer);
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
      _replace(answer);
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
