"""Cross-attempt analytics: score history, accuracy by domain/skill/difficulty,
and weak-area identification (CLAUDE.md build-roadmap Phase 7).

Scoped to *finished* attempts only (submitted or abandoned), matching the gate
already used by the review and score routes - an in-progress attempt's numbers
are still moving and reviewing it is refused there too. Practice-mode
`POST /api/questions/<id>/check` calls are not persisted anywhere (see
grading_service), so they are not and cannot be part of this: everything here
is derived from AnswerResponse rows belonging to a TestAttempt.

Aggregation happens in SQL, not by loading every response into Python and
summing in a loop, because "over time" means this can span many attempts per
user (Phase 7.5's query-performance concern).
"""

from sqlalchemy import case, func
from sqlalchemy.orm import joinedload, selectinload

from app.extensions import db
from app.models import (
    DIFFICULTIES,
    DOMAINS_BY_SECTION,
    SECTION_ORDER,
    AnswerResponse,
    ModuleAttempt,
    Question,
    TestAttempt,
)
from app.services.scoring_service import score_attempt

FINISHED_STATUSES = ("submitted", "abandoned")
DEFAULT_MIN_SAMPLE = 5
DEFAULT_WEAK_LIMIT = 5


def _accuracy(correct, answered):
    return round(correct / answered, 4) if answered else None


def _finished_attempts(user):
    return (
        db.session.query(TestAttempt)
        .filter(
            TestAttempt.user_id == user.id,
            TestAttempt.status.in_(FINISHED_STATUSES),
        )
        # score_history() below calls score_attempt() once per row, which
        # walks module_attempts and each one's responses. Neither relationship
        # is selectin by default (unlike AnswerResponse.question - see
        # app/models/attempt.py - which stays lazy="select" so the per-second
        # timer poll on a live attempt does not eagerly pull every response
        # across all four modules on every request). Batching both here scopes
        # the fix to the one path that actually walks many attempts at once,
        # so this stays two queries total instead of growing with attempt
        # count - see tests/test_query_efficiency.py.
        .options(
            selectinload(TestAttempt.module_attempts).selectinload(
                ModuleAttempt.responses
            ),
            # score_history() also reads attempt.form.name per row.
            joinedload(TestAttempt.form),
        )
        # Ties on submitted_at broken by id, same reasoning as
        # attempt_service.list_attempts_for_user: two rows can share a
        # timestamp on platforms with coarse clock resolution.
        .order_by(TestAttempt.submitted_at.asc(), TestAttempt.id.asc())
        .all()
    )


def score_history(user):
    """One entry per finished attempt, oldest first, so a client can plot a
    trend line without re-sorting. Reuses score_attempt rather than
    duplicating scaling logic - this is a read path, so recomputing per
    attempt costs nothing an index doesn't already cover."""
    history = []
    for attempt in _finished_attempts(user):
        report = score_attempt(attempt)
        history.append(
            {
                "attempt_id": attempt.id,
                "form_id": attempt.form_id,
                "form_name": attempt.form.name,
                "status": attempt.status,
                "submitted_at": attempt.submitted_at.isoformat()
                if attempt.submitted_at
                else None,
                "total_scaled_score": report["total"]["scaled_score"],
                "complete": report["total"]["complete"],
                "sections": [
                    {
                        "section": s["section"],
                        "scaled_score": s["scaled_score"],
                        "complete": s["complete"],
                    }
                    for s in report["sections"]
                ],
            }
        )
    return history


def _grouped_rows(user, group_columns):
    """One GROUP BY query per taxonomy level, joined from AnswerResponse up
    to TestAttempt (to scope by user + finished status) and down to Question
    (for the section/domain/skill/difficulty being grouped on)."""
    delivered = func.count(AnswerResponse.id)
    answered = func.sum(case((AnswerResponse.answer.isnot(None), 1), else_=0))
    correct = func.sum(case((AnswerResponse.is_correct.is_(True), 1), else_=0))

    return (
        db.session.query(*group_columns, delivered, answered, correct)
        .join(ModuleAttempt, AnswerResponse.module_attempt_id == ModuleAttempt.id)
        .join(TestAttempt, ModuleAttempt.attempt_id == TestAttempt.id)
        .join(Question, AnswerResponse.question_id == Question.id)
        .filter(
            TestAttempt.user_id == user.id,
            TestAttempt.status.in_(FINISHED_STATUSES),
        )
        .group_by(*group_columns)
        .all()
    )


def _domain_sort_key(section, domain):
    section_rank = SECTION_ORDER.index(section) if section in SECTION_ORDER else len(SECTION_ORDER)
    domains = DOMAINS_BY_SECTION.get(section, ())
    domain_rank = domains.index(domain) if domain in domains else len(domains)
    return (section_rank, domain_rank)


def domain_breakdown(user):
    rows = _grouped_rows(user, [Question.section, Question.domain])
    result = [
        {
            "section": section,
            "domain": domain,
            "delivered": delivered,
            "answered": answered or 0,
            "correct": correct or 0,
            "accuracy": _accuracy(correct or 0, answered or 0),
        }
        for section, domain, delivered, answered, correct in rows
    ]
    result.sort(key=lambda r: _domain_sort_key(r["section"], r["domain"]))
    return result


def skill_breakdown(user):
    rows = _grouped_rows(user, [Question.section, Question.domain, Question.skill])
    result = [
        {
            "section": section,
            "domain": domain,
            "skill": skill,
            "delivered": delivered,
            "answered": answered or 0,
            "correct": correct or 0,
            "accuracy": _accuracy(correct or 0, answered or 0),
        }
        for section, domain, skill, delivered, answered, correct in rows
    ]
    result.sort(key=lambda r: (_domain_sort_key(r["section"], r["domain"]), r["skill"]))
    return result


def difficulty_breakdown(user):
    rows = _grouped_rows(user, [Question.difficulty])
    by_difficulty = {
        difficulty: {
            "difficulty": difficulty,
            "delivered": delivered,
            "answered": answered or 0,
            "correct": correct or 0,
            "accuracy": _accuracy(correct or 0, answered or 0),
        }
        for difficulty, delivered, answered, correct in rows
    }
    return [by_difficulty[d] for d in DIFFICULTIES if d in by_difficulty]


def _weakest(rows, min_sample, limit):
    """Ranked lowest-accuracy-first. A domain answered once at 0% is not a
    "weak area", it is one data point - min_sample keeps a lucky/unlucky
    handful of questions from dominating the list."""
    ranked = [r for r in rows if r["answered"] >= min_sample]
    ranked.sort(key=lambda r: r["accuracy"])
    return ranked[:limit]


def dashboard(user, min_sample=DEFAULT_MIN_SAMPLE, weak_limit=DEFAULT_WEAK_LIMIT):
    domains = domain_breakdown(user)
    skills = skill_breakdown(user)
    difficulty = difficulty_breakdown(user)
    history = score_history(user)

    return {
        "attempts_analyzed": len(history),
        "score_history": history,
        "domains": domains,
        "skills": skills,
        "difficulty": difficulty,
        "weak_domains": _weakest(domains, min_sample, weak_limit),
        "weak_skills": _weakest(skills, min_sample, weak_limit),
        "min_sample_size": min_sample,
    }
