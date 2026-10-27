// Read helpers for scores and rules. All scoring itself happens on the server;
// this file only describes rules and finds levels for display.
import * as db from './store.js';
import * as api from './api.js';
import { fmt } from './dom.js';
import { t } from './i18n.js';

export const normalizations = () => ({
  criteria_lookup: {
    label: t('Criteria lookup'),
    description: t('A table of conditions and the score each one gives.'),
    example: t('Crack 0.5–2 mm → 3, roof “Leaking” → 1, alarm “No” → 1.'),
  },
  linear_min_max: {
    label: t('Linear between worst and best'),
    description: t('The worst value gets the lowest score, the best value the highest, proportional in between.'),
    example: t('Heat use: 250 or more → 1, 90 or less → 5, 170 → 3.'),
  },
  linear_target: {
    label: t('Linear towards a target'),
    description: t('Best at a target value, falling to the lowest score at a lower and an upper limit.'),
    example: t('Humidity: 45 % → 5, 20 % or 70 % → 1.'),
  },
  formula: {
    label: t('Formula'),
    description: t('A custom calculation. For experienced users.'),
    example: 'hi - x / 2',
  },
  none: {
    label: t('Use the answer as the score'),
    description: t('The raw number is the score. Only for answers already on the score scale.'),
    example: t('An expert rating from 1 to 5.'),
  },
});

export const aggregations = () => ({
  weighted_arithmetic_mean: { label: t('Weighted average'), description: t('Each child score × its weight, added up. Strong children can make up for weak ones. The usual choice.') },
  weighted_geometric_mean: { label: t('Weighted geometric mean'), description: t('Like an average, but one very low child pulls the group down more.') },
  weighted_harmonic_mean: { label: t('Weighted harmonic mean'), description: t('Even stricter than geometric: dominated by the weakest children.') },
  weighted_sum: { label: t('Weighted sum'), description: t('Child score × weight, added up without rescaling. Use when weights are points, not shares.') },
  min: { label: t('Minimum'), description: t('The group is as good as its weakest child. Weights are ignored.') },
  max: { label: t('Maximum'), description: t('The group is as good as its best child. Weights are ignored.') },
  custom_formula: { label: t('Custom formula'), description: t('A Python expression with s (child scores) and w (weights). For experienced users.') },
});

export const answerTypes = () => ({
  numeric: { label: t('Number'), description: t('A measured or counted value with a unit.'), example: t('Crack width in mm.') },
  single_choice: { label: t('Single choice'), description: t('Pick exactly one option from a list.'), example: t('Roof condition: good / minor wear / local damage / leaking.') },
  multi_choice: { label: t('Multiple choice'), description: t('Tick all options that apply. The lowest of their scores counts.'), example: t('Facade defects: stains, peeling, missing elements.') },
  boolean: { label: t('Yes / no'), description: t('A simple yes or no.'), example: t('Is a working fire alarm installed?') },
  scale_level: { label: t('Rating on a scale'), description: t('Pick a level of a rating scale.'), example: t('Facade appearance from 1 Unacceptable to 5 Excellent.') },
  text: { label: t('Free text'), description: t('A comment. Stored but never scored.'), example: t('Other remarks.') },
});

export const labelOf = (map, key) => map[key]?.label ?? key ?? '–';

const bySort = (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.id - b.id;

export function scaleOf(node) {
  const version = db.get('methodology_versions', node.version_id);
  return db.get('rating_scales', node.score_scale_id ?? version?.result_scale_id);
}

export function levelsOf(scale) {
  return scale ? db.all('scale_levels', (l) => l.scale_id === scale.id).sort((a, b) => a.value - b.value) : [];
}

export function nearestLevel(scale, score) {
  if (score == null) return null;
  let best = null;
  for (const l of levelsOf(scale)) if (!best || Math.abs(l.value - score) < Math.abs(best.value - score)) best = l;
  return best;
}

export function answerOf(response) {
  if (!response) return { option_ids: [] };
  return { ...response, option_ids: db.all('response_options', (o) => o.response_id === response.id).map((o) => o.option_id) };
}

export function hasAnswer(question, a) {
  switch (question.answer_type) {
    case 'numeric': return a.numeric_value != null;
    case 'boolean': return a.boolean_value != null;
    case 'single_choice': return a.option_id != null;
    case 'multi_choice': return (a.option_ids ?? []).length > 0;
    case 'scale_level': return a.scale_level_id != null;
    case 'text': return !!a.text_value;
    default: return false;
  }
}

export function criteriaOf(rule) {
  return rule ? db.all('score_criteria', (c) => c.scoring_rule_id === rule.id).sort(bySort) : [];
}

export function describeCondition(c, question) {
  const unit = db.get('units', question?.unit_id)?.code ?? '';
  if (c.option_id != null) return `= ${db.get('question_options', c.option_id)?.label ?? '?'}`;
  if (c.boolean_value != null) return `= ${c.boolean_value ? t('Yes') : t('No')}`;
  const from = c.range_from == null ? '−∞' : c.range_from;
  const to = c.range_to == null ? '∞' : c.range_to;
  return `${from} ≤ x < ${to}${unit ? ` ${unit}` : ''}`;
}

// The rule in plain words, for the "In plain words" box.
export function describeRule(rule, node, question) {
  if (!rule) return t('No scoring rule yet.');
  const scale = scaleOf(node);
  const lo = scale?.min_value ?? 0;
  const hi = scale?.max_value ?? 1;
  const unit = db.get('units', question?.unit_id)?.code ?? '';
  const u = (v) => `${v}${unit ? ` ${unit}` : ''}`;
  switch (rule.normalization_type) {
    case 'criteria_lookup': {
      const criteria = criteriaOf(rule);
      if (!criteria.length) return t('The answer is looked up in the score criteria below, but there are none yet.');
      const base = t('The answer is looked up in the score criteria ({count}); the first matching one gives the score.', { count: criteria.length });
      return question?.answer_type === 'multi_choice' ? `${base} ${t('With several options ticked, the lowest of their scores counts.')}` : base;
    }
    case 'linear_min_max': {
      if (rule.raw_min == null || rule.raw_max == null) return t('Set the worst and the best value.');
      const mid = (rule.raw_min + rule.raw_max) / 2;
      const direction = rule.raw_max > rule.raw_min ? t('Higher values are better.') : t('Lower values are better.');
      return `${t('{worst} or worse scores {lo}; {best} or better scores {hi}. In between the score grows in proportion: {mid} scores {midScore}.', {
        worst: u(rule.raw_min), lo, best: u(rule.raw_max), hi, mid: u(mid), midScore: fmt((lo + hi) / 2),
      })} ${direction}`;
    }
    case 'linear_target':
      if (rule.raw_min == null || rule.raw_max == null || rule.target_value == null) return t('Set the lower limit, the target and the upper limit.');
      return t('Exactly {target} scores {hi}. The score falls in a straight line to {lo} at {min} and at {max}, and stays {lo} beyond them.', {
        target: u(rule.target_value), hi, lo, min: u(rule.raw_min), max: u(rule.raw_max),
      });
    case 'formula':
      return rule.formula ? t('The score is calculated as {formula}, kept within {lo}–{hi}.', { formula: rule.formula, lo, hi }) : t('Write the formula.');
    case 'none':
      return t('The number entered is used as the score as it is.');
    default:
      return '';
  }
}

// "Try the rule": scores a trial answer on the server without saving it.
export const tryRule = (nodeId, answer) => api.post(`${db.urlOf('methodology_nodes', nodeId)}try-rule/`, answer);
