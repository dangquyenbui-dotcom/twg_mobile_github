"""
TWG Mobile — Flask Application Factory
"""

import os
import msal
from flask import Flask, redirect, url_for
from flask_session import Session

from twg_mobile.config import Config


def create_app():
    """Create and configure the Flask application."""

    app = Flask(__name__)
    app.config.from_object(Config)

    # ---------- Server-side session ----------
    os.makedirs(app.config["SESSION_FILE_DIR"], exist_ok=True)
    Session(app)

    # ---------- MSAL confidential client ----------
    app.msal_app = msal.ConfidentialClientApplication(
        client_id=app.config["AZURE_CLIENT_ID"],
        client_credential=app.config["AZURE_CLIENT_SECRET"],
        authority=app.config["AZURE_AUTHORITY"],
    )

    # ---------- Template globals ----------
    @app.context_processor
    def inject_globals():
        """Make app_version available in every template for cache busting."""
        return {"app_version": app.config["APP_VERSION"]}

    # ---------- Register blueprints ----------
    from twg_mobile.auth.routes import auth_bp

    app.register_blueprint(auth_bp)

    # Future feature modules — uncomment as they are built:
    # from twg_mobile.modules.orders.routes import orders_bp
    # from twg_mobile.modules.customers.routes import customers_bp
    # from twg_mobile.modules.inventory.routes import inventory_bp
    # app.register_blueprint(orders_bp, url_prefix="/orders")
    # app.register_blueprint(customers_bp, url_prefix="/customers")
    # app.register_blueprint(inventory_bp, url_prefix="/inventory")

    # ---------- Root route ----------
    @app.route("/")
    def index():
        """Redirect to the home/dashboard page (orders for now)."""
        from flask import session as flask_session

        if "user" not in flask_session:
            return redirect(url_for("auth.login"))
        # Once the orders module is live this will point there.
        return redirect(url_for("auth.profile"))

    return app
