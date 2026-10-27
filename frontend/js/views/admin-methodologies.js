// Methodologies (admin steps A8–A14): list, version editor with the property tree,
// node editor (settings, question, how to assess, scoring), checklist and publishing.
import * as db from '../store.js';
import { h, form, pageHead, section, table, chip, statusChip, link, button, asyncButton, confirmButton, navigate, selectEl, num, fmt, rerender, toast } from '../dom.js';
import { tip, help, example, stored, term, steps } from '../help.js';
import { helpOn } from '../prefs.js';
import * as session from '../session.js';
import { t, formatDate, languages } from '../i18n.js';
import { normalizations, aggregations, answerTypes, labelOf, scaleOf, levelsOf, criteriaOf, describeCondition, describeRule, tryRule } from '../scoring.js';
import {
  childrenOf, rootOf, ruleOf, nodesOf, pathOf, problemsOf, createMethodology, addNode, deleteNode, setNodeQuestion,
  publishVersion, archiveVersion, newVersionFrom, equalizeWeights, scaleWeightsToOne,
} from '../methodology.js';
import { scoreBadge } from './shared.js';

const weighting = () => ({
  equal: [t('Equal'), t('All siblings weigh the same.')],
  direct_expert: [t('Direct expert'), t('Experts assigned each weight directly. The usual choice.')],
  ranking: [t('Ranking'), t('Weights were derived from a ranking of importance.')],
  pairwise_ahp: [t('Pairwise comparison (AHP)'), t('Weights come from pairwise comparisons (Analytic Hierarchy Process).')],
  custom: [t('Custom'), t('Another method; describe it in the notes.')],
});
const statusText = () => ({
  draft: t('Draft: you can change everything. Respondents can’t use it yet.'),
  published: t('Published: locked so past scores stay reproducible. Respondents can start assessments with it.'),
  archived: t('Archived: no longer offered for new assessments. Existing assessments still point to it.'),
});
const statusShort = () => ({
  draft: t('You can change everything. Respondents can’t use it yet.'),
  published: t('Locked. Respondents can start assessments with it.'),
  archived: t('No longer offered for new assessments.'),
});
const scaleOpts = () => db.all('rating_scales').map((s) => ({ value: s.id, label: `${s.name} (${s.min_value ?? '?'}–${s.max_value ?? '?'})` }));
const nodeHref = (node) => `/admin/versions/${node.version_id}/node/${node.id}`;

// ── Methodology list ──────────────────────────────────────────

let editingMethodology = null;

export function methodologyList() {
  const edit = db.get('methodologies', editingMethodology);
  return h('div', { class: 'page' },
    pageHead(t('Methodologies'), t('Steps 3 and 4 of the setup. A methodology arranges library questions into a weighted tree and says how each one is assessed and scored.')),

    tip('m-list', t('Methodologies and versions'),
      h('p', {}, t('All the content of a methodology – its tree, weights, rules and criteria – lives in a version. You work in a draft and publish it when the checklist is empty. A published version is locked, so assessments made with it can always be explained.'), ' ', term('version')),
      h('p', {}, t('To change a published methodology, open it and click “Create new version”. You get an editable copy, e.g. v1.1, and the old version keeps working until you archive it.'))),

    db.all('methodologies').map((m) => {
      const versions = db.all('methodology_versions', (v) => v.methodology_id === m.id);
      const onlyDrafts = versions.every((v) => v.status === 'draft');
      return h('section', { class: 'block' },
        h('div', { class: 'block-head' },
          h('div', {},
            h('h2', {}, m.name, ' ', h('code', { class: 'h-code' }, m.code)),
            h('p', { class: 'meta' }, t('For: {type}', { type: db.get('object_types', m.object_type_id)?.name ?? t('any object type') }))),
          h('span', { class: 'row-actions' },
            button(t('Edit details'), () => { editingMethodology = m.id; rerender(); document.getElementById(`meth-${m.id}`)?.scrollIntoView({ block: 'center' }); }, { class: 'btn small ghost' }),
            onlyDrafts && confirmButton(t('Delete'), t('Click again to delete it with its drafts'), async () => { await db.remove('methodologies', m.id); toast(t('Deleted: {name}.', { name: m.name })); }))),
        m.description && h('p', { class: 'intro' }, m.description),
        table([t('Version'), t('Status'), t('What this means'), t('Nodes'), t('Published'), ''],
          versions.map((v) => [
            h('strong', {}, v.version), statusChip(v.status),
            h('span', { class: 'small' }, statusShort()[v.status]),
            String(nodesOf(v.id).length),
            formatDate(v.published_at),
            link(`/admin/versions/${v.id}`, v.status === 'draft' ? t('Edit') : t('Open'), { class: 'btn small' }),
          ])));
    }),

    db.all('methodologies').length === 0 && h('p', { class: 'empty' }, t('No methodologies yet. Create the first one below.')),

    section(edit ? t('Edit {name}', { name: edit.name }) : t('New methodology'),
      edit ? t('Name, description and object type of the methodology. Its versions are edited on their own pages.') : t('Creates version 1.0 as a draft with an empty root group. You build the tree on the next page.'),
      form({
        id: edit ? `meth-${edit.id}` : 'meth-new', submit: edit ? t('Save') : t('Create methodology'), layout: 'stacked',
        cancel: edit ? () => { editingMethodology = null; rerender(); } : null,
        fields: [
          { name: 'name', label: t('Name'), required: true, translated: true, row: edit, wide: true, help: t('Respondents see this name when they start an assessment.') },
          { name: 'code', label: t('Code'), required: true, value: edit?.code, hint: t('e.g. TECH_RES'), help: t('Short and unique. Used in exports and the API.') },
          { name: 'object_type_id', label: t('Object type'), type: 'select', numeric: true, required: true, value: edit?.object_type_id, options: db.all('object_types').map((x) => ({ value: x.id, label: x.name })), help: t('Only objects of this type can be assessed with the methodology.') },
          !edit && { name: 'result_scale_id', label: t('Result scale'), type: 'select', numeric: true, required: true, options: scaleOpts(), help: t('The scale of the final score. Nodes use it too unless you give them their own.') },
          { name: 'description', label: t('Description'), type: 'textarea', translated: true, row: edit, wide: true, help: t('What the methodology assesses and when to use it.') },
        ],
        onSubmit: async (v) => {
          if (edit) {
            await db.update('methodologies', edit.id, v);
            editingMethodology = null;
            toast(t('Saved: {name}.', { name: edit.code }));
            rerender();
            return;
          }
          const { result_scale_id: resultScale, ...rest } = v;
          const version = await createMethodology({ ...rest, result_scale: resultScale });
          toast(t('Created {code} with draft version 1.0.', { code: v.code }));
          navigate(`/admin/versions/${version.id}`);
        },
      })));
}

// ── Version editor ────────────────────────────────────────────

function lifecycle(status) {
  const stages = [['draft', t('Draft'), t('Edit and fix the checklist')], ['published', t('Published'), t('Locked, used for assessments')], ['archived', t('Archived'), t('Retired')]];
  const at = stages.findIndex(([s]) => s === status);
  return h('ol', { class: 'lifecycle', 'aria-label': t('Version status') }, stages.map(([, label, text], i) => h('li', { class: `${i < at ? 'past' : ''} ${i === at ? 'now' : ''}` },
    h('strong', {}, label), helpOn() && h('span', { class: 'small' }, text))));
}

function nodeByMessage(versionId, message) {
  const code = message.split(':')[0];
  return nodesOf(versionId).find((n) => n.code === code) ?? null;
}

function checklist(version, validation) {
  if (!validation) return h('div', { class: 'check info' }, t('Checking the version…'));
  const item = (m) => {
    const node = nodeByMessage(version.id, m);
    return h('li', {}, node ? [link(nodeHref(node), node.code), m.slice(node.code.length)] : m);
  };
  const { errors, warnings } = validation;
  return h('div', { class: `check ${errors.length ? 'bad' : 'ok'}`, id: 'checklist' },
    h('strong', {}, errors.length ? t('Problems to fix before publishing: {count}', { count: errors.length }) : t('Ready to publish: no problems found.')),
    help(t('This checklist is re-checked by the server after every change. Click a code to open that node.')),
    errors.length > 0 && h('ul', {}, errors.map(item)),
    warnings.length > 0 && h('div', {}, h('p', { class: 'small' }, h('strong', {}, t('Warnings')), ' ', t('(publishing is still allowed):')), h('ul', {}, warnings.map(item))));
}

export function versionView(versionId, selectedId) {
  const version = db.get('methodology_versions', versionId);
  if (!version) return h('div', { class: 'page' }, h('p', {}, t('Version not found.'), ' '), link('/admin/methodologies', t('Back to methodologies')));
  const meth = db.get('methodologies', version.methodology_id);
  const draft = version.status === 'draft';
  const root = rootOf(versionId);
  const picked = db.get('methodology_nodes', selectedId);
  const selected = picked?.version_id === versionId ? picked : root;
  const validation = draft ? db.validationOf(versionId) : null;
  const w = weighting();

  const publish = async () => {
    try {
      await publishVersion(versionId);
      toast(t('Published v{version}. Respondents can now use it.', { version: version.version }));
    } catch (err) {
      await db.load();
      toast(err.status === 400 ? t('Not published: fix the problems in the checklist first.') : err.message, 'bad');
    }
  };
  const copy = async () => {
    const id = await newVersionFrom(versionId);
    toast(t('Created a new draft version. Edit it here.'));
    navigate(`/admin/versions/${id}`);
  };

  // Buttons follow the role's permissions; the API checks them too.
  const actions = draft
    ? [session.can('methodologies.publish_methodologyversion') && asyncButton(t('Publish'), publish, { class: 'btn primary', disabled: !validation?.can_publish, title: validation?.can_publish ? t('Lock this version and make it available') : t('Fix the checklist first') })]
    : [
      session.can('methodologies.add_methodologyversion') && asyncButton(t('Create new version'), copy, { class: 'btn primary' }),
      version.status === 'published' && session.can('methodologies.archive_methodologyversion') && confirmButton(t('Archive'), t('Click again to archive'), async () => { await archiveVersion(versionId); toast(t('Archived.')); }, { class: 'btn' }),
    ];

  return h('div', { class: 'page wide' },
    h('p', { class: 'crumbs' }, link('/admin/methodologies', t('Methodologies')), ' / ', meth.name),
    pageHead(h('span', {}, meth.name, ' ', h('span', { class: 'h-version' }, `v${version.version}`), ' ', statusChip(version.status)), null, ...actions),
    lifecycle(version.status),

    draft
      ? tip('v-draft', t('How to finish a draft'),
        steps(
          [t('Build the tree on the left: add groups, then questions inside them.'), ' ', term('tree')],
          [t('Click each node and fill in its settings. Siblings’ weights must add up to 1.'), ' ', term('weight')],
          [t('For every question node: link a library question, add an assessment method and define the scoring rule.'), ' ', term('method'), ' · ', term('rule')],
          t('Use “Try the rule” to check that answers get the scores you expect.'),
          t('Names and texts are entered in every language. Missing required translations appear in the forms.'),
          t('When the checklist below is green, click Publish.')))
      : h('p', { class: 'banner' }, statusText()[version.status], ' ', t('To make changes, click “Create new version”.')),

    draft && checklist(version, validation),

    h('details', { class: 'block settings' },
      h('summary', {}, h('h2', {}, t('Version settings')), h('span', { class: 'small muted' }, ` ${t('Result scale')}: ${db.get('rating_scales', version.result_scale_id)?.name ?? '–'} · ${t('Weights')}: ${w[version.weighting_method]?.[0] ?? version.weighting_method}`)),
      h('fieldset', { class: 'plain', disabled: !draft },
        form({
          id: `ver-${version.id}`, submit: t('Save settings'),
          fields: [
            { name: 'weighting_method', label: t('How the weights were set'), type: 'select', required: true, value: version.weighting_method, options: Object.entries(w).map(([value, [label]]) => ({ value, label })), explain: Object.fromEntries(Object.entries(w).map(([k, [, d]]) => [k, d])), help: t('For documentation only. It doesn’t change any calculation.') },
            { name: 'result_scale_id', label: t('Result scale'), type: 'select', numeric: true, required: true, value: version.result_scale_id, options: scaleOpts(), help: t('The scale of the final score. Changing it also changes linear rules that use the default scale.') },
            { name: 'notes', label: t('Notes'), type: 'textarea', translated: true, row: version, wide: true, help: t('E.g. who agreed the weights and when.') },
          ],
          onSubmit: async (v) => { await db.update('methodology_versions', version.id, v); toast(t('Settings saved.')); },
        }))),

    h('div', { class: 'split' },
      h('aside', { class: 'tree-panel' },
        h('h2', {}, t('Property tree')),
        help(t('Groups (G) combine the scores of what is inside them; questions (Q) are scored from answers. Click a node to edit it.')),
        root ? h('ul', { class: 'tree' }, treeItem(root, selected, draft, validation)) : h('p', {}, t('No root node.')),
        h('p', { class: 'legend small muted' }, h('span', { class: 'kind group' }, 'G'), ` ${t('group')} `, h('span', { class: 'kind question' }, 'Q'), ` ${t('question')} `, h('span', { class: 'dot bad' }), ` ${t('has problems')}`)),
      selected && nodeEditor(version, selected, draft, validation)));
}

function treeItem(node, selected, draft, validation) {
  const kids = childrenOf(node.version_id, node.id);
  const isGroup = node.node_type === 'group';
  const sum = kids.reduce((s, k) => s + (k.weight ?? 0), 0);
  const off = kids.length > 0 && Math.abs(sum - 1) > 0.001;
  const problems = problemsOf(validation, node).errors.length;
  const add = (type) => async () => {
    const created = await addNode(node.version_id, node.id, type);
    toast(type === 'group' ? t('Added a group. Give it a name.') : t('Added a question node. Link a question to it.'));
    navigate(nodeHref(created));
  };

  return h('li', {},
    h('a', { class: `tree-row ${selected?.id === node.id ? 'selected' : ''}`, href: `#${nodeHref(node)}` },
      h('span', { class: `kind ${node.node_type}`, title: isGroup ? t('Group') : t('Question') }, isGroup ? 'G' : 'Q'),
      h('span', { class: 'tree-name' }, node.name),
      node.parent_id != null && h('span', { class: 'tree-w', title: t('Weight') }, fmt(node.weight, 3)),
      node.veto_threshold != null && chip(`${t('veto')} < ${node.veto_threshold}`, 'warn'),
      problems > 0 && h('span', { class: 'dot bad', title: t('Problems: {count}', { count: problems }) })),
    isGroup && h('ul', {},
      kids.map((k) => treeItem(k, selected, draft, validation)),
      kids.length > 0 && h('li', { class: `tree-sum ${off ? 'bad-text' : 'muted'}` },
        t('weights add up to {sum}', { sum: fmt(sum, 3) }), off && ` ${t('(should be 1)')}`,
        off && draft && h('span', { class: 'row-actions' },
          asyncButton(t('Make equal'), () => equalizeWeights(node), { class: 'btn small ghost', title: t('Give every child the same weight') }),
          asyncButton(t('Scale to 1'), () => scaleWeightsToOne(node), { class: 'btn small ghost', title: t('Keep the proportions, make the sum 1') }))),
      draft && h('li', { class: 'tree-add' },
        asyncButton(t('+ group'), add('group'), { class: 'btn small ghost', title: t('Add a sub-group inside {name}', { name: node.name }) }),
        asyncButton(t('+ question'), add('question'), { class: 'btn small ghost', title: t('Add a question inside {name}', { name: node.name }) }))));
}

function block(title, intro, ...body) {
  return h('div', { class: 'eblock' }, h('h3', {}, title), intro && helpOn() && h('p', { class: 'small muted' }, intro), body);
}

function nodeEditor(version, node, draft, validation) {
  const isRoot = node.parent_id == null;
  const isGroup = node.node_type === 'group';
  const q = db.get('questions', node.question_id);
  const scale = scaleOf(node);
  const siblings = isRoot ? [] : childrenOf(version.id, node.parent_id);
  const siblingSum = siblings.reduce((s, k) => s + k.weight, 0);
  const { errors, warnings } = problemsOf(validation, node);
  const agg = aggregations();

  const nodeFields = [
    { name: 'name', label: t('Name'), required: true, translated: true, row: node, wide: true, help: isGroup ? t('What this group measures, e.g. “Structural condition”.') : t('Usually a short version of the question.') },
    { name: 'code', label: t('Code'), required: true, value: node.code, help: t('Unique in this version. Shown in the checklist and results.') },
    !isRoot && {
      name: 'weight', label: t('Weight'), type: 'number', required: true, value: node.weight,
      hint: Math.abs(siblingSum - 1) > 0.001 ? t('Siblings add up to {sum} – should be 1.', { sum: fmt(siblingSum, 3) }) : t('Siblings add up to {sum}.', { sum: fmt(siblingSum, 3) }),
      help: t('Share of the parent’s score. Siblings: {list}.', { list: siblings.map((s) => `${s.code} ${fmt(s.weight, 3)}`).join(', ') }),
    },
    { name: 'sort_order', label: t('Position'), type: 'number', value: node.sort_order, help: t('Lower numbers are shown first.') },
    isGroup && { name: 'aggregation_type', label: t('Combine children with'), type: 'select', required: true, value: node.aggregation_type, options: Object.entries(agg).map(([value, a]) => ({ value, label: a.label })), explain: Object.fromEntries(Object.entries(agg).map(([k, a]) => [k, a.description])) },
    isGroup && { name: 'aggregation_formula', label: t('Formula'), type: 'textarea', value: node.aggregation_formula, wide: true, showIf: (v) => v.aggregation_type === 'custom_formula', help: t('Python expression. s = child scores, w = weights that add up to 1. Example: min(s) * 0.5 + sum(a * b for a, b in zip(s, w)) * 0.5') },
    !isGroup && { name: 'is_mandatory', label: t('Mandatory: must be answered before the assessment can be completed'), type: 'checkbox', value: node.is_mandatory },
    !isRoot && { name: 'veto_threshold', label: t('Knock-out threshold'), type: 'number', value: node.veto_threshold, hint: t('Leave empty for none.'), help: t('If this node scores below the threshold, the parent and the whole object fail, whatever the total. Use it for critical requirements, e.g. 2 for a fire alarm.') },
    { name: 'score_scale_id', label: t('Score scale'), type: 'select', numeric: true, value: node.score_scale_id, options: scaleOpts(), placeholder: t('Same as the version ({scale})', { scale: db.get('rating_scales', version.result_scale_id)?.name ?? '–' }), help: t('Leave as is unless this node is scored on a different scale.') },
    { name: 'description', label: t('Description'), type: 'textarea', translated: true, row: node, wide: true },
  ];

  return h('div', { class: 'editor' },
    h('fieldset', { class: 'plain', disabled: !draft },
      h('div', { class: 'editor-head' },
        h('div', {},
          h('p', { class: 'crumbs-inline small muted' }, pathOf(node).map((n, i) => [i ? ' › ' : '', n.id === node.id ? n.name : link(nodeHref(n), n.name)])),
          h('p', { class: 'eyebrow' }, isRoot ? t('Root group – its score is the final result') : isGroup ? t('Group') : t('Question node')),
          h('h2', {}, node.name)),
        !isRoot && draft && confirmButton(t('Delete node'), isGroup ? t('Click again: deletes the group and everything inside it') : t('Click again to delete'), async () => {
          await deleteNode(node);
          toast(t('Deleted: {name}.', { name: node.name }));
          navigate(`/admin/versions/${version.id}/node/${node.parent_id}`);
        })),

      (errors.length > 0 || warnings.length > 0) && h('div', { class: `check ${errors.length ? 'bad' : 'warn'}` },
        h('strong', {}, errors.length ? t('To fix on this node:') : t('Warnings:')),
        h('ul', {}, [...errors, ...warnings].map((m) => h('li', {}, m)))),

      isGroup && isRoot && tip('n-root', t('The root group'),
        h('p', {}, t('The root sits at the top of the tree and combines the main groups into the final score. Add groups to it with “+ group” in the tree, e.g. “Structural condition”, “Fire safety”, “Energy efficiency”.'))),

      block(t('Node settings'), [t('Name, weight and how the node is scored or combined.'), ' ', term('weight'), ' · ', isGroup ? term('aggregation') : term('veto')],
        form({
          id: `node-${node.id}`, submit: t('Save node'), fields: nodeFields,
          onSubmit: async (v) => { await db.update('methodology_nodes', node.id, v); toast(t('Node saved.')); },
        }),
        isGroup && !isRoot && example(t('Structural condition (weight 0.5) contains Crack width (0.6) and Roof condition (0.4). With scores 3 and 4 the group scores 0.6 × 3 + 0.4 × 4 = 3.4.')),
        stored('methodology_nodes')),

      !isGroup && questionBlock(node, q),
      !isGroup && q && methodsBlock(node, draft),
      !isGroup && q && scoringBlock(node, q, scale, draft)),

    !isGroup && q && q.answer_type !== 'text' && block(t('Try the rule'), t('Enter a sample answer to see the score it gets. Nothing is saved. Works on published versions too.'), testBox(node, q)));
}

// ── Question ──────────────────────────────────────────────────

const questionFilter = {};

function questionBlock(node, q) {
  const search = (questionFilter[node.id] ?? '').toLowerCase();
  const inAnyLanguage = (x) => `${x.code} ${languages().map((l) => x[`text_${l.code}`] ?? '').join(' ')}`.toLowerCase();
  const candidates = db.all('questions', (x) => (x.is_active || x.id === node.question_id)
    && (!search || x.id === node.question_id || inAnyLanguage(x).includes(search)));
  return block(t('Question'), [t('The library question this node asks. Changing it deletes the node’s score criteria, because they belong to the old question.'), ' ', term('question')],
    !q && help(t('Pick the question this node should ask. Name and code are filled in from it.')),
    h('div', { class: 'picker' },
      h('input', {
        type: 'search', id: `node-${node.id}-qsearch`, placeholder: t('Filter questions…'), value: questionFilter[node.id] ?? '',
        oninput: (e) => { questionFilter[node.id] = e.target.value; rerender(); },
      }),
      selectEl(candidates.map((x) => ({ value: x.id, label: `${x.code} · ${x.text}` })), node.question_id, {
        id: `node-${node.id}-question`, placeholder: candidates.length ? t('Choose a question…') : t('No question matches'),
        onchange: async (e) => {
          try {
            await setNodeQuestion(node, num(e.target.value));
            toast(t('Question linked.'));
          } catch (err) { toast(err.message, 'bad'); }
        },
      })),
    q && h('div', { class: 'qpreview' },
      h('p', {}, h('strong', {}, q.text)),
      q.description && h('p', { class: 'small muted' }, q.description),
      h('p', { class: 'small' }, labelOf(answerTypes(), q.answer_type),
        q.unit_id && ` · ${t('unit')} ${db.get('units', q.unit_id)?.code}`,
        q.default_scale_id && ` · ${t('scale')} ${db.get('rating_scales', q.default_scale_id)?.name}`),
      link(`/admin/questions/${q.id}`, t('Open in the question library'), { class: 'small' })));
}

// ── How to assess ─────────────────────────────────────────────

const editingMethod = {};

function methodsBlock(node, draft) {
  const rows = db.all('node_assessment_methods', (m) => m.node_id === node.id);
  const edit = rows.find((m) => m.id === editingMethod[node.id]);
  const methodName = (m) => db.get('assessment_methods', m.assessment_method_id)?.name ?? '?';
  const makePrimary = (m) => async () => {
    for (const other of rows.filter((x) => x.is_primary && x.id !== m.id)) {
      // eslint-disable-next-line no-await-in-loop
      await db.update('node_assessment_methods', other.id, { is_primary: false }, ['node_assessment_methods']);
    }
    await db.update('node_assessment_methods', m.id, { is_primary: true });
  };

  return block(t('How to assess'), [t('The assessment methods respondents may use for this question, with instructions. The primary method is preselected for them.'), ' ', term('method')],
    table([t('Method'), '', t('Instructions'), t('Evidence to collect'), ''], rows.map((m) => [
      methodName(m),
      m.is_primary ? chip(t('primary'), 'info') : (draft && asyncButton(t('Make primary'), makePrimary(m), { class: 'btn small ghost' })),
      m.instructions ?? '–',
      m.required_evidence ?? '–',
      draft && h('span', { class: 'row-actions' },
        button(t('Edit'), () => { editingMethod[node.id] = m.id; rerender(); }, { class: 'btn small ghost' }),
        confirmButton(t('Remove'), t('Click again'), async () => { await db.remove('node_assessment_methods', m.id); toast(t('Method removed.')); })),
    ]), t('No method yet. Add at least one so respondents know how to get the value.')),
    draft && form({
      id: `nam-${node.id}-${edit?.id ?? 'new'}`, submit: edit ? t('Save method') : t('Add method'), layout: 'stacked',
      cancel: edit ? () => { editingMethod[node.id] = null; rerender(); } : null,
      fields: [
        !edit && { name: 'assessment_method_id', label: t('Method'), type: 'select', numeric: true, required: true, options: db.all('assessment_methods', (m) => !rows.some((r) => r.assessment_method_id === m.id)).map((m) => ({ value: m.id, label: m.name })) },
        { name: 'instructions', label: t('Instructions'), type: 'textarea', translated: true, row: edit, wide: true, help: t('Step by step: tools, where to look, how many samples. Write it so a new colleague could follow it.') },
        { name: 'required_evidence', label: t('Evidence to collect'), translated: true, row: edit, wide: true, hint: t('e.g. Photo of the gauge against the widest crack') },
      ],
      onSubmit: async (v) => {
        if (edit) await db.update('node_assessment_methods', edit.id, v);
        else await db.create('node_assessment_methods', { ...v, node_id: node.id, is_primary: rows.length === 0 });
        editingMethod[node.id] = null;
        toast(t('Method saved.'));
        rerender();
      },
    }),
    stored('node_assessment_methods'));
}

// ── Scoring ───────────────────────────────────────────────────

function ruleFields(rule, unit) {
  const u = unit ? ` (${unit})` : '';
  switch (rule.normalization_type) {
    case 'linear_min_max':
      return [
        { name: 'raw_min', label: `${t('Worst value')}${u}`, type: 'number', required: true, value: rule.raw_min, help: t('This value, or anything worse, gets the lowest score of the scale.') },
        { name: 'raw_max', label: `${t('Best value')}${u}`, type: 'number', required: true, value: rule.raw_max, help: t('This value, or anything better, gets the highest score. It may be lower than the worst value when less is better.') },
      ];
    case 'linear_target':
      return [
        { name: 'raw_min', label: `${t('Lower limit')}${u}`, type: 'number', required: true, value: rule.raw_min, help: t('At or below this value, the lowest score.') },
        { name: 'target_value', label: `${t('Target')}${u}`, type: 'number', required: true, value: rule.target_value, help: t('The ideal value: the highest score.') },
        { name: 'raw_max', label: `${t('Upper limit')}${u}`, type: 'number', required: true, value: rule.raw_max, help: t('At or above this value, the lowest score.') },
      ];
    case 'formula':
      return [{ name: 'formula', label: t('Formula'), type: 'textarea', required: true, value: rule.formula, wide: true, help: t('Python expression. x = the answer (Yes = 1, No = 0), lo / hi = the scale’s lowest and highest score. Examples: hi - x / 2 · hi if x > 10 else lo') }];
    default:
      return [];
  }
}

function ruleTypeCards(node, rule, q, draft) {
  const numeric = q.answer_type === 'numeric' || q.answer_type === 'scale_level';
  const all = normalizations();
  const allowed = numeric ? Object.keys(all) : ['criteria_lookup', ...(q.answer_type === 'boolean' ? ['formula'] : [])];
  return h('div', { class: 'cards-input', role: 'radiogroup', 'aria-label': t('How the answer becomes a score') },
    allowed.map((key) => {
      const n = all[key];
      return h('label', { class: 'card-opt' },
        h('input', {
          type: 'radio', name: `rule-${node.id}`, id: `rule-${node.id}-${key}`, value: key, checked: rule.normalization_type === key, disabled: !draft,
          onchange: async () => {
            try {
              await db.update('scoring_rules', rule.id, { normalization_type: key });
              toast(t('Scoring changed to “{name}”.', { name: n.label }));
            } catch (err) { toast(err.message, 'bad'); }
          },
        }),
        h('span', { class: 'card-opt-body' }, h('strong', {}, n.label), h('span', { class: 'small' }, n.description),
          helpOn() && h('span', { class: 'small muted' }, t('Example:'), ' ', n.example)));
    }));
}

function scoringBlock(node, q, scale, draft) {
  const rule = ruleOf(node.id);
  if (!rule) {
    return block(t('Scoring'), t('This node has no scoring rule.'),
      draft && asyncButton(t('Create scoring rule'), () => db.create('scoring_rules', { node_id: node.id, normalization_type: 'criteria_lookup' }), { class: 'btn primary' }));
  }
  if (q.answer_type === 'text') return block(t('Scoring'), null, h('p', { class: 'muted' }, t('Text answers are stored but never scored.')));
  const unit = db.get('units', q.unit_id)?.code;
  const fields = ruleFields(rule, unit);
  return block(t('Scoring'), [t('How the answer becomes a score on {scale}.', { scale: scale ? `${scale.name} (${scale.min_value}–${scale.max_value})` : t('no scale') }), ' ', term('rule')],
    ruleTypeCards(node, rule, q, draft),
    fields.length > 0 && form({
      id: `rule-${node.id}-${rule.normalization_type}`, submit: t('Save rule'), fields,
      onSubmit: async (v) => { await db.update('scoring_rules', rule.id, v); toast(t('Rule saved.')); },
    }),
    h('div', { class: 'plain-words' }, h('span', { class: 'eyebrow' }, t('In plain words')), h('p', {}, describeRule(rule, node, q))),
    rule.normalization_type === 'criteria_lookup' && criteriaBlock(node, q, scale, rule, draft),
    stored('scoring_rules', 'score_criteria'));
}

const editingCriterion = {};

// One criterion per option (first option best) or Yes/No, as a starting point.
// Labels are copied from the option in every language.
async function addStarterCriteria(rule, q, scale, criteria) {
  const lo = scale?.min_value ?? 0;
  const hi = scale?.max_value ?? 1;
  const labels = (source, field) => Object.fromEntries(languages().map((l) => [`label_${l.code}`, source[`${field}_${l.code}`] ?? null]));
  let rows;
  if (q.answer_type === 'boolean') {
    // No label: the condition (“= Yes”) already says it, in every interface language.
    rows = [[{ boolean_value: true }, hi, {}], [{ boolean_value: false }, lo, {}]].filter(([c]) => !criteria.some((x) => x.boolean_value === c.boolean_value));
  } else {
    const options = db.all('question_options', (o) => o.question_id === q.id).sort((a, b) => a.sort_order - b.sort_order);
    rows = options.map((o, i) => [{ option_id: o.id }, options.length > 1 ? Math.round((hi - (i * (hi - lo)) / (options.length - 1)) * 100) / 100 : hi, labels(o, 'label')])
      .filter(([c]) => !criteria.some((x) => x.option_id === c.option_id));
  }
  for (const [i, [condition, score, label]] of rows.entries()) {
    // eslint-disable-next-line no-await-in-loop
    await db.create('score_criteria', { scoring_rule_id: rule.id, ...condition, score, ...label, sort_order: criteria.length + i }, ['score_criteria']);
  }
  await db.load();
  toast(t('Criteria added: {count}. Check the scores and adjust them.', { count: rows.length }));
}

function criteriaBlock(node, q, scale, rule, draft) {
  const criteria = criteriaOf(rule);
  const levels = levelsOf(scale);
  const options = db.all('question_options', (o) => o.question_id === q.id);
  const numeric = q.answer_type === 'numeric' || q.answer_type === 'scale_level';
  const unit = db.get('units', q.unit_id)?.code ?? '';
  const edit = criteria.find((c) => c.id === editingCriterion[node.id]);
  const missing = q.answer_type === 'boolean'
    ? [true, false].filter((b) => !criteria.some((c) => c.boolean_value === b)).length
    : options.filter((o) => !criteria.some((c) => c.option_id === o.id)).length;

  const conditionFields = numeric
    ? [
      { name: 'range_from', label: `${t('From, included')}${unit ? ` (${unit})` : ''}`, type: 'number', value: edit?.range_from, hint: t('Empty = no lower limit'), help: t('The range includes this value.') },
      { name: 'range_to', label: `${t('Up to, not included')}${unit ? ` (${unit})` : ''}`, type: 'number', value: edit?.range_to, hint: t('Empty = no upper limit'), help: t('The range stops just below this value, so the next range can start at it.') },
    ]
    : q.answer_type === 'boolean'
      ? [{ name: 'boolean_value', label: t('Answer'), type: 'select', required: true, value: edit ? String(edit.boolean_value) : null, options: [{ value: 'true', label: t('Yes') }, { value: 'false', label: t('No') }] }]
      : [{ name: 'option_id', label: t('Option'), type: 'select', numeric: true, required: true, value: edit?.option_id, options: options.map((o) => ({ value: o.id, label: o.label })) }];

  return h('div', { class: 'criteria' },
    h('h4', {}, term('criteria', t('Score criteria'))),
    numeric && example(t('Crack width: 0–0.1 → 5, 0.1–0.5 → 4, 0.5–2 → 3, 2–5 → 2, 5 and more → 1. Each range starts where the previous one ends.')),
    q.answer_type === 'multi_choice' && help(t('When several options are ticked, the lowest of their scores applies.')),
    q.answer_type === 'scale_level' && help(t('Ranges are matched against the value of the chosen level.')),
    table([t('If the answer is'), t('Score'), t('Level'), t('Label'), t('Description'), ''], criteria.map((c) => [
      h('code', {}, describeCondition(c, q)),
      h('span', { class: 'num' }, fmt(c.score)),
      db.get('scale_levels', c.scale_level_id)?.label ?? '–',
      c.label ?? '–',
      c.description ?? '–',
      draft && h('span', { class: 'row-actions' },
        button(t('Edit'), () => { editingCriterion[node.id] = c.id; rerender(); }, { class: 'btn small ghost' }),
        confirmButton(t('Remove'), t('Click again'), async () => { await db.remove('score_criteria', c.id); toast(t('Criterion removed.')); })),
    ]), t('No criteria yet.')),
    draft && !numeric && missing > 0 && h('div', { class: 'quickstart' },
      asyncButton(q.answer_type === 'boolean' ? t('Add Yes and No criteria') : t('Add a criterion for each option (missing: {count})', { count: missing }),
        () => addStarterCriteria(rule, q, scale, criteria), { class: 'btn' }),
      help(q.answer_type === 'boolean' ? t('Yes gets the highest score and No the lowest; change them if needed.') : t('The first option gets the highest score and the last the lowest; adjust the scores afterwards. Labels are copied from the options in every language.'))),
    draft && form({
      id: `crit-${node.id}-${edit?.id ?? 'new'}`, submit: edit ? t('Save criterion') : t('Add criterion'),
      cancel: edit ? () => { editingCriterion[node.id] = null; rerender(); } : null,
      fields: [
        ...conditionFields,
        { name: 'score', label: t('Score'), type: 'number', value: edit?.score, hint: scale ? t('Between {lo} and {hi}', { lo: scale.min_value, hi: scale.max_value }) : null, help: t('Leave empty to use the value of the level you choose.') },
        { name: 'scale_level_id', label: t('Level'), type: 'select', numeric: true, value: edit?.scale_level_id, options: levels.map((l) => ({ value: l.id, label: `${l.value} · ${l.label}` })), placeholder: t('Nearest to the score'), help: t('Filled in automatically from the score if left empty.') },
        { name: 'label', label: t('Label'), translated: true, row: edit, hint: t('e.g. Local cracks') },
        { name: 'description', label: t('Description'), translated: true, row: edit, wide: true, help: t('Plain-language explanation shown in the result, e.g. “Cracks 0.5–2 mm: local repair required”.') },
      ],
      validate: (v) => {
        if (v.score == null && v.scale_level_id == null) return t('Give a score or choose a level.');
        if (numeric && v.range_from == null && v.range_to == null && criteria.length > (edit ? 1 : 0)) return t('Give at least one limit: a range without limits would match every answer.');
        if (numeric && v.range_from != null && v.range_to != null && v.range_from >= v.range_to) return t('“From” must be lower than “Up to”.');
        return null;
      },
      onSubmit: async (v) => {
        const row = { ...v };
        if (row.score == null) row.score = db.get('scale_levels', v.scale_level_id).value;
        if ('boolean_value' in row) row.boolean_value = row.boolean_value === 'true';
        if (edit) await db.update('score_criteria', edit.id, row);
        else await db.create('score_criteria', { ...row, scoring_rule_id: rule.id, sort_order: criteria.length });
        editingCriterion[node.id] = null;
        toast(t('Criterion saved.'));
        rerender();
      },
    }));
}

// ── Try the rule ──────────────────────────────────────────────

function testBox(node, q) {
  const out = h('div', { class: 'test-out' }, h('span', { class: 'muted' }, t('Enter a sample answer.')));
  let timer = null;
  let seq = 0;
  const show = (answer) => {
    clearTimeout(timer);
    timer = setTimeout(async () => {
      const mine = (seq += 1);
      try {
        const r = await tryRule(node.id, answer);
        if (mine === seq) out.replaceChildren(scoreBadge(node, { score: r.score, criterion_id: r.matched_criterion?.id, note: r.note }));
      } catch (err) {
        out.replaceChildren(h('span', { class: 'bad-text' }, err.message));
      }
    }, 250);
  };
  const id = `test-${node.id}`;
  const options = db.all('question_options', (o) => o.question_id === q.id).sort((a, b) => a.sort_order - b.sort_order);
  let control;

  switch (q.answer_type) {
    case 'numeric':
      control = h('input', { id, type: 'number', step: 'any', placeholder: '1.2', oninput: (e) => show({ numeric_value: num(e.target.value) }) });
      break;
    case 'boolean':
      control = selectEl([{ value: 'true', label: t('Yes') }, { value: 'false', label: t('No') }], null,
        { id, placeholder: t('Choose…'), onchange: (e) => show({ boolean_value: e.target.value === '' ? null : e.target.value === 'true' }) });
      break;
    case 'single_choice':
      control = selectEl(options.map((o) => ({ value: o.id, label: o.label })), null,
        { id, placeholder: t('Choose…'), onchange: (e) => show({ option: num(e.target.value) }) });
      break;
    case 'multi_choice':
      control = h('div', { class: 'checks' }, options.map((o) => h('label', { class: 'check-inline' },
        h('input', {
          type: 'checkbox', id: `${id}-${o.id}`, value: String(o.id),
          onchange: (e) => show({ options: [...e.target.closest('.checks').querySelectorAll('input:checked')].map((i) => Number(i.value)) }),
        }), ' ', o.label)));
      break;
    case 'scale_level':
      control = selectEl(levelsOf(db.get('rating_scales', q.default_scale_id)).map((l) => ({ value: l.id, label: `${l.value} · ${l.label}` })), null,
        { id, placeholder: t('Choose…'), onchange: (e) => show({ scale_level: num(e.target.value) }) });
      break;
    default:
      return h('p', { class: 'muted' }, t('Text answers are not scored.'));
  }
  const unit = db.get('units', q.unit_id)?.code;
  return h('div', { class: 'test' }, h('div', { class: 'test-in' }, control, unit && h('span', { class: 'unit' }, unit)), out);
}
