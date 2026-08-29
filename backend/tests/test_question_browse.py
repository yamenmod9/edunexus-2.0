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
        assert domain["total"] == sum(domain["skills"].values())


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


def test_counts_require_a_signed_in_user(client):
    assert client.get("/api/questions/counts").status_code == 401
