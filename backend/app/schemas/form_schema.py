from marshmallow import Schema, ValidationError, fields, validate, validates_schema

from app.models import SECTION_ORDER


class SectionBlueprintSchema(Schema):
    questions_per_module = fields.Int(
        required=True, validate=validate.Range(min=1, max=100)
    )
    time_limit_seconds = fields.Int(
        required=True, validate=validate.Range(min=30, max=4 * 3600)
    )


class CreateFormSchema(Schema):
    name = fields.Str(required=True, validate=validate.Length(min=1, max=255))
    description = fields.Str(load_default=None, allow_none=True)
    # Optional: omitting it assembles a full-length form at real Digital SAT
    # dimensions. Supplying it is mainly for short practice forms.
    blueprint = fields.Dict(
        keys=fields.Str(validate=validate.OneOf(SECTION_ORDER)),
        values=fields.Nested(SectionBlueprintSchema),
        load_default=None,
        allow_none=True,
    )
    # Pinning the seed makes assembly reproducible, which is what lets a test
    # assert on composition.
    seed = fields.Int(load_default=None, allow_none=True)
    activate = fields.Bool(load_default=True)

    @validates_schema
    def blueprint_covers_every_section(self, data, **kwargs):
        blueprint = data.get("blueprint")
        if blueprint is None:
            return
        missing = [s for s in SECTION_ORDER if s not in blueprint]
        if missing:
            raise ValidationError(
                "blueprint must cover every section; missing: "
                + ", ".join(missing),
                field_name="blueprint",
            )


create_form_schema = CreateFormSchema()
