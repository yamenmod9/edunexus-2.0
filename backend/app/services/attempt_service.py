"""The adaptive attempt state machine.

Owns everything the client is not trusted with: which module comes next, which
module 2 variant a student earns, when a module is out of time, and whether an
answer was correct. Per CLAUDE.md section 7 none of this may move to a client.

Module order across an attempt is fixed and one-way:

    1  Reading & Writing module 1  (same for everyone)
    2  Reading & Writing module 2  (routed from module 1)
    3  Math module 1               (same for everyone)
    4  Math module 2               (routed from module 3)
"""

from datetime import datetime, timezone

from app.extensions import db
from app.models import (
    MODULE_1_VARIANT,
    MODULES_PER_SECTION,
    SECTION_ORDER,
    AnswerResponse,
    ModuleAttempt,
    TestAttempt,
)
from app.services.grading_service import grade
from app.services.routing_service import decide_variant


class AttemptError(Exception):
    """A client-correctable problem. `status` is the HTTP status to return."""

    def __init__(self, message, status=409):
        super().__init__(message)
        self.status = status


def _utcnow():
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _slot_for(order_index):
    """Maps an attempt-wide module index (1..4) to (section, sequence)."""
    section = SECTION_ORDER[(order_index - 1) // MODULES_PER_SECTION]
    sequence = (order_index - 1) % MODULES_PER_SECTION + 1
    return section, sequence


def _total_modules():
    return len(SECTION_ORDER) * MODULES_PER_SECTION


# --- starting ----------------------------------------------------------


def open_attempt_for(user):
    return (
        db.session.query(TestAttempt)
        .filter_by(user_id=user.id, status="in_progress")
        .first()
    )


def start_attempt(user, form, threshold):
    """Creates the attempt and opens module 1. One attempt at a time per user:
    a second live attempt would let a student scout a form's module 1, abandon,
    and restart knowing the questions."""
    existing = open_attempt_for(user)
    if existing is not None:
        raise AttemptError(
            "an attempt is already in progress; submit or abandon it first"
        )

    if not form.is_active:
        raise AttemptError("this form is not available", status=422)
    if not form.is_complete():
        raise AttemptError("this form is incomplete and cannot be started", status=422)

    attempt = TestAttempt(
        user_id=user.id,
        # Assigned through the relationship, not form_id: _open_module reads
        # attempt.form before this row is flushed.
        form=form,
        status="in_progress",
        routing_threshold=threshold,
        started_at=_utcnow(),
    )
    db.session.add(attempt)

    _open_module(attempt, order_index=1, variant=MODULE_1_VARIANT, start_at=attempt.started_at)
    db.session.commit()
    return attempt


def _open_module(attempt, order_index, variant, start_at, routing=None):
    section, sequence = _slot_for(order_index)
    module = attempt.form.module_for(section, sequence, variant)
    if module is None:
        raise AttemptError(
            "form {} has no {} module {} ({})".format(
                attempt.form_id, section, sequence, variant
            ),
            status=500,
        )

    module_attempt = ModuleAttempt(
        attempt=attempt,
        module_id=module.id,
        order_index=order_index,
        status="in_progress",
        started_at=start_at,
        expires_at=ModuleAttempt.deadline_from(start_at, module.time_limit_seconds),
    )
    if routing is not None:
        module_attempt.routed_from_raw = routing.raw_correct
        module_attempt.routed_from_total = routing.total
        module_attempt.routed_ratio = routing.ratio
        module_attempt.routed_threshold = routing.threshold
    db.session.add(module_attempt)

    # Responses are created up front so the client can navigate, flag and
    # revisit questions before answering any of them.
    for form_question in module.form_questions:
        db.session.add(
            AnswerResponse(
                module_attempt=module_attempt,
                question_id=form_question.question_id,
                position=form_question.position,
            )
        )

    return module_attempt


# --- advancing ---------------------------------------------------------


def _grade_module(module_attempt):
    module_attempt.raw_correct = sum(
        1 for response in module_attempt.responses if response.is_correct
    )
    return module_attempt.raw_correct


def _close_module(module_attempt, status, at):
    module_attempt.status = status
    module_attempt.completed_at = at
    _grade_module(module_attempt)


def _advance(attempt, finished, start_next_at):
    """Opens whatever follows `finished`, or submits the attempt if it was the
    last module. Returns the new ModuleAttempt, or None when the attempt ends.
    """
    next_index = finished.order_index + 1
    if next_index > _total_modules():
        attempt.status = "submitted"
        attempt.submitted_at = start_next_at
        return None

    _, sequence = _slot_for(next_index)
    if sequence == 1:
        # First module of the next section: everyone gets the same one.
        return _open_module(
            attempt, next_index, MODULE_1_VARIANT, start_next_at
        )

    decision = decide_variant(
        raw_correct=finished.raw_correct or 0,
        total=len(finished.responses),
        threshold=attempt.routing_threshold,
    )
    return _open_module(
        attempt, next_index, decision.variant, start_next_at, routing=decision
    )


def sync_timers(attempt, now=None):
    """Closes out any module whose deadline has passed and opens the next one.

    A module that ran out while the client was away must not hand the student
    a fresh clock on the next module, so the next module starts at the previous
    one's deadline, not at `now`. That also means a long absence can expire
    several modules in one pass, hence the loop.
    """
    if not attempt.is_open:
        return attempt

    now = now or _utcnow()
    rolled = False
    while True:
        current = attempt.current_module_attempt
        if current is None or not current.is_expired(now):
            break
        deadline = current.expires_at
        _close_module(current, "expired", deadline)
        _advance(attempt, current, deadline)
        rolled = True

    # Every read of an attempt calls this, and the overwhelming majority find
    # nothing expired; committing unconditionally would write on every poll.
    if rolled:
        db.session.commit()
    return attempt


def complete_current_module(attempt):
    """Student-initiated early finish of the module they are on."""
    sync_timers(attempt)
    if not attempt.is_open:
        raise AttemptError("this attempt is already finished")

    current = attempt.current_module_attempt
    if current is None:
        raise AttemptError("no module is currently open")

    now = _utcnow()
    _close_module(current, "completed", now)
    _advance(attempt, current, now)
    db.session.commit()
    return attempt


def abandon_attempt(attempt):
    if not attempt.is_open:
        raise AttemptError("this attempt is already finished")
    now = _utcnow()
    current = attempt.current_module_attempt
    if current is not None:
        _close_module(current, "completed", now)
    attempt.status = "abandoned"
    attempt.submitted_at = now
    db.session.commit()
    return attempt


def submit_attempt(attempt):
    """Finishes the whole attempt from wherever the student is. Modules not
    reached stay absent; modules partly done are graded on what was answered.
    """
    sync_timers(attempt)
    if not attempt.is_open:
        raise AttemptError("this attempt is already finished")

    now = _utcnow()
    current = attempt.current_module_attempt
    if current is not None:
        _close_module(current, "completed", now)
    attempt.status = "submitted"
    attempt.submitted_at = now
    db.session.commit()
    return attempt


# --- answering ---------------------------------------------------------


def record_response(attempt, question_id, answer=None, flagged=None):
    """Records (or changes) an answer to a question in the *current* module.

    Grading happens here, server-side, and the result is stored but never
    returned - see the delivery schemas. Questions in already-closed modules
    are not writable: going back to a finished module is exactly what the
    adaptive format forbids.
    """
    sync_timers(attempt)
    if not attempt.is_open:
        raise AttemptError("this attempt is already finished")

    current = attempt.current_module_attempt
    if current is None:
        raise AttemptError("no module is currently open")
    if current.is_expired():
        # sync_timers already rolled forward; reaching here means the deadline
        # passed between that call and this one.
        raise AttemptError("this module is out of time")

    response = next(
        (r for r in current.responses if r.question_id == question_id), None
    )
    if response is None:
        # 404 rather than 403: whether a question exists in some other module
        # is not something an in-progress attempt should reveal.
        raise AttemptError("that question is not in the current module", status=404)

    if flagged is not None:
        response.flagged = bool(flagged)

    if answer is not None:
        cleared = answer == ""
        response.answer = None if cleared else answer
        response.is_correct = None if cleared else grade(response.question, answer)
        response.answered_at = None if cleared else _utcnow()

    db.session.commit()
    return response


# --- reading -----------------------------------------------------------


def get_attempt_for_user(user, attempt_id):
    """Owner-scoped lookup. Returns None for someone else's attempt rather
    than 403, so ids cannot be probed."""
    attempt = db.session.get(TestAttempt, attempt_id)
    if attempt is None or attempt.user_id != user.id:
        return None
    return attempt


def list_attempts_for_user(user):
    return (
        db.session.query(TestAttempt)
        .filter_by(user_id=user.id)
        # `id` only breaks ties: the system clock has coarser resolution than
        # a round trip on some platforms, so two rows can share started_at and
        # the order would otherwise vary between calls.
        .order_by(TestAttempt.started_at.desc(), TestAttempt.id.desc())
        .all()
    )


def question_ids_in_open_attempts(user):
    """Every question the user can currently see in a live attempt. Practice
    mode uses this to refuse to grade - and so reveal the answer to - a
    question that is sitting in front of the student in a real test."""
    attempt = open_attempt_for(user)
    if attempt is None:
        return set()
    return {
        response.question_id
        for module_attempt in attempt.module_attempts
        for response in module_attempt.responses
    }
