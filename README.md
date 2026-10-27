# Qualimetry scoring prototype

A qualimetric assessment engine. Admins build **methodologies**: a weighted tree of properties, made of
questions from a shared library, with rules that turn each answer into a score. Respondents apply a
published methodology version to a concrete object, answer the questions and get a total score with its
level, e.g. 3.9 “Good”.

- **Question library and rating scales**: what is measured and how answers are scored.
- **Methodologies**: versioned property trees with weights, aggregation rules and knock-out thresholds.
  A version is locked once published, so past scores stay reproducible.
- **Assessments**: raw answers, normalized scores, evidence and the calculated result of every node.
- **Users and roles**: standard users fill in assessments; the Admin role and superusers manage the rest.
- **Three languages**: English (main), Russian and Kyrgyz, for the interface and all content.

## Repository

| Path | What | Docs |
| --- | --- | --- |
| [`backend/`](backend/) | Django + Django REST Framework: models, admin and respondent APIs, accounts, Django admin, fixtures, translations | [backend/README.md](backend/README.md) |
| [`frontend/`](frontend/) | Admin dashboard and respondent screens: plain HTML and JavaScript modules, no build step | [frontend/README.md](frontend/README.md) |
| [`schema.dbml`](schema.dbml) | The data model (PostgreSQL), viewable on [dbdiagram.io](https://dbdiagram.io) | – |

## Quick start

Needs Python 3.11+. The Django server also serves the frontend, so one command runs everything.

```bash
cd backend
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/python manage.py migrate
.venv/bin/python manage.py setup_demo     # example data and demo users
.venv/bin/python manage.py runserver
```

Open <http://localhost:8000> and sign in:

| User | Password | Sees |
| --- | --- | --- |
| `expert` | `expert` | Standard user: fills in assessments, own history |
| `admin` | `admin` | Admin role: catalogs, questions, methodologies, all assessments |
| `root` | `root` | Superuser: everything, plus users and roles in Django admin |

Other addresses: Django admin at `/admin/`, API docs at `/api/docs/`, interface translations at `/rosetta/`.
See [backend/README.md](backend/README.md#run) for PostgreSQL and the full setup.

## Tests

```bash
cd backend && .venv/bin/python manage.py test
```

## Security

The frontend guards against the common client-side risks (XSS, open redirects, clickjacking, JSON
hijacking, log forging) with a Content-Security-Policy and shared helpers. See
[frontend/README.md](frontend/README.md#security). In production, serve the site over HTTPS and set
`DJANGO_HTTPS=1` for HSTS and secure cookies, set `DJANGO_DEBUG=0` and `DJANGO_SECRET_KEY`, and leave
`DEMO_RESET_ENABLED` off.
