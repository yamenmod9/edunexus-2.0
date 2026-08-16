import json

from app.models import Question
from app.services.question_import import import_from_csv, import_from_json, import_records
from tests.conftest import make_grid_in, make_question

CSV_HEADER = (
    "section,domain,skill,difficulty,question_type,stimulus,stem,"
    "choices,correct_answer,rationale,source,external_id\n"
)


def test_import_records_creates_rows(app, db):
    result = import_records([make_question(), make_grid_in()])

    assert result.success
    assert result.created == 2
    assert db.session.query(Question).count() == 2


def test_import_reports_bad_row_by_index(app, db):
    records = [
        make_question(),
        make_question(domain="craft_structure"),  # invalid for math
        make_grid_in(),
    ]

    result = import_records(records)

    assert not result.success
    assert result.created == 2
    assert len(result.errors) == 1
    assert result.errors[0]["row"] == 1
    assert "domain" in result.errors[0]["errors"]


def test_valid_rows_import_despite_sibling_failure(app, db):
    result = import_records([make_question(), make_question(difficulty="bogus")])

    assert result.created == 1
    assert db.session.query(Question).count() == 1


def test_import_from_json_file(app, db, tmp_path):
    path = tmp_path / "questions.json"
    path.write_text(json.dumps([make_question(), make_grid_in()]), encoding="utf-8")

    result = import_from_json(str(path))

    assert result.success
    assert result.created == 2


def test_import_from_json_accepts_wrapped_object(app, db, tmp_path):
    path = tmp_path / "wrapped.json"
    path.write_text(json.dumps({"questions": [make_question()]}), encoding="utf-8")

    assert import_from_json(str(path)).created == 1


def test_import_from_csv_decodes_json_choices(app, db, tmp_path):
    path = tmp_path / "questions.csv"
    choices = '"[{""id"":""A"",""text"":""5""},{""id"":""B"",""text"":""6""}]"'
    path.write_text(
        CSV_HEADER
        + f'math,geometry_trigonometry,Right triangles,easy,multiple_choice,,"Hypotenuse?",{choices},A,,self_authored,\n',
        encoding="utf-8",
    )

    result = import_from_csv(str(path))

    assert result.success
    question = db.session.query(Question).one()
    assert question.choices == [{"id": "A", "text": "5"}, {"id": "B", "text": "6"}]


def test_csv_empty_cells_become_null_not_empty_string(app, db, tmp_path):
    path = tmp_path / "grid.csv"
    path.write_text(
        CSV_HEADER
        + 'math,problem_solving_data_analysis,Percentages,medium,grid_in,,"20% of 150?",,30,,self_authored,\n',
        encoding="utf-8",
    )

    assert import_from_csv(str(path)).success
    question = db.session.query(Question).one()
    assert question.choices is None
    assert question.stimulus is None
    assert question.external_id is None
