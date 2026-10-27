// Respondent flow (R1–R8): start an assessment, answer the questions, complete, read the result.
import * as db from '../store.js';
import { h, form, pageHead, section, table, chip, statusChip, statusLabel, link, button, asyncButton, confirmButton, navigate, selectEl, num, fmt, rerender, toast, tabs } from '../dom.js';
import * as session from '../session.js';
import { tip, help, stored, term } from '../help.js';
import { answerOf, hasAnswer, levelsOf, scaleOf, aggregations, labelOf } from '../scoring.js';
import { t, formatDate, formatDateTime } from '../i18n.js';
import { childrenOf, rootOf } from '../methodology.js';
import { scoreBadge } from './shared.js';

const R = db.RESPONDENT_TABLES;
const evidenceKinds = () => ({ photo: t('photo'), document: t('document'), measurement_protocol: t('measurement protocol'), link: t('link') });

// UI-only state
const issuesByAssessment = new Map();
const openHelp = new Set();

const versionLabel = (v) => `${db.get('methodologies', v?.methodology_id)?.name ?? '?'} v${v?.version}`;
const questionNodes = (versionId) => db.all('methodology_nodes', (n) => n.version_id === versionId && n.node_type === 'question');
const responseOf = (a, node) => db.find('responses', (x) => x.assessment_id === a.id && x.node_id === node.id);

function progress(a) {
  const nodes = questionNodes(a.methodology_version_id);
  const done = nodes.filter((n) => {
    const r = responseOf(a, n);
    const q = db.get('questions', n.question_id);
    return r && (r.is_not_applicable || (q && hasAnswer(q, answerOf(r))));
  }).length;
  return { done, total: nodes.length };
}

function parseAttributes(text) {
  if (!text) return null;
  const out = {};
  for (const line of text.split('\n')) {
    const [k, ...rest] = line.split('=');
    if (!k.trim() || !rest.length) continue;
    const v = rest.join('=').trim();
    out[k.trim()] = v !== '' && !Number.isNaN(Number(v)) ? Number(v) : v;
  }
  return Object.keys(out).length ? out : null;
}

// ── Home: my assessments ──────────────────────────────────────

// The user's own assessments. Roles that see everyone's get those too, so filter by owner.
const ownAssessments = () => db.all('assessments', (a) => a.respondent_id === session.current().id);

function assessmentRow(a, { withRespondent = false } = {}) {
  const p = progress(a);
  const version = db.get('methodology_versions', a.methodology_version_id);
  return [
    link(a.status === 'completed' ? `/respondent/assessments/${a.id}/result` : `/respondent/assessments/${a.id}`, a.title ?? t('Assessment #{id}', { id: a.id })),
    withRespondent && (a.respondent_name ?? '–'),
    db.get('assessment_objects', a.object_id)?.name ?? '–',
    versionLabel(version),
    formatDate(a.created_at),
    statusChip(a.status),
    `${p.done} / ${p.total}`,
    a.total_score != null ? h('span', {}, h('strong', { class: 'num' }, fmt(a.total_score)), ' ', db.get('scale_levels', a.total_scale_level_id)?.label ?? '') : '–',
    a.status === 'completed' ? link(`/respondent/assessments/${a.id}/result`, t('Result')) : link(`/respondent/assessments/${a.id}`, t('Continue')),
  ].filter((x) => x !== false);
}

export function respondentHome() {
  const all = ownAssessments();
  const open = all.filter((a) => a.status !== 'completed' && a.status !== 'cancelled');
  const done = all.filter((a) => a.status === 'completed');
  const u = session.current();

  return h('div', { class: 'page' },
    pageHead(t('Hello, {name}', { name: u.display_name }), t('Your assessments in one place: continue where you left off, start a new one or look back at earlier results.'),
      button(t('New assessment'), () => navigate('/assessments/new'), { class: 'btn primary' })),

    tip('r-home', t('How an assessment works'),
      h('p', {}, t('1. Click “New assessment” and choose a questionnaire or the object you are assessing. The newest version of the questionnaire is used automatically. 2. Answer every question, following its “How to assess” instructions. 3. Click “Complete assessment” to calculate the result.')),
      h('p', {}, t('You can stop at any time: answers are saved as soon as you enter them. Everything you have filled in stays in your history.'))),

    h('div', { class: 'tiles' },
      h('a', { class: 'tile', href: '#/history' }, h('span', { class: 'eyebrow' }, t('In progress')), h('strong', { class: 'tile-num' }, String(open.length))),
      h('a', { class: 'tile', href: '#/history' }, h('span', { class: 'eyebrow' }, t('Completed')), h('strong', { class: 'tile-num' }, String(done.length))),
      h('a', { class: 'tile', href: '#/assessments/new' }, h('span', { class: 'eyebrow' }, t('Questionnaires available')), h('strong', { class: 'tile-num' }, String(db.questionnaires()?.length ?? '…')))),

    section(t('Continue'), null,
      open.length
        ? table([t('Assessment'), t('Object'), t('Questionnaire'), t('Started'), t('Status'), t('Answered'), t('Total'), ''], open.map((a) => assessmentRow(a)))
        : h('p', { class: 'empty' }, t('Nothing in progress. Start a new assessment.'))),

    done.length > 0 && section(t('Latest results'), null,
      table([t('Assessment'), t('Object'), t('Questionnaire'), t('Started'), t('Status'), t('Answered'), t('Total'), ''], done.slice(0, 5).map((a) => assessmentRow(a))),
      link('/history', t('See your full history'))));
}

// ── Start a new assessment ────────────────────────────────────

const startState = { questionnaire: null, object: null };

async function start(objectId, methodologyId) {
  const obj = db.get('assessment_objects', objectId);
  const a = await db.create('assessments', {
    object_id: objectId, methodology: methodologyId,
    title: `${obj?.name ?? ''}, ${new Date().toISOString().slice(0, 10)}`,
    assessed_at: new Date().toISOString().slice(0, 10),
  }, R);
  toast(t('Assessment started.'));
  navigate(`/respondent/assessments/${a.id}`);
}

function registerObjectForm(id, objectTypeId, onCreated) {
  return form({
    id, submit: t('Register object'),
    fields: [
      !objectTypeId && { name: 'object_type_id', label: t('Type'), type: 'select', numeric: true, required: true, options: db.all('object_types').map((x) => ({ value: x.id, label: x.name })) },
      { name: 'name', label: t('Name'), required: true, hint: t('e.g. Block A, Riverside residential complex') },
      { name: 'external_ref', label: t('Reference'), hint: t('Cadastral number, inventory code…') },
      { name: 'attributes', label: t('Attributes'), type: 'textarea', rows: 2, wide: true, hint: t('One per line, e.g. year_built = 1987') },
    ],
    onSubmit: async (v) => {
      const created = await db.create('assessment_objects', { ...v, object_type_id: v.object_type_id ?? objectTypeId, attributes: parseAttributes(v.attributes) }, ['assessment_objects']);
      toast(t('Registered {name}.', { name: created.name }));
      onCreated?.(created);
    },
  });
}

function questionnaireCard(q) {
  const open = startState.questionnaire === q.methodology;
  const objects = db.all('assessment_objects', (o) => q.object_type == null || o.object_type_id === q.object_type);
  return h('article', { class: `card questionnaire ${open ? 'open' : ''}` },
    h('div', { class: 'card-head' }, h('strong', {}, q.name), ' ', chip(`v${q.version_label}`, 'muted')),
    q.description && h('p', { class: 'small' }, q.description),
    h('p', { class: 'meta' }, t('For: {type}', { type: q.object_type_name ?? t('any object type') }), ' · ', t('Questions: {count}', { count: q.question_count }), ' · ', t('Published {date}', { date: formatDate(q.published_at) })),
    open
      ? h('div', { class: 'picker' },
        h('label', { class: 'field' }, h('span', { class: 'field-label' }, t('Which object are you assessing?')),
          selectEl(objects.map((o) => ({ value: o.id, label: o.name })), startState.object, {
            id: `start-object-${q.methodology}`, placeholder: objects.length ? t('Choose…') : t('No objects of this type yet'),
            onchange: (e) => { startState.object = num(e.target.value); },
          })),
        h('div', { class: 'actions' },
          asyncButton(t('Start assessment'), async () => {
            const objectId = num(document.getElementById(`start-object-${q.methodology}`)?.value);
            if (!objectId) { toast(t('Choose the object first.'), 'bad'); return; }
            await start(objectId, q.methodology);
          }, { class: 'btn primary', id: `start-${q.methodology}` }),
          button(t('Cancel'), () => { startState.questionnaire = null; rerender(); }, { class: 'btn ghost' })),
        h('details', { class: 'ev-add' }, h('summary', {}, t('The object is not in the list? Register it')),
          registerObjectForm(`start-obj-${q.methodology}`, q.object_type, (o) => { startState.object = o.id; rerender(); })))
      : button(t('Choose'), () => { startState.questionnaire = q.methodology; startState.object = null; rerender(); }, { class: 'btn primary', id: `choose-${q.methodology}` }));
}

function byQuestionnaire(list) {
  return [
    help(t('Each questionnaire is the newest published version of a methodology. Choose one, then the object you are assessing.')),
    list.length ? h('div', { class: 'cards' }, list.map(questionnaireCard)) : h('p', { class: 'empty' }, t('No questionnaires are published yet. Ask an admin to publish one.')),
  ];
}

const objectFilter = { search: '' };

function byObject(list) {
  const s = objectFilter.search.toLowerCase();
  const objects = db.all('assessment_objects', (o) => !s || `${o.name} ${o.external_ref ?? ''}`.toLowerCase().includes(s));
  return [
    help(t('Find the object you are assessing. The questionnaires that apply to its type are shown next to it, always in their newest version.')),
    h('label', { class: 'field grow' }, h('span', { class: 'field-label' }, t('Search')),
      h('input', { type: 'search', id: 'obj-search', value: objectFilter.search, placeholder: t('Name or reference'), oninput: (e) => { objectFilter.search = e.target.value; rerender(); } })),
    table([t('Object'), t('Type'), t('Reference'), t('Questionnaires'), t('Your assessments')], objects.map((o) => {
      const available = list.filter((q) => q.object_type == null || q.object_type === o.object_type_id);
      return [
        h('strong', {}, o.name),
        db.get('object_types', o.object_type_id)?.name ?? '–',
        o.external_ref ?? '–',
        available.length
          ? h('div', { class: 'row-actions' }, available.map((q) => asyncButton(t('Start “{name}”', { name: q.name }), () => start(o.id, q.methodology), { class: 'btn small primary' })))
          : h('span', { class: 'muted small' }, t('No questionnaire for this type yet')),
        String(ownAssessments().filter((a) => a.object_id === o.id).length),
      ];
    }), t('No objects found.')),
    h('h3', { class: 'form-title' }, t('Register an object')),
    registerObjectForm('obj', null),
  ];
}

export function startView(tab = 'questionnaire') {
  const list = db.questionnaires();
  return h('div', { class: 'page' },
    h('p', { class: 'crumbs' }, link('/', t('My assessments')), ' / ', t('New assessment')),
    pageHead(t('New assessment'), t('Choose what to assess. Start from a questionnaire or from the object itself.')),
    tabs([['/assessments/new', t('By questionnaire'), list?.length], ['/assessments/new/by-object', t('By object'), db.all('assessment_objects').length]],
      tab === 'object' ? '/assessments/new/by-object' : '/assessments/new'),
    h('section', { class: 'block' }, list == null ? h('p', { class: 'muted' }, t('Loading…')) : (tab === 'object' ? byObject(list) : byQuestionnaire(list))));
}

// ── History ───────────────────────────────────────────────────

const historyFilter = { status: '', methodology: '', respondent: '' };

// scope: 'mine' (everyone's own history) or 'all' (roles that see every assessment).
export function historyView(scope = 'mine') {
  const everyone = scope === 'all';
  const rows = (everyone ? db.all('assessments') : ownAssessments()).filter((a) => {
    const version = db.get('methodology_versions', a.methodology_version_id);
    return (!historyFilter.status || a.status === historyFilter.status)
      && (!historyFilter.methodology || version?.methodology_id === Number(historyFilter.methodology))
      && (!everyone || !historyFilter.respondent || String(a.respondent_id) === historyFilter.respondent);
  });
  const setFilter = (key) => (e) => { historyFilter[key] = e.target.value; rerender(); };
  const respondents = [...new Map(db.all('assessments').filter((a) => a.respondent_id).map((a) => [a.respondent_id, a.respondent_name])).entries()];

  return h('div', { class: 'page wide' },
    pageHead(everyone ? t('All assessments') : t('History'),
      everyone ? t('Every user’s assessments. You can open them read-only; only their respondent can change answers.') : t('Every assessment you have started, newest first. Open one to see your answers and the result.'),
      !everyone && button(t('New assessment'), () => navigate('/assessments/new'), { class: 'btn primary' })),
    h('section', { class: 'block' },
      h('div', { class: 'filters' },
        h('label', { class: 'field' }, h('span', { class: 'field-label' }, t('Status')),
          selectEl(['in_progress', 'completed', 'draft', 'cancelled'].map((x) => ({ value: x, label: statusLabel(x) })), historyFilter.status, { id: 'h-status', placeholder: t('All'), onchange: setFilter('status') })),
        h('label', { class: 'field' }, h('span', { class: 'field-label' }, t('Questionnaire')),
          selectEl(db.all('methodologies').map((m) => ({ value: m.id, label: m.name })), historyFilter.methodology, { id: 'h-meth', placeholder: t('All'), onchange: setFilter('methodology') })),
        everyone && h('label', { class: 'field' }, h('span', { class: 'field-label' }, t('Respondent')),
          selectEl(respondents.map(([id, name]) => ({ value: id, label: name })), historyFilter.respondent, { id: 'h-resp', placeholder: t('All'), onchange: setFilter('respondent') }))),
      table([t('Assessment'), everyone && t('Respondent'), t('Object'), t('Questionnaire'), t('Started'), t('Status'), t('Answered'), t('Total'), ''].filter((x) => x !== false),
        rows.map((a) => assessmentRow(a, { withRespondent: everyone })),
        everyone ? t('No assessments yet.') : t('No assessments yet. Start one with “New assessment”.')),
      stored('assessments')));
}

// ── Questionnaire ─────────────────────────────────────────────

// Typed answers are saved shortly after the last keystroke, and at once when the
// field is left. Timers live here, not in the DOM, because a re-render can replace
// the input while someone is typing.
const timers = new Map();
const lastSent = new Map();

function typed(key, value, send, { now = false } = {}) {
  clearTimeout(timers.get(key));
  timers.delete(key);
  const run = () => {
    if (lastSent.get(key) === value) return;
    lastSent.set(key, value);
    send(value);
  };
  if (now) run();
  else timers.set(key, setTimeout(() => { timers.delete(key); run(); }, 700));
}

// Props for a text-like input that saves as you type.
const typedInput = (key, parse, send) => ({
  oninput: (e) => typed(key, parse(e.target.value), send),
  onchange: (e) => typed(key, parse(e.target.value), send, { now: true }),
});
const orNull = (v) => v || null;

const answerUrl = (a) => `${db.urlOf('assessments', a.id)}answer/`;

// patch uses schema names (option_id …); the API wants option, scale_level, assessment_method.
async function saveAnswer(a, node, patch = {}, optionIds) {
  const body = { node: node.id, ...db.toApi('responses', patch) };
  if (optionIds) body.options = optionIds;
  try {
    return await db.action(answerUrl(a), body, R);
  } catch (err) {
    toast(err.message, 'bad');
    return null;
  }
}

export function fillView(id) {
  const a = db.get('assessments', id);
  if (!a) return h('div', { class: 'page' }, h('p', {}, t('Assessment not found.'), ' '), link('/respondent', t('Back to assessments')));
  const version = db.get('methodology_versions', a.methodology_version_id);
  const obj = db.get('assessment_objects', a.object_id);
  const root = rootOf(version.id);
  const done = a.status === 'completed';
  // Roles that see everyone's assessments open other people's read-only.
  const own = a.respondent_id === session.current().id;
  const locked = done || !own;
  const back = own ? ['/history', t('History')] : ['/admin/assessments', t('All assessments')];
  const evaluation = db.evaluationOf(a.id);
  const p = progress(a);
  const issues = issuesByAssessment.get(a.id) ?? [];
  const url = db.urlOf('assessments', a.id);

  const complete = async () => {
    try {
      await db.action(`${url}complete/`, {}, R);
      issuesByAssessment.delete(a.id);
      toast(t('Assessment completed.'));
      navigate(`/respondent/assessments/${a.id}/result`);
    } catch (err) {
      if (!err.body?.issues) throw err;
      issuesByAssessment.set(a.id, err.body.issues);
      rerender();
    }
  };

  return h('div', { class: 'page' },
    h('p', { class: 'crumbs' }, link(...back), ' / ', a.title ?? `#${a.id}`),
    pageHead(a.title ?? t('Assessment #{id}', { id: a.id }), `${obj?.name} · ${versionLabel(version)}`,
      statusChip(a.status),
      done && button(t('View result'), () => navigate(`/respondent/assessments/${a.id}/result`), { class: 'btn primary' }),
      done && own && asyncButton(t('Reopen'), async () => { issuesByAssessment.delete(a.id); await db.action(`${url}reopen/`, {}, R); toast(t('Reopened: you can change answers again.')); })),

    !own && h('p', { class: 'banner' }, t('This is {name}’s assessment. You can read it, but only they can change the answers.', { name: a.respondent_name ?? '?' })),

    !locked && tip('r-fill', t('Answering'),
      h('p', {}, t('Open “How to assess” on each question for the instructions. Each answer is saved and scored shortly after you enter it.')),
      h('p', {}, t('Tick “Not applicable” when a question doesn’t apply to this object: it is left out and the other weights are rescaled.'))),

    h('div', { class: 'summary' },
      h('div', {}, h('span', { class: 'eyebrow' }, t('Answered')), h('strong', { class: 'big num' }, `${p.done} / ${p.total}`)),
      h('div', {}, h('span', { class: 'eyebrow' }, done ? t('Total score') : t('Provisional total')),
        h('strong', { class: 'big num' }, fmt(done ? a.total_score : evaluation?.total)),
        h('span', { class: 'muted' }, ' ', (done ? db.get('scale_levels', a.total_scale_level_id)?.label : evaluation?.level?.label) ?? '')),
      evaluation?.is_vetoed && h('div', { class: 'bad-text' }, h('strong', {}, t('Knock-out:')), ' ', t('a critical question is below its threshold.')),
      help(done
        ? t('Completed. Answers are locked; reopen the assessment to change them.')
        : t('The total is provisional: unanswered questions are left out and the remaining weights rescaled until you complete the assessment.'))),

    h('fieldset', { class: 'plain', disabled: locked },
      root && childrenOf(version.id, root.id).map((n) => renderNode(a, n, evaluation, 0))),

    !locked && h('div', { class: 'complete-bar' },
      issues.length > 0 && h('div', { class: 'check bad' }, h('strong', {}, t('The assessment can’t be completed yet:')), h('ul', {}, issues.map((x) => h('li', {}, x)))),
      help(t('Completing checks the mandatory questions, then calculates every group and saves the total.')),
      asyncButton(t('Complete assessment'), complete, { class: 'btn primary big', id: `complete-${a.id}` })));
}

function renderNode(a, node, evaluation, depth) {
  if (node.node_type === 'question') return questionCard(a, node);
  const res = evaluation?.nodes[node.id];
  return h('section', { class: `qgroup depth-${depth}` },
    h('header', { class: 'qgroup-head' },
      h('div', {},
        h('h2', {}, node.name),
        h('p', { class: 'small muted' }, `${t('Weight')} ${fmt(node.weight, 3)} · ${labelOf(aggregations(), node.aggregation_type)}`)),
      h('div', { class: 'qgroup-score' },
        h('strong', { class: 'num' }, fmt(res?.score)),
        res?.is_vetoed && chip(t('knock-out'), 'bad'))),
    node.description && h('p', { class: 'small' }, node.description),
    childrenOf(node.version_id, node.id).map((c) => renderNode(a, c, evaluation, depth + 1)));
}

function questionCard(a, node) {
  const q = db.get('questions', node.question_id);
  if (!q) return null;
  const r = responseOf(a, node);
  const ans = answerOf(r);
  const methods = db.all('node_assessment_methods', (m) => m.node_id === node.id).sort((x, y) => y.is_primary - x.is_primary);
  const evidence = r ? db.all('response_evidence', (e) => e.response_id === r.id) : [];
  const shown = { score: r?.score ?? null, criterion_id: r?.matched_criterion_id ?? null, note: !r || !hasAnswer(q, ans) ? (r?.is_not_applicable ? t('Not applicable: left out.') : t('Not answered yet.')) : null };
  const save = (patch, optionIds) => saveAnswer(a, node, patch, optionIds);
  const pid = `a-${node.id}`;
  const na = !!r?.is_not_applicable;
  const methodName = (m) => db.get('assessment_methods', m.assessment_method_id)?.name ?? '?';

  return h('article', { class: `qcard ${na ? 'na' : ''}` },
    h('div', { class: 'qcard-head' },
      h('div', {},
        h('p', { class: 'eyebrow' }, node.code, ' · ', node.is_mandatory ? t('required') : t('optional'), ` · ${t('weight')} ${fmt(node.weight, 3)}`),
        h('h3', {}, q.text)),
      scoreBadge(node, shown)),
    q.description && h('p', { class: 'small' }, q.description),

    methods.length > 0 && h('details', {
      class: 'howto', open: openHelp.has(node.id),
      ontoggle: (e) => (e.currentTarget.open ? openHelp.add(node.id) : openHelp.delete(node.id)),
    },
    h('summary', {}, t('How to assess:'), ' ', methods.map(methodName).join(' / ')),
    methods.map((m) => h('div', { class: 'howto-item' },
      h('strong', {}, methodName(m)), m.is_primary && ` (${t('primary')})`,
      m.instructions && h('p', {}, m.instructions),
      m.required_evidence && h('p', { class: 'small' }, h('strong', {}, t('Evidence:')), ' ', m.required_evidence)))),

    h('div', { class: 'answer' }, answerControl(q, ans, pid, save, na, a.id)),

    h('div', { class: 'qmeta' },
      h('label', { class: 'check-inline' },
        h('input', { type: 'checkbox', id: `${pid}-na`, checked: na, onchange: (e) => save({ is_not_applicable: e.target.checked }) }),
        ' ', t('Not applicable')),
      methods.length > 0 && h('label', { class: 'inline' }, t('Method used'), ' ',
        selectEl(methods.map((m) => ({ value: m.assessment_method_id, label: methodName(m) })),
          r?.assessment_method_id ?? methods[0].assessment_method_id,
          { id: `${pid}-method`, onchange: (e) => save({ assessment_method_id: num(e.target.value) }) })),
      h('label', { class: 'inline grow' }, t('Comment'), ' ',
        h('input', { type: 'text', id: `${pid}-comment`, value: r?.comment ?? '', ...typedInput(`${a.id}-${pid}-comment`, orNull, (v) => save({ comment: v })) }))),

    h('div', { class: 'evidence' },
      evidence.map((e) => h('div', { class: 'ev' },
        chip(evidenceKinds()[e.kind] ?? e.kind, 'muted'), ' ', h('span', { class: 'ev-uri' }, e.uri), e.description && h('span', { class: 'muted' }, ` · ${e.description}`),
        confirmButton(t('Remove'), t('Click again'), () => db.remove('response_evidence', e.id, R), { class: 'btn small ghost' }))),
      h('details', { class: 'ev-add' },
        h('summary', {}, t('Attach evidence ({count})', { count: evidence.length })),
        form({
          id: `${pid}-ev`, submit: t('Attach'),
          fields: [
            { name: 'kind', label: t('Kind'), type: 'select', required: true, value: 'photo', options: Object.entries(evidenceKinds()).map(([value, label]) => ({ value, label })) },
            { name: 'uri', label: t('File name or link'), required: true, hint: t('No real upload in this prototype') },
            { name: 'description', label: t('Description') },
          ],
          onSubmit: async (v) => {
            const responseId = r?.id ?? (await saveAnswer(a, node))?.id;
            if (responseId) await db.create('response_evidence', { ...v, response_id: responseId }, R);
          },
        }))));
}

function answerControl(q, ans, pid, save, na, assessmentId) {
  const key = `${assessmentId}-${pid}`;
  const opts = db.all('question_options', (o) => o.question_id === q.id).sort((x, y) => x.sort_order - y.sort_order);
  const radio = (name, id, checked, label, onchange) =>
    h('label', { class: 'choice' }, h('input', { type: 'radio', name, id, checked, disabled: na, onchange }), ' ', label);

  switch (q.answer_type) {
    case 'numeric':
      return h('div', { class: 'num-in' },
        h('input', {
          type: 'number', step: 'any', id: `${pid}-num`, disabled: na,
          value: ans.numeric_value ?? '', ...typedInput(`${key}-num`, num, (v) => save({ numeric_value: v })),
        }),
        h('span', { class: 'unit' }, db.get('units', q.unit_id)?.code ?? ''));
    case 'boolean':
      return h('div', { class: 'choices' },
        radio(`${pid}-b`, `${pid}-yes`, ans.boolean_value === true, t('Yes'), () => save({ boolean_value: true })),
        radio(`${pid}-b`, `${pid}-no`, ans.boolean_value === false, t('No'), () => save({ boolean_value: false })));
    case 'single_choice':
      return h('div', { class: 'choices' }, opts.map((o) =>
        radio(`${pid}-o`, `${pid}-o${o.id}`, ans.option_id === o.id, o.label, () => save({ option_id: o.id }))));
    case 'multi_choice':
      return h('div', { class: 'choices' }, opts.map((o) => h('label', { class: 'choice' },
        h('input', {
          type: 'checkbox', id: `${pid}-m${o.id}`, value: String(o.id), disabled: na, checked: ans.option_ids.includes(o.id),
          onchange: (e) => save({}, [...e.target.closest('.choices').querySelectorAll('input:checked')].map((i) => Number(i.value))),
        }), ' ', o.label)));
    case 'scale_level':
      return h('div', { class: 'choices' }, levelsOf(db.get('rating_scales', q.default_scale_id)).map((l) =>
        radio(`${pid}-s`, `${pid}-s${l.id}`, ans.scale_level_id === l.id, `${l.value} · ${l.label}`, () => save({ scale_level_id: l.id }))));
    case 'text':
      return h('textarea', { id: `${pid}-text`, rows: 3, disabled: na, value: ans.text_value ?? '', ...typedInput(`${key}-text`, orNull, (v) => save({ text_value: v })) });
    default:
      return h('p', {}, t('Unsupported answer type.'));
  }
}

// ── Result ────────────────────────────────────────────────────

function answerText(q, r) {
  if (!r) return t('Not answered');
  if (r.is_not_applicable) return t('Not applicable');
  const a = answerOf(r);
  switch (q.answer_type) {
    case 'numeric': return a.numeric_value == null ? '–' : `${a.numeric_value} ${db.get('units', q.unit_id)?.code ?? ''}`;
    case 'boolean': return a.boolean_value == null ? '–' : (a.boolean_value ? t('Yes') : t('No'));
    case 'single_choice': return db.get('question_options', a.option_id)?.label ?? '–';
    case 'multi_choice': return a.option_ids.map((id) => db.get('question_options', id)?.label).join(', ') || '–';
    case 'scale_level': return db.get('scale_levels', a.scale_level_id)?.label ?? '–';
    default: return a.text_value ?? '–';
  }
}

export function resultView(id) {
  const a = db.get('assessments', id);
  if (!a) return h('div', { class: 'page' }, h('p', {}, t('Assessment not found.'), ' '), link('/respondent', t('Back to assessments')));
  const version = db.get('methodology_versions', a.methodology_version_id);
  const obj = db.get('assessment_objects', a.object_id);
  const root = rootOf(version.id);

  if (a.status !== 'completed') {
    return h('div', { class: 'page' },
      pageHead(t('Result not ready'), t('Results are calculated when the assessment is completed.')),
      link(`/respondent/assessments/${a.id}`, t('Back to the questionnaire')));
  }

  const stored_ = new Map(db.all('node_results', (r) => r.assessment_id === a.id).map((r) => [r.node_id, r]));
  const rows = [];
  const walk = (node, depth) => {
    const res = stored_.get(node.id);
    const isQ = node.node_type === 'question';
    const q = isQ ? db.get('questions', node.question_id) : null;
    const resp = isQ ? responseOf(a, node) : null;
    const crit = db.get('score_criteria', resp?.matched_criterion_id);
    const evidenceCount = resp ? db.all('response_evidence', (e) => e.response_id === resp.id).length : 0;
    const belowVeto = res?.score != null && node.veto_threshold != null && res.score < node.veto_threshold;
    rows.push([
      h('span', { class: `indent d${depth} ${isQ ? '' : 'grp'}` }, node.name),
      node.parent_id == null ? '–' : h('span', { class: 'num' }, fmt(node.weight, 3)),
      h('strong', { class: 'num' }, fmt(res?.score)),
      node.parent_id == null ? '–' : h('span', { class: 'num' }, fmt(res?.weighted_score)),
      db.get('scale_levels', res?.scale_level_id)?.label ?? '–',
      [res?.is_vetoed && chip(t('knock-out'), 'bad'), belowVeto && chip(t('below {threshold}', { threshold: node.veto_threshold }), 'bad')],
      isQ
        ? h('span', { class: 'small' },
          h('strong', {}, answerText(q, resp)),
          crit && ` → ${crit.label ?? ''}${crit.description ? `: ${crit.description}` : ''}`,
          resp?.assessment_method_id && h('span', { class: 'muted' }, ` · ${db.get('assessment_methods', resp.assessment_method_id)?.name}`),
          evidenceCount > 0 && h('span', { class: 'muted' }, ` · ${t('evidence: {count}', { count: evidenceCount })}`))
        : h('span', { class: 'small muted' }, labelOf(aggregations(), node.aggregation_type)),
    ]);
    if (!isQ) childrenOf(version.id, node.id).forEach((c) => walk(c, depth + 1));
  };
  walk(root, 0);

  const rootRes = stored_.get(root.id);
  const level = db.get('scale_levels', a.total_scale_level_id);
  const scale = scaleOf(root);

  return h('div', { class: 'page' },
    h('p', { class: 'crumbs' }, link(...(a.respondent_id === session.current().id ? ['/history', t('History')] : ['/admin/assessments', t('All assessments')])), ' / ', link(`/respondent/assessments/${a.id}`, a.title ?? `#${a.id}`), ' / ', t('Result')),
    pageHead(t('Result'), [`${obj?.name} · ${versionLabel(version)} · ${t('completed')} ${formatDateTime(a.completed_at)}`,
      a.respondent_id !== session.current().id && ` · ${t('Respondent')}: ${a.respondent_name ?? '–'}`]),

    h('div', { class: `result-hero ${rootRes?.is_vetoed ? 'failed' : ''}` },
      h('div', {},
        h('span', { class: 'eyebrow' }, t('Integral quality')),
        h('div', { class: 'hero-score num' }, fmt(a.total_score)),
        h('span', { class: 'muted' }, `${scale?.name ?? ''} (${scale?.min_value}–${scale?.max_value})`)),
      h('div', {},
        h('span', { class: 'eyebrow' }, t('Level')),
        h('div', { class: 'hero-level' }, level?.label ?? '–'),
        level?.description && h('span', { class: 'muted' }, level.description)),
      rootRes?.is_vetoed && h('div', { class: 'hero-fail' }, h('strong', {}, t('Failed on a knock-out criterion.')), ' ', t('At least one critical question scored below its threshold, so the object fails regardless of the total.'))),

    tip('r-result', t('Reading the result'),
      h('p', {}, t('Each row is a node of the tree. “Weighted” is the node’s contribution to its parent (score × weight). The last column shows the answer and the criterion that explains the score.'), ' ', term('criteria'))),

    section(t('Breakdown'), null,
      table([t('Node'), t('Weight'), t('Score'), t('Weighted'), t('Level'), '', t('Answer and reason')], rows),
      stored('node_results')));
}
