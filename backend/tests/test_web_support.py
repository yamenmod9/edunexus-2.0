"""The backend surface the web client depends on: CORS, the taxonomy feed,
and bulk import from the admin UI."""

import io
import json

from app.models import DOMAINS_BY_SECTION, SECTION_ORDER
from tests.conftest import make_question, seed_bank

ALLOWED_ORIGIN = "http://localhost:5173"


# --- CORS ----------------------------------------------------------------


def test_an_allowed_origin_gets_the_cors_header(client):
    response = client.get("/health", headers={"Origin": ALLOWED_ORIGIN})
    assert response.headers["Access-Control-Allow-Origin"] == ALLOWED_ORIGIN
    assert "Authorization" in response.headers["Access-Control-Allow-Headers"]


def test_an_unknown_origin_gets_nothing(client):
    response = client.get("/health", headers={"Origin": "http://evil.example"})
    assert "Access-Control-Allow-Origin" not in response.headers


def test_a_lookalike_origin_is_not_allowed(client):
    # The bug prefix matching would introduce: this starts with the allowed
    # origin but is a different site.
    for origin in (
        ALLOWED_ORIGIN + ".evil.example",
        "http://localhost:5173.evil.example",
        "http://notlocalhost:5173",
    ):
        response = client.get("/health", headers={"Origin": origin})
        assert "Access-Control-Allow-Origin" not in response.headers, origin


def test_a_request_with_no_origin_is_untouched(client):
    # Native clients and curl send no Origin and must not be affected.
    response = client.get("/health")
    assert response.status_code == 200
    assert "Access-Control-Allow-Origin" not in response.headers


def test_the_response_varies_on_origin(client):
    response = client.get("/health", headers={"Origin": ALLOWED_ORIGIN})
    assert "Origin" in response.headers.get("Vary", "")


def test_preflight_is_answered_for_a_real_route(client):
    response = client.options(
        "/api/questions",
        headers={
            "Origin": ALLOWED_ORIGIN,
            "Access-Control-Request-Method": "GET",
            "Access-Control-Request-Headers": "Authorization",
        },
    )
    assert response.status_code == 200
    assert response.headers["Access-Control-Allow-Origin"] == ALLOWED_ORIGIN


def test_cors_headers_ride_along_on_an_error_response(client):
    # A 401 the browser cannot read is indistinguishable from a network
    # failure, which makes every auth bug look like a CORS bug.
    response = client.get("/api/questions", headers={"Origin": ALLOWED_ORIGIN})
    assert response.status_code == 401
    assert response.headers["Access-Control-Allow-Origin"] == ALLOWED_ORIGIN


# --- taxonomy ------------------------------------------------------------


def test_taxonomy_requires_a_login(client):
    assert client.get("/api/taxonomy").status_code == 401


def test_taxonomy_matches_the_server_side_vocabulary(student_client):
    body = student_client.get("/api/taxonomy").get_json()

    assert [s["value"] for s in body["sections"]] == list(SECTION_ORDER)
    for section in body["sections"]:
        assert [d["value"] for d in section["domains"]] == list(
            DOMAINS_BY_SECTION[section["value"]]
        )
    assert [d["value"] for d in body["difficulties"]] == ["easy", "medium", "hard"]
    assert [t["value"] for t in body["question_types"]] == [
        "multiple_choice",
        "grid_in",
    ]


def test_taxonomy_labels_reading_and_writing_readably(student_client):
    body = student_client.get("/api/taxonomy").get_json()
    labels = {s["value"]: s["label"] for s in body["sections"]}
    assert labels["reading_writing"] == "Reading & Writing"
    assert labels["math"] == "Math"


def test_taxonomy_labels_domains_by_their_real_names(student_client):
    """CLAUDE.md section 5 fixes these names exactly.

    Deriving them by title-casing the enum drops every ampersand and hyphen -
    "Craft & Structure" becomes "Craft Structure" - and these strings are what
    a student reads on the score report and what analytics groups by, so the
    drift is visible rather than cosmetic.
    """
    body = student_client.get("/api/taxonomy").get_json()
    labels = {
        d["value"]: d["label"]
        for section in body["sections"]
        for d in section["domains"]
    }
    assert labels == {
        "algebra": "Algebra",
        "advanced_math": "Advanced Math",
        "problem_solving_data_analysis": "Problem-Solving & Data Analysis",
        "geometry_trigonometry": "Geometry & Trigonometry",
        "information_ideas": "Information & Ideas",
        "craft_structure": "Craft & Structure",
        "expression_of_ideas": "Expression of Ideas",
        "standard_english_conventions": "Standard English Conventions",
    }


def test_taxonomy_reports_skills_actually_present_in_the_bank(student_client, db):
    seed_bank(db)
    body = student_client.get("/api/taxonomy").get_json()

    algebra = next(
        d
        for s in body["sections"]
        if s["value"] == "math"
        for d in s["domains"]
        if d["value"] == "algebra"
    )
    assert algebra["skills"] == ["algebra skill"]


def test_taxonomy_lists_every_domain_even_with_an_empty_bank(student_client):
    body = student_client.get("/api/taxonomy").get_json()
    for section in body["sections"]:
        assert len(section["domains"]) == 4
        assert all(d["skills"] == [] for d in section["domains"])


# --- bulk import ---------------------------------------------------------

CSV_HEADER = (
    "section,domain,skill,difficulty,question_type,stem,choices,correct_answer,source\n"
)
CSV_ROW = (
    'math,algebra,Linear equations,easy,multiple_choice,"What is 2+2?",'
    '"[{""id"": ""A"", ""text"": ""3""}, {""id"": ""B"", ""text"": ""4""}]",B,self_authored\n'
)


def upload(client, name, body):
    return client.post(
        "/api/questions/import",
        data={"file": (io.BytesIO(body.encode()), name)},
        content_type="multipart/form-data",
    )


def test_a_student_cannot_bulk_import(student_client):
    assert upload(student_client, "q.csv", CSV_HEADER + CSV_ROW).status_code == 403


def test_anonymous_cannot_bulk_import(client):
    assert client.post("/api/questions/import").status_code == 401


def test_a_csv_upload_imports(admin_client):
    response = upload(admin_client, "questions.csv", CSV_HEADER + CSV_ROW)
    assert response.status_code == 200
    body = response.get_json()
    assert (body["imported"], body["failed"]) == (1, 0)
    assert admin_client.get("/api/questions").get_json()["total"] == 1


def test_a_json_upload_imports(admin_client):
    payload = json.dumps([make_question(), make_question(difficulty="hard")])
    response = upload(admin_client, "questions.json", payload)
    assert response.status_code == 200
    assert response.get_json()["imported"] == 2


def test_a_raw_json_body_imports(admin_client):
    response = admin_client.post("/api/questions/import", json=[make_question()])
    assert response.status_code == 200
    assert response.get_json()["imported"] == 1


def test_a_partly_bad_import_keeps_the_good_rows_and_reports_the_rest(admin_client):
    payload = json.dumps(
        [make_question(), make_question(domain="not_a_domain"), make_question()]
    )
    response = upload(admin_client, "questions.json", payload)

    # 207: this genuinely is a mixed outcome, and flattening it to 200 or 422
    # would either hide the failures or imply nothing was written.
    assert response.status_code == 207
    body = response.get_json()
    assert (body["imported"], body["failed"]) == (2, 1)
    assert body["errors"][0]["row"] == 1
    assert "domain" in body["errors"][0]["errors"]


def test_an_unsupported_extension_is_refused(admin_client):
    assert upload(admin_client, "questions.txt", CSV_HEADER).status_code == 422


def test_malformed_json_is_refused_with_a_readable_message(admin_client):
    response = upload(admin_client, "questions.json", "{not json")
    assert response.status_code == 422
    assert "could not parse" in response.get_json()["error"]


def test_an_empty_import_is_refused(admin_client):
    response = upload(admin_client, "questions.json", "[]")
    assert response.status_code == 422
    assert "no questions" in response.get_json()["error"]


def test_a_json_object_that_is_not_a_list_is_refused(admin_client):
    response = upload(admin_client, "questions.json", '{"nope": 1}')
    assert response.status_code == 422


def test_an_oversized_upload_is_refused(admin_client):
    padding = "x" * (2 * 1024 * 1024 + 10)
    response = upload(admin_client, "questions.json", padding)
    assert response.status_code == 413


def test_a_non_utf8_upload_is_refused(admin_client):
    response = admin_client.post(
        "/api/questions/import",
        data={"file": (io.BytesIO(b"\xff\xfe\x00bad"), "questions.csv")},
        content_type="multipart/form-data",
    )
    assert response.status_code == 422
    assert "UTF-8" in response.get_json()["error"]
