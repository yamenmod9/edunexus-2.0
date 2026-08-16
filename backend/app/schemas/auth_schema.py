import re

from marshmallow import (
    Schema,
    ValidationError,
    fields,
    pre_load,
    validate,
    validates,
)

PASSWORD_MIN_LENGTH = 10


def _validate_password_strength(value):
    if len(value) < PASSWORD_MIN_LENGTH:
        raise ValidationError(
            f"password must be at least {PASSWORD_MIN_LENGTH} characters"
        )
    if not re.search(r"[A-Za-z]", value):
        raise ValidationError("password must contain a letter")
    if not re.search(r"\d", value):
        raise ValidationError("password must contain a digit")


class _EmailStripMixin:
    @pre_load
    def strip_email(self, data, **kwargs):
        # Email fields reject surrounding whitespace, and people paste
        # addresses with it constantly. Trim before validating rather than
        # rejecting an otherwise valid address.
        if isinstance(data, dict) and isinstance(data.get("email"), str):
            data = {**data, "email": data["email"].strip()}
        return data


class RegisterSchema(_EmailStripMixin, Schema):
    email = fields.Email(required=True, validate=validate.Length(max=255))
    password = fields.Str(required=True)

    @validates("password")
    def validate_password(self, value, **kwargs):
        _validate_password_strength(value)


class LoginSchema(_EmailStripMixin, Schema):
    email = fields.Email(required=True)
    password = fields.Str(required=True)


class RefreshSchema(Schema):
    refresh_token = fields.Str(required=True, validate=validate.Length(min=1))


class ChangePasswordSchema(Schema):
    current_password = fields.Str(required=True)
    new_password = fields.Str(required=True)

    @validates("new_password")
    def validate_new_password(self, value, **kwargs):
        _validate_password_strength(value)


register_schema = RegisterSchema()
login_schema = LoginSchema()
refresh_schema = RefreshSchema()
change_password_schema = ChangePasswordSchema()
