"""Scoring: the conversion tables themselves, the section/total arithmetic,
and the breakdowns.

These scores are an approximation by design (CLAUDE.md section 7). The tests
below pin the properties that must hold for any table we ship - monotone,
bounded, variant-aware - rather than pretending the specific numbers are
psychometrically meaningful.
"""

import pytest

from app.models import SECTION_ORDER, TestAttempt
from app.services.scoring_service import (
    DEFAULT_SCALE_TABLE_ID,
    ScoringError,
    load_scale_table,
    scale_raw_score,
    score_attempt,
)
from tests.test_attempt_flow import answer_current_module, complete_module, start


@pytest.fixture
def table():
    return load_scale_table(DEFAULT_SCALE_TABLE_ID)


# --- the table -----------------------------------------------------------


def test_the_table_declares_itself_an_approximation(table):
    assert table["approximation"] is True
    assert "not psychometrically" in table["description"].lower()


def test_every_section_has_both_variant_curves(table):
    for section in SECTION_ORDER:
        assert set(table["sections"][section]["variants"]) == {"easy", "hard"}


def test_curves_are_dense_and_index_aligned(table):
    for section in SECTION_ORDER:
        spec = table["sections"][section]
        for curve in spec["variants"].values():
            assert [e["raw"] for e in curve] == list(range(spec["max_raw"] + 1))


def test_curves_never_decrease(table):
    # An extra correct answer must never lower the score, which rounding to
    # the nearest 10 could otherwise cause at a flat stretch of the curve.
    for section in SECTION_ORDER:
        for curve in table["sections"][section]["variants"].values():
            scores = [e["scaled"] for e in curve]
            assert scores == sorted(scores)


def test_scores_stay_inside_the_scale(table):
    for section in SECTION_ORDER:
        for curve in table["sections"][section]["variants"].values():
            for entry in curve:
                assert table["scale_min"] <= entry["scaled"] <= table["scale_max"]


def test_scores_are_multiples_of_ten(table):
    for section in SECTION_ORDER:
        for curve in table["sections"][section]["variants"].values():
            assert all(e["scaled"] % 10 == 0 for e in curve)


def test_the_hard_path_is_never_worth_less_than_the_easy_path(table):
    for section in SECTION_ORDER:
        variants = table["sections"][section]["variants"]
        for easy, hard in zip(variants["easy"], variants["hard"]):
            assert hard["scaled"] >= easy["scaled"]


def test_the_easy_path_is_capped_below_the_top_of_the_scale(table):
    # Routing to the easier module 2 should cap the section: a student who
    # never saw the harder questions has not shown they can answer them.
    for section in SECTION_ORDER:
        variants = table["sections"][section]["variants"]
        assert variants["easy"][-1]["scaled"] == table["easy_path_cap"]
        assert variants["hard"][-1]["scaled"] == table["scale_max"]


# --- boundaries ----------------------------------------------------------


@pytest.mark.parametrize("section,max_raw", [("reading_writing", 54), ("math", 44)])
def test_zero_raw_scores_the_floor(table, section, max_raw):
    for variant in ("easy", "hard"):
        scaled, projected = scale_raw_score(table, section, variant, 0, max_raw)
        assert (scaled, projected) == (200, 0)


@pytest.mark.parametrize("section,max_raw", [("reading_writing", 54), ("math", 44)])
def test_full_raw_scores_the_ceiling_of_its_path(table, section, max_raw):
    assert scale_raw_score(table, section, "hard", max_raw, max_raw)[0] == 800
    assert scale_raw_score(table, section, "easy", max_raw, max_raw)[0] == 600


@pytest.mark.parametrize("section,max_raw", [("reading_writing", 54), ("math", 44)])
def test_one_off_each_edge_is_inside_the_scale(table, section, max_raw):
    assert scale_raw_score(table, section, "hard", 1, max_raw)[0] > 200
    assert scale_raw_score(table, section, "hard", max_raw - 1, max_raw)[0] == 790
    assert scale_raw_score(table, section, "easy", max_raw - 1, max_raw)[0] == 590


def test_a_raw_score_beyond_the_table_is_clamped(table):
    # Defensive: a corrupt raw count must not index off the end of the curve.
    assert scale_raw_score(table, "math", "hard", 999, 44)[0] == 800
    assert scale_raw_score(table, "math", "hard", -5, 44)[0] == 200


def test_no_questions_delivered_scores_the_floor(table):
    assert scale_raw_score(table, "math", "hard", 0, 0) == (200, 0)


def test_an_unknown_section_or_variant_is_an_error(table):
    with pytest.raises(ScoringError):
        scale_raw_score(table, "history", "hard", 1, 10)
    with pytest.raises(ScoringError):
        scale_raw_score(table, "math", "medium", 1, 10)


def test_an_unknown_table_is_an_error():
    with pytest.raises(ScoringError, match="unknown scale table"):
        load_scale_table("no-such-table")


# --- short forms ---------------------------------------------------------


def test_a_short_form_is_projected_onto_the_canonical_length(table):
    # A 4-question section cannot be looked up in a 44-row table directly.
    scaled, projected = scale_raw_score(table, "math", "hard", 2, 4)
    assert projected == 22  # half of 44
    assert scaled == 570


def test_projection_preserves_the_endpoints(table):
    assert scale_raw_score(table, "math", "hard", 0, 4) == (200, 0)
    assert scale_raw_score(table, "math", "hard", 4, 4) == (800, 44)


def test_projection_rounds_to_the_nearest_raw_score(table):
    # 1/4 of 44 is 11 exactly; 1/3 of 44 is 14.67 and must round, not truncate.
    assert scale_raw_score(table, "math", "hard", 1, 4)[1] == 11
    assert scale_raw_score(table, "math", "hard", 1, 3)[1] == 15


# --- reports over real attempts ------------------------------------------


def run_attempt(client, form, correct_per_module):
    state = start(client, form)
    for count in correct_per_module:
        answer_current_module(client, state, correct_count=count)
        state = complete_module(client, state["id"])
    return state


def test_a_perfect_attempt_scores_the_top_of_the_scale(student_client, form, db):
    state = run_attempt(student_client, form, [2, 2, 2, 2])
    report = score_attempt(db.session.get(TestAttempt, state["id"]))

    assert [s["module_2_variant"] for s in report["sections"]] == ["hard", "hard"]
    assert [s["scaled_score"] for s in report["sections"]] == [800, 800]
    assert report["total"]["scaled_score"] == 1600
    assert report["total"]["max"] == 1600


def test_a_blank_attempt_scores_the_floor(student_client, form, db):
    state = run_attempt(student_client, form, [0, 0, 0, 0])
    report = score_attempt(db.session.get(TestAttempt, state["id"]))

    assert [s["module_2_variant"] for s in report["sections"]] == ["easy", "easy"]
    assert [s["scaled_score"] for s in report["sections"]] == [200, 200]
    assert report["total"]["scaled_score"] == 400
    assert report["total"]["min"] == 400


def test_the_total_is_the_sum_of_the_sections(student_client, form, db):
    state = run_attempt(student_client, form, [2, 1, 1, 2])
    report = score_attempt(db.session.get(TestAttempt, state["id"]))
    assert report["total"]["scaled_score"] == sum(
        s["scaled_score"] for s in report["sections"]
    )


def test_the_same_raw_score_scores_higher_on_the_hard_path(client, form, db):
    # The point of variant-aware scaling: 2 of 4 correct is worth more when
    # those answers were given against the harder module 2.
    from tests.conftest import register_student

    strong = register_student(client, "strong@example.com")
    weak = register_student(client, "weak@example.com")

    # Both end on 2/4 in reading & writing, by opposite routes.
    strong_state = run_attempt(strong, form, [2, 0, 0, 0])
    weak_state = run_attempt(weak, form, [0, 2, 0, 0])

    strong_report = score_attempt(db.session.get(TestAttempt, strong_state["id"]))
    weak_report = score_attempt(db.session.get(TestAttempt, weak_state["id"]))

    strong_rw = strong_report["sections"][0]
    weak_rw = weak_report["sections"][0]
    assert strong_rw["raw_correct"] == weak_rw["raw_correct"] == 2
    assert (strong_rw["module_2_variant"], weak_rw["module_2_variant"]) == (
        "hard",
        "easy",
    )
    assert strong_rw["scaled_score"] > weak_rw["scaled_score"]


def test_a_section_never_reached_is_reported_incomplete_not_invented(
    student_client, form, db
):
    state = start(student_client, form)
    answer_current_module(student_client, state, correct_count=2)
    student_client.post(f"/api/attempts/{state['id']}/submit")

    report = score_attempt(db.session.get(TestAttempt, state["id"]))
    reading_writing, math = report["sections"]

    assert reading_writing["complete"] is False
    assert reading_writing["scaled_score"] is None
    assert "module 2" in reading_writing["incomplete_reason"]
    assert math["raw_possible"] == 0
    assert math["scaled_score"] is None

    # No total either: half a test does not have a 400-1600 score.
    assert report["total"]["scaled_score"] is None
    assert report["total"]["complete"] is False


def test_an_abandoned_attempt_still_reports_what_was_done(student_client, form, db):
    state = start(student_client, form)
    answer_current_module(student_client, state, correct_count=1)
    student_client.post(f"/api/attempts/{state['id']}/abandon")

    report = score_attempt(db.session.get(TestAttempt, state["id"]))
    assert report["status"] == "abandoned"
    assert report["sections"][0]["raw_correct"] == 1
    assert report["total"]["scaled_score"] is None


def test_a_section_completed_by_timeout_still_scores(student_client, form, db):
    # Running out of time is a result, not an error - the modules were
    # delivered and graded, so the section scores.
    from datetime import timedelta

    state = start(student_client, form)
    answer_current_module(student_client, state, correct_count=2)
    attempt = db.session.get(TestAttempt, state["id"])
    attempt.module_attempts[0].expires_at -= timedelta(days=2)
    db.session.commit()

    student_client.get(f"/api/attempts/{state['id']}")  # rolls the timers
    attempt = db.session.get(TestAttempt, state["id"])
    assert attempt.status == "submitted"
    assert [m.status for m in attempt.module_attempts] == ["expired"] * 4

    report = score_attempt(attempt)
    assert all(s["complete"] for s in report["sections"])
    # Module 1 was answered before the clock ran out and still counts.
    assert report["sections"][0]["raw_correct"] == 2


# --- breakdowns ----------------------------------------------------------


def test_domain_breakdown_only_lists_domains_that_were_delivered(
    student_client, form, db
):
    state = run_attempt(student_client, form, [2, 2, 2, 2])
    report = score_attempt(db.session.get(TestAttempt, state["id"]))

    assert report["domains"]
    for row in report["domains"]:
        assert row["delivered"] > 0
        assert row["correct"] <= row["answered"] <= row["delivered"]
    delivered = sum(row["delivered"] for row in report["domains"])
    assert delivered == 8  # 2 questions per module, 4 modules


def test_unanswered_questions_are_excluded_from_accuracy_but_still_counted(
    student_client, form, db
):
    state = start(student_client, form)
    student_client.post(f"/api/attempts/{state['id']}/submit")
    report = score_attempt(db.session.get(TestAttempt, state["id"]))

    for row in report["domains"]:
        assert row["answered"] == 0
        # None, not 0.0: nothing was attempted, so there is no accuracy to
        # report and claiming 0% would be a different statement.
        assert row["accuracy"] is None


def test_difficulty_breakdown_covers_the_delivered_difficulties(
    student_client, form, db
):
    state = run_attempt(student_client, form, [2, 2, 2, 2])
    report = score_attempt(db.session.get(TestAttempt, state["id"]))

    # Ordered easiest first, not by dict insertion or alphabetically.
    order = [row["difficulty"] for row in report["difficulty"]]
    assert order == [d for d in ("easy", "medium", "hard") if d in order]
    assert all(row["accuracy"] == 1.0 for row in report["difficulty"])


# --- the snapshot --------------------------------------------------------


def test_an_attempt_records_the_table_it_will_be_scored_against(
    student_client, form, db, app
):
    state = start(student_client, form)
    attempt = db.session.get(TestAttempt, state["id"])
    assert attempt.scale_table_id == app.config["SCALE_TABLE_ID"]


def test_scoring_uses_the_stored_table_not_the_current_config(
    student_client, form, db, app
):
    # Proves the snapshot is load-bearing: point the attempt at a table that
    # does not exist and scoring must fail rather than quietly fall back to
    # whatever the config now says.
    state = run_attempt(student_client, form, [2, 2, 2, 2])
    attempt = db.session.get(TestAttempt, state["id"])
    attempt.scale_table_id = "retired-table-v0"
    db.session.commit()

    with pytest.raises(ScoringError):
        score_attempt(attempt)


def test_an_attempt_predating_phase_4_falls_back_to_the_default(
    student_client, form, db
):
    state = run_attempt(student_client, form, [2, 2, 2, 2])
    attempt = db.session.get(TestAttempt, state["id"])
    attempt.scale_table_id = None
    db.session.commit()

    report = score_attempt(attempt)
    assert report["scale_table"]["id"] == DEFAULT_SCALE_TABLE_ID


# --- the API -------------------------------------------------------------


def test_the_score_is_withheld_until_the_attempt_is_over(student_client, form):
    state = start(student_client, form)
    response = student_client.get(f"/api/attempts/{state['id']}/score")
    assert response.status_code == 409


def test_the_score_endpoint_returns_the_report(student_client, form):
    state = run_attempt(student_client, form, [2, 2, 2, 2])
    body = student_client.get(f"/api/attempts/{state['id']}/score").get_json()

    assert body["total"]["scaled_score"] == 1600
    assert len(body["sections"]) == 2
    assert body["domains"] and body["difficulty"]


def test_every_score_payload_carries_the_approximation_caveat(student_client, form):
    state = run_attempt(student_client, form, [2, 1, 1, 2])
    body = student_client.get(f"/api/attempts/{state['id']}/score").get_json()

    assert body["approximation"] is True
    assert "not official SAT equating" in body["approximation_note"]
    assert body["scale_table"]["approximation"] is True


def test_the_review_carries_the_score_inline(student_client, form):
    state = run_attempt(student_client, form, [2, 2, 2, 2])
    review = student_client.get(f"/api/attempts/{state['id']}/review").get_json()

    assert review["score"]["total"]["scaled_score"] == 1600
    assert review["score"]["approximation"] is True


def test_another_student_cannot_read_your_score(client, form):
    from tests.conftest import register_student

    alice = register_student(client, "alice@example.com")
    bob = register_student(client, "bob@example.com")
    state = run_attempt(alice, form, [2, 2, 2, 2])

    assert bob.get(f"/api/attempts/{state['id']}/score").status_code == 404


def test_anonymous_callers_cannot_read_a_score(client, form):
    assert client.get("/api/attempts/any-id/score").status_code == 401
