# TWG Mobile

Mobile-first Progressive Web App for The Wheel Group sales team.
Built with Flask, Microsoft Entra ID SSO, and SQL Server.

## Status

**Phase: Foundation Scaffold**

The wireframe and core infrastructure are in place. The following is ready:

- Flask app factory with server-side sessions
- Microsoft Entra ID SSO (login, callback, logout, profile)
- Role-based access control (sales_rep, inside_sales, sales_manager, admin)
- Dual-region database helper (US/PRO05, CA/PRO06)
- PWA shell (manifest, service worker, offline fallback)
- Responsive mobile-first UI with bottom navigation
- Error pages (403, 404, 500)

**Pending:**

- Orders module (routes, queries, templates stubbed)
- Customers module (routes, queries, templates stubbed)
- Inventory module (routes, queries, templates stubbed)
- PWA icons (192px, 512px, and maskable variants)

## Prerequisites

- Python 3.10+
- ODBC Driver 17 for SQL Server
- Access to PRO05 (US) and/or PRO06 (CA) SQL Server instances
- An Azure App Registration with Entra ID configured

## Setup

```bash
# Clone and enter the project
git clone https://github.com/dangquyenbui-dotcom/twg_mobile_github.git
cd twg_mobile_github

# Create and activate a virtual environment
python -m venv .venv
source .venv/bin/activate      # macOS/Linux
.venv\Scripts\activate         # Windows

# Install dependencies
pip install -r requirements.txt

# Configure environment variables
cp .env.example .env
# Edit .env with your Azure, database, and role group values
```

## Running

```bash
# Development
python app.py

# Production (example with gunicorn)
gunicorn "app:create_app()" --bind 0.0.0.0:8000
```

## Project Structure

```
twg_mobile_github/
  app.py              # Flask app factory
  config.py           # Environment-based configuration
  db.py               # pyodbc connection helper (US/CA)
  auth/
    routes.py         # Entra ID SSO login/logout/callback/profile
    decorators.py     # @login_required, @role_required
  modules/
    orders/           # Order entry & dashboard (stub)
    customers/        # Customer lookup (stub)
    inventory/        # Inventory search (stub)
  static/
    css/app.css       # Mobile-first responsive styles
    js/app.js         # PWA registration, pull-to-refresh, navigation
    js/dialogs.js     # Reusable dialog/toast components
    manifest.json     # PWA manifest
    sw.js             # Service worker (cache-first strategy)
    icons/            # PWA icons (to be added)
  templates/
    base.html         # Base layout with header, bottom nav, sidebar
    auth/             # Login and profile pages
    orders/           # Order list, detail, new order forms
    customers/        # Customer list and detail
    inventory/        # Inventory search
    errors/           # 403, 404, 500 error pages
    offline.html      # Offline fallback page
```

## Environment Variables

See `.env.example` for the full list. Key groups:

- **AZURE_*** — Entra ID app registration credentials
- **DB_*** — SQL Server connection details for US and CA
- **GROUP_*** — Entra Security Group Object IDs mapped to roles
- **APP_VERSION** — Appended to static asset URLs for Cloudflare cache busting
