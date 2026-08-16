from marshmallow import Schema, fields, validate, validates_schema, ValidationError

from app.models import DIFFICULTIES, DOMAINS_BY_SECTION, QUESTION_TYPES, SECTIONS, SOURCES


class ChoiceSchema(Schema):
    id = fields.Str(required=True)
    text = fields.Str(required=True)


class QuestionSchema(Schema):
    id = fields.Str(dump_only=True)

    section = fields.Str(required=True, validate=validate.OneOf(SECTIONS))
    domain = fields.Str(required=True)
    skill = fields.Str(required=True, validate=validate.Length(min=1))
    difficulty = fields.Str(required=True, validate=validate.OneOf(DIFFICULTIES))
    question_type = fields.Str(required=True, validate=validate.OneOf(QUESTION_TYPES))

    stimulus = fields.Str(load_default=None, allow_none=True)
    stem = fields.Str(required=True, validate=validate.Length(min=1))
    choices = fields.List(fields.Nested(ChoiceSchema), load_default=None, allow_none=True)
    correct_answer = fields.Str(required=True, validate=validate.Length(min=1))
    rationale = fields.Str(load_default=None, allow_none=True)
    figure_url = fields.Str(load_default=None, allow_none=True)

    source = fields.Str(load_default="self_authored", validate=validate.OneOf(SOURCES))
    external_id = fields.Str(load_default=None, allow_none=True)

    created_at = fields.DateTime(dump_only=True)
    updated_at = fields.DateTime(dump_only=True)

    @validates_schema
    def validate_domain_matches_section(self, data, **kwargs):
        section = data.get("section")
        domain = data.get("domain")
        if section not in DOMAINS_BY_SECTION:
            return
        if domain not in DOMAINS_BY_SECTION[section]:
            raise ValidationError(
                f"domain '{domain}' is not valid for section '{section}'. "
                f"Expected one of: {DOMAINS_BY_SECTION[section]}",
                field_name="domain",
            )

    @validates_schema
    def validate_choices_match_question_type(self, data, **kwargs):
        question_type = data.get("question_type")
        choices = data.get("choices")
        if question_type == "multiple_choice" and not choices:
            raise ValidationError(
                "multiple_choice questions require a non-empty 'choices' array.",
                field_name="choices",
            )
        if question_type == "grid_in" and choices:
            raise ValidationError(
                "grid_in questions must not have 'choices'.",
                field_name="choices",
            )

    @validates_schema
    def validate_grid_in_not_math_only(self, data, **kwargs):
        if data.get("question_type") == "grid_in" and data.get("section") != "math":
            raise ValidationError(
                "grid_in questions are math-only.",
                field_name="question_type",
            )


question_schema = QuestionSchema()
questions_schema = QuestionSchema(many=True)
question_update_schema = QuestionSchema(partial=True)
