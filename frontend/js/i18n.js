// Interface language.
//
// Texts are written in English inside t('…'). Their translations live in the
// backend's locale/<lang>/LC_MESSAGES/djangojs.po (edit them in Rosetta at
// /rosetta/; "python manage.py frontend_messages" collects new t('…') texts).
// The chosen language is stored in Django's django_language cookie, so the API
// returns content and messages in the same language.

let catalog = {};
let settings = {
  language: 'en',
  languages: [{ code: 'en', name: 'English' }],
  default_language: 'en',
  required_languages: ['en'],
  translated_fields: {},
};

// t('Saved {name}.', { name }) → the translation, with {placeholders} filled in.
export function t(text, params) {
  const found = catalog[text];
  const out = typeof found === 'string' && found ? found : text;
  return params ? out.replace(/\{(\w+)\}/g, (m, key) => (params[key] ?? m)) : out;
}

export async function loadLanguage(me) {
  settings = { ...settings, ...me };
  document.documentElement.lang = settings.language;
  if (settings.language === settings.default_language) {
    catalog = {};
    return;
  }
  const res = await fetch('/api/i18n/catalog/', { credentials: 'same-origin' });
  catalog = res.ok ? (await res.json()).catalog ?? {} : {};
}

export const language = () => settings.language;
export const languages = () => settings.languages;
export const defaultLanguage = () => settings.default_language;
export const requiredLanguages = () => settings.required_languages;
export const languageName = (code) => settings.languages.find((l) => l.code === code)?.name ?? code;

// { field: required } for the translated fields of a schema table, e.g. questions → { text: true, description: false }.
export const translatedFields = (table) => settings.translated_fields[table] ?? {};

export function setLanguage(code) {
  document.cookie = `django_language=${code}; path=/; max-age=31536000; SameSite=Lax`;
  location.reload();
}

// Dates in the interface language.
export const formatDate = (iso) => (iso ? new Date(iso).toLocaleDateString(settings.language) : '–');
export const formatDateTime = (iso) => (iso ? new Date(iso).toLocaleString(settings.language) : '–');
