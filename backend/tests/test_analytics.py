"""The analytics dashboard: score history, accuracy by domain/skill/
difficulty, and weak-area surfacing (build-roadmap.md Phase 7).

Domain/skill assignment inside a seeded form comes from form assembly, which
these tests do not control question-by-question - so assertions check
aggregate totals and cross-consistency (skills roll up to the same totals as
domains) rather than which specific domain got which count.
"""

from tests.conftest import register_student
from tests.test_attempt_flow import answer_current_module, complete_module, start


def run_full_attempt(client, form, correct_count):
    """Drives all four modules to submission, answering `correct_count` of
    each module's 2 seeded questions correctly."""
    state = start(client, form)
    for _ in range(4):
        answer_current_module(client, state, correct_count=correct_count)
        state = complete_module(client, state["id"])
    return state


def test_dashboard_requires_auth(client):
    response = client.get("/api/analytics/dashboard")
    assert response.status_code == 401


def test_dashboard_is_empty_before_any_finished_attempt(student_client):
    body = student_client.get("/api/analytics/dashboard").get_json()
    assert body["attempts_analyzed"] == 0
    assert body["score_history"] == []
    assert body["domains"] == []
    assert body["skills"] == []
    assert body["difficulty"] == []
    assert body["weak_domains"] == []
    assert body["weak_skills"] == []


def test_in_progress_attempt_is_excluded(student_client, form):
    start(student_client, form)  # never submitted or abandoned
    body = student_client.get("/api/analytics/dashboard").get_json()
    assert body["attempts_analyzed"] == 0


def test_score_history_lists_finished_attempts_oldest_first(student_client, form):
    first = run_full_attempt(student_client, form, correct_count=2)
    second = run_full_attempt(student_client, form, correct_count=0)

    history = student_client.get("/api/analytics/dashboard").get_json()["score_history"]
    assert [h["attempt_id"] for h in history] == [first["id"], second["id"]]
    assert all(h["status"] == "submitted" for h in history)
    # A perfect run outscores an all-wrong one.
    assert history[0]["total_scaled_score"] > history[1]["total_scaled_score"]


def test_domain_breakdown_aggregates_across_attempts(student_client, form):
    run_full_attempt(student_client, form, correct_count=2)  # every question right
    run_full_attempt(student_client, form, correct_count=0)  # every question wrong

    domains = student_client.get("/api/analytics/dashboard").get_json()["domains"]
    assert domains

    # SHORT_BLUEPRINT: 2 questions/module x 4 modules x 2 attempts = 16.
    assert sum(d["delivered"] for d in domains) == 16
    assert sum(d["answered"] for d in domains) == 16
    assert sum(d["correct"] for d in domains) == 8  # one perfect run, one blank
    for d in domains:
        assert d["accuracy"] == round(d["correct"] / d["answered"], 4)


def test_skill_breakdown_rolls_up_to_the_same_totals_as_domains(student_client, form):
    run_full_attempt(student_client, form, correct_count=1)

    body = student_client.get("/api/analytics/dashboard").get_json()
    assert sum(s["delivered"] for s in body["skills"]) == sum(
        d["delivered"] for d in body["domains"]
    )
    assert sum(s["correct"] for s in body["skills"]) == sum(
        d["correct"] for d in body["domains"]
    )


def test_difficulty_breakdown_covers_every_delivered_question(student_client, form):
    run_full_attempt(student_client, form, correct_count=2)

    difficulty = student_client.get("/api/analytics/dashboard").get_json()["difficulty"]
    assert sum(d["delivered"] for d in difficulty) == 8
    assert {d["difficulty"] for d in difficulty} <= {"easy", "medium", "hard"}


def test_weak_domains_respects_min_sample_and_sorts_ascending(student_client, form):
    run_full_attempt(student_client, form, correct_count=0)  # 0% everywhere

    starved = student_client.get(
        "/api/analytics/dashboard?min_sample=100"
    ).get_json()
    assert starved["weak_domains"] == []  # nothing has 100 samples yet

    body = student_client.get("/api/analytics/dashboard?min_sample=1").get_json()
    assert body["weak_domains"]
    accuracies = [d["accuracy"] for d in body["weak_domains"]]
    assert accuracies == sorted(accuracies)
    assert all(a == 0.0 for a in accuracies)


def test_a_students_dashboard_never_includes_another_students_attempts(client, form):
    a = register_student(client, "analytics-a@example.com")
    b = register_student(client, "analytics-b@example.com")

    run_full_attempt(a, form, correct_count=2)

    assert a.get("/api/analytics/dashboard").get_json()["attempts_analyzed"] == 1
    assert b.get("/api/analytics/dashboard").get_json()["attempts_analyzed"] == 0
