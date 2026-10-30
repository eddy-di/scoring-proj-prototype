# Qualimetry scoring – frontend

The admin dashboard and the respondent screens. Plain HTML and JavaScript modules: no build step and
no dependencies. All data comes from the Django backend in `../backend`.

## Run

The Django server also serves this folder, so the app and the API share one origin and the session cookie.

```bash
cd ../backend
.venv/bin/python manage.py setup_demo   # example data + demo users (first time, or to start over)
.venv/bin/python manage.py runserver
```

Open <http://localhost:8000> and sign in, or create an account:

- `expert` / `expert`: a standard user. My assessments, new assessment, history, profile;
- `admin` / `admin`: the Admin role. The admin dashboard, plus everything a standard user has;
- `root` / `root`: superuser. The same as Admin, plus a **Users and roles** link to Django admin.

## What each user sees

| Page | Standard user | Admin role | Notes |
| --- | --- | --- | --- |
| My assessments (`#/` or `#/my`) | ✓ | ✓ | In progress, latest results, counts |
| New assessment (`#/assessments/new`) | ✓ | ✓ | By questionnaire or by object. Always the newest published version |
| History (`#/history`) | ✓ | ✓ | Your own assessments, with filters |
| Profile (`#/profile`) | ✓ | ✓ | Details, preferred language, password |
| Dashboard, Catalogs, Questions, Methodologies | – | ✓ | Each needs its permissions |
| All assessments (`#/admin/assessments`) | – | ✓ | Everyone's; other people's open read-only |
| Data tables | – | ✓ | Staff only |

Menus and buttons come from the user's permissions (`session.can()`, `session.canManage()`), not role
names, so a new role created in Django admin automatically gets exactly the matching screens.

See `../backend/README.md` for the first-time setup.

## Helpers for new admins

The admin screens are written for junior specialists. While **Helpers** is on (the switch in the top bar):

- each page starts with a tip explaining what it is for, with an example from the example methodology;
- form fields show longer help, and dropdowns explain the chosen option (aggregation types, scale types…);
- answer types and scoring rules are picked from cards with a description and an example;
- glossary words have a dotted underline: hover for a definition, click to open the glossary;
- small notes show which database table each screen writes to.

Turn **Helpers** off to get compact forms. Single tips can also be hidden with “Hide this tip”. The
**Help** page brings hidden tips back and is always available. It has the glossary, the usual order of
work and the worked example. The setting is saved per user in this browser (`localStorage`).

These aids stay on even with helpers off:

- **Dashboard**: setup steps with progress, items that need attention (drafts with problems, scales
  without levels, choice questions without options) and counts.
- **Publishing checklist**: on a draft, the server's validation is shown live. Every problem links to its
  node, and the tree marks nodes with problems with a red dot.
- **Weights**: each group shows the sum of its children's weights, with “Make equal” and “Scale to 1”.
- **In plain words**: every scoring rule is described in a sentence, e.g. “250 kWh/m²·yr or worse scores 1…”.
- **Starter criteria**: one click adds a criterion for every option, or for Yes and No.
- **Try the rule**: type a sample answer and the server scores it without saving.
- Errors appear next to the field they belong to. Records that are still in use explain what uses them.
  Deleting always needs a second click.

## Light and dark theme

The switch in the top bar, also on the sign-in page, has three choices: **Auto** (◐, follows the system
setting), **Light** and **Dark**. The choice applies at once and is saved in this browser (`localStorage`),
for every account. `js/theme-init.js` applies it in `<head>` before the page is drawn, so a dark choice
never flashes light. Colours are CSS variables at the top of `css/app.css`: the dark values apply under
`prefers-color-scheme: dark` unless `html[data-theme="light"]` is set, and always under
`html[data-theme="dark"]`. Use the variables (`--ink`, `--surface`, `--accent`…), never fixed colours,
so new screens work in both themes.

## Languages

The **EN / RU / KY** switch in the top bar, and on the sign-in page, changes the interface language. It
sets Django's `django_language` cookie and reloads the page, so content and server messages come back in
the same language. English is the main language and the fallback.

- **Interface texts** are written in English inside `t('…')`, e.g. `t('Saved: {name}.', { name })`.
  Their Russian and Kyrgyz translations are in the backend's `locale/<lang>/LC_MESSAGES/djangojs.po`.
  After adding or changing texts, run `python manage.py frontend_messages` in `../backend`, then
  translate the new entries in Rosetta (`/rosetta/`). Use whole sentences with `{placeholders}`;
  don't glue words together, because word order differs between languages.
- **Content** (names, questions, options, levels, criteria, instructions) is entered in every language.
  Forms show one input per language, and `*` marks the languages the server requires. Translated
  fields are marked `translated: true` in `form()` and are sent as `name_en`, `name_ru`, `name_ky`.
- The dashboard's **Needs attention** list shows texts that are still missing a translation.

## Where data lives

`js/store.js` keeps the data the screens read in memory. It uses the schema's table and column names, so
`methodology_nodes.parent_id` works even though the API calls the field `parent`. What it loads is chosen
so that the amount doesn't grow with the number of assessments:

| Data | Loaded |
| --- | --- |
| Catalogs, question library, methodologies | At sign-in. Admins write them and they stay small |
| Assessments | Only the user's own, at sign-in, plus any opened by link |
| Answers, evidence, node results | Per assessment, when it is opened (`db.assessmentReady(id)`) |
| Everyone's assessments, dashboard counts | From the server, a page at a time (`db.page()`, `db.assessmentSummary()`) |
| Data tables of assessments and answers | From the server, 100 rows at a time |

Each change goes to the API and then reloads only what it can have changed: the written table's group
(`GROUPS` in `store.js`), or for answers just that assessment (`db.forAssessment(id)`). Lists show their
previous rows while they refresh. Every GET revalidates with the server's ETag, so an unchanged list costs
an empty `304`. Answers typed into the questionnaire are saved shortly after you stop typing.

When adding a screen: read reference data with `db.all()`/`db.get()`; read assessments of other people
with `db.page()`; call `db.assessmentReady(id)` before reading one assessment's answers.

## Security

The frontend protects itself against the usual client-side attacks without extra work on the server.
The rules live in `js/security.js`, and every module goes through them:

| Risk | Protection |
| --- | --- |
| XSS (reflected, DOM) | Views build the DOM with `h()`, which adds data only as text. It refuses `<script>`, `<iframe>`, `<object>`… tags, string event handlers, `srcdoc`, and `style="…"` strings (use `style: { … }`). Nothing uses `innerHTML`. |
| Unsafe links | `href`/`src` go through `safeUrl()`: `javascript:`, `data:` and `//host` become `#`. `target="_blank"` always gets `rel="noopener noreferrer"`. |
| Open redirect | The app only navigates to its own hash routes (`routePath()`). There is no `?next=`; after sign-in it always goes to `/`. Unknown or malformed routes show “Page not found”. |
| Content injection | A Content-Security-Policy `<meta>` in `index.html`: scripts only as files from this origin (no inline code, no `eval`), styles from this origin and Google Fonts, no frames, no plugins, API calls only to this origin. In Chrome, Trusted Types reject every HTML-string sink. |
| Clickjacking, iframes | The server sends `X-Frame-Options: DENY`, and the app refuses to start inside a frame. |
| JSON hijacking | `api.js` calls only same-origin `/api/` URLs and reads a response only when it is `application/json`. The server sends `nosniff`. |
| Log forging | `logError()` writes one line per entry, with CR/LF and other control characters escaped. |
| Tampered storage | `prefs.js` keeps only well-formed values from `localStorage`. Route parts never match inherited object keys (`own()`). |
| HSTS, secure cookies | Set `DJANGO_HTTPS=1` in production (see `backend/config/settings.py`). |

When writing new code: build elements with `h()`, never assign HTML strings; link only through `link()`/`h('a')`;
call the API only through `api.js`; log with `logError()`.

## Browsers

Chrome, Firefox and Safari draw the app the same way. The top of `css/app.css` resets the parts each engine
styles differently: form controls (select chevron, number spinners, date fields, search fields, autofill),
checkbox size and colour, `<details>` markers, button margins, iOS text inflation, font smoothing and
bold weights. Write component styles on top of that base. Element defaults use `:where()`, so any class
rule overrides them.

Note: WebKit logs “Refused to apply a stylesheet…” once per `<select>`. That message comes from the
browser's own select styling under the CSP, not from the app, and changes nothing on screen.

## Code map

| File | Purpose |
| --- | --- |
| `js/security.js` | URL, route and log sanitizing, frame check: the client-side security rules |
| `js/api.js` | fetch wrapper: same-origin JSON only, CSRF header, readable error messages |
| `js/store.js` | Cached tables, writes, server validation and provisional scores |
| `js/session.js` | Signed-in user, roles and permission checks |
| `js/views/account.js` | Sign in, sign up, profile |
| `js/i18n.js` | Interface language, `t()`, language settings from the server |
| `js/theme.js`, `js/theme-init.js` | Light / dark / auto theme: the switch, and applying the saved choice before the first paint |
| `js/prefs.js`, `js/help.js` | Helper switch, tips, help text, glossary |
| `js/scoring.js` | Labels and explanations of rule and aggregation types, rule descriptions, “Try the rule” |
| `js/methodology.js` | Tree helpers and methodology operations (add node, weights, publish, new version) |
| `js/views/dashboard.js` | Admin start page |
| `js/views/admin-*.js` | Catalogs, question library, methodology editor |
| `js/views/respondent.js` | My assessments, starting assessments, history, the questionnaire, the result |
| `js/views/help.js` | Help page and glossary |
| `js/views/data.js` | Raw view of every table |
| `js/dom.js` | DOM helpers (`h()` builds safe elements), forms, toasts, confirm buttons |
