from flask import Blueprint, current_app, g, jsonify, request
from marshmallow import ValidationError

from app.auth import require_auth
from app.schemas import (
    response_schema,
    serialize_attempt,
    serialize_review,
    start_attempt_schema,
)
from app.services.attempt_service import (
    AttemptError,
    abandon_attempt,
    complete_current_module,
    get_attempt_for_user,
    list_attempts_for_user,
    open_attempt_for,
    record_response,
    start_attempt,
    submit_attempt,
    sync_timers,
)
from app.services.form_service import get_form
from app.services.scoring_service import ScoringError, score_attempt

bp = Blueprint("attempts", __name__, url_prefix="/api/attempts")


def _load_attempt(attempt_id):
    """Owner-scoped. Returns (attempt, error_response)."""
    attempt = get_attempt_for_user(g.current_user, attempt_id)
    if attempt is None:
        return None, (jsonify({"error": "attempt not found"}), 404)
    return attempt, None


@bp.post("")
@require_auth
def start_attempt_route():
    try:
        data = start_attempt_schema.load(request.get_json(force=True, silent=True) or {})
    except ValidationError as err:
        return jsonify({"errors": err.messages}), 422

    form = get_form(data["form_id"])
    # An inactive form reads as absent, matching GET /api/forms/<id>: a
    # retired form should not be distinguishable from one that never existed.
    if form is None or not form.is_active:
        return jsonify({"error": "form not found"}), 404

    try:
        attempt = start_attempt(
            g.current_user,
            form,
            current_app.config["ROUTING_THRESHOLD"],
            current_app.config["SCALE_TABLE_ID"],
        )
    except AttemptError as exc:
        return jsonify({"error": str(exc)}), exc.status

    return jsonify(serialize_attempt(attempt)), 201


@bp.get("")
@require_auth
def list_attempts_route():
    attempts = list_attempts_for_user(g.current_user)
    return jsonify(
        {
            "items": [
                {
                    "id": a.id,
                    "form_id": a.form_id,
                    "form_name": a.form.name,
                    "status": a.status,
                    "started_at": a.started_at.isoformat(),
                    "submitted_at": a.submitted_at.isoformat()
                    if a.submitted_at
                    else None,
                }
                for a in attempts
            ]
        }
    )


@bp.get("/current")
@require_auth
def current_attempt_route():
    """Resume endpoint: what the client calls on launch to find out whether a
    test is mid-flight, and how much time is left on it."""
    attempt = open_attempt_for(g.current_user)
    if attempt is None:
        return jsonify({"attempt": None})

    sync_timers(attempt)
    return jsonify({"attempt": serialize_attempt(attempt)})


@bp.get("/<attempt_id>")
@require_auth
def get_attempt_route(attempt_id):
    attempt, error = _load_attempt(attempt_id)
    if error:
        return error

    # Reading the attempt is also what rolls an expired module forward, so a
    # client that reconnects after a timeout sees the truth immediately.
    sync_timers(attempt)
    return jsonify(serialize_attempt(attempt))


@bp.put("/<attempt_id>/responses/<question_id>")
@require_auth
def record_response_route(attempt_id, question_id):
    attempt, error = _load_attempt(attempt_id)
    if error:
        return error

    try:
        data = response_schema.load(request.get_json(force=True, silent=True) or {})
    except ValidationError as err:
        return jsonify({"errors": err.messages}), 422

    try:
        response = record_response(
            attempt,
            question_id,
            answer=data.get("answer"),
            flagged=data.get("flagged"),
        )
    except AttemptError as exc:
        return jsonify({"error": str(exc)}), exc.status

    # Deliberately no grading result here - see attempt_schema.
    return jsonify(
        {
            "question_id": response.question_id,
            "position": response.position,
            "answer": response.answer,
            "answered": response.is_answered,
            "flagged": response.flagged,
            "seconds_remaining": attempt.current_module_attempt.seconds_remaining()
            if attempt.current_module_attempt
            else 0,
        }
    )


@bp.post("/<attempt_id>/module/complete")
@require_auth
def complete_module_route(attempt_id):
    attempt, error = _load_attempt(attempt_id)
    if error:
        return error

    try:
        complete_current_module(attempt)
    except AttemptError as exc:
        return jsonify({"error": str(exc)}), exc.status

    return jsonify(serialize_attempt(attempt))


@bp.post("/<attempt_id>/submit")
@require_auth
def submit_attempt_route(attempt_id):
    attempt, error = _load_attempt(attempt_id)
    if error:
        return error

    try:
        submit_attempt(attempt)
    except AttemptError as exc:
        return jsonify({"error": str(exc)}), exc.status

    return jsonify(serialize_attempt(attempt))


@bp.post("/<attempt_id>/abandon")
@require_auth
def abandon_attempt_route(attempt_id):
    attempt, error = _load_attempt(attempt_id)
    if error:
        return error

    try:
        abandon_attempt(attempt)
    except AttemptError as exc:
        return jsonify({"error": str(exc)}), exc.status

    return jsonify(serialize_attempt(attempt))


@bp.get("/<attempt_id>/review")
@require_auth
def review_attempt_route(attempt_id):
    attempt, error = _load_attempt(attempt_id)
    if error:
        return error

    sync_timers(attempt)
    if attempt.is_open:
        # The one gate that matters: answers and rationales exist in the
        # database from the first keystroke, and this is what keeps them there
        # until the attempt is over.
        return (
            jsonify({"error": "review is available once the attempt is submitted"}),
            409,
        )

    try:
        return jsonify(serialize_review(attempt))
    except ScoringError as exc:
        return jsonify({"error": str(exc)}), 500


@bp.get("/<attempt_id>/score")
@require_auth
def score_attempt_route(attempt_id):
    """The score report on its own, for a client that wants the result without
    pulling every question back down with it."""
    attempt, error = _load_attempt(attempt_id)
    if error:
        return error

    sync_timers(attempt)
    if attempt.is_open:
        return (
            jsonify({"error": "a score is available once the attempt is submitted"}),
            409,
        )

    try:
        return jsonify(score_attempt(attempt))
    except ScoringError as exc:
        # A missing or malformed table is an operator problem, not the
        # student's, and should not read as a client error.
        return jsonify({"error": str(exc)}), 500
