// Question library (admin steps A5–A7).
import * as db from '../store.js';
import { h, form, pageHead, section, table, chip, link, button, confirmButton, navigate, selectEl, toast, rerender, statusChip } from '../dom.js';
import { tip, help, example, stored, term, steps } from '../help.js';
import { answerTypes, labelOf, levelsOf } from '../scoring.js';
import { t, languages, requiredLanguages } from '../i18n.js';

const CHOICE = new Set(['single_choice', 'multi_choice']);
const opts = (rows, label = (r) => r.name) => rows.map((r) => ({ value: r.id, label: label(r) }));

function categoryPath(id) {
  const parts = [];
  for (let c = db.get('question_categories', id); c; c = db.get('question_categories', c.parent_id)) parts.unshift(c.name);
  return parts.join(' › ');
}
const categoryOptions = () => db.all('question_categories').map((c) => ({ value: c.id, label: categoryPath(c.id) }));
const usage = (questionId) => db.all('methodology_nodes', (n) => n.question_id === questionId).map((n) => db.get('methodology_versions', n.version_id)).filter(Boolean);

const STOP = new Set(['what', 'is', 'the', 'a', 'an', 'of', 'in', 'on', 'and', 'or', 'are', 'how', 'which', 'any', 'there', 'to', 'for', 'does', 'do', 'you', 'would', 'rate', 'other', 'about', 'with', 'at', 'by', 'from', 'it', 'be']);

// STR_CRACK_WIDTH-style code from the English question text, unique in the library.
function suggestCode(text) {
  const words = (text ?? '').toUpperCase().replace(/[^A-Z0-9 ]+/g, ' ').split(/\s+/).filter((w) => w && !STOP.has(w.toLowerCase()));
  const base = words.slice(0, 4).join('_') || 'QUESTION';
  let candidate = base;
  for (let i = 2; db.find('questions', (q) => q.code === candidate); i += 1) candidate = `${base}_${i}`;
  return candidate;
}
const slug = (label) => (label ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 60) || 'option';

// Every language version of a translated field, for searching.
const allLanguages = (row, field) => languages().map((l) => row[`${field}_${l.code}`] ?? '').join(' ');

// ── List ──────────────────────────────────────────────────────

const filter = { search: '', answer_type: '', category: '', show: 'all' };

export function questionList() {
  const s = filter.search.toLowerCase();
  const types = answerTypes();
  const questions = db.all('questions').filter((q) => (!s || `${q.code} ${allLanguages(q, 'text')} ${allLanguages(q, 'description')}`.toLowerCase().includes(s))
    && (!filter.answer_type || q.answer_type === filter.answer_type)
    && (!filter.category || q.category_id === Number(filter.category))
    && (filter.show === 'all' || (filter.show === 'unused' ? usage(q.id).length === 0 : !q.is_active)));
  const setFilter = (key) => (e) => { filter[key] = e.target.value; rerender(); };

  return h('div', { class: 'page' },
    pageHead(t('Question library'), t('Step 2 of the setup. A question says what is asked and which kind of answer is valid.'),
      button(t('New question'), () => navigate('/admin/questions/new'), { class: 'btn primary' })),

    tip('q-library', t('Questions don’t have scores – methodologies do'),
      h('p', {}, t('A question in the library only says what is asked and how it is answered (a number, a choice, yes/no…). How important it is and which answer earns which score is decided inside each methodology. That way one question can be reused by many methodologies, each scoring it in its own way.')),
      h('p', {}, t('Click a question code to edit it. A question that a published methodology uses can still get clearer wording, but its answer type is locked.'))),

    section(t('Questions'), null,
      h('div', { class: 'filters' },
        h('label', { class: 'field grow' }, h('span', { class: 'field-label' }, t('Search')),
          h('input', { type: 'search', id: 'q-search', value: filter.search, placeholder: t('Code or words in any language'), oninput: setFilter('search') })),
        h('label', { class: 'field' }, h('span', { class: 'field-label' }, t('Answer type')),
          selectEl(Object.entries(types).map(([value, x]) => ({ value, label: x.label })), filter.answer_type, { id: 'q-type', placeholder: t('All types'), onchange: setFilter('answer_type') })),
        h('label', { class: 'field' }, h('span', { class: 'field-label' }, t('Category')),
          selectEl(categoryOptions(), filter.category, { id: 'q-cat', placeholder: t('All categories'), onchange: setFilter('category') })),
        h('label', { class: 'field' }, h('span', { class: 'field-label' }, t('Show')),
          selectEl([{ value: 'all', label: t('All questions') }, { value: 'unused', label: t('Not used in any methodology') }, { value: 'inactive', label: t('Inactive only') }], filter.show, { id: 'q-show', onchange: setFilter('show') }))),
      table([t('Code'), t('Question'), t('Answer type'), t('Unit / scale'), t('Category'), t('Used in'), ''],
        questions.map((q) => {
          const used = usage(q.id);
          const optionCount = db.all('question_options', (o) => o.question_id === q.id).length;
          return [
            link(`/admin/questions/${q.id}`, h('code', {}, q.code)),
            q.text,
            labelOf(types, q.answer_type),
            db.get('units', q.unit_id)?.code ?? db.get('rating_scales', q.default_scale_id)?.name ?? (CHOICE.has(q.answer_type) ? t('Options: {count}', { count: optionCount }) : '–'),
            categoryPath(q.category_id) || '–',
            used.length ? t('Versions: {count}', { count: used.length }) : chip(t('not used'), 'muted'),
            [!q.is_active && chip(t('inactive'), 'muted'), CHOICE.has(q.answer_type) && optionCount < 2 && chip(t('needs options'), 'bad')],
          ];
        }), db.all('questions').length ? t('No questions match the filters.') : t('No questions yet. Click “New question” to write the first one.')),
      stored('questions', 'question_options')),

    categoriesBlock());
}

let editingCategory = null;

function categoriesBlock() {
  const edit = db.get('question_categories', editingCategory);
  return section(t('Categories'), t('Optional folders for browsing the library. They have no effect on scoring.'),
    table([t('Category'), t('Questions'), ''], db.all('question_categories').map((c) => [
      categoryPath(c.id),
      String(db.all('questions', (q) => q.category_id === c.id).length),
      h('span', { class: 'row-actions' },
        button(t('Rename'), () => { editingCategory = c.id; rerender(); }, { class: 'btn small ghost' }),
        confirmButton(t('Delete'), t('Click again'), async () => { await db.remove('question_categories', c.id); toast(t('Deleted category {name}. Its questions are kept.', { name: c.name })); })),
    ]), t('No categories yet.')),
    form({
      id: `cat-${edit?.id ?? 'new'}`, submit: edit ? t('Save category') : t('Add category'),
      cancel: edit ? () => { editingCategory = null; rerender(); } : null,
      fields: [
        { name: 'name', label: t('Name'), required: true, translated: true, row: edit, hint: t('e.g. Structure') },
        { name: 'parent_id', label: t('Inside category'), type: 'select', numeric: true, value: edit?.parent_id, options: categoryOptions().filter((o) => o.value !== edit?.id), placeholder: t('— top level —') },
      ],
      onSubmit: async (v) => {
        const saved = edit ? await db.update('question_categories', edit.id, v) : await db.create('question_categories', v);
        editingCategory = null;
        toast(t('Saved: {name}.', { name: saved.name }));
        rerender();
      },
    }));
}

// ── Editor ────────────────────────────────────────────────────

// Options typed one per line in every language become [{ code, label_en, label_ru, … }].
function optionsFromLines(v) {
  const lines = Object.fromEntries(languages().map((l) => [l.code, (v[`options_text_${l.code}`] ?? '').split('\n').map((x) => x.trim()).filter(Boolean)]));
  const main = lines.en ?? Object.values(lines)[0];
  for (const l of languages()) {
    const required = requiredLanguages().includes(l.code);
    if ((required || lines[l.code].length) && lines[l.code].length !== main.length) {
      throw Object.assign(new Error(t('Every language needs the same number of option lines ({count}), in the same order.', { count: main.length })), { fields: {} });
    }
  }
  const usedCodes = new Set();
  return main.map((label, i) => {
    let c = slug(label);
    while (usedCodes.has(c)) c = `${c}_${i}`;
    usedCodes.add(c);
    return { code: c, sort_order: i, ...Object.fromEntries(languages().map((l) => [`label_${l.code}`, lines[l.code][i] ?? null])) };
  });
}

export function questionEditor(id) {
  const q = id ? db.get('questions', id) : null;
  if (id && !q) return h('div', { class: 'page' }, h('p', {}, t('Question not found.'), ' '), link('/admin/questions', t('Back to the library')));
  const used = q ? usage(q.id) : [];
  const typeLocked = used.some((v) => v.status !== 'draft');
  const isChoice = q && CHOICE.has(q.answer_type);
  const types = answerTypes();

  return h('div', { class: 'page' },
    h('p', { class: 'crumbs' }, link('/admin/questions', t('Question library')), ' / ', q ? q.code : t('New question')),
    pageHead(q ? t('Edit question {code}', { code: q.code }) : t('New question'), null,
      q && !used.length && confirmButton(t('Delete question'), t('Click again to delete'), async () => {
        await db.remove('questions', q.id);
        toast(t('Deleted: {name}.', { name: q.code }));
        navigate('/admin/questions');
      })),

    !q && tip('q-new', t('How to write a good question'),
      steps(
        t('Ask about one thing only. “Width of the widest crack” is better than “Cracks and their size”.'),
        t('Say where and how to look in the guidance, e.g. “Measure at the widest point”.'),
        t('Choose the answer type that matches how the value is obtained. Prefer a number when something can be measured.'),
        t('For choice questions, write every possible option, from best to worst.'),
        t('Write the question in every language. Keep the meaning identical, so answers can be compared.'))),

    h('section', { class: 'block' },
      form({
        id: `question-${q?.id ?? 'new'}`, submit: q ? t('Save question') : t('Create question'), layout: 'stacked',
        fields: [
          { name: 'text', label: t('Question'), type: 'textarea', required: true, translated: true, row: q, wide: true, help: t('Write it exactly as the respondent should read it.') },
          { name: 'description', label: t('Guidance for the respondent'), type: 'textarea', translated: true, row: q, wide: true, help: t('Optional. Where to look, what to ignore, how to measure.') },
          {
            name: 'answer_type', label: t('Kind of answer'), type: 'cards', required: true, value: q?.answer_type, disabled: typeLocked,
            options: Object.entries(types).map(([value, x]) => ({ value, ...x })),
            hint: typeLocked ? t('Locked: a published methodology uses this question. Create a new question to ask it differently.') : null,
          },
          { name: 'unit_id', label: t('Unit'), type: 'select', numeric: true, required: true, value: q?.unit_id, options: opts(db.all('units'), (u) => `${u.code} · ${u.name}`), showIf: (v) => v.answer_type === 'numeric', help: t('Shown next to the input. Missing one? Add it under Catalogs → Units.') },
          { name: 'default_scale_id', label: t('Scale'), type: 'select', numeric: true, required: true, value: q?.default_scale_id, options: opts(db.all('rating_scales')), showIf: (v) => v.answer_type === 'scale_level', help: t('The respondent picks one of this scale’s levels.') },
          !q && { name: 'options_text', label: t('Options, one per line'), type: 'textarea', rows: 4, wide: true, translated: true, required: true, showIf: (v) => CHOICE.has(v.answer_type), help: t('Line 1 in every language is the same option, line 2 the next, and so on. You can edit and reorder options after saving.') },
          { name: 'code', label: t('Code'), value: q?.code, required: !!q, placeholder: q ? null : t('Leave empty to generate it'), help: t('A short, unique identifier, e.g. STR_CRACK_WIDTH. Methodology nodes show it in the tree.') },
          { name: 'category_id', label: t('Category'), type: 'select', numeric: true, value: q?.category_id, options: categoryOptions(), placeholder: t('— none —') },
          { name: 'is_active', label: t('Active: can be added to methodologies'), type: 'checkbox', value: q ? q.is_active : true, help: t('Untick to retire a question without deleting it.') },
        ],
        validate: (v) => (!v.answer_type ? t('Choose the kind of answer.') : null),
        onSubmit: async (v) => {
          const data = Object.fromEntries(Object.entries(v).filter(([k]) => !k.startsWith('options_text_')));
          if (!data.code) data.code = suggestCode(data.text_en);
          if (data.answer_type !== 'numeric') data.unit_id = null;
          if (data.answer_type !== 'scale_level') data.default_scale_id = null;
          if (q) {
            if (typeLocked) delete data.answer_type;
            await db.update('questions', q.id, data);
            toast(t('Saved: {name}.', { name: data.code }));
            return;
          }
          const options = CHOICE.has(data.answer_type) ? optionsFromLines(v) : [];
          const created = await db.create('questions', { ...data, options });
          toast(t('Created question {code}.', { code: created.code }));
          navigate(`/admin/questions/${created.id}`);
        },
      })),

    isChoice && optionsBlock(q, typeLocked),
    q && previewBlock(q),
    q && section(t('Used in'), [t('Methodology versions whose tree links this question.'), ' ', term('tree')],
      table([t('Methodology'), t('Version'), t('Status')], used.map((v) => [
        db.get('methodologies', v.methodology_id)?.name,
        link(`/admin/versions/${v.id}`, `v${v.version}`),
        statusChip(v.status),
      ]), t('Not used yet. Add it to a methodology from the methodology’s tree.'))));
}

let editingOption = null;

function optionsBlock(q, locked) {
  const options = db.all('question_options', (o) => o.question_id === q.id).sort((a, b) => a.sort_order - b.sort_order || a.id - b.id);
  const edit = options.find((o) => o.id === editingOption);
  const move = (o, delta) => async () => {
    const i = options.indexOf(o);
    const other = options[i + delta];
    if (!other) return;
    await db.update('question_options', o.id, { sort_order: i + delta }, ['question_options']);
    await db.update('question_options', other.id, { sort_order: i });
  };
  return section(t('Answer options'), t('The choices the respondent picks from, in this order.'),
    help(t('Options carry no score. Each methodology gives every option a score in its score criteria.'), locked ? ` ${t('Options used by score criteria or answers can’t be deleted, only renamed.')}` : ''),
    table(['', t('Label'), t('Code'), ''], options.map((o, i) => [
      h('span', { class: 'row-actions' },
        button('↑', move(o, -1), { class: 'btn small ghost', disabled: i === 0, title: t('Move up'), 'aria-label': t('Move up') }),
        button('↓', move(o, 1), { class: 'btn small ghost', disabled: i === options.length - 1, title: t('Move down'), 'aria-label': t('Move down') })),
      o.label, h('code', {}, o.code),
      h('span', { class: 'row-actions' },
        button(t('Edit'), () => { editingOption = o.id; rerender(); }, { class: 'btn small ghost' }),
        confirmButton(t('Delete'), t('Click again'), async () => { await db.remove('question_options', o.id); toast(t('Deleted: {name}.', { name: o.label })); })),
    ]), t('No options yet. Add at least two.')),
    options.length < 2 && h('p', { class: 'check bad small' }, t('A choice question needs at least two options.')),
    form({
      id: `opt-${q.id}-${edit?.id ?? 'new'}`, submit: edit ? t('Save option') : t('Add option'),
      cancel: edit ? () => { editingOption = null; rerender(); } : null,
      fields: [
        { name: 'label', label: t('Label'), required: true, translated: true, row: edit, hint: t('What the respondent reads') },
        { name: 'code', label: t('Code'), value: edit?.code, placeholder: t('Generated from the English label'), help: t('Unique within this question.') },
      ],
      onSubmit: async (v) => {
        const data = { ...v, code: v.code ?? slug(v.label_en) };
        const saved = edit
          ? await db.update('question_options', edit.id, data)
          : await db.create('question_options', { ...data, question_id: q.id, sort_order: options.length });
        editingOption = null;
        toast(t('Saved: {name}.', { name: saved.label }));
        rerender();
      },
    }));
}

// What the respondent will see, with disabled inputs.
function previewBlock(q) {
  const options = db.all('question_options', (o) => o.question_id === q.id).sort((a, b) => a.sort_order - b.sort_order);
  const choice = (type, label) => h('label', { class: 'choice' }, h('input', { type, disabled: true }), ' ', label);
  let control;
  switch (q.answer_type) {
    case 'numeric': control = h('div', { class: 'num-in' }, h('input', { type: 'number', disabled: true, placeholder: '0' }), h('span', { class: 'unit' }, db.get('units', q.unit_id)?.code ?? '')); break;
    case 'boolean': control = h('div', { class: 'choices' }, choice('radio', t('Yes')), choice('radio', t('No'))); break;
    case 'single_choice': control = h('div', { class: 'choices' }, options.map((o) => choice('radio', o.label))); break;
    case 'multi_choice': control = h('div', { class: 'choices' }, options.map((o) => choice('checkbox', o.label))); break;
    case 'scale_level': control = h('div', { class: 'choices' }, levelsOf(db.get('rating_scales', q.default_scale_id)).map((l) => choice('radio', `${l.value} · ${l.label}`))); break;
    default: control = h('textarea', { rows: 2, disabled: true });
  }
  return section(t('Preview'), t('What the respondent will see in the current language (the inputs are disabled here).'),
    h('article', { class: 'qcard preview' },
      h('h3', {}, q.text),
      q.description && h('p', { class: 'small' }, q.description),
      control),
    example(t('A respondent fills this in inside an assessment, together with the “How to assess” instructions from the methodology.')));
}
