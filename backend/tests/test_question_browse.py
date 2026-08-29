"""The practice browser's two API needs: category counts, and picking more
than one category at a time.

Both exist for the same screen — a two-column browse of every category with a
number beside it — and both are things the question list could not do before:
it counted nothing, and every filter was a single equality test.
"""

from tests.conftest import make_question, seed_bank


def test_counts_group_by_section_domain_and_skill(student_client, db):
    seed_bank(db, per_difficulty=2)

    counts = student_client.get("/api/questions/counts").get_json()

    assert counts["total"] == sum(
        section["total"] for section in counts["sections"].values()
    )
    math = counts["sections"]["math"]
    assert math["total"] == sum(d["total"] for d in math["domains"].values())
    for domain in math["domains"].values():
        assert domain["total"] == sum(s["total"] for s in domain["skills"].values())


def test_counts_honour_the_same_filters_as_the_question_list(student_client, db):
    # With difficulty set, the browser has to say how many HARD questions each
    # category holds, or it sends students into pools that turn out to be empty.
    seed_bank(db, per_difficulty=2)

    everything = student_client.get("/api/questions/counts").get_json()
    hard = student_client.get("/api/questions/counts?difficulty=hard").get_json()

    assert hard["total"] < everything["total"]
    listed = student_client.get("/api/questions?difficulty=hard&per_page=200").get_json()
    assert hard["total"] == listed["total"]


def test_counts_omit_a_category_that_has_nothing_in_it(student_client, db):
    db.session.add_all([])
    student_client.get("/api/questions/counts")

    counts = student_client.get("/api/questions/counts?difficulty=hard").get_json()
    assert counts["total"] == 0
    assert counts["sections"] == {}


def test_a_repeated_filter_returns_the_union_of_both_categories(admin_client, db):
    for domain, skill in [
        ("algebra", "Linear equations"),
        ("geometry_trigonometry", "Circles"),
        ("advanced_math", "Quadratics"),
    ]:
        admin_client.post("/api/questions", json=make_question(domain=domain, skill=skill))

    both = admin_client.get(
        "/api/questions?domain=algebra&domain=geometry_trigonometry&per_page=200"
    ).get_json()

    assert both["total"] == 2
    assert {item["domain"] for item in both["items"]} == {
        "algebra",
        "geometry_trigonometry",
    }


def test_one_value_still_behaves_as_an_equality_test(admin_client, db):
    admin_client.post("/api/questions", json=make_question(domain="algebra"))
    admin_client.post("/api/questions", json=make_question(domain="advanced_math"))

    only = admin_client.get("/api/questions?domain=algebra&per_page=200").get_json()

    assert only["total"] == 1
    assert only["items"][0]["domain"] == "algebra"


def test_values_within_a_field_are_or_but_fields_are_and(admin_client, db):
    # Algebra + Geometry + hard means hard questions from either domain, which
    # is what ticking those three controls looks like it should do.
    admin_client.post(
        "/api/questions", json=make_question(domain="algebra", difficulty="hard")
    )
    admin_client.post(
        "/api/questions", json=make_question(domain="algebra", difficulty="easy")
    )
    admin_client.post(
        "/api/questions",
        json=make_question(domain="geometry_trigonometry", difficulty="hard", skill="Circles"),
    )

    result = admin_client.get(
        "/api/questions?domain=algebra&domain=geometry_trigonometry"
        "&difficulty=hard&per_page=200"
    ).get_json()

    assert result["total"] == 2
    assert all(item["difficulty"] == "hard" for item in result["items"])


def test_an_empty_repeated_filter_is_ignored_rather_than_matching_nothing(
    admin_client, db
):
    # `?domain=&domain=` is what a cleared multi-select serialises to.
    admin_client.post("/api/questions", json=make_question())

    result = admin_client.get("/api/questions?domain=&domain=&per_page=200").get_json()

    assert result["total"] == 1


def test_counts_report_how_much_the_student_has_already_solved(student_client, db):
    seed_bank(db, per_difficulty=2)

    before = student_client.get("/api/questions/counts").get_json()
    assert before["solved"] == 0

    listed = student_client.get("/api/questions?section=math&per_page=1").get_json()
    question = listed["items"][0]
    student_client.post(f"/api/questions/{question['id']}/check", json={"answer": "B"})

    after = student_client.get("/api/questions/counts").get_json()
    assert after["solved"] == 1
    assert after["total"] == before["total"]

    domain = after["sections"][question["section"]]["domains"][question["domain"]]
    assert domain["solved"] == 1
    assert domain["skills"][question["skill"]]["solved"] == 1


def test_answering_the_same_question_twice_counts_once(student_client, db):
    # practice_responses is append-only, so a student who redoes one question
    # ten times must not look like they finished the category.
    seed_bank(db, per_difficulty=2)
    listed = student_client.get("/api/questions?per_page=1").get_json()
    question_id = listed["items"][0]["id"]

    for _ in range(3):
        student_client.post(f"/api/questions/{question_id}/check", json={"answer": "B"})

    assert student_client.get("/api/questions/counts").get_json()["solved"] == 1


def test_one_students_practice_does_not_show_in_anothers_counts(client, db):
    from tests.conftest import register_student

    seed_bank(db, per_difficulty=2)
    first = register_student(client, "first-counter@example.com")
    listed = first.get("/api/questions?per_page=1").get_json()
    first.post(f"/api/questions/{listed['items'][0]['id']}/check", json={"answer": "B"})

    assert first.get("/api/questions/counts").get_json()["solved"] == 1

    second = register_student(client, "second-counter@example.com")
    assert second.get("/api/questions/counts").get_json()["solved"] == 0


def test_counts_require_a_signed_in_user(client):
    assert client.get("/api/questions/counts").status_code == 401
