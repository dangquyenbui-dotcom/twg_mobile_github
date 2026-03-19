"""
TWG Mobile — Orders Module Routes
"""

import logging
from flask import Blueprint, render_template, request, jsonify, session
from auth.decorators import login_required
from modules.orders import queries
from modules.orders.service import create_sales_order, SOCreationError

logger = logging.getLogger(__name__)

orders_bp = Blueprint("orders", __name__)


@orders_bp.route("/new")
@login_required
def new_order():
    """Order entry wizard."""
    return render_template("orders/new.html")


# ---------------------------------------------------------------------------
# Read API — Customer & Item Search
# ---------------------------------------------------------------------------

@orders_bp.route("/api/customers/search")
@login_required
def api_customer_search():
    """Search customers by name, ID, or phone."""
    q = request.args.get("q", "").strip()
    if len(q) < 2:
        return jsonify([])
    results = queries.search_customers(q)
    return jsonify(results)


@orders_bp.route("/api/customers/<custno>")
@login_required
def api_customer_detail(custno):
    """Get full customer detail for pre-filling order fields."""
    cust = queries.get_customer_detail(custno)
    if not cust:
        return jsonify({"error": "Customer not found"}), 404
    return jsonify(cust)


@orders_bp.route("/api/items/search")
@login_required
def api_item_search():
    """Search inventory items by code or description."""
    q = request.args.get("q", "").strip()
    loctid = request.args.get("loctid", "LA").strip()
    if len(q) < 2:
        return jsonify([])
    results = queries.search_items(q, loctid)
    return jsonify(results)


@orders_bp.route("/api/warehouses")
@login_required
def api_warehouses():
    """List all warehouse locations."""
    results = queries.get_warehouses()
    return jsonify(results)


# ---------------------------------------------------------------------------
# Write API — Order Creation
# ---------------------------------------------------------------------------

@orders_bp.route("/api/create", methods=["POST"])
@login_required
def api_create_order():
    """Create a Sales Order in the ERP."""
    data = request.get_json()
    if not data:
        return jsonify({"success": False, "error": "No data provided"}), 400

    # Validate required fields
    errors = []
    if not data.get("custno"):
        errors.append("Customer is required")
    if not data.get("items") or len(data["items"]) == 0:
        errors.append("At least one line item is required")
    if not data.get("ponum"):
        errors.append("PO number is required")
    if errors:
        return jsonify({"success": False, "error": "; ".join(errors)}), 400

    user = session.get("user", {})
    region = user.get("region", "US")

    try:
        result = create_sales_order(data, region, user)
        return jsonify(result)
    except SOCreationError as e:
        logger.warning("SO creation failed (code=%d): %s", e.code, e.message)
        return jsonify({"success": False, "error": e.message, "code": e.code}), 400
    except Exception as e:
        logger.exception("Unexpected error in order creation")
        return jsonify({"success": False, "error": "Server error. Please try again."}), 500
