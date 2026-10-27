// Help page: always available, even with helpers switched off.
import * as session from '../session.js';
import { h, link, pageHead, section, table, button, rerender, toast } from '../dom.js';
import { helpOn, setHelpOn, showAllTips, hiddenTipCount } from '../prefs.js';
import { glossary } from '../help.js';
import { t, languages, requiredLanguages } from '../i18n.js';

const step = (code, title, href, text) => h('li', { class: 'gstep' },
  h('span', { class: 'gcode' }, code),
  h('div', {}, h('h3', {}, href ? link(href, title) : title), h('p', {}, text)));

export default function helpView(focus) {
  const admin = session.usesAdmin();
  const hidden = hiddenTipCount();
  const page = h('div', { class: 'page' },
    pageHead(t('Help'), t('How the system works, the usual order of work, and what every term means.')),

    section(t('Helpers'), t('Explanations, examples and tips are shown on every page while helpers are on.'),
      h('div', { class: 'helper-settings' },
        h('p', {}, helpOn() ? t('Helpers are on.') : t('Helpers are off.'), ' ', t('Hidden tips: {count}.', { count: hidden })),
        h('div', { class: 'actions' },
          button(helpOn() ? t('Turn helpers off') : t('Turn helpers on'), () => { setHelpOn(!helpOn()); rerender(); }, { class: 'btn' }),
          button(t('Show all tips again'), () => { showAllTips(); toast(t('All tips will be shown again.')); rerender(); }, { class: 'btn', disabled: !hidden && helpOn() }))),
      h('p', { class: 'small muted' }, t('This setting is saved in this browser for your account.'))),

    section(t('Languages'), t('Switch the interface language with the EN / RU / KY buttons at the top. Data is shown in the same language.'),
      h('ul', { class: 'plain-list' },
        h('li', {}, t('Interface languages: {list}.', { list: languages().map((l) => `${l.name} (${l.code.toUpperCase()})`).join(', ') })),
        h('li', {}, t('Content such as questions, options and criteria must be entered in: {list}.', { list: requiredLanguages().map((c) => c.toUpperCase()).join(', ') })),
        h('li', {}, t('When a translation is missing, the English text is shown.')),
        admin && h('li', {}, t('Interface texts are translated in Rosetta:'), ' ', h('a', { href: '/rosetta/', target: '_blank', rel: 'noopener' }, '/rosetta/'), '.'))),

    section(t('The idea in one minute'), t('A methodology works like an exam.'),
      table([t('In an exam'), t('In this system')], [
        [t('The bank of exam questions'), t('The question library')],
        [t('The exam programme: which questions, how many points each'), t('A methodology: the property tree with weights')],
        [t('The answer key'), t('Score criteria: which answer earns which score')],
        [t('“Not admitted” for a critical failure'), t('A knock-out threshold')],
        [t('The grade on the certificate'), t('The total score and its level, e.g. 3.9 “Good”')],
      ])),

    admin && section(t('Admin: the usual order of work'), null,
      h('ol', { class: 'guide-list' },
        step('1', t('Catalogs'), '/admin/catalogs', t('Units, rating scales with levels, assessment methods, object types and objects. Usually set up once.')),
        step('2', t('Questions'), '/admin/questions', t('Write the question, choose the answer type, add options for choice questions. Questions carry no weights or scores.')),
        step('3', t('Methodology'), '/admin/methodologies', t('Create it for an object type with a result scale. Version 1.0 starts as a draft with an empty root group.')),
        step('4', t('Property tree'), '/admin/methodologies', t('Add groups and question nodes. Give siblings weights that add up to 1. Add knock-out thresholds for critical questions.')),
        step('5', t('How to assess'), '/admin/methodologies', t('For every question node, attach at least one assessment method with instructions and the evidence to collect.')),
        step('6', t('Scoring'), '/admin/methodologies', t('Pick the scoring rule and add score criteria. Check them with “Try the rule”.')),
        step('7', t('Check and publish'), '/admin/methodologies', t('The checklist on the version page lists every problem. When it is empty, publish. Published versions are read-only; “Create new version” makes an editable copy.')))),

    section(t('Respondent: filling in an assessment'), null,
      h('ol', { class: 'guide-list' },
        step('1', t('Start'), '/assessments/new', t('Click “New assessment” and choose a questionnaire or the object you are assessing. The newest published version of the questionnaire is used automatically.')),
        step('2', t('Answer'), null, t('Follow the “How to assess” instructions, enter the answer, the method used and evidence. Each answer is scored right away.')),
        step('3', t('Complete'), null, t('Completing checks that mandatory questions are answered, then calculates every group and the total.')),
        step('4', t('Read the result'), null, t('The breakdown shows every node with the answer and the criterion that explains its score.')),
        step('5', t('History'), '/history', t('Every assessment you have started stays in your history, with your answers and results.')))),

    section(t('Accounts and roles'), null,
      h('ul', { class: 'plain-list' },
        h('li', {}, h('strong', {}, t('Standard users')), ' – ', t('sign up themselves, fill in assessments and see their own history.')),
        h('li', {}, h('strong', {}, t('Admin')), ' – ', t('a staff role with full access to catalogs, questions, methodologies and all assessments, but not to users.')),
        h('li', {}, h('strong', {}, t('Superuser')), ' – ', t('manages users and roles in Django admin. New roles with narrower permissions can be added there at any time.')))),

    section(t('Worked example'), t('The example data contains this completed assessment of Block A.'),
      table([t('Question'), t('Answer'), t('Score'), t('Why')], [
        [t('Crack width'), '1.2 mm', '3', t('Criterion 0.5–2 mm: local cracks')],
        [t('Roof condition'), t('Minor wear'), '4', t('Criterion for this option')],
        [t('Fire alarm'), t('Yes'), '5', t('Installed and working')],
        [t('Heat consumption'), '150 kWh/m²·yr', '3.5', t('Linear: 250 → 1, 90 → 5')],
      ]),
      h('p', {}, t('Structural condition = 0.6 × 3 + 0.4 × 4 = 3.4. Fire safety = 5. Energy efficiency = 3.5.')),
      h('p', {}, t('Total = 0.5 × 3.4 + 0.3 × 5 + 0.2 × 3.5 = 3.9, “Good”.')),
      h('p', {}, t('House 7 has the same answers but no fire alarm. The alarm scores 1, below its knock-out threshold of 2, so the building fails even though its total is 2.7.'))),

    h('section', { class: 'block', id: 'glossary' },
      h('h2', {}, t('Glossary')),
      h('dl', { class: 'glossary' }, Object.entries(glossary()).map(([key, g]) => h('div', { class: `gterm ${key === focus ? 'focus' : ''}`, id: `term-${key}` },
        h('dt', {}, g.term),
        h('dd', {}, h('p', {}, g.text), g.example && h('p', { class: 'example' }, h('strong', {}, t('Example:')), ' ', g.example)))))));

  if (focus) requestAnimationFrame(() => document.getElementById(`term-${focus}`)?.scrollIntoView({ block: 'center' }));
  return page;
}
