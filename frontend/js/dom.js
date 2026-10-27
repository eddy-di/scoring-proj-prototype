// Tiny DOM helpers. Views build plain DOM trees with h() and the whole
// page is re-rendered after each data change.
import { helpOn } from './prefs.js';
import { t, languages, requiredLanguages, defaultLanguage, language, setLanguage } from './i18n.js';
import * as session from './session.js';
import { theme, setTheme } from './theme.js';
import { BLOCKED_TAGS, BLOCKED_ATTRS, URL_ATTRS, safeUrl, routePath } from './security.js';

const PROPS = new Set(['value', 'checked', 'disabled', 'selected', 'open']);

// Children are always added as text, never parsed as HTML, so data from the
// server or the URL can't inject markup. See security.js for the other rules.
// style takes an object ({ left: '40%' }); the CSP blocks style="" strings.
export function h(tag, props, ...children) {
  if (BLOCKED_TAGS.has(String(tag).toLowerCase())) throw new TypeError(`h(): <${tag}> is not allowed`);
  const el = document.createElement(tag);
  const late = [];
  for (const [k, v] of Object.entries(props ?? {})) {
    if (v == null || v === false) continue;
    const key = k.toLowerCase();
    if (BLOCKED_ATTRS.has(key)) throw new TypeError(`h(): "${k}" is not allowed`);
    if (key.startsWith('on')) {
      if (typeof v !== 'function') throw new TypeError(`h(): ${k} must be a function`);
      el.addEventListener(key.slice(2), v);
    } else if (k === 'class') el.className = v;
    else if (k === 'style') {
      if (typeof v !== 'object') throw new TypeError('h(): style must be an object');
      Object.assign(el.style, v);
    } else if (PROPS.has(k)) late.push([k, v]);
    else if (URL_ATTRS.has(key)) el.setAttribute(k, safeUrl(v));
    else el.setAttribute(k, v === true ? '' : v);
  }
  // A new tab must not get a handle on this one (reverse tabnabbing).
  if (el.getAttribute('target') === '_blank') el.setAttribute('rel', 'noopener noreferrer');
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false || c === true) continue;
    el.append(c instanceof Node ? c : String(c));
  }
  // Set after children so <select value> finds its <option>.
  for (const [k, v] of late) el[k] = v;
  return el;
}

export const num = (v) => (v === '' || v == null ? null : Number(v));

export function fmt(n, digits = 2) {
  if (n == null || Number.isNaN(n)) return '–';
  return String(Math.round(n * 10 ** digits) / 10 ** digits);
}

// Only the app's own routes; anything else goes to the start page.
export const navigate = (path) => { location.hash = routePath(path) ?? '/'; };

export const button = (label, onclick, props = {}) =>
  h('button', { type: 'button', class: 'btn', onclick, ...props }, label);

export const link = (href, label, props = {}) => h('a', { href: `#${href}`, ...props }, label);

export const chip = (text, kind = '') => h('span', { class: `chip ${kind}` }, text);

const STATUS_KIND = { draft: 'muted', in_progress: 'info', published: 'ok', completed: 'ok', archived: 'muted', cancelled: 'bad' };
export const statusLabel = (status) => ({
  draft: t('draft'), in_progress: t('in progress'), published: t('published'),
  completed: t('completed'), archived: t('archived'), cancelled: t('cancelled'),
}[status] ?? status);
export const statusChip = (status) => chip(statusLabel(status), STATUS_KIND[status] ?? '');

export const tbl = (name) => h('code', { class: 't' }, name);

export function pageHead(title, lede, ...extra) {
  return h('header', { class: 'page-head' },
    h('div', {}, h('h1', {}, title), lede && h('p', { class: 'lede' }, lede)),
    extra.flat().filter(Boolean).length ? h('div', { class: 'actions' }, extra) : null);
}

export function section(title, intro, ...body) {
  return h('section', { class: 'block' },
    h('h2', {}, title),
    intro && h('p', { class: 'intro' }, intro),
    body);
}

export function table(headers, rows, empty) {
  if (!rows.length) return h('p', { class: 'empty' }, empty ?? t('Nothing here yet.'));
  return h('div', { class: 'tbl' },
    h('table', {},
      h('thead', {}, h('tr', {}, headers.map((x) => h('th', {}, x)))),
      h('tbody', {}, rows.map((cells) => h('tr', {}, cells.map((c) => h('td', {}, c)))))));
}

export function selectEl(options, value, props = {}) {
  const { placeholder, ...rest } = props;
  return h('select', { ...rest, value: value == null ? '' : String(value) },
    placeholder != null && h('option', { value: '' }, placeholder),
    options.map((o) => h('option', { value: String(o.value) }, o.label)));
}

// EN / RU / KY buttons. Switching reloads the page in the new language.
export function languageSwitch() {
  return h('div', { class: 'lang-switch', role: 'group', 'aria-label': t('Interface language') },
    languages().map((l) => h('button', {
      type: 'button', class: `lang ${l.code === language() ? 'active' : ''}`, title: l.name, lang: l.code,
      'aria-pressed': l.code === language() ? 'true' : 'false',
      onclick: async () => {
        if (l.code === language()) return;
        // Signed-in users keep the choice in their profile; it applies whenever they sign in.
        if (session.signedIn()) await session.updateProfile({ preferred_language: l.code }).catch(() => {});
        setLanguage(l.code);
      },
    }, l.code.toUpperCase())));
}

// Auto / Light / Dark. Applies at once, no reload.
export function themeSwitch() {
  const options = [['auto', t('Theme: follow the system')], ['light', t('Theme: light')], ['dark', t('Theme: dark')]];
  const group = h('div', { class: 'lang-switch theme-switch', role: 'group', 'aria-label': t('Colour theme') },
    options.map(([value, label]) => h('button', {
      type: 'button', class: `lang ${value === theme() ? 'active' : ''}`, title: label, 'aria-label': label,
      'aria-pressed': value === theme() ? 'true' : 'false', 'data-theme-value': value,
      onclick: () => {
        setTheme(value);
        group.querySelectorAll('button').forEach((b) => {
          const on = b.dataset.themeValue === value;
          b.classList.toggle('active', on);
          b.setAttribute('aria-pressed', on ? 'true' : 'false');
        });
      },
    }, h('span', { class: `ti ti-${value}`, 'aria-hidden': 'true' }))));
  return group;
}

// ── Feedback ──────────────────────────────────────────────────

let toastBox = null;

// Short message in the corner. kind: ok | bad | info
export function toast(message, kind = 'ok') {
  if (!toastBox) {
    toastBox = h('div', { class: 'toasts', role: 'status', 'aria-live': 'polite' });
    document.body.append(toastBox);
  }
  const el = h('div', { class: `toast ${kind}` }, message);
  toastBox.append(el);
  setTimeout(() => el.remove(), kind === 'bad' ? 9000 : 3500);
}

// A button that runs an async action, shows that it is working, and reports errors.
export function asyncButton(label, fn, props = {}) {
  return button(label, async (e) => {
    const b = e.currentTarget;
    b.disabled = true;
    b.dataset.busy = '1';
    try {
      await fn();
    } catch (err) {
      toast(err.message, 'bad');
    } finally {
      b.disabled = false;
      delete b.dataset.busy;
    }
  }, props);
}

// Two-step button for destructive actions: the first click asks, the second runs.
export function confirmButton(label, question, fn, props = {}) {
  return button(label, async (e) => {
    const b = e.currentTarget;
    if (!b.dataset.armed) {
      b.dataset.armed = '1';
      b.textContent = question;
      b.classList.add('armed');
      setTimeout(() => {
        if (b.isConnected) { delete b.dataset.armed; b.textContent = label; b.classList.remove('armed'); }
      }, 5000);
      return;
    }
    b.disabled = true;
    try {
      await fn();
    } catch (err) {
      toast(err.message, 'bad');
      b.disabled = false;
    }
  }, { class: 'btn small danger', ...props });
}

export function tabs(items, active) {
  return h('nav', { class: 'tabs', 'aria-label': t('Sections') },
    items.map(([href, label, count]) => h('a', { href: `#${href}`, class: href === active ? 'active' : '' },
      label, count != null && h('span', { class: 'count' }, String(count)))));
}

// ── Forms ─────────────────────────────────────────────────────

// Declarative form.
// fields: [{ name, label, type, options, numeric, required, value, hint, help, explain, showIf, disabled, wide, rows, placeholder, translated, row }]
// Types: text, textarea, number, select, checkbox, date, password, cards (radio cards: options with description/example).
// - hint: short, always shown. help: longer, shown only while helpers are on.
// - explain: { optionValue: text } shown under a select/cards for the chosen value (helpers on).
// - showIf: (values) => boolean, re-checked on every change.
// - translated: one input per language (name_en, name_ru, …); values come from row[`${name}_${code}`].
//   required then applies to the languages the server requires.
// onSubmit may be async. An ApiError from it is shown next to the matching fields.
export function form({ id, fields, onSubmit, submit, validate, layout = 'inline', cancel }) {
  submit = submit ?? t('Add');
  fields = fields.filter(Boolean);
  const inputs = []; // one entry per control: plain fields and every language of translated ones
  const controls = {};
  const errorEls = {};
  const items = {};
  const msg = h('p', { class: 'form-msg', role: 'alert' });
  const submitBtn = h('button', { type: 'submit', class: 'btn primary', id: `${id}-submit` }, submit);

  const control = (f) => {
    const cid = `${id}-${f.name}`;
    const common = { id: cid, name: f.name, disabled: f.disabled, 'aria-describedby': `${cid}-err`, lang: f.lang };
    if (f.type === 'textarea') return h('textarea', { ...common, rows: f.rows ?? 2, value: f.value ?? '', placeholder: f.placeholder });
    if (f.type === 'select') return selectEl(f.options, f.value, { ...common, placeholder: f.placeholder ?? (f.required ? t('Choose…') : '—') });
    if (f.type === 'checkbox') return h('input', { ...common, type: 'checkbox', checked: !!(f.value ?? false) });
    if (f.type === 'number') return h('input', { ...common, type: 'number', step: 'any', value: f.value ?? '', placeholder: f.placeholder });
    if (f.type === 'cards') {
      return h('div', { class: 'cards-input', role: 'radiogroup', id: cid },
        f.options.map((o) => h('label', { class: 'card-opt' },
          h('input', { type: 'radio', name: cid, id: `${cid}-${o.value}`, value: String(o.value), checked: String(f.value) === String(o.value), disabled: f.disabled }),
          h('span', { class: 'card-opt-body' },
            h('strong', {}, o.label),
            o.description && h('span', { class: 'small' }, o.description),
            o.example && helpOn() && h('span', { class: 'small muted' }, t('Example:'), ' ', o.example)))));
    }
    return h('input', { ...common, type: f.type ?? 'text', value: f.value ?? '', placeholder: f.placeholder });
  };

  const rawValue = (f) => {
    const c = controls[f.name];
    if (f.type === 'checkbox') return c.checked;
    if (f.type === 'cards') return c.querySelector('input:checked')?.value ?? null;
    return c.value;
  };

  const read = () => {
    const v = {};
    for (const f of inputs) {
      const raw = rawValue(f);
      if (f.type === 'checkbox') v[f.name] = raw;
      else if (f.type === 'number' || f.numeric) v[f.name] = num(raw);
      else v[f.name] = raw == null || raw.trim() === '' ? null : raw.trim();
    }
    return v;
  };

  const explainEls = {};
  const refresh = () => {
    const v = read();
    for (const f of fields) {
      if (f.showIf) items[f.name].hidden = !f.showIf(v);
      if (explainEls[f.name]) explainEls[f.name].textContent = f.explain[v[f.name]] ?? '';
    }
  };

  const hiddenInput = (f) => !!items[f.group ?? f.name]?.hidden;

  const plainField = (f) => {
    inputs.push(f);
    const c = (controls[f.name] = control(f));
    errorEls[f.name] = h('span', { class: 'field-error', id: `${id}-${f.name}-err` });
    if (f.explain && helpOn()) explainEls[f.name] = h('span', { class: 'help explain' });
    const cls = `field ${f.type === 'checkbox' ? 'checkbox' : ''} ${f.wide || f.type === 'cards' ? 'wide' : ''}`;
    const Tag = f.type === 'cards' ? 'div' : 'label';
    items[f.name] = h(Tag, { class: cls },
      h('span', { class: 'field-label' }, f.label, f.required && h('span', { class: 'req', title: t('Required') }, ' *')),
      c,
      f.hint && h('span', { class: 'hint' }, f.hint),
      f.help && helpOn() && h('span', { class: 'help' }, f.help),
      explainEls[f.name],
      errorEls[f.name]);
    return items[f.name];
  };

  // One labelled input per language, the main language first.
  const translatedField = (f) => {
    const required = requiredLanguages();
    const rows = languages().map((l) => {
      const sub = {
        ...f, name: `${f.name}_${l.code}`, group: f.name, lang: l.code, translated: false,
        required: !!f.required && required.includes(l.code),
        value: f.row?.[`${f.name}_${l.code}`] ?? null,
      };
      inputs.push(sub);
      controls[sub.name] = control(sub);
      errorEls[sub.name] = h('span', { class: 'field-error', id: `${id}-${sub.name}-err` });
      items[sub.name] = h('label', { class: 'lang-row' },
        h('span', { class: 'lang-tag', title: l.name }, l.code.toUpperCase(), sub.required && h('span', { class: 'req', title: t('Required') }, '*')),
        controls[sub.name],
        errorEls[sub.name]);
      return items[sub.name];
    });
    items[f.name] = h('div', { class: `field translated ${f.wide || f.type === 'textarea' ? 'wide' : ''}`, role: 'group', 'aria-label': f.label },
      h('span', { class: 'field-label' }, f.label, f.required && h('span', { class: 'req', title: t('Required') }, ' *')),
      h('div', { class: 'lang-rows' }, rows),
      f.hint && h('span', { class: 'hint' }, f.hint),
      f.help && helpOn() && h('span', { class: 'help' }, f.help),
      helpOn() && h('span', { class: 'help' }, f.required
        ? t('Fill in every language marked with *. People see the text in their own language.')
        : t('Optional. Where a translation is missing, the {lang} text is shown.', { lang: defaultLanguage().toUpperCase() })));
    return items[f.name];
  };

  const fieldEls = fields.map((f) => (f.translated ? translatedField(f) : plainField(f)));

  const clearErrors = () => {
    msg.textContent = '';
    Object.values(errorEls).forEach((el) => { el.textContent = ''; });
    Object.values(items).forEach((el) => el.classList.remove('has-error'));
  };

  const mark = (f, text) => {
    errorEls[f.name].textContent = text;
    items[f.name].classList.add('has-error');
  };

  const showError = (err) => {
    const unmatched = [];
    for (const [key, text] of Object.entries(err.fields ?? {})) {
      const f = inputs.find((x) => x.name === key || x.name === `${key}_id`);
      if (f && !hiddenInput(f)) mark(f, text);
      else unmatched.push(key === 'non_field_errors' ? text : `${key.replace(/_/g, ' ')}: ${text}`);
    }
    if (unmatched.length) msg.textContent = unmatched.join(' ');
    else if (Object.keys(err.fields ?? {}).length) msg.textContent = t('Please fix the highlighted fields.');
    else msg.textContent = err.message;
  };

  const el = h('form', {
    class: `form ${layout}`,
    id,
    oninput: refresh,
    onchange: refresh,
    onsubmit: async (e) => {
      e.preventDefault();
      clearErrors();
      const v = read();
      for (const f of inputs) if (hiddenInput(f)) v[f.name] = f.type === 'checkbox' ? false : null;
      const missing = inputs.filter((f) => f.required && v[f.name] == null && !hiddenInput(f));
      if (missing.length) {
        missing.forEach((f) => mark(f, t('Required.')));
        const labels = [...new Set(missing.map((f) => (f.lang ? `${f.label} (${f.lang.toUpperCase()})` : f.label)))];
        msg.textContent = t('Fill in: {fields}.', { fields: labels.join(', ') });
        return;
      }
      const problem = validate?.(v);
      if (problem) { msg.textContent = problem; return; }
      submitBtn.disabled = true;
      submitBtn.textContent = t('Saving…');
      markClean(el);
      try {
        await onSubmit(v);
      } catch (err) {
        if (!el.isConnected) { toast(err.message, 'bad'); return; }
        showError(err);
        markDirty(el);
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = submit;
      }
    },
  },
  h('div', { class: 'form-fields' }, fieldEls),
  h('div', { class: 'form-foot' }, submitBtn, cancel && button(t('Cancel'), cancel, { class: 'btn ghost' }), msg));
  refresh();
  return el;
}

// Re-rendering replaces the DOM. Inputs the user has typed into are marked
// dirty, and main.js copies their values into the new page so unsaved
// typing survives a background refresh.
export const markClean = (root) => root.querySelectorAll('[data-dirty]').forEach((x) => delete x.dataset.dirty);
const markDirty = (root) => root.querySelectorAll('input, select, textarea').forEach((x) => { x.dataset.dirty = '1'; });

// main.js registers the page renderer; views call rerender() for UI-only state changes.
let renderer = null;
export const setRenderer = (fn) => { renderer = fn; };
export const rerender = () => renderer?.();
