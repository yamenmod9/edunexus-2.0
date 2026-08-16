"""End-to-end drive of the adaptive attempt: four modules, routing between
them, timers, and resume."""

from datetime import timedelta

from app.models import SECTION_ORDER, TestAttempt
from tests.conftest import SHORT_BLUEPRINT, register_student, seed_bank


# Every seeded question's correct choice is "B" (see conftest.seed_bank),
# so a test can dictate exactly how many it gets right.
RIGHT = "B"
WRONG = "A"


def start(client, form):
    response = client.post("/api/attempts", json={"form_id": form.id})
    assert response.status_code == 201, response.get_json()
    return response.get_json()


def answer_current_module(client, state, correct_count):
    attempt_id = state["id"]
    questions = state["current_module"]["questions"]
    for index, question in enumerate(questions):
        answer = RIGHT if index < correct_count else WRONG
        response = client.put(
            f"/api/attempts/{attempt_id}/responses/{question['id']}",
            json={"answer": answer},
        )
        assert response.status_code == 200, response.get_json()
    return questions


def complete_module(client, attempt_id):
    response = client.post(f"/api/attempts/{attempt_id}/module/complete")
    assert response.status_code == 200, response.get_json()
    return response.get_json()


def module_variants(db, attempt_id):
    attempt = db.session.get(TestAttempt, attempt_id)
    return [
        (m.order_index, m.module.section, m.module.sequence, m.module.variant)
        for m in attempt.module_attempts
    ]


# --- the happy path ----------------------------------------------------


def test_starting_an_attempt_opens_reading_and_writing_module_one(student_client, form):
    state = start(student_client, form)
    current = state["current_module"]

    assert state["status"] == "in_progress"
    assert current["order_index"] == 1
    assert current["section"] == "reading_writing"
    assert current["sequence"] == 1
    assert current["question_count"] == 2
    assert len(current["questions"]) == 2
    assert current["seconds_remaining"] > 0


def test_a_full_four_module_attempt_runs_to_submission(student_client, form, db):
    state = start(student_client, form)

    seen_modules = []
    for _ in range(4):
        current = state["current_module"]
        seen_modules.append((current["section"], current["sequence"]))
        answer_current_module(student_client, state, correct_count=2)
        state = complete_module(student_client, state["id"])

    assert seen_modules == [
        ("reading_writing", 1),
        ("reading_writing", 2),
        ("math", 1),
        ("math", 2),
    ]
    assert state["status"] == "submitted"
    assert state["current_module"] is None
    assert state["modules_completed"] == 4

    attempt = db.session.get(TestAttempt, state["id"])
    assert attempt.submitted_at is not None
    assert all(m.status == "completed" for m in attempt.module_attempts)


def test_module_order_is_reading_and_writing_then_math(student_client, form, db):
    state = start(student_client, form)
    for _ in range(4):
        answer_current_module(student_client, state, correct_count=1)
        state = complete_module(student_client, state["id"])

    ordered = module_variants(db, state["id"])
    assert [row[1] for row in ordered] == [
        SECTION_ORDER[0],
        SECTION_ORDER[0],
        SECTION_ORDER[1],
        SECTION_ORDER[1],
    ]
    assert [row[2] for row in ordered] == [1, 2, 1, 2]


# --- routing -----------------------------------------------------------


def test_strong_module_one_routes_to_the_hard_module_two(student_client, form, db):
    state = start(student_client, form)
    answer_current_module(student_client, state, correct_count=2)  # 2/2 = 1.0
    state = complete_module(student_client, state["id"])

    assert module_variants(db, state["id"])[1] == (2, "reading_writing", 2, "hard")


def test_weak_module_one_routes_to_the_easy_module_two(student_client, form, db):
    state = start(student_client, form)
    answer_current_module(student_client, state, correct_count=0)  # 0/2 = 0.0
    state = complete_module(student_client, state["id"])

    assert module_variants(db, state["id"])[1] == (2, "reading_writing", 2, "easy")


def test_each_section_routes_independently(student_client, form, db):
    state = start(student_client, form)
    answer_current_module(student_client, state, correct_count=0)  # R&W: down
    state = complete_module(student_client, state["id"])
    answer_current_module(student_client, state, correct_count=1)
    state = complete_module(student_client, state["id"])
    answer_current_module(student_client, state, correct_count=2)  # Math: up
    state = complete_module(student_client, state["id"])

    variants = module_variants(db, state["id"])
    assert variants[1][3] == "easy"  # reading & writing module 2
    assert variants[3][3] == "hard"  # math module 2


def test_routing_inputs_are_recorded_on_the_module_attempt(student_client, form, db):
    state = start(student_client, form)
    answer_current_module(student_client, state, correct_count=1)  # 1/2 = 0.5
    state = complete_module(student_client, state["id"])

    attempt = db.session.get(TestAttempt, state["id"])
    module_two = attempt.module_attempts[1]
    assert module_two.routed_from_raw == 1
    assert module_two.routed_from_total == 2
    assert module_two.routed_ratio == 0.5
    assert module_two.routed_threshold == 0.6
    assert module_two.module.variant == "easy"


def test_module_one_carries_no_routing_provenance(student_client, form, db):
    state = start(student_client, form)
    attempt = db.session.get(TestAttempt, state["id"])
    assert attempt.module_attempts[0].routed_from_total is None


def test_threshold_is_snapshotted_so_config_changes_cannot_rewrite_an_attempt(
    student_client, form, db, app
):
    state = start(student_client, form)
    attempt = db.session.get(TestAttempt, state["id"])
    assert attempt.routing_threshold == 0.6

    # A student halfway through a test must not be re-routed by an ops change.
    app.config["ROUTING_THRESHOLD"] = 0.99
    answer_current_module(student_client, state, correct_count=2)  # ratio 1.0
    state = complete_module(student_client, state["id"])

    attempt = db.session.get(TestAttempt, state["id"])
    assert attempt.routing_threshold == 0.6
    assert attempt.module_attempts[1].routed_threshold == 0.6


def test_a_new_attempt_picks_up_the_current_threshold(student_client, form, db, app):
    app.config["ROUTING_THRESHOLD"] = 0.8
    state = start(student_client, form)
    assert db.session.get(TestAttempt, state["id"]).routing_threshold == 0.8


# --- answering and navigation ------------------------------------------


def test_an_answer_can_be_changed_and_cleared(student_client, form):
    state = start(student_client, form)
    attempt_id = state["id"]
    question_id = state["current_module"]["questions"][0]["id"]

    student_client.put(
        f"/api/attempts/{attempt_id}/responses/{question_id}", json={"answer": "A"}
    )
    changed = student_client.put(
        f"/api/attempts/{attempt_id}/responses/{question_id}", json={"answer": "C"}
    ).get_json()
    assert changed["answer"] == "C"
    assert changed["answered"] is True

    cleared = student_client.put(
        f"/api/attempts/{attempt_id}/responses/{question_id}", json={"answer": ""}
    ).get_json()
    assert cleared["answer"] is None
    assert cleared["answered"] is False


def test_a_question_can_be_flagged_without_answering_it(student_client, form):
    state = start(student_client, form)
    attempt_id = state["id"]
    question_id = state["current_module"]["questions"][0]["id"]

    flagged = student_client.put(
        f"/api/attempts/{attempt_id}/responses/{question_id}", json={"flagged": True}
    ).get_json()
    assert flagged["flagged"] is True
    assert flagged["answered"] is False

    state = student_client.get(f"/api/attempts/{attempt_id}").get_json()
    responses = {r["question_id"]: r for r in state["current_module"]["responses"]}
    assert responses[question_id]["flagged"] is True


def test_an_empty_body_is_rejected(student_client, form):
    state = start(student_client, form)
    question_id = state["current_module"]["questions"][0]["id"]
    response = student_client.put(
        f"/api/attempts/{state['id']}/responses/{question_id}", json={}
    )
    assert response.status_code == 422


def test_a_question_outside_the_current_module_cannot_be_answered(
    student_client, form, db
):
    # Going back to a finished module is exactly what the adaptive format
    # forbids - the routing decision has already been made on those answers.
    state = start(student_client, form)
    first_module_questions = [q["id"] for q in state["current_module"]["questions"]]
    answer_current_module(student_client, state, correct_count=2)
    state = complete_module(student_client, state["id"])

    response = student_client.put(
        f"/api/attempts/{state['id']}/responses/{first_module_questions[0]}",
        json={"answer": "A"},
    )
    assert response.status_code == 404


def test_an_unknown_question_id_is_rejected(student_client, form):
    state = start(student_client, form)
    response = student_client.put(
        f"/api/attempts/{state['id']}/responses/does-not-exist", json={"answer": "B"}
    )
    assert response.status_code == 404


# --- one attempt at a time ---------------------------------------------


def test_a_second_concurrent_attempt_is_refused(student_client, form):
    start(student_client, form)
    response = student_client.post("/api/attempts", json={"form_id": form.id})
    assert response.status_code == 409


def test_a_new_attempt_is_allowed_once_the_last_one_is_submitted(student_client, form):
    state = start(student_client, form)
    student_client.post(f"/api/attempts/{state['id']}/submit")
    assert (
        student_client.post("/api/attempts", json={"form_id": form.id}).status_code
        == 201
    )


def test_abandoning_frees_the_student_to_start_again(student_client, form):
    state = start(student_client, form)
    abandoned = student_client.post(f"/api/attempts/{state['id']}/abandon").get_json()
    assert abandoned["status"] == "abandoned"
    assert (
        student_client.post("/api/attempts", json={"form_id": form.id}).status_code
        == 201
    )


def test_an_inactive_form_cannot_be_started(student_client, form, db):
    form.is_active = False
    db.session.commit()
    response = student_client.post("/api/attempts", json={"form_id": form.id})
    assert response.status_code == 404


def test_an_unknown_form_is_rejected(student_client, form):
    response = student_client.post("/api/attempts", json={"form_id": "nope"})
    assert response.status_code == 404


# --- timers ------------------------------------------------------------


def expire_current_module(db, attempt_id, seconds_ago=1):
    attempt = db.session.get(TestAttempt, attempt_id)
    current = attempt.current_module_attempt
    current.expires_at = current.started_at - timedelta(seconds=seconds_ago)
    db.session.commit()
    return current


def test_an_expired_module_closes_itself_and_the_next_one_opens(
    student_client, form, db
):
    state = start(student_client, form)
    answer_current_module(student_client, state, correct_count=2)
    expire_current_module(db, state["id"])

    state = student_client.get(f"/api/attempts/{state['id']}").get_json()
    assert state["current_module"]["order_index"] == 2

    attempt = db.session.get(TestAttempt, state["id"])
    assert attempt.module_attempts[0].status == "expired"


def test_an_expired_module_still_counts_the_answers_it_received(
    student_client, form, db
):
    state = start(student_client, form)
    answer_current_module(student_client, state, correct_count=2)
    expire_current_module(db, state["id"])
    student_client.get(f"/api/attempts/{state['id']}")

    attempt = db.session.get(TestAttempt, state["id"])
    assert attempt.module_attempts[0].raw_correct == 2
    # Routing still happens off an expired module - running out of time is a
    # performance signal, not a reason to skip the decision.
    assert attempt.module_attempts[1].module.variant == "hard"


def test_answering_after_the_deadline_is_refused(student_client, form, db):
    state = start(student_client, form)
    question_id = state["current_module"]["questions"][0]["id"]
    expire_current_module(db, state["id"])

    response = student_client.put(
        f"/api/attempts/{state['id']}/responses/{question_id}", json={"answer": "B"}
    )
    # The module rolled forward, so the question is no longer the current one.
    assert response.status_code == 404


def test_the_next_module_starts_at_the_previous_deadline_not_at_reconnect(
    student_client, form, db
):
    # Otherwise closing the app during module 1 would buy a fresh full clock
    # for module 2.
    state = start(student_client, form)
    expired = expire_current_module(db, state["id"])
    deadline = expired.expires_at

    student_client.get(f"/api/attempts/{state['id']}")
    attempt = db.session.get(TestAttempt, state["id"])
    assert attempt.module_attempts[1].started_at == deadline


def test_a_long_absence_expires_several_modules_in_one_pass(student_client, form, db):
    state = start(student_client, form)
    attempt = db.session.get(TestAttempt, state["id"])
    # Backdate the whole attempt far enough that every module's clock has run.
    attempt.module_attempts[0].started_at -= timedelta(days=2)
    attempt.module_attempts[0].expires_at -= timedelta(days=2)
    db.session.commit()

    state = student_client.get(f"/api/attempts/{state['id']}").get_json()
    assert state["status"] == "submitted"
    assert state["current_module"] is None

    attempt = db.session.get(TestAttempt, state["id"])
    assert len(attempt.module_attempts) == 4
    assert all(m.status == "expired" for m in attempt.module_attempts)


def test_seconds_remaining_counts_down_from_the_module_limit(student_client, form):
    state = start(student_client, form)
    limit = SHORT_BLUEPRINT["reading_writing"]["time_limit_seconds"]
    remaining = state["current_module"]["seconds_remaining"]
    assert limit - 5 <= remaining <= limit


# --- resume ------------------------------------------------------------


def test_current_returns_nothing_when_no_attempt_is_open(student_client, form):
    assert student_client.get("/api/attempts/current").get_json()["attempt"] is None


def test_current_resumes_an_attempt_with_its_answers_intact(student_client, form):
    state = start(student_client, form)
    question_id = state["current_module"]["questions"][0]["id"]
    student_client.put(
        f"/api/attempts/{state['id']}/responses/{question_id}",
        json={"answer": "B", "flagged": True},
    )

    resumed = student_client.get("/api/attempts/current").get_json()["attempt"]
    assert resumed["id"] == state["id"]
    assert resumed["current_module"]["order_index"] == 1
    saved = {r["question_id"]: r for r in resumed["current_module"]["responses"]}
    assert saved[question_id]["answer"] == "B"
    assert saved[question_id]["flagged"] is True


def test_resume_reports_the_module_a_timeout_moved_the_student_to(
    student_client, form, db
):
    state = start(student_client, form)
    expire_current_module(db, state["id"])
    resumed = student_client.get("/api/attempts/current").get_json()["attempt"]
    assert resumed["current_module"]["order_index"] == 2


def test_a_submitted_attempt_is_no_longer_current(student_client, form):
    state = start(student_client, form)
    student_client.post(f"/api/attempts/{state['id']}/submit")
    assert student_client.get("/api/attempts/current").get_json()["attempt"] is None


def test_attempts_are_listed_newest_first(student_client, form, db):
    first = start(student_client, form)
    student_client.post(f"/api/attempts/{first['id']}/submit")
    # Separate the two in time explicitly: the clock resolution on some
    # platforms is coarser than the round trip, so back-to-back attempts can
    # otherwise land on an identical started_at.
    backdated = db.session.get(TestAttempt, first["id"])
    backdated.started_at -= timedelta(minutes=5)
    db.session.commit()
    second = start(student_client, form)

    items = student_client.get("/api/attempts").get_json()["items"]
    assert [item["id"] for item in items] == [second["id"], first["id"]]


# --- finishing ---------------------------------------------------------


def test_submitting_early_grades_what_was_answered(student_client, form, db):
    state = start(student_client, form)
    answer_current_module(student_client, state, correct_count=1)
    student_client.post(f"/api/attempts/{state['id']}/submit")

    attempt = db.session.get(TestAttempt, state["id"])
    assert attempt.status == "submitted"
    assert attempt.module_attempts[0].raw_correct == 1
    # Modules never reached simply do not exist.
    assert len(attempt.module_attempts) == 1


def test_a_finished_attempt_rejects_further_changes(student_client, form):
    state = start(student_client, form)
    question_id = state["current_module"]["questions"][0]["id"]
    student_client.post(f"/api/attempts/{state['id']}/submit")

    assert (
        student_client.put(
            f"/api/attempts/{state['id']}/responses/{question_id}", json={"answer": "B"}
        ).status_code
        == 409
    )
    assert (
        student_client.post(f"/api/attempts/{state['id']}/module/complete").status_code
        == 409
    )
    assert student_client.post(f"/api/attempts/{state['id']}/submit").status_code == 409


def test_completing_the_last_module_submits_the_attempt(student_client, form, db):
    state = start(student_client, form)
    for _ in range(4):
        state = complete_module(student_client, state["id"])
    assert state["status"] == "submitted"
    attempt = db.session.get(TestAttempt, state["id"])
    assert [m.status for m in attempt.module_attempts] == ["completed"] * 4


def test_unanswered_questions_score_zero(student_client, form, db):
    state = start(student_client, form)
    student_client.post(f"/api/attempts/{state['id']}/submit")
    attempt = db.session.get(TestAttempt, state["id"])
    assert attempt.module_attempts[0].raw_correct == 0


def test_two_students_run_independent_attempts(client, form, db):
    alice = register_student(client, "alice@example.com")
    bob = register_student(client, "bob@example.com")

    alice_state = start(alice, form)
    bob_state = start(bob, form)
    assert alice_state["id"] != bob_state["id"]

    answer_current_module(alice, alice_state, correct_count=2)
    complete_module(alice, alice_state["id"])

    bob_attempt = db.session.get(TestAttempt, bob_state["id"])
    assert len(bob_attempt.module_attempts) == 1
