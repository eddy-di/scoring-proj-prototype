"""Scoring engine: turns a raw answer into a score using scoring_rules + score_criteria,
and combines child scores with a node's aggregation type.

Same rules as the frontend prototype (frontend/js/scoring.js):
- multi_choice criteria lookup: the lowest score among the selected options applies;
- linear_min_max: raw_min is the worst value and raw_max the best, in either direction;
- the score of a linear or formula rule is mapped onto the node scale [lo, hi];
- a fractional score maps to the nearest level of its scale.
"""
from dataclasses import dataclass, field

from django.utils.translation import gettext as _

from library.models import AnswerType

from . import formulas
from .models import AggregationType, NormalizationType


def _f(value):
    return None if value is None else float(value)


def _clamp(x, lo, hi):
    return min(hi, max(lo, x))


def _fmt(value, digits=1):
    return f'{value:.{digits}f}'.rstrip('0').rstrip('.')


@dataclass
class Answer:
    """The answer scoring works on: the value columns of `responses` plus multi-choice options."""

    numeric_value: float | None = None
    boolean_value: bool | None = None
    option_id: int | None = None
    option_ids: list[int] = field(default_factory=list)
    scale_level_id: int | None = None
    text_value: str | None = None
    is_not_applicable: bool = False

    @classmethod
    def from_response(cls, response):
        if response is None:
            return cls()
        return cls(
            numeric_value=_f(response.numeric_value),
            boolean_value=response.boolean_value,
            option_id=response.option_id,
            option_ids=list(response.selected_options.values_list('option_id', flat=True)) if response.pk else [],
            scale_level_id=response.scale_level_id,
            text_value=response.text_value,
            is_not_applicable=response.is_not_applicable,
        )


@dataclass
class ScoreResult:
    score: float | None
    criterion: object = None  # ScoreCriterion
    note: str | None = None


def nearest_level(scale, score):
    """The scale level whose value is closest to the score."""
    if scale is None or score is None:
        return None
    return min(scale.levels.all(), key=lambda level: abs(float(level.value) - score), default=None)


def has_answer(question, a):
    match question.answer_type:
        case AnswerType.NUMERIC:
            return a.numeric_value is not None
        case AnswerType.BOOLEAN:
            return a.boolean_value is not None
        case AnswerType.SINGLE_CHOICE:
            return a.option_id is not None
        case AnswerType.MULTI_CHOICE:
            return bool(a.option_ids)
        case AnswerType.SCALE_LEVEL:
            return a.scale_level_id is not None
        case AnswerType.TEXT:
            return bool(a.text_value)
    return False


def raw_number(question, a):
    """The answer as a number, where that makes sense (numeric, scale level, boolean as 1/0)."""
    if question.answer_type == AnswerType.NUMERIC:
        return a.numeric_value
    if question.answer_type == AnswerType.SCALE_LEVEL and a.scale_level_id is not None:
        from catalogs.models import ScaleLevel
        level = ScaleLevel.objects.filter(pk=a.scale_level_id).first()
        return _f(level.value) if level else None
    if question.answer_type == AnswerType.BOOLEAN and a.boolean_value is not None:
        return 1.0 if a.boolean_value else 0.0
    return None


def criterion_matches(c, question, a, x):
    if question.answer_type in (AnswerType.NUMERIC, AnswerType.SCALE_LEVEL):
        return (x is not None
                and (c.range_from is None or x >= float(c.range_from))
                and (c.range_to is None or x < float(c.range_to)))
    if question.answer_type == AnswerType.SINGLE_CHOICE:
        return c.option_id == a.option_id
    if question.answer_type == AnswerType.BOOLEAN:
        return c.boolean_value is not None and c.boolean_value == a.boolean_value
    return False


def describe_condition(c, question=None):
    """Human-readable condition of a criterion, e.g. '0.5 ≤ x < 2 mm' or '= Leaking'."""
    if c.option_id is not None:
        return f'= {c.option.label}'
    if c.boolean_value is not None:
        return '= ' + (_('Yes') if c.boolean_value else _('No'))
    unit = f' {question.unit.code}' if question is not None and question.unit_id else ''
    lo = '−∞' if c.range_from is None else f'{float(c.range_from):g}'
    hi = '∞' if c.range_to is None else f'{float(c.range_to):g}'
    return f'{lo} ≤ x < {hi}{unit}'


def score_answer(node, a):
    """Scores one answer for a question node."""
    question = node.question
    rule = getattr(node, 'scoring_rule', None)
    if question is None:
        return ScoreResult(None, note=_('No question linked to this node.'))
    if a.is_not_applicable:
        return ScoreResult(None, note=_('Not applicable: left out of the calculation.'))
    if question.answer_type == AnswerType.TEXT:
        return ScoreResult(None, note=_('Text answers are stored but not scored.'))
    if not has_answer(question, a):
        return ScoreResult(None, note=_('Not answered yet.'))
    if rule is None or not rule.normalization_type:
        return ScoreResult(None, note=_('No scoring rule is defined for this node.'))

    scale = node.scale
    lo = _f(scale.min_value) if scale and scale.min_value is not None else 0.0
    hi = _f(scale.max_value) if scale and scale.max_value is not None else 1.0
    x = raw_number(question, a)
    raw_min, raw_max, target = _f(rule.raw_min), _f(rule.raw_max), _f(rule.target_value)

    match rule.normalization_type:
        case NormalizationType.CRITERIA_LOOKUP:
            criteria = list(rule.criteria.all())
            if question.answer_type == AnswerType.MULTI_CHOICE:
                by_option = {}
                for c in criteria:
                    by_option.setdefault(c.option_id, c)
                matched = [by_option[oid] for oid in a.option_ids if oid in by_option]
                if not matched:
                    return ScoreResult(None, note=_('No criterion matches the selected options.'))
                worst = min(matched, key=lambda c: c.score)
                note = _('The lowest score of the %(count)s selected options applies.') % {'count': len(matched)} if len(matched) > 1 else None
                return ScoreResult(float(worst.score), worst, note)
            c = next((c for c in criteria if criterion_matches(c, question, a, x)), None)
            if c is None:
                return ScoreResult(None, note=_('No criterion matches this answer.'))
            return ScoreResult(float(c.score), c)

        case NormalizationType.LINEAR_MIN_MAX:
            if x is None:
                return ScoreResult(None, note=_('Linear rules need a numeric answer.'))
            if raw_min is None or raw_max is None or raw_min == raw_max:
                return ScoreResult(None, note=_('The rule needs different worst and best values.'))
            f = _clamp((x - raw_min) / (raw_max - raw_min), 0, 1)
            return ScoreResult(lo + f * (hi - lo), note=(
                _('%(percent)s %% of the way from the worst value (%(worst)s) to the best (%(best)s).')
                % {'percent': _fmt(f * 100), 'worst': f'{raw_min:g}', 'best': f'{raw_max:g}'}))

        case NormalizationType.LINEAR_TARGET:
            if x is None:
                return ScoreResult(None, note=_('Linear rules need a numeric answer.'))
            if None in (target, raw_min, raw_max) or not raw_min < target < raw_max:
                return ScoreResult(None, note=_('The target must lie between the lower and the upper limit.'))
            f = (x - raw_min) / (target - raw_min) if x <= target else (raw_max - x) / (raw_max - target)
            f = _clamp(f, 0, 1)
            return ScoreResult(lo + f * (hi - lo), note=(
                _('Distance to the target %(target)s: %(percent)s %% of the tolerance used.')
                % {'target': f'{target:g}', 'percent': _fmt((1 - f) * 100)}))

        case NormalizationType.FORMULA:
            if not rule.formula:
                return ScoreResult(None, note=_('The formula is empty.'))
            try:
                v = formulas.evaluate(rule.formula, x=x, lo=lo, hi=hi)
            except formulas.FormulaError as e:
                return ScoreResult(None, note=_('Formula error: %(error)s') % {'error': e})
            return ScoreResult(_clamp(v, lo, hi), note=_('Formula %(formula)s with x = %(x)s.') % {'formula': rule.formula, 'x': f'{x:g}'})

        case NormalizationType.NONE:
            if x is None:
                return ScoreResult(None, note=_('This rule needs a numeric answer.'))
            return ScoreResult(x, note=_('The answer is used as the score.'))

    return ScoreResult(None, note=_('Unknown scoring method %(type)s.') % {'type': rule.normalization_type})


def aggregate(aggregation_type, items, formula=None):
    """Combines [(score, weight)] of the scored children. Weights are rescaled to sum to 1
    (except for weighted_sum), so unscored children don't drag the result down."""
    if not items:
        return None
    scores = [s for s, _ in items]
    total = sum(w for _, w in items)
    w = [wt / total if total > 0 else 1 / len(items) for _, wt in items]

    match aggregation_type:
        case AggregationType.WEIGHTED_ARITHMETIC_MEAN:
            return sum(s * wi for s, wi in zip(scores, w))
        case AggregationType.WEIGHTED_GEOMETRIC_MEAN:
            if any(s <= 0 for s in scores):
                return 0.0
            result = 1.0
            for s, wi in zip(scores, w):
                result *= s ** wi
            return result
        case AggregationType.WEIGHTED_HARMONIC_MEAN:
            if any(s <= 0 for s in scores):
                return 0.0
            return 1 / sum(wi / s for s, wi in zip(scores, w))
        case AggregationType.WEIGHTED_SUM:
            return sum(s * wt for s, wt in items)
        case AggregationType.MIN:
            return min(scores)
        case AggregationType.MAX:
            return max(scores)
        case AggregationType.CUSTOM_FORMULA:
            return formulas.evaluate(formula or '', s=scores, w=w)
    raise formulas.FormulaError('no aggregation type set')
