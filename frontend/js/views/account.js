// Accounts: sign in, sign up and the profile page.
import * as session from '../session.js';
import { h, form, link, pageHead, section, languageSwitch, themeSwitch, toast, chip } from '../dom.js';
import { t, languages, language, setLanguage, formatDate } from '../i18n.js';
import { help } from '../help.js';

const card = (...children) => h('div', { class: 'login' }, h('div', { class: 'login-card' },
  h('div', { class: 'login-top' },
    h('div', { class: 'brand big' }, h('span', { class: 'brand-mark' }, 'Q'), 'Qualimetry'),
    h('div', { class: 'switches' }, languageSwitch(), themeSwitch())),
  children));

export function loginView(onSignedIn) {
  return card(
    h('h1', {}, t('Sign in')),
    h('p', { class: 'muted' }, t('Use your account to open your assessments or the admin dashboard.')),
    form({
      id: 'login', submit: t('Sign in'), layout: 'stacked',
      fields: [
        { name: 'username', label: t('Username'), required: true },
        { name: 'password', label: t('Password'), type: 'password', required: true },
      ],
      onSubmit: async (v) => {
        await session.login(v.username, v.password);
        await onSignedIn();
      },
    }),
    h('p', {}, t('New here?'), ' ', link('/register', t('Create an account'))),
    h('div', { class: 'demo-accounts' },
      h('p', { class: 'eyebrow' }, t('Demo accounts')),
      h('ul', {},
        h('li', {}, h('code', {}, 'expert'), ' / ', h('code', {}, 'expert'), ' – ', t('standard user: fills in assessments')),
        h('li', {}, h('code', {}, 'admin'), ' / ', h('code', {}, 'admin'), ' – ', t('Admin role: catalogs, questions, methodologies, all assessments')),
        h('li', {}, h('code', {}, 'root'), ' / ', h('code', {}, 'root'), ' – ', t('superuser: also manages users and roles in Django admin'))),
      h('p', { class: 'small muted' }, t('Created with “python manage.py setup_demo”.'))));
}

const languageOptions = () => languages().map((l) => ({ value: l.code, label: l.name }));

export function registerView(onSignedIn) {
  return card(
    h('h1', {}, t('Create an account')),
    h('p', { class: 'muted' }, t('With an account you can fill in assessments and keep the history of your answers.')),
    form({
      id: 'register', submit: t('Create account'), layout: 'stacked',
      fields: [
        { name: 'username', label: t('Username'), required: true, hint: t('Letters, digits and @ . + - _ only.') },
        { name: 'email', label: t('Email'), type: 'email', required: true },
        { name: 'first_name', label: t('First name') },
        { name: 'last_name', label: t('Last name') },
        { name: 'organization', label: t('Organization') },
        { name: 'preferred_language', label: t('Language'), type: 'select', required: true, value: language(), options: languageOptions() },
        { name: 'password', label: t('Password'), type: 'password', required: true, hint: t('At least 8 characters; not only digits and not a common password.') },
        { name: 'password2', label: t('Repeat the password'), type: 'password', required: true },
      ],
      validate: (v) => (v.password !== v.password2 ? t('The passwords don’t match.') : null),
      onSubmit: async (v) => {
        const { password2, ...data } = v;
        Object.keys(data).forEach((k) => { if (data[k] == null) data[k] = ''; });
        await session.register(data);
        await onSignedIn();
      },
    }),
    h('p', {}, t('Already have an account?'), ' ', link('/', t('Sign in'))));
}

export function profileView() {
  const u = session.current();
  const p = u.profile ?? {};
  return h('div', { class: 'page' },
    pageHead(t('Profile'), t('Your details, language and password.')),

    h('section', { class: 'block profile-head' },
      h('div', { class: 'avatar', 'aria-hidden': 'true' }, (u.display_name ?? '?').slice(0, 1).toUpperCase()),
      h('div', {},
        h('h2', {}, u.display_name),
        h('p', { class: 'muted' }, `@${u.username}`, p.email && ` · ${p.email}`),
        h('p', {},
          u.is_superuser && chip(t('superuser'), 'warn'),
          u.roles.length ? u.roles.map((r) => chip(r, 'info')) : !u.is_superuser && chip(t('standard user'), 'muted'),
          ' ', h('span', { class: 'small muted' }, t('Member since {date}', { date: formatDate(p.date_joined) })))),
      h('div', { class: 'tiles compact' },
        h('a', { class: 'tile', href: '#/history' }, h('span', { class: 'eyebrow' }, t('Assessments')), h('strong', { class: 'tile-num' }, String(u.stats?.assessments ?? 0))),
        h('a', { class: 'tile', href: '#/history' }, h('span', { class: 'eyebrow' }, t('Completed')), h('strong', { class: 'tile-num' }, String(u.stats?.completed ?? 0))))),

    help(u.roles.length || u.is_superuser
      ? t('Your roles decide which parts of the admin dashboard you can use. A superuser changes roles in Django admin.')
      : t('You are a standard user: you can fill in assessments and see your own history. Ask an administrator if you need access to the admin dashboard.')),

    section(t('Personal details'), null,
      form({
        id: 'profile', submit: t('Save'), layout: 'stacked',
        fields: [
          { name: 'first_name', label: t('First name'), value: p.first_name },
          { name: 'last_name', label: t('Last name'), value: p.last_name },
          { name: 'email', label: t('Email'), type: 'email', required: true, value: p.email },
          { name: 'organization', label: t('Organization'), value: p.organization },
          { name: 'position', label: t('Position'), value: p.position },
          { name: 'phone', label: t('Phone'), value: p.phone },
          { name: 'preferred_language', label: t('Language'), type: 'select', required: true, value: p.preferred_language, options: languageOptions(), help: t('The interface switches to this language whenever you sign in.') },
        ],
        onSubmit: async (v) => {
          const data = Object.fromEntries(Object.entries(v).map(([k, x]) => [k, x ?? '']));
          await session.updateProfile(data);
          toast(t('Profile saved.'));
          if (data.preferred_language !== language()) setLanguage(data.preferred_language);
        },
      })),

    section(t('Password'), null,
      form({
        id: 'password', submit: t('Change password'), layout: 'stacked',
        fields: [
          { name: 'current_password', label: t('Current password'), type: 'password', required: true },
          { name: 'new_password', label: t('New password'), type: 'password', required: true, hint: t('At least 8 characters; not only digits and not a common password.') },
          { name: 'new_password2', label: t('Repeat the new password'), type: 'password', required: true },
        ],
        validate: (v) => (v.new_password !== v.new_password2 ? t('The passwords don’t match.') : null),
        onSubmit: async (v) => {
          await session.changePassword({ current_password: v.current_password, new_password: v.new_password });
          document.querySelectorAll('#password input').forEach((i) => { i.value = ''; });
          toast(t('Password changed.'));
        },
      })));
}
