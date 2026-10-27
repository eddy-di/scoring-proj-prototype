# Qualimetry scoring – backend (Django)

The backend for `../schema.dbml`:

- models for every table;
- a REST API for the admin dashboard (`/api/admin/`) and for respondents (`/api/respondent/`);
- accounts for the frontend (`/api/auth/`): sign up, sign in, profile, password;
- users and roles: standard users (respondents), the **Admin** staff role, superusers, and room for more roles;
- Django's built-in admin for every model, at `/admin/`;
- fixtures with the example data used in the user-flow documents;
- the frontend in `../frontend`, served at `/` from the same origin so it can use the session cookie;
- three languages: English (main), Russian and Kyrgyz, for the interface and for all content.

## Run

```bash
cd backend
uv venv .venv -p 3.11            # or: python3 -m venv .venv
uv pip install -p .venv/bin/python -r requirements.txt
.venv/bin/python manage.py migrate
.venv/bin/python manage.py setup_demo
.venv/bin/python manage.py runserver
```

`setup_demo` replaces all data with the example fixtures and creates three users if they don't exist yet:

| User | Password | Role | Can |
| --- | --- | --- | --- |
| `root` | `root` | superuser | everything, including users and roles in Django admin |
| `admin` | `admin` | Admin | catalogs, questions, methodologies (incl. publishing) and all assessments; not users |
| `expert` | `expert` | none (standard user) | fill in assessments, see own history; owns the two example assessments |

Anyone can create a standard account on the sign-in page.

Run it again at any time to start over. Users and their passwords are kept. Signed-in admins can do
the same from the app with **Reset demo data**. That button calls `POST /api/demo/reset/`, which only
works while `DEMO_RESET_ENABLED` is on (by default whenever `DEBUG` is on).

| URL | What |
| --- | --- |
| <http://localhost:8000/> | The app: admin dashboard and respondent screens |
| <http://localhost:8000/admin/> | Django admin. Superusers manage users and roles here |
| <http://localhost:8000/api/admin/> | Admin panel API, browsable once signed in |
| <http://localhost:8000/api/docs/> | Swagger UI / OpenAPI schema (`/api/schema/`) |
| <http://localhost:8000/rosetta/> | Rosetta: translate interface texts (superusers) |

SQLite is used by default. It runs in WAL mode with immediate transactions, so the parallel requests the
frontend sends don't fail with "database is locked". To use PostgreSQL, install `psycopg[binary]` and set
`POSTGRES_DB`, plus `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_HOST` and `POSTGRES_PORT` as needed.
SQLite compares only Latin letters case-insensitively, so API `?search=` on Russian or Kyrgyz text is
case-sensitive there. PostgreSQL doesn't have this limitation, and the frontend's own search works either way.

Tests: `.venv/bin/python manage.py test`

## Languages

`settings.LANGUAGES` lists the languages: `en` (main and fallback), `ru` and `ky`. Add a language there,
then run `makemigrations` (new content columns), `makemessages -l <code>` and `frontend_messages`.

**Content: django-modeltranslation.** Every text an admin enters gets one column per language, e.g.
`questions.text_en`, `text_ru`, `text_ky`. The registrations are in `*/translation.py`:

| Table | Translated fields |
| --- | --- |
| units, object_types, rating_scales, assessment_methods, methodologies, question_categories | `name`, `description` |
| scale_levels | `label`, `description` |
| questions | `text`, `description` |
| question_options | `label` |
| methodology_versions | `notes` |
| methodology_nodes | `name`, `description` |
| node_assessment_methods | `instructions`, `required_evidence` |
| scoring_rules | `description` |
| score_criteria | `label`, `description` |

Codes, unit symbols (`units.code`, e.g. "mm"), object names, assessment titles and respondents'
answers are not translated.

- `MODELTRANSLATION_REQUIRED_LANGUAGES` (default: all languages; env `REQUIRED_CONTENT_LANGUAGES=en,ru`)
  says which languages must be filled in for required texts such as names and question texts. The API
  and Django admin both enforce it. Optional texts such as descriptions stay optional, and fall back to
  English when a translation is missing.
- The API returns `name_en`, `name_ru`, `name_ky` and accepts them for writing. It also returns `name`,
  read-only, in the language of the request.
- Django admin shows one input per language (modeltranslation's `TranslationAdmin`).
- The fixtures contain the example content in all three languages.

**Interface: gettext + Rosetta.** All backend texts (model and field names, validation and checklist
messages, Django admin actions) use `gettext`. The frontend's texts live in the `djangojs` domain.

| File | What |
| --- | --- |
| `locale/<lang>/LC_MESSAGES/django.po` | Backend texts. Update with `makemessages -l ru -l ky --ignore=.venv` |
| `locale/<lang>/LC_MESSAGES/djangojs.po` | Frontend texts. Update with `frontend_messages`, which collects every `t('…')` from `../frontend/js` |

Translate both in Rosetta at <http://localhost:8000/rosetta/>. Saving there compiles the `.mo` files.
Outside Rosetta, run `compilemessages`.
`tests/test_api.py` fails while any frontend text is untranslated.

The language of a request comes from the `django_language` cookie (set by the EN / RU / KY switch in the
frontend), then the `Accept-Language` header. `GET /api/auth/me/` reports the languages, the required
ones and which fields are translated. `GET /api/i18n/catalog/` returns the frontend texts for the
current language.

The Russian and Kyrgyz texts were written for this prototype. A native speaker should review them,
the Kyrgyz ones especially, before real use.

## Users and roles

| Who | How they get it | What they can do |
| --- | --- | --- |
| Standard user | Signs up at `/#/register`, or created by a superuser without a role | Profile; questionnaires; start, answer and complete **their own** assessments; their history. They never see draft methodologies or other people's assessments |
| **Admin** (staff role) | A superuser adds the user to the *Admin* role in Django admin | Everything in catalogs, question library, methodologies (publish, archive) and all assessments, in the admin dashboard and in Django admin. **No** access to users or roles |
| Superuser | `createsuperuser`, or a superuser ticks *Superuser status* | Everything, including users and roles in Django admin and Rosetta |

How it works (`accounts/`):

- A **role is a Django group**. Its permissions are ordinary Django model permissions
  (`view/add/change/delete_<model>`), plus custom ones: `methodologies.publish_methodologyversion`,
  `methodologies.archive_methodologyversion` and `assessments.view_all_assessments`.
- **RoleProfile** adds a description and *staff role* to a group. Members of a staff role get
  `is_staff` automatically, and lose it when they leave the role (`accounts/roles.py`).
- The **API checks permissions, not role names** (`config/permissions.py`). Writes need the model
  permission for the action, and custom actions name theirs, e.g. publishing. Reads are open to signed-in
  users, but querysets hide drafts from users without `methodologies.view_methodologyversion`, and
  other people's assessments from users without `assessments.view_all_assessments`.
- The **frontend** shows menus and buttons from the same permissions (`GET /api/auth/me/` lists them).
- The built-in roles are defined in `ROLES` in `accounts/roles.py` and created after every `migrate`.
  Permissions are only ever added to them, so changes a superuser makes in Django admin are kept.

**Adding a role for a division or area of expertise.** In Django admin, go to *Groups → Add*, name it
(e.g. "Real estate methodologists"), choose its permissions (e.g. everything in *methodologies* except
*Can publish methodology versions*), tick *Staff role*, then add users to it. No code changes are
needed: the menus, buttons and API follow the permissions. `tests/test_respondent_api.py::RoleTests`
shows such a role. A role limited to *some* methodologies (e.g. one object type) needs one more step:
a scope on `RoleProfile` (e.g. object types) applied in the methodology querysets, the way
`HideDraftsMixin` hides drafts.

## Apps

| App | Tables |
| --- | --- |
| `catalogs` | units, object_types, assessment_objects, rating_scales, scale_levels, assessment_methods |
| `library` | question_categories, questions, question_options |
| `methodologies` | methodologies, methodology_versions, methodology_nodes, node_assessment_methods, scoring_rules, score_criteria |
| `assessments` | assessments, responses, response_options, response_evidence, node_results |
| `accounts` | users, role_profiles (+ Django's auth_group and permissions) |

Models set `db_table` to the schema's table names, and their fields use the schema's column names.

## Fixtures

| Fixture | Contents |
| --- | --- |
| `catalogs` | Units (mm, kWh/m²·yr, %, pcs), the `quality_5` and `pass_fail` scales with levels, 5 assessment methods, 2 object types, and the buildings "Block A, Riverside residential complex" (RC-0042) and "House 7, Green Lane" (GL-0007) |
| `question_library` | 4 categories and 8 questions. Four are used by the methodology: `STR_CRACK_WIDTH`, `STR_ROOF_STATE`, `SAF_FIRE_ALARM`, `EN_HEAT_USE`. Four are in the library only: `COM_INDOOR_HUMIDITY`, `COM_FACADE_RATING`, `COM_FACADE_DEFECTS`, `GEN_REMARKS` |
| `tech_res_methodology` | `TECH_RES` v1.0 (published): the tree STR 0.5 / SAF 0.3 / EN 0.2, plus assessment methods, scoring rules and criteria |
| `example_assessments` | The worked example, completed. **Block A**: crack 1.2 mm → 3, roof minor wear → 4, fire alarm yes → 5, heat 150 → 3.5, giving a total of **3.9 "Good"**. **House 7**: the same answers but no fire alarm, giving **2.7**, and the root is vetoed by the knock-out threshold |

Load them in the order shown, or together in one `loaddata` call. Each fixture refers to records in the ones before it.
Every translated field is filled in English, Russian and Kyrgyz.

## Admin panel API

Any signed-in user can read what their role may see; changes need the matching Django permission (see
*Users and roles*). Any signed-in user may also create assessment objects (respondent step R1); the
object records who created it. Session and HTTP Basic auth are enabled. Every
collection supports list, create, retrieve, update (`PATCH`/`PUT`) and delete, unless noted otherwise.
Lists accept `?search=` and `?ordering=`, plus the filters shown.

| Endpoint | Filters | Notes |
| --- | --- | --- |
| `GET choices/` | | Values and labels of every enum, for dropdowns |
| **Catalogs (A1–A4)** | | |
| `units/` | | |
| `object-types/` | | |
| `assessment-objects/` | `object_type` | |
| `rating-scales/` | `scale_type` | Includes `levels`. Sending `levels` replaces the list: items with an `id` are updated, new items created, missing items deleted |
| `scale-levels/` | `scale` | |
| `assessment-methods/` | | |
| **Question library (A5–A7)** | | |
| `question-categories/` | `parent` | |
| `questions/` | `category`, `answer_type`, `is_active` | Includes `options`, which work like `levels` above, and `used_in` (the versions that link the question) |
| `question-options/` | `question` | |
| **Methodologies (A8–A14)** | | |
| `methodologies/` | `object_type` | Creating one also creates draft version 1.0 and a `ROOT` node. Pass `result_scale` for the version |
| `versions/` | `methodology`, `status` | No create; use `new-version`. Update and delete work on drafts only |
| `GET versions/{id}/tree/` | | The whole tree, with rules, criteria and methods on each node |
| `GET versions/{id}/validation/` | | `{can_publish, errors, warnings}` |
| `POST versions/{id}/publish/` | | 200 with the version, or 400 with the validation errors |
| `POST versions/{id}/archive/` | | Published versions only |
| `POST versions/{id}/new-version/` | | Deep-copies the version into a new draft, e.g. 1.0 → 1.1 |
| `nodes/` | `version`, `parent`, `node_type` | New question nodes get a criteria-lookup rule. Linking a different question deletes the rule's criteria. Deleting a group deletes its subtree |
| `POST nodes/{id}/try-rule/` | | "Try the rule": scores a trial answer without saving it |
| `node-assessment-methods/` | `node`, `version` | |
| `scoring-rules/` | `node`, `version` | Includes `criteria` |
| `score-criteria/` | `scoring_rule`, `node` | `scale_level` defaults to the level nearest to `score`. Includes a readable `condition` |

Errors:

- `400` – invalid input. Examples: a second root node, a parent in another version, a criterion
  option from another question, `range_from >= range_to`, options on a non-choice question.
- `409` – a published or archived version can't be changed, or the record is still in use
  (`PROTECT`, e.g. a question linked by a methodology node). The whole request is rolled back.

Example, scoring a trial answer for the crack-width node:

```bash
curl -u admin:admin -H 'Content-Type: application/json' \
  -d '{"numeric_value": 1.2}' http://localhost:8000/api/admin/nodes/5/try-rule/
# {"score": 3.0, "scale_level": {"id": 3, "value": 3.0, "label": "Satisfactory"},
#  "matched_criterion": {"id": 3, "label": "Local cracks", "condition": "0.5 ≤ x < 2 mm"}, "note": null}
```

## Respondent API

Mounted at `/api/respondent/`. Any signed-in user can use it for **their own** assessments. Users with
`assessments.view_all_assessments` (e.g. Admin) can also read everyone's, but not change them.

| Endpoint | Notes |
| --- | --- |
| `GET questionnaires/` | The latest published version of every methodology. `?object=<id>` limits it to the object's type |
| `assessments/` | List, create, update and delete. Create with `{object, methodology?}`: the latest published version of that methodology for the object's type is used. `methodology` can be left out when only one questionnaire fits. `respondent` is the signed-in user |
| `POST assessments/{id}/answer/` | Saves part of an answer (`node` plus only the fields you send) and scores it. `options` replaces a multi-choice selection. Returns 409 once the assessment is completed |
| `GET assessments/{id}/evaluation/` | Provisional score of every node from the answers so far |
| `POST assessments/{id}/complete/` | 400 with `issues` if mandatory answers are missing; otherwise saves the node results and the total |
| `POST assessments/{id}/reopen/` | Deletes the computed results so answers can change again |
| `responses/`, `response-options/`, `node-results/` | Read only. Filter with `?assessment=` |
| `response-evidence/` | List, create and delete |

## Sign-in

| Endpoint | Notes |
| --- | --- |
| `GET /api/auth/me/` | The signed-in user: `id`, `username`, `roles`, `permissions`, `profile`, `stats`, language settings. It also sets the CSRF cookie |
| `PATCH /api/auth/me/` | Update your profile: names, email, organization, position, phone, `preferred_language` |
| `POST /api/auth/register/` | Create a standard account and sign in: `username`, `password`, `email`, optional profile fields. Django's password validators apply |
| `POST /api/auth/login/` | `{username, password}`. Sets the language cookie to the user's preferred language |
| `POST /api/auth/password/` | `{current_password, new_password}`. You stay signed in |
| `POST /api/auth/logout/` | |

The frontend sends the `csrftoken` cookie back in the `X-CSRFToken` header.

## Django admin

Every model is registered. It also includes:

- inlines: levels on scales, options on questions, versions on methodologies, nodes on versions, methods and
  the rule on nodes, criteria on rules, and responses, results, options and evidence on assessments;
- version actions: **Validate**, **Publish**, **Archive** and **Create new version**. The version page also
  shows its validation result;
- read-only pages: nodes, rules, criteria and methods of a published or archived version, matching the API;
- assessment actions: **Re-score answers and complete** and **Reopen**. Saving a response in the admin re-scores it.

## Scoring rules

These match the frontend prototype, including the points the schema leaves open:

- Criteria ranges are `[range_from, range_to)`. A missing bound means unbounded.
- Multiple choice: when several options are selected, the lowest score applies.
- `linear_min_max`: `raw_min` is the worst value and `raw_max` the best, so the rule works in either direction. Results are
  mapped onto the node scale (the version result scale unless `score_scale` is set).
- Unanswered and not-applicable questions are left out of aggregation, and their siblings' weights are rescaled.
- A child scoring below its `veto_threshold`, or already vetoed, vetoes its parent, up to the root.
- A score's level is the nearest level of its scale.
- **Formulas are Python expressions**, where the frontend prototype uses JavaScript. They are checked
  against an allowed set of syntax: arithmetic, comparisons, `a if c else b`, comprehensions,
  `min max abs sum len round zip sqrt log exp pow prod`. Rule formulas get `x`, `lo` and `hi`.
  Aggregation formulas get `s` (child scores) and `w` (weights that sum to 1).

## Differences from schema.dbml

- `response_options` has a surrogate `id` and a unique constraint on `(response_id, option_id)`, not
  the composite primary key, because Django admin can't edit composite-key models.
- Foreign keys use `PROTECT` wherever deleting the target would break a published version or a past
  assessment. Records inside a version use `CASCADE`.
