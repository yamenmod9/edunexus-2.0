"""Guards against N+1 query regressions on the hot paths.

Delivering a module and scoring an attempt both walk every question involved.
With the default lazy loading that is one SELECT per question, which is
invisible on SQLite in tests and roughly a second per module against a hosted
Postgres. These tests assert the query count scales with modules, not with
questions, so removing the `lazy="selectin"` on those relationships fails here
rather than in production.
"""

import pytest
from sqlalchemy import event

from app.extensions import db as _db
from app.models import TestAttempt
from tests.conftest import SHORT_BLUEPRINT, build_form, seed_bank
from tests.test_analytics import run_full_attempt


class QueryCounter:
    def __init__(self):
        self.statements = []

    def __enter__(self):
        event.listen(_db.engine, "before_cursor_execute", self._record)
        return self

    def __exit__(self, *exc):
        event.remove(_db.engine, "before_cursor_execute", self._record)

    def _record(self, conn, cursor, statement, params, context, executemany):
        self.statements.append(statement)

    def against(self, table):
        needle = f"FROM {table}"
        return [s for s in self.statements if needle in s]


@pytest.fixture
def big_form(db):
    """8 questions per module - large enough that per-question queries stand
    out clearly against per-module ones."""
    seed_bank(db, per_difficulty=12)
    blueprint = {
        section: {"questions_per_module": 8, "time_limit_seconds": 900}
        for section in SHORT_BLUEPRINT
    }
    return build_form(db, name="Big Form", blueprint=blueprint, seed=9)


def test_delivering_a_module_does_not_query_per_question(student_client, big_form):
    response = student_client.post("/api/attempts", json={"form_id": big_form.id})
    assert response.status_code == 201
    attempt_id = response.get_json()["id"]

    with QueryCounter() as counter:
        body = student_client.get(f"/api/attempts/{attempt_id}").get_json()

    assert len(body["current_module"]["questions"]) == 8
    # One batched load, not one per question. The allowance leaves room for
    # the form/module lookups without leaving room for eight.
    assert len(counter.against("questions")) <= 3


def test_scoring_does_not_query_per_question(student_client, big_form, db):
    state = student_client.post(
        "/api/attempts", json={"form_id": big_form.id}
    ).get_json()
    for _ in range(4):
        state = student_client.post(
            f"/api/attempts/{state['id']}/module/complete"
        ).get_json()

    from app.services.scoring_service import score_attempt

    attempt = db.session.get(TestAttempt, state["id"])
    _db.session.expire_all()

    with QueryCounter() as counter:
        report = score_attempt(attempt)

    # 32 questions across 4 modules; the per-domain breakdown touches them all.
    assert sum(s["raw_possible"] for s in report["sections"]) == 32
    assert len(counter.against("questions")) <= 6


def test_score_history_does_not_query_per_attempt(student_client, form):
    """analytics_service.score_history() calls score_attempt() once per
    finished attempt, which walks module_attempts and their responses.
    Neither relationship is selectin by default (see the comment in
    analytics_service._finished_attempts for why not), so without an
    attempt-scoped eager-load this is two extra queries per attempt. Five
    attempts must not mean ten-plus extra round trips."""
    for _ in range(5):
        run_full_attempt(student_client, form, correct_count=1)

    with QueryCounter() as counter:
        body = student_client.get("/api/analytics/dashboard").get_json()

    assert len(body["score_history"]) == 5
    # The three GROUP BY breakdown queries also select FROM answer_responses,
    # so isolate the *eager-loaded* fetch (no GROUP BY) from those - it must
    # be one batched IN (...) query, not one per attempt.
    response_loads = [
        s for s in counter.against("answer_responses") if "GROUP BY" not in s
    ]
    assert len(counter.against("module_attempts")) <= 2
    assert len(response_loads) <= 2
