# Scholaris — School Management SaaS

Multi-school platform for admissions, classes, fees and attendance. Each school signs up, gets **its own MongoDB database**, a 14-day free trial, and its own staff and parent logins. You, the platform owner, manage every school from the **platform console**.

## How it works

| Who | Signs in at | Can do |
|---|---|---|
| Platform owner (you) | `/platform/login` | See all schools, approve upgrades, change plans, extend trials, suspend/reactivate |
| School admin | `/login` with **school code** | Everything in their school, add staff and parent logins, request plan upgrades |
| Teacher | `/login` with school code | Students, attendance, view classes and fees |
| Parent | `/login` with school code | Only their own children (matched by the student's guardian email) |

**Data isolation:** platform data (schools, owner accounts) lives in `scholaris_platform`. Each school's data lives in `school_<code>`. Every request is resolved to the school in the signed-in user's session token, so one school can never read or write another school's database. The test suite checks this.

**Plans** (edit `backend/app/plans.py`): Trial (100 students, 10 staff), Basic ₹2,999/mo (500 / 25), Pro ₹7,999/mo (5,000 / 200). Limits are enforced by the API. When a trial ends or a payment lapses, the school becomes **read-only** until you approve an upgrade or renew it. Prices are placeholders.

**Payments:** schools click "Request Basic/Pro", you confirm payment outside the app (bank transfer or UPI) and click **Approve** in the console. Connecting Razorpay for automatic billing is the next step when you're ready.

## Run locally

**Docker (easiest):**
```bash
docker compose up --build
```
- App: http://localhost:3000. Demo school code `demo`, sign in with `admin@school.com` / `admin123`
- Console: http://localhost:3000/platform/login. Sign in with `owner@example.com` / `OwnerPass#2026`

**Windows without Docker:** install Python, Node.js and MongoDB (`INSTALL-PREREQS.cmd` does this), then double-click `START-APP.cmd`.

**Manual:**
```bash
# backend
cd backend
python -m venv .venv && . .venv/bin/activate      # Windows: .venv\Scripts\activate
pip install -r requirements-dev.txt
cp .env.example .env
uvicorn server:app --reload --port 8001           # API docs: http://localhost:8001/api/docs

# frontend (new terminal)
cd frontend
yarn install
echo REACT_APP_BACKEND_URL=http://localhost:8001 > .env
yarn start
```

## Tests

```bash
cd backend && pytest
```
The tests run in-process against an in-memory MongoDB, so you don't need a running database or server. They cover school isolation, role permissions, parent scoping, plan limits, trial expiry, suspension, the platform console, rate limiting, token refresh and data migration.

## Project layout

```
backend/
  app/
    main.py          app setup, middleware, health checks, startup seeding
    config.py        settings from environment (validated in production)
    db.py            platform DB + one database per school
    security.py      passwords, JWT cookies, current school/user resolution
    plans.py         plans, limits, subscription state
    tenants.py       creating schools and their databases
    routers/         auth, signup, school data, billing, platform
  scripts/migrate_single_school.py   move old single-school data into a school
  tests/
frontend/            React app (Nginx config + Dockerfile for production)
deploy/              Caddyfile, production env template, backup script
docker-compose.yml        local stack
docker-compose.prod.yml   production stack (HTTPS)
DEPLOYMENT.md             step-by-step production guide
```

## Moving old data

If you used the earlier single-school version, copy its data into a school:
```bash
cd backend
python -m scripts.migrate_single_school --source-db scholaris --code my-school --name "My School"
```
