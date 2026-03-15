# TWG Mobile

Mobile-first Progressive Web App for **The Wheel Group** sales team.
Built with Flask, Microsoft Entra ID SSO, and SQL Server.

> **Version 1.2.2** &mdash; Order Entry Wizard live, foundation modules scaffolded.

---

## Table of Contents

- [Overview](#overview)
- [Status](#status)
- [Features](#features)
- [Architecture](#architecture)
- [Project Structure](#project-structure)
- [Prerequisites](#prerequisites)
- [Setup](#setup)
- [Running](#running)
- [Environment Variables](#environment-variables)
- [Authentication & Authorization](#authentication--authorization)
- [Database](#database)
- [PWA & Service Worker](#pwa--service-worker)
- [UI & Theming](#ui--theming)
- [Order Entry Wizard](#order-entry-wizard)
- [Dialog System](#dialog-system)
- [iOS-Specific Handling](#ios-specific-handling)
- [Module Development Guide](#module-development-guide)

---

## Overview

TWG Mobile gives sales reps a fast, native-feeling app they can install on their iPhone and use in the field &mdash; even with spotty connectivity. The app connects to The Wheel Group's ERP system via dual-region SQL Server databases and authenticates users through Microsoft Entra ID single sign-on.

Key design goals:

- **iPhone-first** &mdash; optimized for one-handed mobile use
- **Installable PWA** &mdash; home screen icon, standalone mode, offline fallback
- **Secure** &mdash; server-side sessions, role-based access, no client-side secrets
- **Fast** &mdash; cache-first service worker, minimal JavaScript (vanilla, no frameworks)

---

## Status

**Phase: Foundation Scaffold + Order Entry**

### Built & Working

| Area | Details |
|------|---------|
| App Shell | Flask app factory, server-side sessions, error pages |
| Authentication | Microsoft Entra ID SSO (login, callback, logout, profile) |
| Authorization | Role-based access control with decorators |
| Database | Dual-region SQL Server helper (US/CA) |
| PWA | Manifest, service worker, offline fallback, app icons |
| UI | Mobile-first responsive layout, bottom nav, light/dark theme |
| Dialogs | Custom alert/confirm/danger system replacing native browser dialogs |
| Order Entry | Full 4-step wizard: Customer &rarr; Details &rarr; Items &rarr; Review |

### Pending

- Customers module &mdash; database queries, list/detail views
- Inventory module &mdash; database queries, search UI
- Orders module &mdash; save to database, order history, order detail view
- Push notifications

---

## Features

### Progressive Web App
- Installable to home screen on iOS and Android
- Standalone display mode (no browser chrome)
- Offline fallback page when network is unavailable
- Cache-first strategy for static assets, network-first for pages
- Version-based cache busting via `APP_VERSION`

### Authentication
- Microsoft Entra ID (Azure AD) OAuth 2.0 authorization code flow
- Automatic role mapping from Entra security groups
- Server-side filesystem sessions (no JWT on client)
- Dev bypass mode when MSAL is not configured

### Order Entry Wizard
- 4-step mobile wizard: Customer &rarr; Details &rarr; Items &rarr; Review
- Customer search with live filtering
- Shipping address auto-filled from customer record
- Slide-up item modal with search, filtering, and line total calculation
- Edit/remove items with confirmation dialogs
- Running subtotal display
- Collapsible "Additional Options" section
- Full navigation protection (browser back, nav tabs, page refresh)

### UI/UX
- Mobile-first CSS with CSS custom properties for theming
- Light and dark theme with localStorage persistence
- Pull-to-refresh gesture with visual indicator
- Bottom tab navigation (Home, Orders, Customers, Inventory, Menu)
- Slide-up menu panel with user profile and logout
- iOS virtual keyboard handling for modal inputs

---

## Architecture

```
                    +-------------------+
                    |   Microsoft       |
                    |   Entra ID        |
                    +--------+----------+
                             |  OAuth 2.0
                             v
+----------+        +--------+----------+        +------------------+
|  iPhone  | <----> |   Flask App       | <----> |  SQL Server      |
|  (PWA)   |  HTTPS |   (Python 3.10+) |  ODBC  |  PRO05 (US)      |
+----------+        |                   |        |  PRO06 (CA)      |
     |               |  - App factory   |        +------------------+
     |               |  - Blueprints    |
     |               |  - Server-side   |
     v               |    sessions      |
+-----------+        +------------------+
| Service   |
| Worker    |
| (sw.js)   |
+-----------+
```

### Design Patterns

| Pattern | Usage |
|---------|-------|
| Application Factory | `create_app()` in `app.py` |
| Blueprints | Auth, Orders, Customers, Inventory as separate modules |
| Server-side Sessions | Filesystem-based via Flask-Session |
| Role-based Access | `@login_required`, `@role_required` decorators |
| Dual-region DB | User's region determines SQL Server connection |
| PWA Shell | Manifest + service worker + offline fallback |
| Wizard Pattern | Multi-step forms with client-side state management |
| Promise-based Dialogs | `TWG.confirm()` / `TWG.alert()` returning Promises |

---

## Project Structure

```
twg_mobile_github/
  app.py                    # Flask app factory, root routes, error handlers
  config.py                 # Environment-based config (version, Azure, DB, roles)
  db.py                     # pyodbc connection helper (US/CA dual-region)
  requirements.txt          # Python dependencies
  .env.example              # Environment variable template

  auth/
    routes.py               # Entra ID SSO: login, callback, logout, profile
    decorators.py           # @login_required, @role_required

  modules/
    orders/
      routes.py             # GET /orders/new (order entry wizard)
      queries.py            # SQL queries (placeholder)
    customers/
      routes.py             # Customer routes (placeholder)
      queries.py            # SQL queries (placeholder)
    inventory/
      routes.py             # Inventory routes (placeholder)
      queries.py            # SQL queries (placeholder)

  static/
    css/
      app.css               # Mobile-first stylesheet (3000+ lines, light/dark themes)
    js/
      app.js                # PWA shell: service worker, theme, pull-to-refresh, nav
      dialogs.js            # TWG.alert(), TWG.confirm(), TWG.confirmDanger()
      order-entry.js        # Order entry wizard (600+ lines)
    manifest.json           # PWA manifest (standalone, portrait, icons)
    sw.js                   # Service worker (cache-first + network-first strategies)
    icons/
      icon-192.png          # PWA icon (192x192)
      icon-512.png          # PWA icon (512x512)
      icon-maskable-192.png # Maskable icon for adaptive display
      icon-maskable-512.png # Maskable icon for adaptive display
      apple-touch-icon.png  # iOS home screen icon
    logo/
      TWG.png               # TWG brand logo

  templates/
    base.html               # Master layout: header, bottom nav, menu, dialogs
    auth/
      login.html            # Microsoft SSO login page
      profile.html          # User profile / home screen
    orders/
      new.html              # 4-step order entry wizard
      index.html            # Order dashboard (stub)
      detail.html           # Order detail (stub)
    customers/
      index.html            # Customer list (stub)
      detail.html           # Customer detail (stub)
    inventory/
      index.html            # Inventory search (stub)
    errors/
      403.html              # Access denied
      404.html              # Not found
      500.html              # Server error
    offline.html            # Offline fallback (served by service worker)
```

---

## Prerequisites

- **Python 3.10+**
- **ODBC Driver 17 for SQL Server**
- Access to **PRO05** (US) and/or **PRO06** (CA) SQL Server instances
- An **Azure App Registration** with Entra ID configured (optional for dev mode)

---

## Setup

```bash
# Clone and enter the project
git clone https://github.com/dangquyenbui-dotcom/twg_mobile_github.git
cd twg_mobile_github

# Create and activate a virtual environment
python -m venv .venv
source .venv/bin/activate      # macOS / Linux
.venv\Scripts\activate         # Windows

# Install dependencies
pip install -r requirements.txt

# Configure environment variables
cp .env.example .env
# Edit .env with your Azure, database, and role group values
```

### Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| Flask | 3.1.0 | Web framework |
| Flask-Session | 0.8.0 | Server-side session storage |
| msal | 1.31.1 | Microsoft Authentication Library |
| pyodbc | 5.2.0 | SQL Server database driver |
| python-dotenv | 1.1.0 | Environment variable loader |

---

## Running

```bash
# Development (debug mode, auto-reload)
python app.py
# → http://localhost:5000

# Production (example with gunicorn)
gunicorn "app:create_app()" --bind 0.0.0.0:8000
```

### Dev Mode

When `AZURE_CLIENT_ID` is not configured, the app automatically bypasses SSO and logs in with a dev user:

```
Name:  Dev User
Email: dev@twg.com
Roles: [admin]
```

---

## Environment Variables

See `.env.example` for the complete template.

| Variable | Description |
|----------|-------------|
| `FLASK_ENV` | `development` or `production` |
| `SECRET_KEY` | Flask session signing key |
| `APP_VERSION` | Appended to static URLs for cache busting (e.g., `1.2.2`) |
| `AZURE_CLIENT_ID` | Entra ID app registration client ID |
| `AZURE_CLIENT_SECRET` | Entra ID app registration secret |
| `AZURE_TENANT_ID` | Azure AD tenant ID |
| `AZURE_REDIRECT_URI` | OAuth callback URL (`http://localhost:5000/auth/callback`) |
| `DB_US_SERVER` | US SQL Server hostname (PRO05) |
| `DB_US_NAME` | US database name |
| `DB_CA_SERVER` | CA SQL Server hostname (PRO06) |
| `DB_CA_NAME` | CA database name |
| `DB_USERNAME` | SQL Server username |
| `DB_PASSWORD` | SQL Server password |
| `GROUP_SALES_REP` | Entra security group Object ID for sales reps |
| `GROUP_INSIDE_SALES` | Entra security group Object ID for inside sales |
| `GROUP_SALES_MANAGER` | Entra security group Object ID for sales managers |
| `GROUP_ADMIN` | Entra security group Object ID for admins |

---

## Authentication & Authorization

### OAuth 2.0 Flow

```
User taps "Sign in with Microsoft"
  → Redirect to Microsoft login (with state token)
    → User authenticates with Entra ID
      → Redirect back to /auth/callback with authorization code
        → Exchange code for ID token via MSAL
          → Extract user claims + group memberships
            → Map group Object IDs to internal roles
              → Store user profile in server-side session
```

### Session Structure

```python
session["user"] = {
    "name": "John Doe",
    "email": "john@example.com",
    "oid": "00000000-...",       # Entra Object ID
    "roles": ["sales_rep"],      # Mapped from security groups
    "region": "US"               # Determines database connection
}
session["access_token"] = "..."  # For Microsoft Graph API calls
```

### Route Protection

```python
from auth.decorators import login_required, role_required

@app.route("/orders/new")
@login_required                              # Must be logged in
def new_order():
    return render_template("orders/new.html")

@app.route("/admin/settings")
@login_required
@role_required("admin", "sales_manager")     # Must have one of these roles
def admin_settings():
    return render_template("admin/settings.html")
```

### Roles

| Role | Entra Group | Access Level |
|------|-------------|-------------|
| `sales_rep` | `GROUP_SALES_REP` | Standard field access |
| `inside_sales` | `GROUP_INSIDE_SALES` | Standard office access |
| `sales_manager` | `GROUP_SALES_MANAGER` | Management features |
| `admin` | `GROUP_ADMIN` | Full system access |

---

## Database

### Dual-Region Architecture

The app connects to two SQL Server instances based on the user's region:

| Region | Server | Purpose |
|--------|--------|---------|
| US | PRO05 | United States ERP data |
| CA | PRO06 | Canada ERP data |

### Usage

```python
from db import execute_query, execute_command

# Query - returns list of dicts
customers = execute_query(
    "SELECT CustID, CustName FROM Customers WHERE CustName LIKE ?",
    params=["%acme%"],
    region="US"  # or omit to use session user's region
)

# Command - returns affected row count
rows = execute_command(
    "UPDATE Orders SET Status = ? WHERE OrderID = ?",
    params=["shipped", 12345]
)
```

### Connection Details

- **Driver:** ODBC Driver 17 for SQL Server
- **Auth:** SQL Server authentication (username/password)
- **TLS:** `TrustServerCertificate=yes`

---

## PWA & Service Worker

### Manifest (`static/manifest.json`)

| Property | Value |
|----------|-------|
| Display | `standalone` (no browser chrome) |
| Orientation | `portrait` |
| Theme Color | `#1a2332` (navy) |
| Background Color | `#1a2332` |
| Icons | 192px, 512px (standard + maskable variants) |

### Service Worker Strategy (`static/sw.js`)

| Request Type | Strategy | Fallback |
|-------------|----------|----------|
| Static assets (CSS, JS, images) | Cache-first | Network |
| HTML / Navigation | Network-first | Cache, then `/offline` |
| API calls | Network-first | Cache |

### Cache Versioning

The cache name includes `APP_VERSION`:

```
twg-mobile-v1.2.2
```

When the version changes, the service worker:
1. Installs and pre-caches updated assets
2. Activates and deletes old version caches
3. Claims all open clients immediately

Static asset URLs include the version query parameter for Cloudflare CDN cache busting:

```html
<link rel="stylesheet" href="/static/css/app.css?v=1.2.2">
<script src="/static/js/app.js?v=1.2.2"></script>
```

### Pre-cached Assets

On install, the service worker caches:
- `/static/css/app.css`
- `/static/js/app.js`
- `/static/js/dialogs.js`
- `/static/manifest.json`
- `/offline`

---

## UI & Theming

### Layout Structure

```
+---------------------------+
|  Header (fixed)           |
|  Logo | Title | Theme Btn |
+---------------------------+
|                           |
|  Scrollable Content       |
|  (#app-content)           |
|                           |
|                           |
+---------------------------+
|  Bottom Nav (fixed)       |
|  Home Orders Cust Inv Menu|
+---------------------------+
```

### Theme System

Two themes controlled by CSS custom properties on `<html data-theme="light|dark">`:

| Property | Light | Dark |
|----------|-------|------|
| `--color-primary` | `#1a2332` | `#0f1720` |
| `--color-accent` | `#e8731a` | `#f08c38` |
| `--color-bg` | `#f4f5f7` | `#000000` |
| `--color-surface` | `#ffffff` | `#1c1c1e` |
| `--color-text` | `#1a1a1a` | `#f5f5f7` |

Theme is:
- Persisted to `localStorage` as `twg-theme`
- Applied before first paint (inline script in `<head>`) to prevent flash
- Toggled via the header button

### CSS Components

The stylesheet (`app.css`, 3000+ lines) includes:

- **Layout:** App shell, header, bottom nav, slide-up menu
- **Cards:** Surface containers with headers and bodies
- **Forms:** Input fields, selects, textareas, form rows/columns
- **Buttons:** Primary, block, icon buttons, FAB
- **Lists:** List items with avatars, bodies, and trailing elements
- **Badges:** Status indicators and counters
- **Dialogs:** Modal overlays with action buttons
- **Wizard:** Step indicators, panels, navigation bar
- **Modal Sheets:** Slide-up bottom sheets with pinned search bar
- **Utilities:** Spacing, typography, responsive helpers

### Pull-to-Refresh

Custom pull-to-refresh gesture on the main content area:
- Shows a visual indicator when pulling down
- Disabled inside wizard views (order entry) to prevent accidental page resets
- Uses `overscroll-behavior-y: contain` on scroll containers

---

## Order Entry Wizard

### Flow

```
Step 1: Customer        Step 2: Details         Step 3: Items           Step 4: Review
+-----------------+     +-----------------+     +-----------------+     +-----------------+
| Search bar      |     | Ship To         |     | Line item cards |     | Customer info   |
| Recent list     |     |   Company       |     | (or empty state)|     | Shipping info   |
|   Acme Wheel    |     |   Address       |     |                 |     | Item list       |
|   Pacific Rim   | --> |   City/St/Zip   | --> | [+ FAB button]  | --> | Subtotal        |
|   Midwest Auto  |     | Order Info      |     |                 |     | Tax             |
|                 |     |   PO#, Date     |     | Subtotal bar    |     | Total           |
| Selected card   |     |   Ship Via      |     |                 |     | [Place Order]   |
| [Change]        |     | Additional Opts |     |                 |     |                 |
+-----------------+     +-----------------+     +-----------------+     +-----------------+
```

### State Management

All state is managed in-memory within a self-executing function:

```javascript
var currentStep = 1;
var selectedCustomer = null;   // Customer object or null
var lineItems = [];            // Array of line item objects
var editingIndex = -1;         // -1 = adding, >= 0 = editing
var orderDirty = false;        // Any user input occurred
```

### Navigation Protection

Three layers prevent accidental data loss:

| Trigger | Protection |
|---------|-----------|
| Browser back button | `popstate` listener with confirm dialog |
| Bottom nav tab tap | Click interceptor with confirm dialog |
| Page refresh / close | `beforeunload` event (native browser prompt) |

After confirmation, all state (`orderDirty`, `selectedCustomer`, `lineItems`) is cleared before navigating.

Non-navigating links (`href="#"` like Menu, Customers, Inventory stubs) are exempt from the confirmation flow.

### Add Item Modal

The modal is a slide-up bottom sheet with three sections:

```
+---------------------------+
|  Header: "Add Item"    [X]|  <- flex-shrink: 0
+---------------------------+
|  Search bar               |  <- flex-shrink: 0 (pinned)
+---------------------------+
|  Scrollable body          |  <- flex: 1, overflow-y: auto
|    Item results list      |
|    -- or --               |
|    Item detail form       |
|      Selected banner      |
|      Qty / UOM            |
|      Price / Discount     |
|      Line Total           |
|      [Add to Order]       |
+---------------------------+
```

The search bar is placed **between the header and scrollable body** so it remains visible when the iOS virtual keyboard opens.

### Line Item Object

```javascript
{
    itemNo: "WHL-3050",
    desc: "Chrome Wheel 20x8.5",
    qty: 4,
    uom: "EA",
    price: 224.75,
    discount: 10,             // percentage
    total: 809.10             // qty * price * (1 - discount/100)
}
```

---

## Dialog System

Custom dialog system replacing native `alert()` and `confirm()` for consistent cross-platform UI.

### API

```javascript
// Alert with OK button — resolves when dismissed
TWG.alert("Order Submitted", "Your order has been submitted successfully.")
    .then(function() { /* after OK */ });

// Confirm with Cancel / Confirm — resolves true or false
TWG.confirm("Discard Order?", "You have unsaved changes.")
    .then(function(ok) { if (ok) { /* discard */ } });

// Danger confirm with Cancel / Delete (red button)
TWG.confirmDanger("Delete Item", "This cannot be undone.")
    .then(function(ok) { if (ok) { /* delete */ } });
```

All methods return **Promises**. The overlay can be tapped to dismiss (resolves `false`).

### DOM Structure

The dialog overlay and elements are defined once in `base.html`:

```html
<div class="dialog-overlay" id="dialog-overlay">
    <div class="dialog-box">
        <div class="dialog-title" id="dialog-title"></div>
        <div class="dialog-message" id="dialog-message"></div>
        <div class="dialog-actions" id="dialog-actions"></div>
    </div>
</div>
```

---

## iOS-Specific Handling

### Viewport & Status Bar

- `viewport-fit=cover` is **not** used (causes unreachable bottom gap in standalone PWA)
- Status bar set to `black` via `apple-mobile-web-app-status-bar-style`
- Body and nav background colors match the status bar for seamless appearance

### Virtual Keyboard

The order entry modal uses the `visualViewport` API to handle iOS keyboard overlap:

```javascript
// When keyboard opens, visualViewport.height shrinks
var keyboardOffset = window.innerHeight - visualViewport.height;
if (keyboardOffset > 50) {
    modalSheet.style.maxHeight = visualViewport.height + "px";
    modalSheet.style.bottom = keyboardOffset + "px";
}
```

Additional measures:
- Search bar pinned outside the scrollable area (won't scroll out of view)
- `focusin` listener scrolls focused inputs into view as a fallback
- Active element blurred on modal close to dismiss keyboard
- `overscroll-behavior-y: contain` prevents scroll chaining

### Pull-to-Refresh

Disabled inside wizard views to prevent accidental page resets:

```javascript
if (content.querySelector(".wizard-steps")) return;
```

---

## Module Development Guide

### Adding a New Module

1. **Create the module directory:**

```
modules/
  my_module/
    __init__.py
    routes.py
    queries.py
```

2. **Define the blueprint** (`routes.py`):

```python
from flask import Blueprint, render_template
from auth.decorators import login_required

my_module_bp = Blueprint("my_module", __name__, url_prefix="/my-module")

@my_module_bp.route("/")
@login_required
def index():
    return render_template("my_module/index.html")
```

3. **Register in `app.py`:**

```python
from modules.my_module.routes import my_module_bp
app.register_blueprint(my_module_bp)
```

4. **Create templates** in `templates/my_module/` extending `base.html`:

```html
{% extends "base.html" %}
{% set active_tab = "my_tab" %}
{% block title %}My Module — TWG Mobile{% endblock %}
{% block header_title %}My Module{% endblock %}

{% block content %}
<div class="page-padding">
    <!-- Your content here -->
</div>
{% endblock %}
```

5. **Add database queries** (`queries.py`):

```python
from db import execute_query

def get_items(region=None):
    return execute_query("SELECT * FROM Items ORDER BY ItemNo", region=region)
```

### Template Variables

The base template provides these context variables:

| Variable | Source | Usage |
|----------|--------|-------|
| `{{ app_version }}` | `config.py` | Cache busting: `?v={{ app_version }}` |
| `{{ active_tab }}` | Template `{% set %}` | Highlights the active bottom nav tab |
| `{{ session.user }}` | Server session | User info (name, email, roles) |

### Adding Page-Specific JavaScript

```html
{% block scripts %}
<script src="{{ url_for('static', filename='js/my-module.js') }}?v={{ app_version }}"></script>
{% endblock %}
```

---

## License

Proprietary &mdash; The Wheel Group. Internal use only.
