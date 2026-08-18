"""Serialization for the test engine.

The important rule lives here: what a student is allowed to see *during* an
attempt is an explicit allowlist, not a blocklist. A new column on Question
must be opted into delivery deliberately - the default has to be that it stays
hidden, because the failure mode of getting this backwards is leaking the
answer key.
"""

from marshmallow import Schema, ValidationError, fields, validate, validates_schema

from app.models import MODULES_PER_SECTION, SECTION_ORDER
from app.services.scoring_service import score_attempt

# Fields a student may see while the question is live in front of them.
# `correct_answer` and `rationale` are the obvious exclusions. `difficulty` is
# excluded too: a module 2 made of hard questions would otherwise tell the
# student they routed up, which is information the score report owns.
DELIVERED_QUESTION_FIELDS = (
    "id",
    "section",
    "domain",
    "skill",
    "question_type",
    "stimulus",
    "stem",
    "choices",
    "figure_url",
)


def serialize_delivered_question(question):
    return {field: getattr(question, field) for field in DELIVERED_QUESTION_FIELDS}


def serialize_reviewed_question(question):
    """Post-submission view: everything, including the key."""
    payload = serialize_delivered_question(question)
    payload.update(
        {
            "difficulty": question.difficulty,
            "correct_answer": question.correct_answer,
            "rationale": question.rationale,
        }
    )
    return payload


def _serialize_response_progress(response):
    """In-attempt view of the student's own work: what they picked and whether
    they flagged it. Deliberately no `is_correct` - it is graded and stored the
    moment they answer, and echoing it back would turn the test into an
    answer-checking oracle."""
    return {
        "question_id": response.question_id,
        "position": response.position,
        "answer": response.answer,
        "answered": response.is_answered,
        "flagged": response.flagged,
        "seconds_spent": response.seconds_spent or 0,
        "annotations": response.annotations or [],
    }


def serialize_current_module(module_attempt, now=None):
    module = module_attempt.module
    return {
        "module_attempt_id": module_attempt.id,
        "order_index": module_attempt.order_index,
        "section": module.section,
        "sequence": module.sequence,
        "question_count": len(module_attempt.responses),
        "time_limit_seconds": module.time_limit_seconds,
        "expires_at": module_attempt.expires_at.isoformat(),
        "seconds_remaining": module_attempt.seconds_remaining(now),
        "questions": [
            serialize_delivered_question(response.question)
            for response in module_attempt.responses
        ],
        "responses": [
            _serialize_response_progress(response)
            for response in module_attempt.responses
        ],
    }


def serialize_attempt(attempt, now=None):
    """The state a client needs to render or resume an attempt."""
    current = attempt.current_module_attempt
    payload = {
        "id": attempt.id,
        "form_id": attempt.form_id,
        "form_name": attempt.form.name,
        "status": attempt.status,
        "started_at": attempt.started_at.isoformat(),
        "submitted_at": attempt.submitted_at.isoformat()
        if attempt.submitted_at
        else None,
        "modules_total": len(SECTION_ORDER) * MODULES_PER_SECTION,
        "modules_completed": sum(
            1 for m in attempt.module_attempts if m.status != "in_progress"
        ),
        "current_module": serialize_current_module(current, now) if current else None,
    }
    if not attempt.is_open:
        # Matches the review route, which gates on the attempt being finished
        # rather than on how it finished - an abandoned attempt is reviewable.
        payload["review_available"] = True
    return payload


def serialize_review(attempt):
    """Only ever called once the attempt is finished. Carries the score report
    inline so a client does not need a second round trip to show a result
    alongside the question-by-question review."""
    modules = []
    for module_attempt in attempt.module_attempts:
        module = module_attempt.module
        modules.append(
            {
                "order_index": module_attempt.order_index,
                "section": module.section,
                "sequence": module.sequence,
                "variant": module.variant,
                "status": module_attempt.status,
                "raw_correct": module_attempt.raw_correct,
                "question_count": len(module_attempt.responses),
                "started_at": module_attempt.started_at.isoformat(),
                "completed_at": module_attempt.completed_at.isoformat()
                if module_attempt.completed_at
                else None,
                "routing": {
                    "raw_correct": module_attempt.routed_from_raw,
                    "total": module_attempt.routed_from_total,
                    "ratio": module_attempt.routed_ratio,
                    "threshold": module_attempt.routed_threshold,
                    "variant": module.variant,
                }
                if module_attempt.routed_from_total is not None
                else None,
                "questions": [
                    {
                        "position": response.position,
                        "question": serialize_reviewed_question(response.question),
                        "answer": response.answer,
                        "is_correct": bool(response.is_correct),
                        "flagged": response.flagged,
                        "seconds_spent": response.seconds_spent or 0,
                    }
                    for response in module_attempt.responses
                ],
            }
        )

    return {
        "id": attempt.id,
        "form_id": attempt.form_id,
        "form_name": attempt.form.name,
        "status": attempt.status,
        "submitted_at": attempt.submitted_at.isoformat()
        if attempt.submitted_at
        else None,
        "routing_threshold": attempt.routing_threshold,
        "modules": modules,
        "raw_correct_by_section": {
            section: sum(
                m.raw_correct or 0
                for m in attempt.module_attempts
                if m.module.section == section
            )
            for section in SECTION_ORDER
        },
        "score": score_attempt(attempt),
    }


class StartAttemptSchema(Schema):
    form_id = fields.Str(required=True, validate=validate.Length(min=1))


class ResponseSchema(Schema):
    # An empty-string answer is meaningful: it clears a previous answer.
    answer = fields.Str(required=False, allow_none=True)
    flagged = fields.Bool(required=False)
    # A delta in seconds since the last report, not a running total: totals
    # from a client can only ever go backwards when a tab is reopened.
    seconds_spent = fields.Int(
        required=False, validate=validate.Range(min=0, max=3600)
    )
    # Free-form on purpose; the server does not interpret annotations.
    annotations = fields.List(fields.Dict(), required=False)

    @validates_schema
    def require_something(self, data, **kwargs):
        known = {"answer", "flagged", "seconds_spent", "annotations"}
        if not known & set(data):
            raise ValidationError(
                "provide at least one of `answer`, `flagged`, `seconds_spent`, "
                "`annotations`"
            )


class CheckAnswerSchema(Schema):
    answer = fields.Str(required=True)
    # How long the student had the question open. Optional: an older client
    # that does not send it still grades, it just records no duration.
    seconds_spent = fields.Int(
        required=False, validate=validate.Range(min=0, max=3600)
    )


start_attempt_schema = StartAttemptSchema()
response_schema = ResponseSchema()
check_answer_schema = CheckAnswerSchema()
