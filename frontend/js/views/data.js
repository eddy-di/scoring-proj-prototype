import * as db from '../store.js';
import { h, pageHead, link, button, rerender } from '../dom.js';
import { tip } from '../help.js';
import { t, formatDateTime } from '../i18n.js';

const GROUPS = () => [
  [t('Catalogs'), {
    units: t('Units for numeric answers.'),
    rating_scales: t('Scales for answers, node scores and results.'),
    scale_levels: t('Named points on a scale.'),
    assessment_methods: t('How values can be obtained.'),
    object_types: t('Kinds of objects assessed.'),
    assessment_objects: t('Concrete objects being assessed.'),
  }],
  [t('Question library'), {
    question_categories: t('Browsing groups for questions.'),
    questions: t('What is asked and which answer is valid.'),
    question_options: t('Choices for choice questions.'),
  }],
  [t('Methodology'), {
    methodologies: t('Stable identity of a methodology.'),
    methodology_versions: t('Locked snapshot of weights and rules once published.'),
    methodology_nodes: t('The weighted property tree.'),
    node_assessment_methods: t('Assessment mechanics per node.'),
    scoring_rules: t('How a raw answer is normalized.'),
    score_criteria: t('Conditions on the answer and the score each gives.'),
  }],
  [t('Assessment'), {
    assessments: t('One methodology version applied to one object.'),
    responses: t('Raw answer, method used, score and matched criterion.'),
    response_options: t('Selected options of multi-choice answers.'),
    response_evidence: t('Photos and documents backing an answer.'),
    node_results: t('Calculated score of every node on completion.'),
  }],
];

function cell(v) {
  if (v == null) return h('span', { class: 'null' }, 'null');
  if (typeof v === 'boolean') return h('span', { class: v ? 'bool-t' : 'bool-f' }, String(v));
  if (typeof v === 'object') return h('code', {}, JSON.stringify(v));
  if (typeof v === 'number') return h('span', { class: 'num' }, String(Math.round(v * 10000) / 10000));
  const s = String(v);
  if (/^\d{4}-\d{2}-\d{2}T/.test(s)) return h('span', { class: 'muted', title: s }, formatDateTime(s));
  return s.length > 80 ? h('span', { title: s }, `${s.slice(0, 80)}…`) : s;
}

// Tables that grow with use (assessments and answers) are read from the server a page at a time.
const PAGE_SIZE = 100;
const offsets = {};

function columnsOfRows(rows) {
  const cols = new Set();
  rows.forEach((r) => Object.keys(r).forEach((k) => cols.add(k)));
  return [...cols];
}

export default function dataView(table = 'questions') {
  if (!db.TABLES.includes(table)) table = 'questions';
  const paged = db.PAGED_TABLES.includes(table);
  const offset = offsets[table] ?? 0;
  const result = paged ? db.page(table, { limit: PAGE_SIZE, offset }) : null;
  const rows = paged ? result?.results ?? null : db.all(table);
  const cols = paged ? columnsOfRows(rows ?? []) : db.columnsOf(table);
  const count = (name) => (db.PAGED_TABLES.includes(name) ? (name === table && result ? result.count : null) : db.all(name).length);
  const go = (to) => () => { offsets[table] = to; rerender(); };
  const pager = result && result.count > PAGE_SIZE && h('div', { class: 'pager' },
    button(t('Previous'), go(Math.max(0, offset - PAGE_SIZE)), { class: 'btn small', disabled: offset === 0 }),
    h('span', { class: 'small muted' }, t('{from}–{to} of {count}', { from: offset + 1, to: Math.min(offset + PAGE_SIZE, result.count), count: result.count })),
    button(t('Next'), go(offset + PAGE_SIZE), { class: 'btn small', disabled: offset + PAGE_SIZE >= result.count }));
  const groups = GROUPS();
  const info = groups.map(([, x]) => x[table]).find(Boolean);

  return h('div', { class: 'page wide' },
    pageHead(t('Data tables'), t('Every table from schema.dbml, as stored in the database. Watch the rows change while you work through the admin and respondent screens.')),
    tip('data', t('What is this page?'),
      h('p', {}, t('A read-only look at the raw database rows behind the screens, with the same table and column names as schema.dbml. Useful to understand where each piece of information is stored. Columns ending in “_id” point to a row in another table.')), h('p', {}, t('Translated texts have one column per language, e.g. name_en, name_ru, name_ky. The column without a suffix shows the current language.'))),
    h('div', { class: 'split data' },
      h('nav', { class: 'tree-panel' },
        groups.map(([group, tables]) => h('div', { class: 'data-group' },
          h('p', { class: 'eyebrow' }, group),
          h('ul', {}, Object.keys(tables).map((name) => h('li', {},
            link(`/data/${name}`, [h('code', {}, name), count(name) != null && h('span', { class: 'count' }, String(count(name)))], { class: `data-link ${name === table ? 'selected' : ''}` }))))))),
      h('div', { class: 'data-main' },
        h('h2', {}, h('code', {}, table)),
        info && h('p', { class: 'intro' }, info),
        pager,
        rows == null ? h('p', { class: 'muted' }, t('Loading…'))
        : rows.length === 0
          ? h('p', { class: 'empty' }, t('No rows yet.'))
          : h('div', { class: 'tbl' }, h('table', { class: 'raw' },
            h('thead', {}, h('tr', {}, cols.map((c) => h('th', {}, c)))),
            h('tbody', {}, rows.map((r) => h('tr', {}, cols.map((c) => h('td', {}, cell(r[c])))))))))));
}
