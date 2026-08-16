"""Answer comparison. The test engine and practice mode share this, so a bug
here shows up as a wrong routing decision as well as a wrong score."""

import pytest

from app.models import Question
from app.services.grading_service import grade


def mc(correct="B"):
    return Question(question_type="multiple_choice", correct_answer=correct)


def grid(correct="3"):
    return Question(question_type="grid_in", correct_answer=correct)


@pytest.mark.parametrize("submitted,expected", [("B", True), ("b", True), ("A", False)])
def test_multiple_choice_is_case_insensitive(submitted, expected):
    assert grade(mc(), submitted) is expected


@pytest.mark.parametrize("submitted", ["", "   ", None])
def test_a_blank_answer_is_never_correct(submitted):
    assert grade(mc(), submitted) is False
    assert grade(grid(), submitted) is False


def test_surrounding_whitespace_does_not_change_a_grid_in_answer():
    assert grade(grid("3"), "  3  ") is True


def test_grid_in_accepts_equivalent_numeric_forms():
    assert grade(grid("0.5"), ".5") is True
    assert grade(grid("0.5"), "1/2") is True
    assert grade(grid(".5"), "0.50") is True


def test_grid_in_accepts_any_of_several_listed_answers():
    question = grid("3|-3")
    assert grade(question, "3") is True
    assert grade(question, "-3") is True
    assert grade(question, "4") is False


def test_grid_in_rejects_a_near_miss():
    assert grade(grid("0.5"), "0.51") is False


def test_a_non_numeric_grid_in_falls_back_to_text_comparison():
    assert grade(grid("x=4"), "x=4") is True
    assert grade(grid("x=4"), "x=5") is False


def test_division_by_zero_in_a_submitted_fraction_is_not_a_crash():
    assert grade(grid("0.5"), "1/0") is False
