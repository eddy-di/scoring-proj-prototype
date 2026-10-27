// Helpers for new admins: tips, inline help, glossary terms.
// Everything here disappears when the "Helpers" switch in the top bar is off,
// except the Help page itself.
import { h, button, rerender, link } from './dom.js';
import { helpOn, tipHidden, hideTip } from './prefs.js';
import { t } from './i18n.js';

// A dismissible explanation box. `id` must be stable: hidden tips are remembered.
export function tip(id, title, ...body) {
  if (!helpOn() || tipHidden(id)) return null;
  return h('aside', { class: 'tip', 'aria-label': `${t('Tip')}: ${title}` },
    h('div', { class: 'tip-head' },
      h('span', { class: 'tip-icon', 'aria-hidden': 'true' }, '?'),
      h('strong', {}, title),
      button(t('Hide this tip'), () => { hideTip(id); rerender(); }, { class: 'btn small ghost tip-hide' })),
    h('div', { class: 'tip-body' }, body));
}

// A sentence of help in the flow of the page.
export const help = (...content) => (helpOn() ? h('p', { class: 'help' }, content) : null);

// "Example: …" box.
export const example = (...content) => (helpOn() ? h('p', { class: 'example' }, h('strong', {}, t('Example:')), ' ', content) : null);

// Numbered how-to list.
export const steps = (...items) => (helpOn() ? h('ol', { class: 'help-steps' }, items.map((i) => h('li', {}, i))) : null);

// A glossary word: underlined with its definition on hover, links to the glossary.
export function term(key, label) {
  const g = glossary()[key];
  const text = label ?? g?.term ?? key;
  if (!helpOn() || !g) return text;
  return link(`/help/${key}`, text, { class: 'term', title: g.short });
}

// "Saved in table X" note for people who also look at the database.
export const stored = (...tables) => (helpOn()
  ? h('p', { class: 'stored' }, t('Saved in'), ' ', tables.map((x, i) => [i ? ', ' : '', h('code', {}, x)]))
  : null);

export const glossary = () => ({
  methodology: {
    term: t('Methodology'),
    short: t('A complete scoring scheme: which questions are asked, how important each is and how answers become scores.'),
    text: t('The rule book for assessing one kind of object. It arranges questions from the library into a tree, gives each part a weight and says how every answer is turned into a score. Methodologies have versions.'),
    example: t('“Technical condition of residential buildings” (TECH_RES) checks structure, fire safety and energy efficiency.'),
  },
  version: {
    term: t('Version'),
    short: t('A snapshot of a methodology. Drafts can be edited; published versions are locked.'),
    text: t('All the content of a methodology lives in a version. A draft can be changed freely. Publishing locks it so that every assessment made with it can always be recalculated and explained. To change a published version, create a new version: it starts as an editable copy.'),
    example: t('TECH_RES v1.0 is published. “Create new version” makes v1.1 as a draft.'),
  },
  draft: {
    term: t('Draft / Published / Archived'),
    short: t('Draft = editable, not usable. Published = locked, usable for assessments. Archived = retired.'),
    text: t('Draft: you are still working on it; respondents can’t use it. Published: read-only; respondents can start assessments with it. Archived: no longer offered for new assessments, but old assessments keep pointing to it.'),
  },
  tree: {
    term: t('Property tree'),
    short: t('The structure of a methodology: groups that contain sub-groups and questions.'),
    text: t('Quality is broken down step by step: the whole building → groups like “Structural condition” → the individual questions. Scores are calculated from the bottom up: questions first, then their groups, then the root.'),
    example: t('Building quality → Structural condition → Crack width.'),
  },
  node: {
    term: t('Node'),
    short: t('One element of the tree: either a group or a question.'),
    text: t('A group node combines the scores of the nodes inside it. A question node is a leaf: it links one question from the library and scores its answer. The single node at the top is the root; its score is the final result.'),
  },
  weight: {
    term: t('Weight'),
    short: t('How important a node is compared with its siblings. Siblings’ weights add up to 1.'),
    text: t('Weights are shares. Nodes directly under the same group must add up to 1 (100 %). A weight of 0.5 means the node makes up half of its group’s score.'),
    example: t('Structural condition 0.5 + Fire safety 0.3 + Energy efficiency 0.2 = 1.'),
  },
  aggregation: {
    term: t('Aggregation'),
    short: t('How a group combines the scores of its children, usually a weighted average.'),
    text: t('The formula a group uses to turn its children’s scores into its own score. The weighted average is the usual choice: multiply each child score by its weight and add them up. “Minimum” makes the group as good as its weakest child.'),
    example: t('Structural condition = 0.6 × 3 (cracks) + 0.4 × 4 (roof) = 3.4.'),
  },
  veto: {
    term: t('Knock-out threshold'),
    short: t('A minimum score. Below it, the whole object fails regardless of its total.'),
    text: t('Some requirements are critical: no average can make up for them. If a node scores below its knock-out threshold, its parent group is marked as failed, and the failure travels up to the root.'),
    example: t('Fire alarm has a threshold of 2. A missing alarm scores 1, so the building fails even with a total of 2.7.'),
  },
  rule: {
    term: t('Scoring rule'),
    short: t('How the raw answer of a question node becomes a score.'),
    text: t('Every question node has one rule. The most common is a criteria lookup: a table of conditions (“from 0.5 to 2 mm”) and the score each gives. For measured values you can also use a linear rule that scales the value between a worst and a best value.'),
  },
  criteria: {
    term: t('Score criteria'),
    short: t('Rows of “if the answer is …, the score is …”.'),
    text: t('The answer key of a criteria-lookup rule. Numeric ranges include the lower bound and exclude the upper bound, so 0.5–2 matches 0.5 but not 2. Ranges must not overlap or leave gaps. Choice and yes/no questions need one criterion per possible answer.'),
    example: t('Crack width 0.5–2 mm → score 3, “Local cracks: local repair required”.'),
  },
  scale: {
    term: t('Rating scale'),
    short: t('The measuring stick for scores, e.g. 1–5 with named levels.'),
    text: t('Defines the range of scores and names the important points on it (levels). The version has a result scale for the final score; nodes use it too unless they have their own.'),
    example: t('5-point quality: 1 Unacceptable, 2 Poor, 3 Satisfactory, 4 Good, 5 Excellent.'),
  },
  level: {
    term: t('Scale level'),
    short: t('A named point on a scale, e.g. 4 = Good.'),
    text: t('Levels turn numbers into words. A score of 3.9 is shown with the nearest level, “Good”.'),
  },
  method: {
    term: t('Assessment method'),
    short: t('How a value is obtained: measuring, inspecting, reading documents…'),
    text: t('The mechanics of getting an answer. On each question node you attach one or more methods with step-by-step instructions and the evidence to collect, so different respondents assess the same way.'),
    example: t('Crack width: measure with a crack-width gauge; evidence: photo of the gauge at the widest crack.'),
  },
  object_type: {
    term: t('Object type / Object'),
    short: t('Object type = the kind of thing assessed. Object = one concrete thing.'),
    text: t('A methodology is written for one object type, e.g. residential buildings. Objects are the actual things respondents assess, e.g. “Block A, Riverside residential complex”.'),
  },
  question: {
    term: t('Question (library)'),
    short: t('What is asked and what kind of answer is valid. No weights or scores.'),
    text: t('Questions live in a shared library so they can be reused by many methodologies. A question only defines the wording and the answer type (number, choice, yes/no…). How important it is and how it is scored is decided inside each methodology.'),
  },
  answer_type: {
    term: t('Answer type'),
    short: t('The kind of answer: number, single choice, multiple choice, yes/no, scale level or text.'),
    text: t('Decides which input the respondent sees and which kinds of score criteria are possible. It can’t be changed once a published methodology uses the question.'),
  },
  assessment: {
    term: t('Assessment'),
    short: t('One methodology version applied to one object, with its answers and results.'),
    text: t('Respondents fill in assessments. Each answer is scored immediately; completing the assessment calculates every group and the final score.'),
    example: t('Block A, October 2026 inspection: total 3.9, “Good”.'),
  },
  translation: {
    term: t('Translations'),
    short: t('Content is stored in every interface language; English is the main one.'),
    text: t('Names, questions, options, levels, criteria and instructions are entered in every language the system uses. Languages marked with * are required. When an optional translation is missing, the English text is shown instead.'),
    example: t('Question text: EN “Is an automatic fire alarm installed?”, RU and KY in their own words.'),
  },
});
