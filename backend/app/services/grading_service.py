"""Answer comparison. Kept separate from the attempt state machine so both
the test engine and practice mode grade identically."""

from app.models import Question


def _normalize(value):
    return (value or "").strip()


def _as_number(value):
    """Grid-in answers are numeric, so 0.5, .5 and 1/2 must all compare equal.
    Returns None when the text is not numeric, which falls back to a string
    comparison."""
    text = _normalize(value)
    if not text:
        return None
    try:
        return float(text)
    except ValueError:
        pass
    # College Board accepts fractions in grid-ins.
    if text.count("/") == 1:
        numerator, _, denominator = text.partition("/")
        try:
            denominator_value = float(denominator.strip())
            if denominator_value == 0:
                return None
            return float(numerator.strip()) / denominator_value
        except ValueError:
            return None
    return None


def accepted_answers(question):
    """Grid-ins may list several accepted forms, pipe-separated."""
    if question.question_type == "grid_in":
        return [part for part in (p.strip() for p in question.correct_answer.split("|")) if part]
    return [_normalize(question.correct_answer)]


def grade(question: Question, submitted) -> bool:
    submitted = _normalize(submitted)
    if not submitted:
        return False

    if question.question_type == "multiple_choice":
        # Choice ids are single letters; case should not decide a score.
        return submitted.casefold() == _normalize(question.correct_answer).casefold()

    submitted_number = _as_number(submitted)
    for accepted in accepted_answers(question):
        if submitted.casefold() == accepted.casefold():
            return True
        accepted_number = _as_number(accepted)
        if (
            submitted_number is not None
            and accepted_number is not None
            and abs(submitted_number - accepted_number) < 1e-9
        ):
            return True
    return False
