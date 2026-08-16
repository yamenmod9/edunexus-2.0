from app.routes.auth import bp as auth_bp
from app.routes.health import bp as health_bp
from app.routes.questions import bp as questions_bp


def register_routes(app):
    app.register_blueprint(health_bp)
    app.register_blueprint(auth_bp)
    app.register_blueprint(questions_bp)
