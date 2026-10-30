// Client-side copy of the tables in schema.dbml, loaded from the Django API.
//
// Views read synchronously (all / find / get) using the schema's table and
// column names, e.g. methodology_nodes.parent_id. Writes go to the API and
// then reload what they can have changed, so the page shows what the server stored.
//
// What is kept in memory, so the amount loaded doesn't grow with the number of assessments:
// - reference tables (catalogs, question library, methodologies): loaded at sign-in.
//   They are written by admins and stay small;
// - assessments: only the user's own, plus any opened by id;
// - answers (responses, options, evidence, node results): per assessment, when it is opened.
// Lists of everyone's assessments and the raw data tables are read page by page from
// the server (page(), assessmentSummary()).
import * as api from './api.js';
import * as session from './session.js';

const ADMIN = '/api/admin';
const RESP = '/api/respondent';

// table → endpoint, foreign keys (the API calls them `scale`, the schema `scale_id`),
// and nested lists to drop because they are loaded as their own tables.
const T = {
  units: { url: `${ADMIN}/units/` },
  object_types: { url: `${ADMIN}/object-types/` },
  assessment_objects: { url: `${ADMIN}/assessment-objects/`, fk: ['object_type', 'created_by'] },
  rating_scales: { url: `${ADMIN}/rating-scales/`, drop: ['levels'] },
  scale_levels: { url: `${ADMIN}/scale-levels/`, fk: ['scale'] },
  assessment_methods: { url: `${ADMIN}/assessment-methods/` },
  question_categories: { url: `${ADMIN}/question-categories/`, fk: ['parent'], drop: ['question_count'] },
  questions: { url: `${ADMIN}/questions/`, fk: ['category', 'unit', 'default_scale'], drop: ['options'] },
  question_options: { url: `${ADMIN}/question-options/`, fk: ['question'] },
  methodologies: { url: `${ADMIN}/methodologies/`, fk: ['object_type'], drop: ['versions'] },
  methodology_versions: { url: `${ADMIN}/versions/`, fk: ['methodology', 'result_scale'], drop: ['methodology_code', 'node_count', 'assessment_count', 'is_editable'] },
  methodology_nodes: { url: `${ADMIN}/nodes/`, fk: ['version', 'parent', 'question', 'score_scale', 'scoring_rule'] },
  node_assessment_methods: { url: `${ADMIN}/node-assessment-methods/`, fk: ['node', 'assessment_method'], drop: ['method_code', 'method_name'] },
  scoring_rules: { url: `${ADMIN}/scoring-rules/`, fk: ['node'], drop: ['criteria'] },
  score_criteria: { url: `${ADMIN}/score-criteria/`, fk: ['scoring_rule', 'option', 'scale_level'], drop: ['condition'] },
  assessments: { url: `${RESP}/assessments/`, fk: ['respondent', 'object', 'methodology_version', 'total_scale_level'] },
  responses: { url: `${RESP}/responses/`, fk: ['assessment', 'node', 'assessment_method', 'option', 'scale_level', 'matched_criterion'] },
  response_options: { url: `${RESP}/response-options/`, fk: ['response', 'option'] },
  response_evidence: { url: `${RESP}/response-evidence/`, fk: ['response'] },
  node_results: { url: `${RESP}/node-results/`, fk: ['assessment', 'node', 'scale_level'] },
};

export const TABLES = Object.keys(T);

// A write reloads the group of its table: the server may change other rows of the
// group too, e.g. a new question node also gets a scoring rule.
export const GROUPS = {
  catalogs: ['units', 'object_types', 'assessment_objects', 'rating_scales', 'scale_levels', 'assessment_methods'],
  library: ['question_categories', 'questions', 'question_options'],
  methodology: ['methodologies', 'methodology_versions', 'methodology_nodes', 'node_assessment_methods', 'scoring_rules', 'score_criteria'],
};
export const REFERENCE_TABLES = Object.values(GROUPS).flat();
// Rows of one assessment, loaded when it is opened.
const DETAIL_TABLES = ['responses', 'response_options', 'response_evidence', 'node_results'];
// Tables that grow with use: the data tables page reads them a page at a time.
export const PAGED_TABLES = ['assessments', ...DETAIL_TABLES];

const groupOf = (table) => Object.values(GROUPS).find((g) => g.includes(table)) ?? [table];

export const urlOf = (table, id) => (id == null ? T[table].url : `${T[table].url}${id}/`);

// Refresh scope for writes to one assessment: its row and its answers.
export const forAssessment = (id) => ({ assessment: id });

const data = Object.fromEntries(TABLES.map((t) => [t, []]));
const listeners = new Set();
const busyListeners = new Set();
let busy = 0;

// onChange: data changed, re-render. onBusy: a request started or finished.
export const onChange = (fn) => listeners.add(fn);
export const onBusy = (fn) => busyListeners.add(fn);
const notify = () => listeners.forEach((fn) => fn());
const busyChanged = (delta) => { busy += delta; busyListeners.forEach((fn) => fn(busy > 0)); };
export const isBusy = () => busy > 0;

function fromApi(table, row) {
  const { fk = [], drop = [] } = T[table];
  const out = {};
  for (const [k, v] of Object.entries(row)) {
    if (drop.includes(k)) continue;
    out[fk.includes(k) ? `${k}_id` : k] = v;
  }
  return out;
}

export function toApi(table, row) {
  const { fk = [] } = T[table];
  const out = {};
  for (const [k, v] of Object.entries(row)) {
    const base = k.endsWith('_id') ? k.slice(0, -3) : null;
    out[base && fk.includes(base) ? base : k] = v;
  }
  return out;
}

// ── Reading ───────────────────────────────────────────────────

export const all = (table, pred) => (pred ? data[table].filter(pred) : data[table].slice());
export const find = (table, pred) => data[table].find(pred) ?? null;
export function get(table, id) {
  if (id == null) return null;
  return data[table].find((r) => r.id === id) ?? null;
}
export function columnsOf(table) {
  const cols = new Set();
  data[table].forEach((r) => Object.keys(r).forEach((k) => cols.add(k)));
  return [...cols];
}

// ── Loading ───────────────────────────────────────────────────

// Extra server-computed views, cached per key and refreshed after writes.
const validations = new Map(); // versionId → { can_publish, errors, warnings }
const questionnaireCache = new Map(); // 'all' → latest published version of every methodology
const evaluations = new Map(); // assessmentId → { total, level, is_vetoed, nodes }
const pages = new Map(); // url → { count, results } of a paged list
const summaries = new Map(); // 'assessments' → { count, completed, latest }
const inFlight = new Set();
const stale = new Set(); // urls to fetch again; the old value is shown meanwhile
const failed = new Set(); // urls that failed; not retried until the next write

const ownAssessmentsUrl = () => `${T.assessments.url}?respondent=${session.current().id}`;

// Assessments opened by id (someone else's, read-only) stay when the own list is reloaded.
const opened = new Set();
const loadedAssessments = new Set();
const loadingAssessments = new Set();

async function fetchTables(tables) {
  const rows = await Promise.all(tables.map((t) => api.get(t === 'assessments' ? ownAssessmentsUrl() : T[t].url)));
  tables.forEach((t, i) => {
    const fresh = rows[i].map((r) => fromApi(t, r));
    if (t === 'assessments') {
      const ids = new Set(fresh.map((a) => a.id));
      fresh.push(...data.assessments.filter((a) => opened.has(a.id) && !ids.has(a.id)));
    }
    data[t] = fresh;
  });
}

// One assessment: its row and every answer row, replacing what was cached for it.
async function fetchAssessment(id) {
  const [row, ...details] = await Promise.all([
    api.get(urlOf('assessments', id)),
    ...DETAIL_TABLES.map((t) => api.get(`${T[t].url}?assessment=${id}`)),
  ]);
  const a = fromApi('assessments', row);
  if (a.respondent_id !== session.current().id) opened.add(id);
  data.assessments = [...data.assessments.filter((x) => x.id !== id), a];
  const oldResponses = new Set(data.responses.filter((r) => r.assessment_id === id).map((r) => r.id));
  const fresh = Object.fromEntries(DETAIL_TABLES.map((t, i) => [t, details[i].map((r) => fromApi(t, r))]));
  data.responses = [...data.responses.filter((r) => r.assessment_id !== id), ...fresh.responses];
  data.node_results = [...data.node_results.filter((r) => r.assessment_id !== id), ...fresh.node_results];
  for (const t of ['response_options', 'response_evidence']) {
    data[t] = [...data[t].filter((r) => !oldResponses.has(r.response_id)), ...fresh[t]];
  }
  loadedAssessments.add(id);
  if (evaluations.has(id)) evaluations.set(id, await api.get(`${urlOf('assessments', id)}evaluation/`));
}

// Server lists and summaries may have changed: show the old value and fetch again.
function markStale() {
  [...pages.keys(), `${RESP}/assessments/summary/`].forEach((url) => stale.add(url));
  failed.clear();
}

async function refetchMethodologyExtras() {
  await Promise.all([
    ...[...validations.keys()].map(async (id) => {
      if (!get('methodology_versions', id)) { validations.delete(id); return; }
      validations.set(id, await api.get(`${urlOf('methodology_versions', id)}validation/`));
    }),
    ...[...questionnaireCache.keys()].map(async (key) => {
      questionnaireCache.set(key, await api.get(`${RESP}/questionnaires/`));
    }),
  ]);
}

// load(): everything a signed-in user needs (reference tables and own assessments).
// load(tables): only those tables. load(forAssessment(id)): one assessment and its answers.
export async function load(scope = [...REFERENCE_TABLES, 'assessments']) {
  busyChanged(1);
  try {
    if (Array.isArray(scope)) {
      await fetchTables(scope);
      if (scope.some((t) => GROUPS.methodology.includes(t))) await refetchMethodologyExtras();
    } else {
      await fetchAssessment(scope.assessment);
    }
    notify();
  } finally {
    busyChanged(-1);
  }
}

export function clear() {
  TABLES.forEach((t) => { data[t] = []; });
  [validations, evaluations, questionnaireCache, pages, summaries].forEach((m) => m.clear());
  [opened, loadedAssessments, stale, failed].forEach((x) => x.clear());
}

// True once the assessment and its answers are in memory; starts loading them otherwise.
// Views show "Loading…" until then and re-render when the data arrives.
export function assessmentReady(id) {
  if (loadedAssessments.has(id)) return true;
  if (!loadingAssessments.has(id)) {
    loadingAssessments.add(id);
    fetchAssessment(id)
      .catch(() => { loadedAssessments.add(id); }) // not found or not allowed: the view says so
      .finally(() => { loadingAssessments.delete(id); notify(); });
  }
  return false;
}

// A cached GET: returns the value (or null while loading the first time) and
// fetches in the background when there is none yet or it went stale.
function lazy(cache, key, url, map = (v) => v) {
  const has = cache.has(key);
  if ((!has || stale.has(url)) && !inFlight.has(url) && !failed.has(url)) {
    inFlight.add(url);
    stale.delete(url);
    api.get(url)
      .then((v) => { cache.set(key, map(v)); })
      .catch(() => { failed.add(url); })
      .finally(() => { inFlight.delete(url); notify(); });
  }
  return has ? cache.get(key) : null;
}

// Validation result of a version; null while it is being fetched for the first time.
export const validationOf = (versionId) => lazy(validations, versionId, `${urlOf('methodology_versions', versionId)}validation/`);
// Questionnaires respondents can start: [{ methodology, name, object_type, version, question_count, … }]; null while loading.
export const questionnaires = () => lazy(questionnaireCache, 'all', `${RESP}/questionnaires/`);
// Provisional scores of an assessment; null while loading.
export const evaluationOf = (assessmentId) => lazy(evaluations, assessmentId, `${urlOf('assessments', assessmentId)}evaluation/`);

// One page of a server list: { count, results } with schema column names; null while loading.
// params: filters of the endpoint plus limit and offset, e.g. { status: 'completed', limit: 50, offset: 100 }.
export function page(table, params) {
  const query = new URLSearchParams(Object.entries(params).filter(([, v]) => v != null && v !== ''));
  const url = `${T[table].url}?${query}`;
  return lazy(pages, url, url, (v) => ({ count: v.count, results: v.results.map((r) => fromApi(table, r)) }));
}

// Counts and the latest assessments the user may see; null while loading.
export const assessmentSummary = () => lazy(summaries, 'assessments', `${RESP}/assessments/summary/`,
  (v) => ({ ...v, latest: v.latest.map((r) => fromApi('assessments', r)) }));

// ── Writing ───────────────────────────────────────────────────
// Each write reloads `refresh`: a list of tables, forAssessment(id), or by default
// the group of the written table.

async function write(promise, refresh) {
  busyChanged(1);
  try {
    const result = await promise;
    markStale();
    await load(refresh);
    return result;
  } finally {
    busyChanged(-1);
  }
}

export async function create(table, row, refresh = groupOf(table)) {
  const r = await write(api.post(urlOf(table), toApi(table, row)), refresh);
  return fromApi(table, r);
}

export async function update(table, id, patch, refresh = groupOf(table)) {
  const r = await write(api.patch(urlOf(table, id), toApi(table, patch)), refresh);
  return fromApi(table, r);
}

export const remove = (table, id, refresh = groupOf(table)) => write(api.del(urlOf(table, id)), refresh);

// POST to a custom action, e.g. versions/3/publish/. Returns the raw API response.
// By default the reference tables are reloaded.
export const action = (url, body, refresh = REFERENCE_TABLES) => write(api.post(url, body), refresh);

export { fromApi };
