# TWG Mobile

Mobile-first Progressive Web App for **The Wheel Group** sales team.
Built with Flask, Microsoft Entra ID SSO, and AccPac/PRO ERP integration via SQL Server.

> **Version 1.3.0** &mdash; Live ERP integration: real-time customer/item search and Sales Order creation against AccPac/PRO.

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
- [ERP Integration](#erp-integration)
- [Sales Order Creation](#sales-order-creation)
- [API Endpoints](#api-endpoints)
- [PWA & Service Worker](#pwa--service-worker)
- [UI & Theming](#ui--theming)
- [Order Entry Wizard](#order-entry-wizard)
- [Dialog System](#dialog-system)
- [iOS-Specific Handling](#ios-specific-handling)
- [Sandbox Environment](#sandbox-environment)
- [Module Development Guide](#module-development-guide)

---

## Overview

TWG Mobile gives sales reps a fast, native-feeling app they can install on their iPhone and use in the field &mdash; even with spotty connectivity. The app connects to The Wheel Group's AccPac/PRO ERP system via dual-region SQL Server databases and authenticates users through Microsoft Entra ID single sign-on.

Key design goals:

- **iPhone-first** &mdash; optimized for one-handed mobile use
- **Installable PWA** &mdash; home screen icon, standalone mode, offline fallback
- **Secure** &mdash; server-side sessions, role-based access, parameterized SQL, no client-side secrets
- **Real ERP integration** &mdash; live customer/item search and Sales Order creation against AccPac/PRO
- **Fast** &mdash; cache-first service worker, minimal JavaScript (vanilla, no frameworks)

---

## Status

**Phase: ERP Integration &mdash; Sales Order Creation**

### Built & Working

| Area | Details |
|------|---------|
| App Shell | Flask app factory, server-side sessions, error pages |
| Authentication | Microsoft Entra ID SSO (login, callback, logout, profile) |
| Authorization | Role-based access control with decorators |
| Database | Dual-region SQL Server helper (US/CA) with transaction support |
| PWA | Manifest, service worker, offline fallback, app icons |
| UI | Mobile-first responsive layout, bottom nav, light/dark theme |
| Dialogs | Custom alert/confirm/danger system replacing native browser dialogs |
| Order Entry | Full 4-step wizard: Customer &rarr; Details &rarr; Items &rarr; Review |
| Customer Search | Live API search against `arcust` (35,781 customers) |
| Item Search | Live API search against `icitem` with `iciloc` cost data (45,248 items) |
| Warehouse Picker | Dynamic dropdown from `icloct` (62+ locations) |
| SO Creation | Full 8-step AccPac/PRO Sales Order creation with transaction safety |

### Pending

- Order history &mdash; list/detail views for existing SOs
- Customers module &mdash; customer list/detail views
- Inventory module &mdash; stock lookup, availability check
- Push notifications
- Offline order queue (IndexedDB + Background Sync)
- Production write-enabled SQL account (currently using sandbox)

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

### ERP Integration
- Live customer search from AccPac/PRO `arcust` table
- Live item search from `icitem` joined with `iciloc` for cost/availability
- Warehouse location picker from `icloct`
- Full Sales Order creation (somast + soaddr + sotran)
- Atomic SO# generation with row-level locking (`UPDLOCK, HOLDLOCK`)
- Automatic inventory record creation (iciloc/iciqty) when missing
- Special line items: SHIP-AC (shipping), DISCOUNT-AC (discounts), TAX-AC (taxes)
- PO# uniqueness verification across current and history tables
- Phone number formatting (NNN/NNN-NNNN)
- Dry-run mode for safe testing (`ORDER_DRYRUN=true`)

### Order Entry Wizard
- 4-step mobile wizard: Customer &rarr; Details &rarr; Items &rarr; Review
- Debounced API search (300ms) for customers and items
- Shipping address auto-filled from customer master record
- Customer terms, salesperson, and territory pre-filled from ERP
- Warehouse selection with localStorage persistence
- Slide-up item modal with search and line total calculation
- Edit/remove items with confirmation dialogs
- Running subtotal display
- Collapsible "Additional Options" section
- Full navigation protection (browser back, nav tabs, page refresh)
- Real SO# returned on successful order placement

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
     |               |  API Layer:      |        |  PROSYS (system) |
     |               |  - routes.py     |        +------------------+
     |               |  - queries.py    |                |
     v               |  - service.py    |                v
+-----------+        +------------------+        +------------------+
| Service   |                                    |  AccPac/PRO ERP  |
| Worker    |                                    |  - somast        |
| (sw.js)   |                                    |  - soaddr        |
+-----------+                                    |  - sotran        |
                                                 |  - arcust        |
                                                 |  - icitem/iciloc |
                                                 |  - sysdata       |
                                                 +------------------+
```

### Data Flow: Order Creation

```
Browser (JS)  ──POST JSON──>  Flask API  ──pyodbc transaction──>  SQL Server
                               routes.py                          PRO05 / PRO06
                               service.py
```

The Flask app serves as the API layer. The browser never touches SQL directly. Flask handles authentication, input validation, and orchestrates the ERP write operations within a managed pyodbc transaction.

### Design Patterns

| Pattern | Usage |
|---------|-------|
| Application Factory | `create_app()` in `app.py` |
| Blueprints | Auth, Orders, Customers, Inventory as separate modules |
| Server-side Sessions | Filesystem-based via Flask-Session |
| Role-based Access | `@login_required`, `@role_required` decorators |
| Dual-region DB | User's region determines SQL Server connection |
| Transaction Orchestration | `service.py` manages multi-table writes with COMMIT/ROLLBACK |
| Row-level Locking | `UPDLOCK, HOLDLOCK` on SO# counter for concurrency safety |
| PWA Shell | Manifest + service worker + offline fallback |
| Wizard Pattern | Multi-step forms with client-side state management |
| Promise-based Dialogs | `TWG.confirm()` / `TWG.alert()` returning Promises |
| Debounced API Search | 300ms debounce on customer/item search inputs |

---

## Project Structure

```
twg_mobile_github/
  app.py                    # Flask app factory, root routes, error handlers
  config.py                 # Environment-based config (version, Azure, DB, roles, dryrun)
  db.py                     # pyodbc connection helpers (dual-region, transaction, system DB)
  requirements.txt          # Python dependencies
  .env.example              # Environment variable template

  auth/
    routes.py               # Entra ID SSO: login, callback, logout, profile
    decorators.py           # @login_required, @role_required

  modules/
    orders/
      routes.py             # GET search endpoints + POST /orders/api/create
      queries.py            # Read-only SQL: customer search, item search, warehouses
      service.py            # SO creation orchestrator (8-step transactional flow)
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
      order-entry.js        # Order entry wizard with live API search + Place Order
    manifest.json           # PWA manifest (standalone, portrait, icons)
    sw.js                   # Service worker (cache-first + network-first strategies)
    icons/                  # PWA icons (192, 512, maskable, apple-touch)
    logo/                   # TWG brand logo

  templates/
    base.html               # Master layout: header, bottom nav, menu, dialogs
    auth/
      login.html            # Microsoft SSO login page
      profile.html          # User profile / home screen
    orders/
      new.html              # 4-step order entry wizard (live ERP search)
      index.html            # Order dashboard (stub)
      detail.html           # Order detail (stub)
    customers/              # Customer views (stubs)
    inventory/              # Inventory views (stubs)
    errors/                 # 403, 404, 500 error pages
    offline.html            # Offline fallback (served by service worker)

  FoxPro_README.md          # Reverse-engineered AccPac/PRO SO creation logic
  SO_Creation_SQL_Logic.sql # SQL statements for SO creation (reference)
  sandbox_setup.sql         # Sandbox database schema setup script
```

---

## Prerequisites

- **Python 3.10+**
- **ODBC Driver 18 for SQL Server**
- Access to **PRO05** (US) and/or **PRO06** (CA) SQL Server instances
- An **Azure App Registration** with Entra ID configured (optional for dev mode)

---

## Setup

```bash
# Clone and enter the project
git clone https://github.com/dangquyenbui-dotcom/twg_mobile_github.git
cd twg_mobile_github

# Create and activate a virtual environment
python -m venv venv
source venv/bin/activate          # macOS / Linux / Git Bash
.\venv\Scripts\Activate.ps1      # Windows PowerShell

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
# -> http://localhost:5050

# Production (example with gunicorn)
gunicorn "app:create_app()" --bind 0.0.0.0:8000
```

### Dev Mode

When `AZURE_CLIENT_ID` is not configured, the app automatically bypasses SSO and logs in with a dev user:

```
Name:  Dev User
Email: dev@twg.com
Roles: [admin]
Region: US
```

---

## Environment Variables

See `.env.example` for the complete template.

| Variable | Description |
|----------|-------------|
| `FLASK_ENV` | `development` or `production` |
| `SECRET_KEY` | Flask session signing key |
| `APP_VERSION` | Appended to static URLs for cache busting (e.g., `1.3.0`) |
| `AZURE_CLIENT_ID` | Entra ID app registration client ID |
| `AZURE_CLIENT_SECRET` | Entra ID app registration secret |
| `AZURE_TENANT_ID` | Azure AD tenant ID |
| `AZURE_REDIRECT_URI` | OAuth callback URL (`http://localhost:5050/auth/callback`) |
| `DB_US_SERVER` | US SQL Server hostname (PRO05) |
| `DB_US_NAME` | US database name (e.g., `PRO05`) |
| `DB_CA_SERVER` | CA SQL Server hostname (PRO06) |
| `DB_CA_NAME` | CA database name (e.g., `PRO06`) |
| `DB_SYS_NAME` | System database name (default: `PROSYS`) |
| `DB_USERNAME` | SQL Server username |
| `DB_PASSWORD` | SQL Server password |
| `ORDER_DRYRUN` | Set to `true` to rollback orders instead of committing (safe testing) |
| `GROUP_SALES_REP` | Entra security group Object ID for sales reps |
| `GROUP_INSIDE_SALES` | Entra security group Object ID for inside sales |
| `GROUP_SALES_MANAGER` | Entra security group Object ID for sales managers |
| `GROUP_ADMIN` | Entra security group Object ID for admins |

---

## Authentication & Authorization

### OAuth 2.0 Flow

```
User taps "Sign in with Microsoft"
  -> Redirect to Microsoft login (with state token)
    -> User authenticates with Entra ID
      -> Redirect back to /auth/callback with authorization code
        -> Exchange code for ID token via MSAL
          -> Extract user claims + group memberships
            -> Map group Object IDs to internal roles
              -> Store user profile in server-side session
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

| Region | Database | Server | Currency | Purpose |
|--------|----------|--------|----------|---------|
| US | PRO05 | `twg-sql-01` (prod) / `apps3` (sandbox) | USD | United States ERP data |
| CA | PRO06 | `twg-sql-01` (prod) | CAD | Canada ERP data |
| System | PROSYS | Same as region server | &mdash; | Company master, SO/IC counters |

### Connection Helpers (`db.py`)

```python
from db import execute_query, execute_command, get_raw_connection, get_company_id

# Read query - returns list of dicts
customers = execute_query(
    "SELECT custno, company FROM arcust WHERE company LIKE ?",
    params=("%acme%",),
    region="US"
)

# Write command - auto-commits
rows = execute_command("UPDATE somast SET sostat = ? WHERE sono = ?", ("C", sono))

# Transaction-managed connection (for multi-step writes)
conn = get_raw_connection(region="US")  # autocommit=False
try:
    cursor = conn.cursor()
    cursor.execute("INSERT INTO ...", params)
    cursor.execute("UPDATE ...", params)
    conn.commit()
except:
    conn.rollback()
    raise
finally:
    conn.close()

# Get company ID from database name
compid = get_company_id("US")  # Returns "05" (from PRO05)
```

### Connection Details

- **Driver:** ODBC Driver 18 for SQL Server
- **Auth:** SQL Server authentication (username/password)
- **TLS:** `TrustServerCertificate=yes`
- **Password escaping:** Braces-wrapped for special characters in connection string

---

## ERP Integration

### AccPac/PRO Database Tables

The app integrates with the following AccPac/PRO ERP tables:

| Table | Database | Purpose |
|-------|----------|---------|
| `somast` | PRO05/06 | Sales Order header (sono, custno, ordamt, ponum, etc.) |
| `soaddr` | PRO05/06 | Sales Order shipping address |
| `sotran` | PRO05/06 | Sales Order line items (products, shipping, discounts, tax) |
| `soymst` | PRO05/06 | Sales Order header history |
| `soytrn` | PRO05/06 | Sales Order line item history |
| `arcust` | PRO05/06 | Customer master (35,781 customers in US) |
| `icitem` | PRO05/06 | Inventory item master (45,248 items) |
| `iciloc` | PRO05/06 | Item-location records (cost, GL accounts per warehouse) |
| `iciqty` | PRO05/06 | Item serial/quantity records |
| `icloct` | PRO05/06 | Warehouse locations (62+ locations) |
| `syccomp` | PROSYS | Company master (currency, company ID) |
| `sysdata` | PROSYS | System counters (SO#, IC# generation) |
| `SOsysd` | PRO05/06 | SO module counter (kept in sync with sysdata) |
| `ICsysd` | PRO05/06 | IC module counter (kept in sync with sysdata) |

### Special Item Codes

| Item Code | Purpose | Qty | Price |
|-----------|---------|-----|-------|
| `SHIP-AC` (padded to 25 chars) | Shipping charge line | 1 | shipping cost |
| `DISCOUNT-AC` (padded to 25 chars) | Order discount line | 1 | discount amount (negative) |
| `TAX-AC` (padded to 25 chars) | Tax charge line | 1 | tax amount |

### Reference Documentation

- `FoxPro_README.md` &mdash; Complete reverse-engineered documentation of the AccPac/PRO SO creation flow from the FoxPro batch import system (`ac_inboundcreate.prg`)
- `SO_Creation_SQL_Logic.sql` &mdash; Exact SQL statements for each step of SO creation

---

## Sales Order Creation

### 8-Step Flow (`service.py`)

The SO creation service implements the exact business logic from the FoxPro system:

```
Step 0: Lookup reference data
  |  syccomp -> currency
  |  arcust  -> terms, GL, salesman, territory
  v
Step 1: Validate each item exists in icitem
  v
Step 2: Ensure iciloc + iciqty exist per item+warehouse
  |  If missing: copy from 'LA' (default) location
  |  Adjust GL account suffixes per target warehouse
  v
Step 3: Generate unique SO# (atomic with row locking)
  |  SELECT int1 FROM sysdata WITH (UPDLOCK, HOLDLOCK)
  |  Increment, verify not in somast/soymst
  |  Update sysdata + SOsysd
  v
Step 4: Verify PO# uniqueness in somast + soymst
  v
Step 5: INSERT somast (order header)
  v
Step 6: INSERT soaddr (shipping address)
  |  Phone formatted: NNN/NNN-NNNN
  |  address3 = "email:{email},Ph:{phone}"
  v
Step 7: INSERT sotran lines
  |  7a. Product lines (qty * price * (1 - disc/100))
  |  7b. SHIP-AC line (if shipping > 0)
  |  7c. DISCOUNT-AC line (if discount > 0, negative amount)
  |  7d. TAX-AC line (if tax > 0)
  v
Step 8: UPDATE somast totals (ordamt, bordamt, taxsamt)
  v
COMMIT (or ROLLBACK on any error)
```

### Transaction Safety

- All 8 steps execute within a single pyodbc transaction (`autocommit=False`)
- SO# generation uses `WITH (UPDLOCK, HOLDLOCK)` to prevent duplicate numbers across concurrent users
- If any step fails, the entire transaction rolls back &mdash; no partial SOs
- Connection failure mid-transaction triggers automatic SQL Server rollback

### Error Codes

| Code | Meaning | User Message |
|------|---------|-------------|
| 0 | Success | "SO# {sono} created successfully" |
| 1 | Duplicate PO# | "Duplicate PO#. Existing SO# {sono}" |
| 2 | Invalid item | "Item {item} not found" |
| 3 | Counter error | "SO counter not found or disabled" |
| 4 | Customer not found | "Customer {custno} not found" |
| 5 | No LA location | "No LA location record for item {item}" |
| 9 | Unexpected error | "Unexpected error: {details}" |

### Business Rules

- **Tax:** Lump-sum TAX-AC line (not per-line). `somast.taxrate = 0`.
- **Discount:** Calculated as rate percentage per line item. Rounding differences captured in DISCOUNT-AC line.
- **Currency:** Always company default from `syccomp.currid`. Exchange rate = 1.000.
- **SO# format:** 10-char right-justified numeric string (e.g., `'   9900001'`).
- **Customer number:** 10-char padded (e.g., `'TOXCUS    '`).
- **Item code:** 25-char padded.
- **Warehouse (loctid):** 6-char padded. User-selected per order.
- **adduser:** First 4 chars of user's name.
- **websono:** `MOB-{sono}` for traceability.

---

## API Endpoints

All endpoints require `@login_required`. The user's region determines which database is queried.

### Read Endpoints (GET)

| Endpoint | Purpose | Query Params |
|----------|---------|-------------|
| `/orders/api/customers/search` | Search customers by name, ID, or phone | `q` (min 2 chars) |
| `/orders/api/customers/<custno>` | Full customer detail (terms, address, salesman, GL) | &mdash; |
| `/orders/api/items/search` | Search inventory items with cost data | `q` (min 2 chars), `loctid` |
| `/orders/api/items/<item>/price` | Item price for specific warehouse | `loctid` |
| `/orders/api/warehouses` | List all warehouse locations | &mdash; |

### Write Endpoints (POST)

| Endpoint | Purpose | Auth |
|----------|---------|------|
| `/orders/api/create` | Create a Sales Order in the ERP | `@login_required` |

### POST `/orders/api/create` Request Body

```json
{
  "custno": "TOXCUS",
  "loctid": "LA",
  "ordate": "2026-03-18",
  "ponum": "PO-12345",
  "shipvia": "UPS",
  "notes": "Rush order",
  "ship_to": {
    "company": "Toxic Customs LLC",
    "address1": "1230 S Saunders St",
    "city": "Raleigh",
    "state": "NC",
    "zip": "27603",
    "country": "US",
    "email": "info@toxiccustoms.com",
    "phone": "9197553699"
  },
  "items": [
    { "item": "167-6681FMB", "qty": 4, "price": 125.00, "discount": 5 }
  ],
  "shpcost": 15.00,
  "exttax": 0,
  "extdisc": 0
}
```

### Response (Success)

```json
{
  "success": true,
  "sono": "9900001",
  "ordamt": 490.00,
  "dryrun": false
}
```

### Response (Error)

```json
{
  "success": false,
  "error": "Duplicate PO#. Existing SO# 9900001",
  "code": 1
}
```

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

The cache name includes `APP_VERSION`. When the version changes, the service worker installs updated assets, deletes old caches, and claims all open clients immediately.

---

## UI & Theming

### Theme System

Two themes controlled by CSS custom properties on `<html data-theme="light|dark">`:

| Property | Light | Dark |
|----------|-------|------|
| `--color-primary` | `#1a2332` | `#0f1720` |
| `--color-accent` | `#e8731a` | `#f08c38` |
| `--color-bg` | `#f4f5f7` | `#000000` |
| `--color-surface` | `#ffffff` | `#1c1c1e` |
| `--color-text` | `#1a1a1a` | `#f5f5f7` |

Theme is persisted to `localStorage`, applied before first paint to prevent flash, and toggled via the header button.

---

## Order Entry Wizard

### Flow

```
Step 1: Customer           Step 2: Details            Step 3: Items            Step 4: Review
+-------------------+     +-------------------+     +-------------------+     +-------------------+
| Search bar (API)  |     | Ship To           |     | Line item cards   |     | Customer info     |
| Live results      |     |   Company/Address |     | (or empty state)  |     | Shipping info     |
|   from arcust     | --> |   City/St/Zip     | --> |                   | --> | Item list         |
|                   |     | Order Info        |     | [+ FAB button]    |     | Subtotal/Tax/Total|
| Selected card     |     |   PO# | Warehouse |     |   -> Item search  |     |                   |
| [Change]          |     |   Date | Ship Via |     |      from icitem  |     | [Place Order]     |
|                   |     | Additional Opts   |     |                   |     |   -> POST /api/   |
| [Next]            |     |   Terms/FOB/Tax   |     | Subtotal bar      |     |      create       |
+-------------------+     +-------------------+     +-------------------+     +-------------------+
```

### State Management

All state is managed in-memory within a self-executing function:

```javascript
var selectedCustomer = null;   // Full customer object from API
var lineItems = [];            // Array of line item objects
var editingIndex = -1;         // -1 = adding, >= 0 = editing
var orderDirty = false;        // Any user input occurred
```

### Navigation Protection

| Trigger | Protection |
|---------|-----------|
| Browser back button | `popstate` listener with confirm dialog |
| Bottom nav tab tap | Click interceptor with confirm dialog |
| Page refresh / close | `beforeunload` event (native browser prompt) |

### Place Order Flow

1. User clicks "Place Order"
2. PO# validation (required field)
3. Confirm dialog: "Submit this order for processing?"
4. Button shows "Submitting..." (disabled)
5. `POST /orders/api/create` with full order payload
6. On success: shows SO# in alert dialog, clears state
7. On error: shows error message, re-enables button
8. On network failure: shows connection error

---

## Dialog System

```javascript
TWG.alert("Order Created", "SO# 9900001 created successfully.")
TWG.confirm("Discard Order?", "You have unsaved changes.")
TWG.confirmDanger("Delete Item", "This cannot be undone.")
```

All methods return Promises. The overlay can be tapped to dismiss (resolves `false`).

---

## iOS-Specific Handling

### Viewport & Status Bar
- `viewport-fit=cover` is **not** used (causes unreachable bottom gap in standalone PWA)
- Status bar set to `black` via `apple-mobile-web-app-status-bar-style`

### Virtual Keyboard
- `visualViewport` API resizes modal when iOS keyboard opens
- Search bar pinned outside scrollable area
- `focusin` listener scrolls focused inputs into view
- `overscroll-behavior-y: contain` prevents scroll chaining

---

## Sandbox Environment

A sandbox SQL Server is available for development and testing:

| Property | Value |
|----------|-------|
| Server | `apps3.thewheelgroup.com` |
| Version | SQL Server 2017 Standard |
| Databases | PRO05 (US), PROSYS (system) |
| Data | 500 customers, 1,003 items, 62 warehouses |
| SO Counter | Starts at 9,900,000 (test range) |

### Setting Up the Sandbox

The sandbox was set up by:
1. Creating `PRO05` and `PROSYS` databases
2. Cloning table schemas from production (`twg-sql-01`)
3. Seeding reference data (arcust, icitem, iciloc, iciqty, icloct, syccomp, sysdata)
4. Initializing SO counter to 9,900,000 (clearly distinguishable from production SOs)

To point the app at the sandbox, set these in `.env`:

```
DB_US_SERVER=apps3.thewheelgroup.com
DB_US_NAME=PRO05
DB_SYS_NAME=PROSYS
DB_USERNAME=sa
DB_PASSWORD=<sandbox-password>
```

To enable dry-run mode (validates everything but rolls back):

```
ORDER_DRYRUN=true
```

---

## Module Development Guide

### Adding a New Module

1. Create `modules/my_module/routes.py` and `queries.py`
2. Define a Flask blueprint with `@login_required` decorators
3. Register the blueprint in `app.py`
4. Create templates in `templates/my_module/` extending `base.html`
5. Add page-specific JavaScript in `static/js/`

### Template Variables

| Variable | Source | Usage |
|----------|--------|-------|
| `{{ app_version }}` | `config.py` | Cache busting: `?v={{ app_version }}` |
| `{{ active_tab }}` | Template `{% set %}` | Highlights the active bottom nav tab |
| `{{ session.user }}` | Server session | User info (name, email, roles, region) |

---

## License

Proprietary &mdash; The Wheel Group. Internal use only.
