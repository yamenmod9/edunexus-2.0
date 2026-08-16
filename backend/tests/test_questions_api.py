from tests.conftest import make_grid_in, make_question


def test_health(client):
    resp = client.get("/health")
    assert resp.status_code == 200
    assert resp.get_json() == {"status": "ok"}


def test_create_multiple_choice(admin_client):
    resp = admin_client.post("/api/questions", json=make_question())
    assert resp.status_code == 201
    body = resp.get_json()
    assert body["id"]
    assert body["section"] == "math"
    assert len(body["choices"]) == 4


def test_create_grid_in_stores_null_choices(admin_client):
    resp = admin_client.post("/api/questions", json=make_grid_in())
    assert resp.status_code == 201
    assert resp.get_json()["choices"] is None


def test_domain_must_match_section(admin_client):
    resp = admin_client.post("/api/questions", json=make_question(domain="craft_structure"))
    assert resp.status_code == 422
    assert "domain" in resp.get_json()["errors"]


def test_grid_in_is_math_only(admin_client):
    payload = make_grid_in(section="reading_writing", domain="information_ideas")
    resp = admin_client.post("/api/questions", json=payload)
    assert resp.status_code == 422
    assert "question_type" in resp.get_json()["errors"]


def test_multiple_choice_requires_choices(admin_client):
    resp = admin_client.post("/api/questions", json=make_question(choices=None))
    assert resp.status_code == 422
    assert "choices" in resp.get_json()["errors"]


def test_grid_in_rejects_choices(admin_client):
    payload = make_grid_in(choices=[{"id": "A", "text": "3"}])
    resp = admin_client.post("/api/questions", json=payload)
    assert resp.status_code == 422
    assert "choices" in resp.get_json()["errors"]


def test_invalid_difficulty_rejected(admin_client):
    resp = admin_client.post("/api/questions", json=make_question(difficulty="impossible"))
    assert resp.status_code == 422
    assert "difficulty" in resp.get_json()["errors"]


def test_get_by_id_and_404(admin_client):
    created = admin_client.post("/api/questions", json=make_question()).get_json()

    assert admin_client.get(f"/api/questions/{created['id']}").status_code == 200
    assert admin_client.get("/api/questions/nope").status_code == 404


def test_filter_by_section_and_domain(admin_client):
    admin_client.post("/api/questions", json=make_question())
    admin_client.post("/api/questions", json=make_grid_in())
    admin_client.post(
        "/api/questions",
        json=make_question(
            section="reading_writing",
            domain="craft_structure",
            skill="Words in context",
        ),
    )

    assert admin_client.get("/api/questions").get_json()["total"] == 3
    assert admin_client.get("/api/questions?section=math").get_json()["total"] == 2
    assert admin_client.get("/api/questions?section=reading_writing").get_json()["total"] == 1
    assert admin_client.get("/api/questions?domain=algebra").get_json()["total"] == 1
    assert admin_client.get("/api/questions?difficulty=hard").get_json()["total"] == 1
    assert (
        admin_client.get("/api/questions?section=math&domain=algebra").get_json()["total"] == 1
    )


def test_pagination(admin_client):
    for i in range(5):
        admin_client.post("/api/questions", json=make_question(skill=f"Skill {i}"))

    body = admin_client.get("/api/questions?page=1&per_page=2").get_json()
    assert body["total"] == 5
    assert body["pages"] == 3
    assert len(body["items"]) == 2


def test_patch_updates_field(admin_client):
    created = admin_client.post("/api/questions", json=make_question()).get_json()

    resp = admin_client.patch(f"/api/questions/{created['id']}", json={"difficulty": "easy"})
    assert resp.status_code == 200
    assert resp.get_json()["difficulty"] == "easy"


def test_patch_rejects_invalid_merged_state(admin_client):
    """A partial update must not be able to leave section/domain inconsistent."""
    created = admin_client.post("/api/questions", json=make_question()).get_json()

    resp = admin_client.patch(
        f"/api/questions/{created['id']}", json={"domain": "information_ideas"}
    )
    assert resp.status_code == 422
    assert "domain" in resp.get_json()["errors"]


def test_delete(admin_client):
    created = admin_client.post("/api/questions", json=make_question()).get_json()

    assert admin_client.delete(f"/api/questions/{created['id']}").status_code == 204
    assert admin_client.get(f"/api/questions/{created['id']}").status_code == 404
    assert admin_client.delete(f"/api/questions/{created['id']}").status_code == 404
