// Catalogs (admin steps A1–A4): the reference lists other screens pick from.
import * as db from '../store.js';
import { h, form, pageHead, table, chip, button, confirmButton, tabs, toast, rerender, fmt } from '../dom.js';
import { tip, help, example, stored, term } from '../help.js';
import { t } from '../i18n.js';
import { own } from '../security.js';

const muted = (v) => (v == null || v === '' ? h('span', { class: 'muted' }, '–') : v);
const code = (v) => h('code', {}, v);
const codeHelp = () => t('A short, unique name for the record, used by the API and in exports. Use letters, digits and “_”, no spaces.');

const TABS = () => [
  ['units', t('Units')],
  ['scales', t('Rating scales')],
  ['methods', t('Assessment methods')],
  ['object-types', t('Object types')],
  ['objects', t('Objects')],
];
const TAB_TABLE = { units: 'units', scales: 'rating_scales', methods: 'assessment_methods', 'object-types': 'object_types', objects: 'assessment_objects' };

// UI state: which row of each table is being edited.
const editing = {};

// A table of rows with Edit / Delete, and a form that adds a row or edits the selected one.
// text: { add, addTitle, editTitle, empty } – full sentences so they translate well.
function crud({ tableName, text, columns, fields, prepare = (v) => v, labelOf = (r) => r.code ?? r.name, deleteNote }) {
  const rows = db.all(tableName);
  const editRow = db.get(tableName, editing[tableName]);
  // Separate ids for the add form and each edit form, so typed-in values never jump between them.
  const formId = `${tableName}-form-${editRow?.id ?? 'new'}`;

  const startEdit = (r) => {
    editing[tableName] = r.id;
    rerender();
    document.getElementById(`${tableName}-form-${r.id}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  };

  const save = async (v) => {
    const data = prepare(v);
    if (editRow) {
      const saved = await db.update(tableName, editRow.id, data);
      editing[tableName] = null;
      toast(t('Saved: {name}.', { name: labelOf(saved) }));
      rerender();
    } else {
      const created = await db.create(tableName, data);
      toast(t('Added: {name}.', { name: labelOf(created) }));
    }
  };

  return [
    table([...columns.map(([label]) => label), ''], rows.map((r) => [
      ...columns.map(([, cell]) => cell(r)),
      h('span', { class: 'row-actions' },
        button(t('Edit'), () => startEdit(r), { class: 'btn small ghost' }),
        confirmButton(t('Delete'), t('Click again to delete'), async () => {
          await db.remove(tableName, r.id);
          toast(t('Deleted: {name}.', { name: labelOf(r) }));
        }, { title: deleteNote })),
    ]), text.empty),
    h('h3', { class: 'form-title' }, editRow ? text.editTitle(labelOf(editRow)) : text.addTitle),
    form({
      id: formId,
      submit: editRow ? t('Save changes') : text.add,
      fields: fields(editRow),
      cancel: editRow ? () => { editing[tableName] = null; rerender(); } : null,
      onSubmit: save,
    }),
  ];
}

// ── Tabs ──────────────────────────────────────────────────────

function unitsTab() {
  return [
    tip('cat-units', t('What are units for?'),
      h('p', {}, t('A unit is the label shown next to a numeric answer, such as “mm” after a crack width. It helps the respondent enter the value in the right unit. Units don’t convert anything.')),
      h('p', {}, t('Add the unit before you create a numeric question that needs it.'))),
    stored('units'),
    crud({
      tableName: 'units',
      text: { add: t('Add unit'), addTitle: t('Add a unit'), editTitle: (n) => t('Edit unit {name}', { name: n }), empty: t('No units yet. Add the first one below.') },
      columns: [[t('Code'), (u) => code(u.code)], [t('Name'), (u) => u.name], [t('Description'), (u) => muted(u.description)]],
      fields: (u) => [
        { name: 'code', label: t('Code'), required: true, value: u?.code, hint: t('e.g. mm, m², %'), help: t('This is exactly what respondents see next to the input field, in every language.') },
        { name: 'name', label: t('Name'), required: true, translated: true, row: u, hint: t('e.g. Millimetre') },
        { name: 'description', label: t('Description'), translated: true, row: u },
      ],
      deleteNote: t('Units used by a question can’t be deleted.'),
    }),
  ];
}

const scaleTypes = () => ({
  binary: t('Two outcomes only, such as Pass / Fail.'),
  nominal: t('Categories without an order. Rarely used for scores.'),
  ordinal: t('Ordered levels with names, such as 1 Poor … 5 Excellent. The most common choice.'),
  interval: t('Numbers with equal steps but no true zero, such as a temperature in °C.'),
  ratio: t('Measurements with a true zero, such as percent or millimetres.'),
});
const scaleTypeLabels = () => ({ binary: t('binary'), nominal: t('nominal'), ordinal: t('ordinal'), interval: t('interval'), ratio: t('ratio') });

function ruler(scale, levels) {
  const lo = scale.min_value ?? Math.min(...levels.map((l) => l.value), 0);
  const hi = scale.max_value ?? Math.max(...levels.map((l) => l.value), 1);
  const pos = (v) => (hi === lo ? 0 : ((v - lo) / (hi - lo)) * 100);
  return h('div', { class: 'ruler', 'aria-hidden': 'true' },
    h('div', { class: 'ruler-line' }),
    levels.map((l) => h('div', { class: 'ruler-tick', style: { left: `${pos(l.value)}%` } },
      h('span', { class: 'ruler-val' }, fmt(l.value)), h('span', { class: 'ruler-label' }, l.label))),
    h('div', { class: 'ruler-ends' }, h('span', {}, scale.higher_is_better ? t('worse') : t('better')), h('span', {}, scale.higher_is_better ? t('better') : t('worse'))));
}

const editingLevel = {};

function levelsCard(scale) {
  const levels = db.all('scale_levels', (l) => l.scale_id === scale.id).sort((a, b) => a.value - b.value);
  const edit = db.get('scale_levels', editingLevel[scale.id]);
  return h('article', { class: 'card' },
    h('div', { class: 'card-head' }, h('strong', {}, scale.name), ' ', code(scale.code)),
    h('p', { class: 'meta' }, `${scaleTypeLabels()[scale.scale_type] ?? scale.scale_type} · ${scale.min_value ?? '?'} – ${scale.max_value ?? '?'}${scale.step ? ` · ${t('step')} ${scale.step}` : ''} · ${scale.higher_is_better ? t('higher is better') : t('lower is better')}`),
    levels.length >= 2 ? ruler(scale, levels) : h('p', { class: 'check bad small' }, t('Add at least two levels so scores can be named.')),
    table([t('Value'), t('Label'), t('Meaning'), ''], levels.map((l) => [
      h('span', { class: 'num' }, fmt(l.value)), l.label, muted(l.description),
      h('span', { class: 'row-actions' },
        button(t('Edit'), () => { editingLevel[scale.id] = l.id; rerender(); }, { class: 'btn small ghost' }),
        confirmButton(t('Delete'), t('Click again'), async () => { await db.remove('scale_levels', l.id); toast(t('Deleted: {name}.', { name: l.label })); },
          { title: t('Levels used by score criteria or results can’t be deleted.') })),
    ]), t('No levels yet.')),
    form({
      id: `level-${scale.id}-${edit?.id ?? 'new'}`,
      submit: edit ? t('Save level') : t('Add level'),
      cancel: edit ? () => { editingLevel[scale.id] = null; rerender(); } : null,
      fields: [
        { name: 'value', label: t('Value'), type: 'number', required: true, value: edit?.value, help: t('The number this level stands for. Scores are shown with the nearest level.') },
        { name: 'label', label: t('Label'), required: true, translated: true, row: edit, hint: t('e.g. Good') },
        { name: 'description', label: t('Meaning'), translated: true, row: edit, help: t('What this level means in practice, e.g. “Minor shortcomings; no action needed now”.') },
      ],
      onSubmit: async (v) => {
        const saved = edit
          ? await db.update('scale_levels', edit.id, v)
          : await db.create('scale_levels', { ...v, scale_id: scale.id, sort_order: levels.length });
        editingLevel[scale.id] = null;
        toast(t('Saved: {name}.', { name: saved.label }));
        rerender();
      },
    }));
}

function scalesTab() {
  const types = scaleTypes();
  return [
    tip('cat-scales', t('Rating scales: the measuring stick for scores'),
      h('p', {}, t('Every score is a number on a scale. A methodology version has a result scale for the final score; its nodes use the same scale unless you give them their own.')),
      h('p', {}, t('Levels give names to points on the scale, so that a total of 3.9 can be shown as “Good”. A score is always shown with the nearest level.')),
      h('p', {}, t('The lowest and highest scores are used by linear scoring rules: the worst answer gets the lowest score, the best answer the highest.'))),
    example(t('“5-point quality” runs from 1 to 5 with levels 1 Unacceptable, 2 Poor, 3 Satisfactory, 4 Good, 5 Excellent.')),
    stored('rating_scales', 'scale_levels'),
    crud({
      tableName: 'rating_scales',
      text: { add: t('Add scale'), addTitle: t('Add a scale'), editTitle: (n) => t('Edit scale {name}', { name: n }), empty: t('No scales yet. Add the first one below.') },
      columns: [
        [t('Code'), (s) => code(s.code)], [t('Name'), (s) => s.name], [t('Type'), (s) => scaleTypeLabels()[s.scale_type] ?? s.scale_type],
        [t('Range'), (s) => `${s.min_value ?? '?'} – ${s.max_value ?? '?'}`],
        [t('Levels'), (s) => String(db.all('scale_levels', (l) => l.scale_id === s.id).length)],
      ],
      fields: (s) => [
        { name: 'code', label: t('Code'), required: true, value: s?.code, help: codeHelp() },
        { name: 'name', label: t('Name'), required: true, translated: true, row: s, hint: t('e.g. 5-point quality') },
        { name: 'scale_type', label: t('Scale type'), type: 'select', required: true, value: s?.scale_type ?? 'ordinal', options: Object.entries(scaleTypeLabels()).map(([value, label]) => ({ value, label })), explain: types },
        { name: 'min_value', label: t('Lowest score'), type: 'number', value: s?.min_value, hint: t('e.g. 1') },
        { name: 'max_value', label: t('Highest score'), type: 'number', value: s?.max_value, hint: t('e.g. 5') },
        { name: 'step', label: t('Step'), type: 'number', value: s?.step, help: t('Distance between levels, for information only.') },
        { name: 'higher_is_better', label: t('Higher scores are better'), type: 'checkbox', value: s ? s.higher_is_better : true },
        { name: 'description', label: t('Description'), translated: true, row: s, wide: true },
      ],
      deleteNote: t('Scales used by questions, methodologies or criteria can’t be deleted.'),
    }),
    h('h3', { class: 'form-title' }, t('Levels of each scale')),
    help(t('Add a level for every point that needs a name. Most scales need one level per whole number.')),
    h('div', { class: 'cards' }, db.all('rating_scales').map(levelsCard)),
  ];
}

function methodsTab() {
  return [
    tip('cat-methods', t('Assessment methods: how a value is obtained'),
      h('p', {}, t('A method names a way of getting an answer: measuring with an instrument, inspecting on site, reading documents, calculating, or an expert’s judgement.')),
      h('p', {}, t('In a methodology you attach methods to each question node and write step-by-step instructions there, so every respondent works the same way. The respondent then records which method they actually used.')),
      h('p', {}, t('“Requires evidence” reminds respondents to attach photos or documents when they use this method.'))),
    stored('assessment_methods'),
    crud({
      tableName: 'assessment_methods',
      text: { add: t('Add method'), addTitle: t('Add a method'), editTitle: (n) => t('Edit method {name}', { name: n }), empty: t('No methods yet. Add the first one below.') },
      columns: [
        [t('Code'), (m) => code(m.code)], [t('Name'), (m) => m.name], [t('Description'), (m) => muted(m.description)],
        [t('Evidence'), (m) => (m.requires_evidence ? chip(t('required'), 'warn') : chip(t('optional'), 'muted'))],
      ],
      fields: (m) => [
        { name: 'code', label: t('Code'), required: true, value: m?.code, help: codeHelp() },
        { name: 'name', label: t('Name'), required: true, translated: true, row: m, hint: t('e.g. Visual inspection') },
        { name: 'description', label: t('Description'), translated: true, row: m, wide: true, help: t('A general description. Specific instructions are written per question in the methodology.') },
        { name: 'requires_evidence', label: t('Requires evidence'), type: 'checkbox', value: m?.requires_evidence },
      ],
      deleteNote: t('Methods attached to a methodology node can’t be deleted.'),
    }),
  ];
}

function objectTypesTab() {
  return [
    tip('cat-otypes', t('Object types: what kind of thing is assessed'),
      h('p', {}, t('Each methodology is written for one object type. Respondents can only use a methodology for objects of that type, so a building methodology can’t be applied to a product by mistake.'))),
    example(t('Residential building, Office building, Supplier.')),
    stored('object_types'),
    crud({
      tableName: 'object_types',
      text: { add: t('Add object type'), addTitle: t('Add an object type'), editTitle: (n) => t('Edit object type {name}', { name: n }), empty: t('No object types yet. Add the first one below.') },
      columns: [[t('Code'), (x) => code(x.code)], [t('Name'), (x) => x.name], [t('Description'), (x) => muted(x.description)]],
      fields: (x) => [
        { name: 'code', label: t('Code'), required: true, value: x?.code, help: codeHelp() },
        { name: 'name', label: t('Name'), required: true, translated: true, row: x },
        { name: 'description', label: t('Description'), translated: true, row: x, wide: true },
      ],
      deleteNote: t('Object types used by objects or methodologies can’t be deleted.'),
    }),
  ];
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
const attributesText = (a) => (a ? Object.entries(a).map(([k, v]) => `${k} = ${v}`).join('\n') : null);

function objectsTab() {
  const types = db.all('object_types');
  return [
    tip('cat-objects', t('Objects: the concrete things being assessed'),
      h('p', {}, t('An object is one real thing being assessed: a building, a supplier, a product. Respondents pick an object when they start an assessment, and they can also register new objects themselves.')),
      h('p', {}, t('The reference is your own identifier, such as a cadastral number or a supplier code. Attributes are free notes like the year built or the country. Object names are not translated.'))),
    stored('assessment_objects'),
    crud({
      tableName: 'assessment_objects', labelOf: (o) => o.name,
      text: { add: t('Add object'), addTitle: t('Add an object'), editTitle: (n) => t('Edit object {name}', { name: n }), empty: t('No objects yet. Add the first one below.') },
      columns: [
        [t('Name'), (o) => o.name], [t('Type'), (o) => db.get('object_types', o.object_type_id)?.name ?? '–'],
        [t('Reference'), (o) => muted(o.external_ref)],
        [t('Attributes'), (o) => (o.attributes ? Object.entries(o.attributes).map(([k, v]) => `${k}: ${v}`).join(' · ') : muted(null))],
        [t('Assessments'), (o) => (o.assessment_count == null ? '–' : String(o.assessment_count))],
      ],
      fields: (o) => [
        { name: 'object_type_id', label: t('Object type'), type: 'select', numeric: true, required: true, value: o?.object_type_id, options: types.map((x) => ({ value: x.id, label: x.name })) },
        { name: 'name', label: t('Name'), required: true, value: o?.name, hint: t('e.g. Block A, Riverside residential complex') },
        { name: 'external_ref', label: t('Reference'), value: o?.external_ref, hint: t('Cadastral number, supplier code, SKU…') },
        { name: 'attributes', label: t('Attributes'), type: 'textarea', rows: 3, wide: true, value: attributesText(o?.attributes), hint: t('One per line, e.g. year_built = 1987') },
      ],
      prepare: (v) => ({ ...v, attributes: parseAttributes(v.attributes) }),
      deleteNote: t('Objects with assessments can’t be deleted.'),
    }),
  ];
}

const VIEWS = { units: unitsTab, scales: scalesTab, methods: methodsTab, 'object-types': objectTypesTab, objects: objectsTab };

export default function catalogsView(tab = 'units') {
  if (!own(VIEWS, tab)) tab = 'units';
  return h('div', { class: 'page' },
    pageHead(t('Catalogs'), t('Step 1 of the setup. Shared reference lists that questions and methodologies pick from. Usually set up once and reused everywhere.')),
    help(t('Work through the tabs from left to right. Records that are in use can’t be deleted; you will see what uses them instead.'), ' ', term('scale'), ' · ', term('method'), ' · ', term('object_type'), ' · ', term('translation')),
    tabs(TABS().map(([key, label]) => [`/admin/catalogs/${key}`, label, db.all(TAB_TABLE[key]).length]), `/admin/catalogs/${tab}`),
    h('section', { class: 'block' }, VIEWS[tab]()));
}
