import * as db from '../store.js';
import { h, fmt } from '../dom.js';
import { scaleOf, nearestLevel } from '../scoring.js';
import { t } from '../i18n.js';

// Score + level + the criterion or note that explains it.
export function scoreBadge(node, res) {
  const scale = scaleOf(node);
  const level = nearestLevel(scale, res.score);
  const crit = db.get('score_criteria', res.criterion_id);
  const belowVeto = res.score != null && node.veto_threshold != null && res.score < node.veto_threshold;
  return h('div', { class: `score ${res.score == null ? 'none' : ''}` },
    h('span', { class: 'score-num' }, fmt(res.score)),
    h('span', { class: 'score-of' }, scale ? `/ ${scale.min_value}–${scale.max_value}` : ''),
    h('span', { class: 'score-text' },
      level && h('strong', {}, level.label),
      crit && h('span', {}, `${t('Criterion:')} ${crit.label ?? ''}${crit.description ? ` · ${crit.description}` : ''}`),
      res.note && h('span', { class: 'muted' }, res.note),
      belowVeto && h('span', { class: 'bad-text' }, t('Below the knock-out threshold of {threshold}: the parent fails.', { threshold: node.veto_threshold }))));
}
