"""Per-question timing and annotations.

Both are reported by the client, which is the whole reason these tests exist:
the server has to treat the numbers as claims rather than facts. Nothing here
feeds a scaled score - see the scoring service - so a wrong duration is bad
data, not a way to buy time. Bad data is still worth refusing.
"""

from app.models import PracticeResponse, Question
from tests.conftest import SHORT_BLUEPRINT, build_form, seed_bank

RIGHT = "B"


def _start_attempt(student_client, db):
    seed_bank(db)
    form = build_form(db, name="Timing")
    db.session.commit()
    return student_client.post(
        "/api/attempts", json={"form_id": form.id}
    ).get_json()


def _first_question(state):
    return state["current_module"]["questions"][0]


# --- test attempts -------------------------------------------------------


def test_seconds_spent_accumulates_across_visits(student_client, db):
    """A student who comes back to a question is still spending time on it, so
    the client sends deltas and the server adds them. A running total from the
    client would go backwards the moment a tab was reopened."""
    state = _start_attempt(student_client, db)
    attempt_id, question = state["id"], _first_question(state)
    url = f"/api/attempts/{attempt_id}/responses/{question['id']}"

    assert student_client.put(url, json={"seconds_spent": 12}).get_json()["seconds_spent"] == 12
    assert student_client.put(url, json={"seconds_spent": 20}).get_json()["seconds_spent"] == 32
    # An answer arriving later must not reset the accumulated time.
    body = student_client.put(url, json={"answer": RIGHT}).get_json()
    assert body["seconds_spent"] == 32


def test_seconds_spent_is_capped_at_the_module_time_limit(student_client, db):
    """The duration is a client claim. Left unbounded, one bogus report would
    skew every average built on top of it."""
    state = _start_attempt(student_client, db)
    attempt_id, question = state["id"], _first_question(state)
    url = f"/api/attempts/{attempt_id}/responses/{question['id']}"

    # The cap is the module's own limit, not what is left on the clock - a
    # second of the countdown has already gone by the time this reads it.
    limit = SHORT_BLUEPRINT["reading_writing"]["time_limit_seconds"]
    for _ in range(10):
        body = student_client.put(url, json={"seconds_spent": 3600}).get_json()

    assert body["seconds_spent"] == limit


def test_a_single_absurd_duration_is_rejected_outright(student_client, db):
    state = _start_attempt(student_client, db)
    attempt_id, question = state["id"], _first_question(state)

    response = student_client.put(
        f"/api/attempts/{attempt_id}/responses/{question['id']}",
        json={"seconds_spent": 999_999},
    )
    assert response.status_code == 422


def test_annotations_round_trip_and_survive_a_reload(student_client, db):
    """Highlights live server-side so a refresh mid-module does not throw a
    student's annotations away."""
    state = _start_attempt(student_client, db)
    attempt_id, question = state["id"], _first_question(state)

    marks = [
        {"start": 0, "end": 12, "colour": "yellow", "note": "main claim"},
        {"start": 40, "end": 55, "colour": "blue"},
    ]
    student_client.put(
        f"/api/attempts/{attempt_id}/responses/{question['id']}",
        json={"annotations": marks},
    )

    reloaded = student_client.get(f"/api/attempts/{attempt_id}").get_json()
    stored = next(
        r
        for r in reloaded["current_module"]["responses"]
        if r["question_id"] == question["id"]
    )
    assert stored["annotations"] == marks


def test_annotations_are_replaced_not_merged(student_client, db):
    """The client owns the whole set for a question; merging two versions of a
    highlight range has no sensible answer."""
    state = _start_attempt(student_client, db)
    attempt_id, question = state["id"], _first_question(state)
    url = f"/api/attempts/{attempt_id}/responses/{question['id']}"

    student_client.put(url, json={"annotations": [{"start": 0, "end": 5}]})
    body = student_client.put(url, json={"annotations": [{"start": 9, "end": 11}]}).get_json()
    assert body["annotations"] == [{"start": 9, "end": 11}]

    # Clearing is expressible.
    assert student_client.put(url, json={"annotations": []}).get_json()["annotations"] == []


def test_a_request_with_nothing_in_it_is_still_refused(student_client, db):
    state = _start_attempt(student_client, db)
    attempt_id, question = state["id"], _first_question(state)

    response = student_client.put(
        f"/api/attempts/{attempt_id}/responses/{question['id']}", json={}
    )
    assert response.status_code == 422


def test_timing_reaches_the_score_report(student_client, db):
    state = _start_attempt(student_client, db)
    attempt_id, question = state["id"], _first_question(state)

    student_client.put(
        f"/api/attempts/{attempt_id}/responses/{question['id']}",
        json={"answer": RIGHT, "seconds_spent": 45},
    )
    student_client.post(f"/api/attempts/{attempt_id}/submit")

    review = student_client.get(f"/api/attempts/{attempt_id}/review").get_json()
    entry = next(
        e
        for module in review["modules"]
        for e in module["questions"]
        if e["question"]["id"] == question["id"]
    )
    assert entry["seconds_spent"] == 45


# --- practice mode -------------------------------------------------------


def test_checking_a_practice_answer_records_how_long_it_took(student_client, db):
    seed_bank(db)
    question = db.session.query(Question).first()

    body = student_client.post(
        f"/api/questions/{question.id}/check",
        json={"answer": RIGHT, "seconds_spent": 73},
    ).get_json()
    assert body["seconds_spent"] == 73

    rows = db.session.query(PracticeResponse).all()
    assert len(rows) == 1
    assert rows[0].seconds_spent == 73
    assert rows[0].is_correct is True


def test_practice_history_is_append_only(student_client, db):
    """Answering the same question again is a second go at it, not an edit of
    the first - the comparison over time is the only reason to store this."""
    seed_bank(db)
    question = db.session.query(Question).first()

    student_client.post(
        f"/api/questions/{question.id}/check", json={"answer": "A", "seconds_spent": 90}
    )
    student_client.post(
        f"/api/questions/{question.id}/check",
        json={"answer": RIGHT, "seconds_spent": 30},
    )

    rows = (
        db.session.query(PracticeResponse)
        .order_by(PracticeResponse.created_at)
        .all()
    )
    assert [r.seconds_spent for r in rows] == [90, 30]
    assert [r.is_correct for r in rows] == [False, True]


def test_practice_timing_is_optional(student_client, db):
    """An older client that sends no duration still grades."""
    seed_bank(db)
    question = db.session.query(Question).first()

    body = student_client.post(
        f"/api/questions/{question.id}/check", json={"answer": RIGHT}
    ).get_json()
    assert body["is_correct"] is True
    assert body["seconds_spent"] == 0


def test_practice_rows_belong_to_the_student_who_answered(student_client, db):
    seed_bank(db)
    question = db.session.query(Question).first()
    student_client.post(
        f"/api/questions/{question.id}/check", json={"answer": RIGHT, "seconds_spent": 5}
    )

    me = student_client.get("/api/auth/me").get_json()
    row = db.session.query(PracticeResponse).one()
    assert row.user_id == me["id"]
