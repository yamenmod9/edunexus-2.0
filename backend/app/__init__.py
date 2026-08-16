from flask import Flask

from app.config import get_config
from app.cors import init_cors
from app.extensions import db, migrate
from app.routes import register_routes

# Imported for its side effect of registering model metadata with `db`,
# which both `flask db migrate` and `db.create_all()` (used in tests) need.
from app import models  # noqa: F401


def create_app(config_name=None):
    app = Flask(__name__)
    app.config.from_object(get_config(config_name))

    db.init_app(app)
    migrate.init_app(app, db)

    init_cors(app)
    register_routes(app)

    return app
