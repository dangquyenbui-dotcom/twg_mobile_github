"""
TWG Mobile — Orders Module Routes
"""

from flask import Blueprint, render_template

orders_bp = Blueprint("orders", __name__)


@orders_bp.route("/new")
def new_order():
    """Order entry wizard."""
    return render_template("orders/new.html")
