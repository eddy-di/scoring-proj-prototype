import * as db from './store.js';
import * as session from './session.js';
import * as api from './api.js';
import { h, setRenderer, toast, navigate, languageSwitch, themeSwitch } from './dom.js';
import { helpOn, setHelpOn, loadPrefs } from './prefs.js';
import { t, loadLanguage, language, setLanguage } from './i18n.js';
import { routePath, logError, framed } from './security.js';
import { loginView, registerView, profileView } from './views/account.js';
import dashboard from './views/dashboard.js';
import helpView from './views/help.js';
import catalogsView from './views/admin-catalogs.js';
import { questionList, questionEditor } from './views/admin-questions.js';
import { methodologyList, versionView } from './views/admin-methodologies.js';
import { respondentHome, startView, historyView, fillView, resultView } from './views/respondent.js';
import dataView from './views/data.js';

// Pages guarded by a permission check. Screens check permissions, not role names.
const guard = (allowed, fn) => (m) => (allowed()
  ? fn(m)
  : h('div', { class: 'page' }, h('p', { class: 'check bad' }, t('Your role doesn’t give access to this page. Ask a superuser if you need it.'))));

const routes = [
  [/^\/$/, () => (session.usesAdmin() ? dashboard() : respondentHome())],
  [/^\/my$/, () => respondentHome()],
  [/^\/profile$/, () => profileView()],
  [/^\/help(?:\/(\w+))?$/, (m) => helpView(m[1])],
  [/^\/assessments\/new$/, () => startView('questionnaire')],
  [/^\/assessments\/new\/by-object$/, () => startView('object')],
  [/^\/(?:history|respondent)$/, () => historyView('mine')],
  [/^\/admin\/assessments$/, guard(session.seesAllAssessments, () => historyView('all'))],
  [/^\/admin\/catalogs(?:\/([\w-]+))?$/, guard(() => session.canManage('catalogs'), (m) => catalogsView(m[1]))],
  [/^\/admin\/questions$/, guard(() => session.canManage('library'), () => questionList())],
  [/^\/admin\/questions\/new$/, guard(() => session.canManage('library'), () => questionEditor(null))],
  [/^\/admin\/questions\/(\d+)$/, guard(() => session.canManage('library'), (m) => questionEditor(Number(m[1])))],
  [/^\/admin\/methodologies$/, guard(session.seesMethodologies, () => methodologyList())],
  [/^\/admin\/versions\/(\d+)(?:\/node\/(\d+))?$/, guard(session.seesMethodologies, (m) => versionView(Number(m[1]), m[2] ? Number(m[2]) : null))],
  [/^\/respondent\/assessments\/(\d+)$/, (m) => fillView(Number(m[1]))],
  [/^\/respondent\/assessments\/(\d+)\/result$/, (m) => resultView(Number(m[1]))],
  [/^\/data(?:\/(\w+))?$/, guard(session.isStaff, (m) => dataView(m[1]))],
];

function nav() {
  const adminItems = [
    session.canManage('catalogs') && ['/admin/catalogs', t('Catalogs')],
    session.canManage('library') && ['/admin/questions', t('Questions')],
    session.seesMethodologies() && ['/admin/methodologies', t('Methodologies')],
    session.seesAllAssessments() && ['/admin/assessments', t('All assessments')],
  ].filter(Boolean);
  return [
    session.usesAdmin() && [null, [['/', t('Dashboard')]]],
    adminItems.length && [t('Admin'), adminItems],
    [t('My work'), [[session.usesAdmin() ? '/my' : '/', t('My assessments')], ['/assessments/new', t('New assessment')], ['/history', t('History')]]],
    [null, [session.isStaff() && ['/data', t('Data tables')], ['/help', t('Help')]].filter(Boolean)],
  ].filter(Boolean);
}

const ACTIVE = { '/admin/versions': '/admin/methodologies', '/respondent/': '/history', '/assessments/new/': '/assessments/new', '/data/': '/data', '/help/': '/help', '/admin/catalogs/': '/admin/catalogs' };

function isActive(path, href) {
  if (href === '/') return path === '/';
  if (path === href || path.startsWith(`${href}/`)) return true;
  return Object.entries(ACTIVE).some(([prefix, target]) => target === href && path.startsWith(prefix));
}

function helpersSwitch() {
  const on = helpOn();
  return h('label', { class: 'switch', title: on ? t('Hide the explanations and tips') : t('Show explanations and tips') },
    h('input', { type: 'checkbox', role: 'switch', id: 'helpers-switch', checked: on, onchange: (e) => { setHelpOn(e.target.checked); render(); } }),
    h('span', { class: 'switch-track', 'aria-hidden': 'true' }),
    h('span', {}, t('Helpers'), ' ', h('strong', {}, on ? t('on') : t('off'))));
}

function resetButton() {
  if (!session.isStaff() || !session.current().demo_reset_enabled) return null;
  return h('button', {
    type: 'button', class: 'btn small ghost',
    title: t('Replace all data on the server with the example data'),
    onclick: async (e) => {
      const b = e.currentTarget;
      if (!b.dataset.armed) {
        b.dataset.armed = '1';
        b.textContent = t('Click again: deletes everyone’s changes');
        return;
      }
      b.disabled = true;
      try {
        await api.post('/api/demo/reset/');
        db.clear();
        await db.load();
        toast(t('Example data restored.'));
        navigate('/');
      } catch (err) {
        toast(err.message, 'bad');
      }
    },
  }, t('Reset demo data'));
}

function userMenu() {
  const u = session.current();
  const role = u.is_superuser ? t('superuser') : (u.roles.join(', ') || t('standard user'));
  return h('div', { class: 'user' },
    session.isSuperuser() && h('a', { class: 'btn small ghost', href: '/admin/accounts/user/', target: '_blank', rel: 'noopener', title: t('Users and roles are managed in Django admin') }, t('Users and roles')),
    h('a', { class: 'user-name', href: '#/profile', title: t('Profile') }, u.display_name, ' ', h('span', { class: 'chip muted' }, role)),
    h('button', {
      type: 'button', class: 'btn small ghost',
      onclick: async () => {
        await session.logout();
        db.clear();
        location.hash = '/';
        render();
      },
    }, t('Sign out')));
}

function layout(path, view) {
  return [
    h('header', { class: 'topbar' },
      h('a', { class: 'brand', href: '#/' }, h('span', { class: 'brand-mark' }, 'Q'), 'Qualimetry'),
      h('nav', { class: 'nav' }, nav().map(([group, items]) => h('div', { class: 'nav-group' },
        group && h('span', { class: 'nav-label' }, group),
        items.map(([href, label]) => h('a', { href: `#${href}`, class: isActive(path, href) ? 'active' : '' }, label))))),
      h('div', { class: 'topbar-end' },
        h('span', { class: `saving ${db.isBusy() ? 'on' : ''}`, id: 'saving', 'aria-live': 'polite' }, db.isBusy() ? t('Saving…') : ''),
        languageSwitch(),
        themeSwitch(),
        helpersSwitch(),
        resetButton(),
        userMenu())),
    h('main', { class: 'content' }, view),
  ];
}

const app = document.getElementById('app');
let lastPath = null;
let booted = false;

// Values typed into inputs that haven't been saved yet, by element id.
function dirtyValues() {
  const out = new Map();
  app.querySelectorAll('[data-dirty]').forEach((el) => {
    if (el.id) out.set(el.id, el.type === 'checkbox' || el.type === 'radio' ? { checked: el.checked } : { value: el.value });
  });
  return out;
}

function restore(values) {
  for (const [id, v] of values) {
    const el = document.getElementById(id);
    if (!el) continue;
    if ('checked' in v) el.checked = v.checked;
    else el.value = v.value;
    el.dataset.dirty = '1';
    el.closest('form')?.dispatchEvent(new Event('input'));
  }
}

function render() {
  if (!booted) return;
  // Malformed or foreign hashes (e.g. "#javascript:…", "#//evil.example") are never routed.
  const path = routePath(location.hash.slice(1) || '/');
  if (!session.current().authenticated) {
    const signedIn = async () => {
      const preferred = session.current().profile?.preferred_language;
      // Signing in switches to the user's language: the server has set the cookie, reload to apply it.
      if (preferred && preferred !== language()) { navigate('/'); setLanguage(preferred); return; }
      loadPrefs(session.current().username);
      await db.load();
      navigate('/');
      render();
    };
    app.replaceChildren(path === '/register' ? registerView(signedIn) : loginView(signedIn));
    return;
  }
  const samePage = path === lastPath;
  const focusId = document.activeElement?.id;
  const y = window.scrollY;
  const typed = samePage ? dirtyValues() : new Map();
  let view;
  try {
    const route = path && routes.find(([re]) => re.test(path));
    view = route ? route[1](path.match(route[0])) : h('div', { class: 'page' }, h('p', {}, t('Page not found.'), ' '), h('a', { href: '#/' }, t('Go to the start page')));
  } catch (e) {
    logError(`render ${path}`, e);
    view = h('div', { class: 'check bad' }, h('strong', {}, t('This page failed to render:'), ' '), e.message);
  }
  app.replaceChildren(...layout(path ?? '', view));
  restore(typed);

  // Re-rendering replaces the DOM; keep the reader's place when staying on the same page.
  if (samePage) {
    window.scrollTo(0, y);
    if (focusId) document.getElementById(focusId)?.focus({ preventScroll: true });
  } else {
    window.scrollTo(0, 0);
  }
  lastPath = path;
}

// Inputs the user types into keep their value across re-renders until submitted.
document.addEventListener('input', (e) => {
  if (e.target.matches?.('input, select, textarea') && e.target.id !== 'helpers-switch') e.target.dataset.dirty = '1';
});

// Clickjacking: don't run inside another site's frame. The server also sends
// X-Frame-Options: DENY; this covers static hosting that doesn't.
function frameWarning() {
  return h('div', { class: 'page' }, h('div', { class: 'check bad' },
    h('strong', {}, t('This app can’t be used inside a frame.'), ' '),
    h('a', { href: location.origin + location.pathname, target: '_blank' }, t('Open it in its own window'))));
}

async function boot() {
  if (framed()) {
    app.replaceChildren(frameWarning());
    return;
  }
  app.replaceChildren(h('p', { class: 'loading' }, '…'));
  try {
    const user = await session.load();
    await loadLanguage(user);
    if (user.authenticated) {
      loadPrefs(user.username);
      await db.load();
    }
  } catch (err) {
    app.replaceChildren(h('div', { class: 'page' }, h('div', { class: 'check bad' },
      h('strong', {}, t('The app could not start.'), ' '), err.message,
      h('p', { class: 'small' }, t('Open the app from the Django server (python manage.py runserver, then http://localhost:8000), not from a file or another web server.')))));
    return;
  }
  booted = true;
  render();
}

setRenderer(render);
db.onChange(render);
db.onBusy((on) => {
  const el = document.getElementById('saving');
  if (!el) return;
  el.textContent = on ? t('Saving…') : '';
  el.classList.toggle('on', on);
});
window.addEventListener('hashchange', render);
boot();
