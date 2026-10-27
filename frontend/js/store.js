// Client-side copy of the tables in schema.dbml, loaded from the Django API.
//
// Views read synchronously (all / find / get) using the schema's table and
// column names, e.g. methodology_nodes.parent_id. Writes go to the API and
// then reload the cache, so the page always shows what the server stored.
import * as api from './api.js';

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
export const RESPONDENT_TABLES = ['assessments', 'responses', 'response_options', 'response_evidence', 'node_results'];
export const urlOf = (table, id) => (id == null ? T[table].url : `${T[table].url}${id}/`);

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

// Extra server-computed views, cached per id and refreshed with the tables.
const validations = new Map(); // versionId → { can_publish, errors, warnings }
const questionnaireCache = new Map(); // 'all' → latest published version of every methodology
const evaluations = new Map(); // assessmentId → { total, level, is_vetoed, nodes }
const inFlight = new Set();

async function fetchTables(tables) {
  const rows = await Promise.all(tables.map((t) => api.get(T[t].url)));
  tables.forEach((t, i) => { data[t] = rows[i].map((r) => fromApi(t, r)); });
}

async function refetchExtras() {
  await Promise.all([
    ...[...validations.keys()].map(async (id) => {
      if (!get('methodology_versions', id)) { validations.delete(id); return; }
      validations.set(id, await api.get(`${urlOf('methodology_versions', id)}validation/`));
    }),
    ...[...questionnaireCache.keys()].map(async (key) => {
      questionnaireCache.set(key, await api.get(`${RESP}/questionnaires/`));
    }),
    ...[...evaluations.keys()].map(async (id) => {
      if (!get('assessments', id)) { evaluations.delete(id); return; }
      evaluations.set(id, await api.get(`${urlOf('assessments', id)}evaluation/`));
    }),
  ]);
}

export async function load(tables = TABLES) {
  busyChanged(1);
  try {
    await fetchTables(tables);
    await refetchExtras();
    notify();
  } finally {
    busyChanged(-1);
  }
}

export function clear() {
  TABLES.forEach((t) => { data[t] = []; });
  validations.clear();
  evaluations.clear();
  questionnaireCache.clear();
}

function lazy(cache, key, url) {
  if (cache.has(key)) return cache.get(key);
  if (!inFlight.has(url)) {
    inFlight.add(url);
    api.get(url).then((v) => { cache.set(key, v); }).catch(() => {}).finally(() => { inFlight.delete(url); notify(); });
  }
  return null;
}

// Validation result of a version; null while it is being fetched for the first time.
export const validationOf = (versionId) => lazy(validations, versionId, `${urlOf('methodology_versions', versionId)}validation/`);
// Questionnaires respondents can start: [{ methodology, name, object_type, version, question_count, … }]; null while loading.
export const questionnaires = () => lazy(questionnaireCache, 'all', `${RESP}/questionnaires/`);
// Provisional scores of an assessment; null while loading.
export const evaluationOf = (assessmentId) => lazy(evaluations, assessmentId, `${urlOf('assessments', assessmentId)}evaluation/`);

// ── Writing ───────────────────────────────────────────────────
// Each write reloads `refresh` (every table by default) because the server
// often changes more than one table, e.g. a new question node also gets a rule.

async function write(promise, refresh) {
  busyChanged(1);
  try {
    const result = await promise;
    await load(refresh);
    return result;
  } finally {
    busyChanged(-1);
  }
}

export async function create(table, row, refresh) {
  const r = await write(api.post(urlOf(table), toApi(table, row)), refresh);
  return fromApi(table, r);
}

export async function update(table, id, patch, refresh) {
  const r = await write(api.patch(urlOf(table, id), toApi(table, patch)), refresh);
  return fromApi(table, r);
}

export const remove = (table, id, refresh) => write(api.del(urlOf(table, id)), refresh);

// POST to a custom action, e.g. versions/3/publish/. Returns the raw API response.
export const action = (url, body, refresh) => write(api.post(url, body), refresh);

export { fromApi };
