import pytest

from app.models import MODULE_2_VARIANTS, SECTION_ORDER, TestForm
from app.services.form_service import (
    DEFAULT_BLUEPRINT,
    FormAssemblyError,
    _target_counts,
    assemble_form,
)
from tests.conftest import SHORT_BLUEPRINT, seed_bank


def test_assembles_six_modules_two_per_section(db):
    seed_bank(db)
    form, _ = assemble_form("Form A", blueprint=SHORT_BLUEPRINT, seed=1)

    assert len(form.modules) == 6
    for section in SECTION_ORDER:
        assert form.module_for(section, 1, "standard") is not None
        for variant in MODULE_2_VARIANTS:
            assert form.module_for(section, 2, variant) is not None
    assert form.is_complete()


def test_every_module_has_the_blueprint_length(db):
    seed_bank(db)
    form, _ = assemble_form("Form A", blueprint=SHORT_BLUEPRINT, seed=1)

    for module in form.modules:
        expected = SHORT_BLUEPRINT[module.section]["questions_per_module"]
        assert module.question_count == expected


def test_modules_within_a_section_share_no_questions(db):
    # A student must never meet the same question twice in one test, and the
    # module 2 variants are drawn from the same pool as module 1.
    seed_bank(db)
    form, _ = assemble_form("Form A", blueprint=SHORT_BLUEPRINT, seed=1)

    for section in SECTION_ORDER:
        seen = []
        for module in form.modules:
            if module.section == section:
                seen.extend(fq.question_id for fq in module.form_questions)
        assert len(seen) == len(set(seen))


def test_modules_only_contain_questions_from_their_own_section(db):
    seed_bank(db)
    form, _ = assemble_form("Form A", blueprint=SHORT_BLUEPRINT, seed=1)

    for module in form.modules:
        for form_question in module.form_questions:
            assert form_question.question.section == module.section


def test_positions_are_contiguous_from_one(db):
    seed_bank(db)
    form, _ = assemble_form("Form A", blueprint=SHORT_BLUEPRINT, seed=1)

    for module in form.modules:
        positions = [fq.position for fq in module.form_questions]
        assert positions == list(range(1, len(positions) + 1))


def test_hard_variant_skews_harder_than_the_easy_variant(db):
    seed_bank(db, per_difficulty=12)
    blueprint = {
        s: {"questions_per_module": 8, "time_limit_seconds": 600} for s in SECTION_ORDER
    }
    form, report = assemble_form("Form A", blueprint=blueprint, seed=3)
    assert report["substitutions"] == []

    def hard_share(module):
        difficulties = [fq.question.difficulty for fq in module.form_questions]
        return difficulties.count("hard") / len(difficulties)

    for section in SECTION_ORDER:
        easy_module = form.module_for(section, 2, "easy")
        hard_module = form.module_for(section, 2, "hard")
        assert hard_share(hard_module) > hard_share(easy_module)


def test_thin_bank_is_rejected_with_a_shortfall_breakdown(db):
    seed_bank(db, per_difficulty=1)  # 3 per section; a short form needs 6
    with pytest.raises(FormAssemblyError) as excinfo:
        assemble_form("Form A", blueprint=SHORT_BLUEPRINT, seed=1)

    shortfalls = {s["section"]: s for s in excinfo.value.shortfalls}
    assert set(shortfalls) == set(SECTION_ORDER)
    assert shortfalls["math"]["needed"] == 6
    assert shortfalls["math"]["available"] == 3
    assert shortfalls["math"]["short_by"] == 3


def test_a_failed_assembly_writes_nothing(db):
    # Half a form is worse than none: it would route students into an empty
    # module 2 at the point of no return.
    seed_bank(db, per_difficulty=1)
    with pytest.raises(FormAssemblyError):
        assemble_form("Form A", blueprint=SHORT_BLUEPRINT, seed=1)

    db.session.rollback()
    assert db.session.query(TestForm).count() == 0


def test_duplicate_form_name_is_rejected(db):
    seed_bank(db)
    assemble_form("Form A", blueprint=SHORT_BLUEPRINT, seed=1)
    with pytest.raises(FormAssemblyError, match="already exists"):
        assemble_form("Form A", blueprint=SHORT_BLUEPRINT, seed=2)


def test_same_seed_assembles_the_same_form(db):
    seed_bank(db)
    first, _ = assemble_form("Form A", blueprint=SHORT_BLUEPRINT, seed=42)
    first_ids = {
        (m.section, m.sequence, m.variant): [fq.question_id for fq in m.form_questions]
        for m in first.modules
    }
    second, _ = assemble_form("Form B", blueprint=SHORT_BLUEPRINT, seed=42)
    second_ids = {
        (m.section, m.sequence, m.variant): [fq.question_id for fq in m.form_questions]
        for m in second.modules
    }
    assert first_ids == second_ids


def test_default_blueprint_matches_the_real_exam_shape(db):
    assert DEFAULT_BLUEPRINT["reading_writing"]["questions_per_module"] == 27
    assert DEFAULT_BLUEPRINT["reading_writing"]["time_limit_seconds"] == 32 * 60
    assert DEFAULT_BLUEPRINT["math"]["questions_per_module"] == 22
    assert DEFAULT_BLUEPRINT["math"]["time_limit_seconds"] == 35 * 60


def test_difficulty_targets_always_sum_to_the_module_length():
    # Rounding three shares down can lose a question; the remainder handling
    # is what stops a 27-question module coming out at 26.
    for total in range(1, 40):
        counts = _target_counts(total, {"easy": 0.30, "medium": 0.40, "hard": 0.30})
        assert sum(counts.values()) == total


# --- API surface -------------------------------------------------------


def test_admin_can_assemble_a_form_over_http(admin_client, db):
    seed_bank(db)
    response = admin_client.post(
        "/api/forms",
        json={"name": "API Form", "blueprint": SHORT_BLUEPRINT, "seed": 5},
    )
    assert response.status_code == 201
    body = response.get_json()
    assert len(body["modules"]) == 6
    assert body["assembly"]["substitutions"] == []


def test_student_cannot_assemble_a_form(student_client, db):
    seed_bank(db)
    response = student_client.post(
        "/api/forms", json={"name": "API Form", "blueprint": SHORT_BLUEPRINT}
    )
    assert response.status_code == 403


def test_anonymous_cannot_list_forms(client, form):
    assert client.get("/api/forms").status_code == 401


def test_student_form_listing_hides_the_variant_structure(student_client, form):
    body = student_client.get("/api/forms").get_json()
    listed = body["items"][0]
    # Which module 2 variants exist - and so which one they were given - is
    # not the student's to see before the score report.
    assert "modules" not in listed
    assert [s["section"] for s in listed["sections"]] == list(SECTION_ORDER)
    assert [m["sequence"] for m in listed["sections"][0]["modules"]] == [1, 2]


def test_admin_form_listing_shows_variants(admin_client, form):
    body = admin_client.get("/api/forms").get_json()
    assert len(body["items"][0]["modules"]) == 6


def test_assembly_over_http_reports_a_thin_bank(admin_client, db):
    seed_bank(db, per_difficulty=1)
    response = admin_client.post(
        "/api/forms", json={"name": "Too Big", "blueprint": SHORT_BLUEPRINT}
    )
    assert response.status_code == 422
    assert response.get_json()["shortfalls"]


def test_blueprint_must_cover_every_section(admin_client, db):
    seed_bank(db)
    response = admin_client.post(
        "/api/forms",
        json={
            "name": "Half",
            "blueprint": {"math": SHORT_BLUEPRINT["math"]},
        },
    )
    assert response.status_code == 422
    assert "blueprint" in response.get_json()["errors"]


def test_form_with_attempts_cannot_be_deleted(admin_client, student_client, form):
    student_client.post("/api/attempts", json={"form_id": form.id})
    response = admin_client.delete(f"/api/forms/{form.id}")
    assert response.status_code == 409
    assert response.get_json()["attempts"] == 1


def test_unused_form_can_be_deleted(admin_client, form):
    assert admin_client.delete(f"/api/forms/{form.id}").status_code == 204


def test_a_question_used_by_a_form_cannot_be_deleted(admin_client, form, db):
    # The foreign key is RESTRICT, so without an explicit check this surfaces
    # as a 500 from the database rather than an explainable refusal.
    question_id = form.modules[0].form_questions[0].question_id
    response = admin_client.delete(f"/api/questions/{question_id}")
    assert response.status_code == 409
    assert response.get_json()["usage"]["forms"] == 1


def test_a_question_outside_every_form_is_still_deletable(admin_client, db):
    from tests.conftest import make_question

    created = admin_client.post("/api/questions", json=make_question()).get_json()
    assert admin_client.delete(f"/api/questions/{created['id']}").status_code == 204
