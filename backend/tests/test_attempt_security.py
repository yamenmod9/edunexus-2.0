"""The answer key must not be reachable while an attempt is live, by any
route, and one student's attempt must not be reachable by another."""

import json

from app.models import AnswerResponse, TestAttempt
from tests.conftest import make_question, register_student, seed_bank

RIGHT = "B"


def start(client, form):
    return client.post("/api/attempts", json={"form_id": form.id}).get_json()


def all_question_ids(state):
    return [q["id"] for q in state["current_module"]["questions"]]


# --- delivery payloads -------------------------------------------------


def test_delivered_questions_carry_no_answer_or_rationale(student_client, form):
    state = start(student_client, form)
    for question in state["current_module"]["questions"]:
        assert "correct_answer" not in question
        assert "rationale" not in question


def test_delivered_questions_hide_difficulty(student_client, form):
    # A module 2 full of hard questions would otherwise announce that the
    # student routed up, before the score report says so.
    state = start(student_client, form)
    for question in state["current_module"]["questions"]:
        assert "difficulty" not in question


def test_the_whole_attempt_payload_never_contains_the_key(student_client, form):
    # Belt and braces: scan the serialized response rather than named fields,
    # so a future nested field cannot smuggle the answer through.
    state = start(student_client, form)
    for question in state["current_module"]["questions"]:
        student_client.put(
            f"/api/attempts/{state['id']}/responses/{question['id']}",
            json={"answer": RIGHT},
        )

    body = student_client.get(f"/api/attempts/{state['id']}").get_json()
    serialized = json.dumps(body)
    assert "correct_answer" not in serialized
    assert "is_correct" not in serialized
    assert "Because B." not in serialized  # the seeded rationale text


def test_answering_does_not_report_whether_the_answer_was_right(
    student_client, form, db
):
    state = start(student_client, form)
    question_id = all_question_ids(state)[0]
    body = student_client.put(
        f"/api/attempts/{state['id']}/responses/{question_id}", json={"answer": RIGHT}
    ).get_json()

    assert "is_correct" not in body
    # ...but the server did grade it, and stored the result.
    response = (
        db.session.query(AnswerResponse).filter_by(question_id=question_id).first()
    )
    assert response.is_correct is True


def test_progress_view_shows_the_students_own_answers_but_not_their_correctness(
    student_client, form
):
    state = start(student_client, form)
    question_id = all_question_ids(state)[0]
    student_client.put(
        f"/api/attempts/{state['id']}/responses/{question_id}", json={"answer": RIGHT}
    )

    state = student_client.get(f"/api/attempts/{state['id']}").get_json()
    saved = {r["question_id"]: r for r in state["current_module"]["responses"]}
    assert saved[question_id]["answer"] == RIGHT
    assert "is_correct" not in saved[question_id]


# --- the question bank as a side channel -------------------------------


def test_the_question_bank_hides_the_key_from_students(student_client, form, db):
    seed_bank(db)
    body = student_client.get("/api/questions").get_json()
    assert body["items"]
    for item in body["items"]:
        assert "correct_answer" not in item
        assert "rationale" not in item


def test_a_single_bank_question_hides_the_key_from_students(
    student_client, admin_client, db
):
    created = admin_client.post("/api/questions", json=make_question()).get_json()
    body = student_client.get(f"/api/questions/{created['id']}").get_json()
    assert "correct_answer" not in body
    assert "rationale" not in body


def test_admins_still_see_the_key(admin_client, db):
    created = admin_client.post("/api/questions", json=make_question()).get_json()
    assert created["correct_answer"] == "B"
    body = admin_client.get(f"/api/questions/{created['id']}").get_json()
    assert body["correct_answer"] == "B"
    listed = admin_client.get("/api/questions").get_json()["items"][0]
    assert "correct_answer" in listed


def test_looking_up_a_live_test_question_by_id_reveals_nothing(student_client, form):
    # The attempt hands the student real question ids. Before the bank routes
    # were narrowed, this call returned the answer outright.
    state = start(student_client, form)
    question_id = all_question_ids(state)[0]
    body = student_client.get(f"/api/questions/{question_id}").get_json()
    assert "correct_answer" not in body


def test_practice_check_refuses_a_question_from_a_live_attempt(student_client, form):
    state = start(student_client, form)
    question_id = all_question_ids(state)[0]
    response = student_client.post(
        f"/api/questions/{question_id}/check", json={"answer": "A"}
    )
    assert response.status_code == 409
    assert "correct_answer" not in response.get_json()


def test_practice_check_refuses_questions_from_later_modules_of_a_live_attempt(
    student_client, form, db
):
    state = start(student_client, form)
    student_client.post(f"/api/attempts/{state['id']}/module/complete")

    attempt = db.session.get(TestAttempt, state["id"])
    module_two_question = attempt.module_attempts[1].responses[0].question_id
    assert (
        student_client.post(
            f"/api/questions/{module_two_question}/check", json={"answer": "A"}
        ).status_code
        == 409
    )


def test_practice_check_works_for_questions_outside_any_attempt(
    student_client, admin_client, db
):
    created = admin_client.post("/api/questions", json=make_question()).get_json()
    body = student_client.post(
        f"/api/questions/{created['id']}/check", json={"answer": "B"}
    ).get_json()
    assert body["is_correct"] is True
    assert body["correct_answer"] == "B"
    assert body["rationale"] is None


def test_practice_check_marks_a_wrong_answer_wrong(student_client, admin_client):
    created = admin_client.post("/api/questions", json=make_question()).get_json()
    body = student_client.post(
        f"/api/questions/{created['id']}/check", json={"answer": "A"}
    ).get_json()
    assert body["is_correct"] is False


def test_practice_check_is_available_again_after_the_attempt_is_submitted(
    student_client, form
):
    state = start(student_client, form)
    question_id = all_question_ids(state)[0]
    student_client.post(f"/api/attempts/{state['id']}/submit")
    assert (
        student_client.post(
            f"/api/questions/{question_id}/check", json={"answer": "B"}
        ).status_code
        == 200
    )


# --- review gating -----------------------------------------------------


def test_review_is_refused_while_the_attempt_is_open(student_client, form):
    state = start(student_client, form)
    response = student_client.get(f"/api/attempts/{state['id']}/review")
    assert response.status_code == 409
    assert "correct_answer" not in json.dumps(response.get_json())


def test_review_after_submission_returns_the_key_and_the_grading(
    student_client, form
):
    state = start(student_client, form)
    questions = all_question_ids(state)
    student_client.put(
        f"/api/attempts/{state['id']}/responses/{questions[0]}", json={"answer": RIGHT}
    )
    student_client.put(
        f"/api/attempts/{state['id']}/responses/{questions[1]}", json={"answer": "A"}
    )
    student_client.post(f"/api/attempts/{state['id']}/submit")

    review = student_client.get(f"/api/attempts/{state['id']}/review").get_json()
    module = review["modules"][0]
    assert module["raw_correct"] == 1
    graded = {q["question"]["id"]: q for q in module["questions"]}
    assert graded[questions[0]]["is_correct"] is True
    assert graded[questions[1]]["is_correct"] is False
    assert graded[questions[0]]["question"]["correct_answer"] == "B"
    assert graded[questions[0]]["question"]["rationale"] == "Because B."


def test_review_exposes_the_routing_decision_after_the_fact(student_client, form):
    state = start(student_client, form)
    for question_id in all_question_ids(state):
        student_client.put(
            f"/api/attempts/{state['id']}/responses/{question_id}",
            json={"answer": RIGHT},
        )
    student_client.post(f"/api/attempts/{state['id']}/module/complete")
    student_client.post(f"/api/attempts/{state['id']}/submit")

    review = student_client.get(f"/api/attempts/{state['id']}/review").get_json()
    routing = review["modules"][1]["routing"]
    assert routing["variant"] == "hard"
    assert routing["raw_correct"] == 2
    assert routing["threshold"] == 0.6
    assert review["routing_threshold"] == 0.6


def test_review_reports_raw_counts_and_flags_scoring_as_later_work(
    student_client, form
):
    state = start(student_client, form)
    student_client.post(f"/api/attempts/{state['id']}/submit")
    review = student_client.get(f"/api/attempts/{state['id']}/review").get_json()

    assert set(review["raw_correct_by_section"]) == {"reading_writing", "math"}
    assert "Phase 4" in review["scoring_note"]


def test_review_of_an_abandoned_attempt_is_allowed(student_client, form):
    state = start(student_client, form)
    student_client.post(f"/api/attempts/{state['id']}/abandon")
    assert (
        student_client.get(f"/api/attempts/{state['id']}/review").status_code == 200
    )


# --- ownership ---------------------------------------------------------


def test_another_students_attempt_reads_as_missing(client, form):
    alice = register_student(client, "alice@example.com")
    bob = register_student(client, "bob@example.com")
    state = start(alice, form)

    # 404 rather than 403: whether an attempt id exists is not Bob's business.
    assert bob.get(f"/api/attempts/{state['id']}").status_code == 404
    assert bob.get(f"/api/attempts/{state['id']}/review").status_code == 404
    assert bob.post(f"/api/attempts/{state['id']}/submit").status_code == 404
    assert bob.post(f"/api/attempts/{state['id']}/abandon").status_code == 404
    assert bob.post(f"/api/attempts/{state['id']}/module/complete").status_code == 404


def test_another_student_cannot_answer_into_someone_elses_attempt(client, form):
    alice = register_student(client, "alice@example.com")
    bob = register_student(client, "bob@example.com")
    state = start(alice, form)
    question_id = all_question_ids(state)[0]

    assert (
        bob.put(
            f"/api/attempts/{state['id']}/responses/{question_id}",
            json={"answer": RIGHT},
        ).status_code
        == 404
    )


def test_an_admin_does_not_get_a_back_door_into_a_students_attempt(
    client, admin_client, form
):
    alice = register_student(client, "alice@example.com")
    state = start(alice, form)
    assert admin_client.get(f"/api/attempts/{state['id']}").status_code == 404


def test_attempt_listing_only_shows_your_own(client, form):
    alice = register_student(client, "alice@example.com")
    bob = register_student(client, "bob@example.com")
    start(alice, form)

    assert bob.get("/api/attempts").get_json()["items"] == []
    assert len(alice.get("/api/attempts").get_json()["items"]) == 1


# --- anonymous ---------------------------------------------------------


def test_every_attempt_route_rejects_anonymous_callers(client, form):
    assert client.post("/api/attempts", json={"form_id": form.id}).status_code == 401
    assert client.get("/api/attempts").status_code == 401
    assert client.get("/api/attempts/current").status_code == 401
    assert client.get("/api/attempts/any-id").status_code == 401
    assert client.get("/api/attempts/any-id/review").status_code == 401
    assert client.post("/api/attempts/any-id/submit").status_code == 401
    assert (
        client.put("/api/attempts/any-id/responses/q", json={"answer": "B"}).status_code
        == 401
    )
