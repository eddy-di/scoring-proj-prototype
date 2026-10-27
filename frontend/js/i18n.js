// Interface language.
//
// Texts are written in English inside t('…'). Their translations live in the
// backend's locale/<lang>/LC_MESSAGES/djangojs.po (edit them in Rosetta at
// /rosetta/; "python manage.py frontend_messages" collects new t('…') texts).
// The chosen language is stored in Django's django_language cookie, so the API
// returns content and messages in the same language.
import { get } from './api.js';

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
  const found = Object.hasOwn(catalog, text) ? catalog[text] : null;
  const out = typeof found === 'string' && found ? found : text;
  return params ? out.replace(/\{(\w+)\}/g, (m, key) => (Object.hasOwn(params, key) ? params[key] ?? m : m)) : out;
}

export async function loadLanguage(me) {
  settings = { ...settings, ...me };
  document.documentElement.lang = settings.language;
  if (settings.language === settings.default_language) {
    catalog = {};
    return;
  }
  try {
    const found = (await get('/api/i18n/catalog/'))?.catalog;
    catalog = found && typeof found === 'object' ? found : {};
  } catch {
    catalog = {}; // Untranslated English texts are still usable.
  }
}

export const language = () => settings.language;
export const languages = () => settings.languages;
export const defaultLanguage = () => settings.default_language;
export const requiredLanguages = () => settings.required_languages;
export const languageName = (code) => settings.languages.find((l) => l.code === code)?.name ?? code;

// { field: required } for the translated fields of a schema table, e.g. questions → { text: true, description: false }.
export const translatedFields = (table) => settings.translated_fields[table] ?? {};

// Only languages the server offers end up in the cookie.
export function setLanguage(code) {
  if (!settings.languages.some((l) => l.code === code)) return;
  const secure = location.protocol === 'https:' ? '; Secure' : '';
  document.cookie = `django_language=${encodeURIComponent(code)}; path=/; max-age=31536000; SameSite=Lax${secure}`;
  location.reload();
}

// Dates in the interface language.
export const formatDate = (iso) => (iso ? new Date(iso).toLocaleDateString(settings.language) : '–');
export const formatDateTime = (iso) => (iso ? new Date(iso).toLocaleString(settings.language) : '–');
