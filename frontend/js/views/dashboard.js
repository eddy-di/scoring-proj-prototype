// Admin start page: where you are in the setup, what needs attention, and counts.
import * as db from '../store.js';
import { h, link, pageHead, chip, statusChip } from '../dom.js';
import { tip, term, help } from '../help.js';
import { t, languages, translatedFields, defaultLanguage } from '../i18n.js';
import { nodesOf } from '../methodology.js';

const CHOICE = new Set(['single_choice', 'multi_choice']);

function setupSteps() {
  const scalesOk = db.all('rating_scales').some((s) => db.all('scale_levels', (l) => l.scale_id === s.id).length >= 2);
  const catalogsOk = db.all('units').length > 0 && scalesOk && db.all('assessment_methods').length > 0 && db.all('object_types').length > 0;
  const questions = db.all('questions', (q) => q.is_active);
  const optionsOk = questions.filter((q) => CHOICE.has(q.answer_type)).every((q) => db.all('question_options', (o) => o.question_id === q.id).length >= 2);
  const versions = db.all('methodology_versions');
  const treeOk = versions.some((v) => nodesOf(v.id).length > 1);
  const publishedOk = versions.some((v) => v.status === 'published');

  return [
    {
      done: catalogsOk, title: t('Set up the catalogs'), href: '/admin/catalogs',
      text: [t('Units of measure, rating scales with their levels, assessment methods and object types.'), ' ', t('Other screens pick from these lists.'), ' ', term('scale'), ' · ', term('method')],
      status: t('{units} units · {scales} scales · {methods} methods · {types} object types', {
        units: db.all('units').length, scales: db.all('rating_scales').length, methods: db.all('assessment_methods').length, types: db.all('object_types').length,
      }),
    },
    {
      done: questions.length > 0 && optionsOk, title: t('Write the questions'), href: '/admin/questions',
      text: [t('The question library: what is asked and which kind of answer is valid. No scores yet.'), ' ', term('question'), ' · ', term('answer_type')],
      status: t('Active questions: {count}', { count: questions.length }),
    },
    {
      done: treeOk, title: t('Build a methodology'), href: '/admin/methodologies',
      text: [t('Arrange questions into a property tree, set weights, say how each question is assessed and scored.'), ' ', term('tree'), ' · ', term('weight'), ' · ', term('criteria')],
      status: t('Methodologies: {count}', { count: db.all('methodologies').length }),
    },
    {
      done: publishedOk, title: t('Check and publish'), href: '/admin/methodologies',
      text: [t('Fix everything the checklist reports, then publish. Respondents can only use published versions.'), ' ', term('draft')],
      status: t('Published: {published} · drafts: {drafts}', {
        published: versions.filter((v) => v.status === 'published').length, drafts: versions.filter((v) => v.status === 'draft').length,
      }),
    },
  ];
}

// Where to fix texts of each table, and how to name it.
const TABLE_PAGES = () => ({
  units: [t('Units'), '/admin/catalogs/units'],
  object_types: [t('Object types'), '/admin/catalogs/object-types'],
  rating_scales: [t('Rating scales'), '/admin/catalogs/scales'],
  scale_levels: [t('Scale levels'), '/admin/catalogs/scales'],
  assessment_methods: [t('Assessment methods'), '/admin/catalogs/methods'],
  question_categories: [t('Question categories'), '/admin/questions'],
  questions: [t('Questions'), '/admin/questions'],
  question_options: [t('Answer options'), '/admin/questions'],
  methodologies: [t('Methodologies'), '/admin/methodologies'],
  methodology_versions: [t('Version notes'), '/admin/methodologies'],
  methodology_nodes: [t('Tree nodes'), '/admin/methodologies'],
  node_assessment_methods: [t('Assessment instructions'), '/admin/methodologies'],
  scoring_rules: [t('Scoring rules'), '/admin/methodologies'],
  score_criteria: [t('Score criteria'), '/admin/methodologies'],
});

// Texts that exist in the main language but not in every other language.
function missingTranslations() {
  const main = defaultLanguage();
  const others = languages().map((l) => l.code).filter((c) => c !== main);
  const out = [];
  for (const [table, [label, href]] of Object.entries(TABLE_PAGES())) {
    const fields = Object.keys(translatedFields(table));
    let count = 0;
    const missingIn = new Set();
    for (const row of db.all(table)) {
      for (const f of fields) {
        if (!row[`${f}_${main}`]) continue;
        const gaps = others.filter((c) => !row[`${f}_${c}`]);
        if (gaps.length) { count += 1; gaps.forEach((c) => missingIn.add(c.toUpperCase())); }
      }
    }
    if (count) out.push(['info', link(href, label), t('Texts without a translation: {count} (missing: {langs}). The {main} text is shown instead.', { count, langs: [...missingIn].join(', '), main: main.toUpperCase() })]);
  }
  return out;
}

function attention() {
  const items = [];
  for (const v of db.all('methodology_versions', (x) => x.status === 'draft')) {
    const m = db.get('methodologies', v.methodology_id);
    const check = db.validationOf(v.id);
    const label = `${m?.name} v${v.version}`;
    if (!check) items.push(['info', link(`/admin/versions/${v.id}`, label), t('Checking…')]);
    else if (check.errors.length) items.push(['bad', link(`/admin/versions/${v.id}`, label), t('Draft with problems to fix before it can be published: {count}.', { count: check.errors.length })]);
    else items.push(['ok', link(`/admin/versions/${v.id}`, label), t('Draft is ready to publish.')]);
  }
  for (const s of db.all('rating_scales')) {
    if (db.all('scale_levels', (l) => l.scale_id === s.id).length < 2) items.push(['bad', link('/admin/catalogs/scales', s.name), t('Scale has fewer than two levels.')]);
  }
  for (const q of db.all('questions', (x) => x.is_active && CHOICE.has(x.answer_type))) {
    const n = db.all('question_options', (o) => o.question_id === q.id).length;
    if (n < 2) items.push(['bad', link(`/admin/questions/${q.id}`, q.code), t('Choice question with {count} options; it needs at least two.', { count: n })]);
  }
  return [...items, ...missingTranslations()];
}

const tile = (label, value, sub, href) => h('a', { class: 'tile', href: `#${href}` },
  h('span', { class: 'eyebrow' }, label), h('strong', { class: 'tile-num' }, String(value)), sub && h('span', { class: 'small muted' }, sub));

export default function dashboard() {
  const steps = setupSteps();
  const next = steps.find((s) => !s.done);
  const issues = attention();
  // Counted by the server: the dashboard never loads every assessment.
  const summary = db.assessmentSummary();
  const latest = summary?.latest ?? [];
  const versions = db.all('methodology_versions');

  return h('div', { class: 'page' },
    pageHead(t('Admin dashboard'), t('Prepare everything respondents need to assess objects: reference lists, questions and published methodologies.')),

    tip('dash-welcome', t('New here? Start with this page'),
      h('p', {}, t('Setting up an assessment goes in four steps, shown below in the usual order. Each step opens a page that explains what to do. Words with a dotted underline show a short definition when you point at them and open the glossary when you click.')),
      h('p', {}, t('The example data already contains a complete, published methodology. Open it to see how a finished one looks before you build your own.')),
      h('p', {}, t('Texts such as names and questions are entered in every language: English, Russian and Kyrgyz.'), ' ', term('translation')),
      h('p', {}, t('When you know your way around, turn the explanations off with the Helpers switch at the top right. You can turn them on again at any time.'))),

    h('section', { class: 'block' },
      h('h2', {}, t('Setup steps')),
      help(next ? [t('Next step:'), ' ', h('strong', {}, next.title), '.'] : t('All steps are done. You can still go back and change anything; published versions need a new version first.')),
      h('ol', { class: 'setup' }, steps.map((s, i) => h('li', { class: `setup-step ${s.done ? 'done' : ''} ${s === next ? 'next' : ''}` },
        h('span', { class: 'setup-num', 'aria-hidden': 'true' }, s.done ? '✓' : String(i + 1)),
        h('div', {},
          h('h3', {}, link(s.href, s.title), ' ', s.done ? chip(t('done'), 'ok') : s === next ? chip(t('next'), 'info') : null),
          help(s.text),
          h('p', { class: 'small muted' }, s.status)))))),

    h('section', { class: 'block' },
      h('h2', {}, t('Needs attention')),
      issues.length
        ? h('ul', { class: 'attention' }, issues.map(([kind, what, text]) => h('li', { class: kind }, h('strong', {}, what), ' – ', text)))
        : h('p', { class: 'muted' }, t('Nothing needs attention.'))),

    h('div', { class: 'tiles' },
      tile(t('Questions'), db.all('questions').length, t('Not used yet: {count}', { count: db.all('questions', (q) => !db.find('methodology_nodes', (n) => n.question_id === q.id)).length }), '/admin/questions'),
      tile(t('Methodology versions'), versions.length, t('Published: {count}', { count: versions.filter((v) => v.status === 'published').length }), '/admin/methodologies'),
      tile(t('Objects'), db.all('assessment_objects').length, t('Object types: {count}', { count: db.all('object_types').length }), '/admin/catalogs/objects'),
      tile(t('Assessments'), summary?.count ?? '…', summary && t('Completed: {count}', { count: summary.completed }), '/admin/assessments')),

    latest.length > 0 && h('section', { class: 'block' },
      h('h2', {}, t('Latest assessments')),
      h('ul', { class: 'plain-list' }, latest.map((a) => h('li', {},
        link(a.status === 'completed' ? `/respondent/assessments/${a.id}/result` : `/respondent/assessments/${a.id}`, a.title ?? t('Assessment #{id}', { id: a.id })), ' ',
        a.respondent_name && h('span', { class: 'muted' }, `${a.respondent_name} · `),
        statusChip(a.status),
        a.total_score != null && h('span', { class: 'muted' }, ` · ${t('total')} ${a.total_score} ${db.get('scale_levels', a.total_scale_level_id)?.label ?? ''}`))))));
}
