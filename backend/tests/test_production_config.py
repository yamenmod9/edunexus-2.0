"""What production refuses to boot on.

Written after a real incident: DATABASE_URL was set to something SQLAlchemy
could not parse, and every deploy for two days died with

    sqlalchemy.exc.ArgumentError: Could not parse SQLAlchemy URL from given
    URL string

which names neither the variable nor what was wrong with it. The service kept
answering only because an older container was still running with an older
value. These tests pin the diagnosis that replaced it.
"""

import pytest

from app.config import ProductionConfig, _describe_db_url

GOOD_URL = "postgresql://user:hunter2@db.example.com:5432/postgres"


@pytest.fixture
def prod_env(monkeypatch):
    monkeypatch.setenv("SECRET_KEY", "a-real-secret")
    monkeypatch.setenv("DATABASE_URL", GOOD_URL)
    return monkeypatch


def test_a_valid_url_is_accepted(prod_env):
    assert ProductionConfig().SQLALCHEMY_DATABASE_URI == GOOD_URL


def test_a_supabase_style_url_is_rewritten_to_the_scheme_sqlalchemy_wants(prod_env):
    prod_env.setenv("DATABASE_URL", "postgres://user:hunter2@db.example.com:5432/postgres")
    assert ProductionConfig().SQLALCHEMY_DATABASE_URI.startswith("postgresql://")


def test_a_missing_url_still_fails_on_its_own_terms(prod_env):
    prod_env.delenv("DATABASE_URL")
    with pytest.raises(RuntimeError, match="DATABASE_URL must be set in production"):
        ProductionConfig()


def test_an_unparseable_url_names_the_variable(prod_env):
    prod_env.setenv("DATABASE_URL", "db.example.com:5432")
    with pytest.raises(RuntimeError, match="DATABASE_URL is not a usable"):
        ProductionConfig()


def test_the_failure_never_prints_the_credential(prod_env):
    # The whole point of describing the shape instead of the value: this
    # message ends up in deploy logs, which are not a secret store.
    prod_env.setenv("DATABASE_URL", '"postgresql://user:hunter2@db:5432/postgres"')
    with pytest.raises(RuntimeError) as caught:
        ProductionConfig()
    assert "hunter2" not in str(caught.value)


# --- the shape report itself -------------------------------------------
# Plain functions, not a class: pytest.ini disables class collection, because
# the domain has models called TestForm and TestAttempt.
#
# Each note has to distinguish one real paste mistake from the others.


def test_describe_reports_the_scheme_when_there_is_one():
    assert "scheme 'postgres'" in _describe_db_url("postgres://x")


def test_describe_reports_the_absence_of_a_scheme():
    assert "no scheme separator" in _describe_db_url("db.example.com:5432")


def test_describe_spots_a_trailing_newline():
    assert "contains a line break" in _describe_db_url(GOOD_URL + chr(10))


def test_describe_spots_surrounding_quotes():
    assert "is wrapped in quotes" in _describe_db_url('"' + GOOD_URL + '"')


def test_describe_spots_an_unresolved_railway_reference():
    # A reference to a service that has since been deleted renders as the
    # literal text rather than resolving, which is how this can be set and
    # still be nonsense.
    assert "unresolved" in _describe_db_url("${{Postgres.DATABASE_URL}}")


def test_describe_always_reports_the_length():
    assert "26 characters" in _describe_db_url("${{Postgres.DATABASE_URL}}")
