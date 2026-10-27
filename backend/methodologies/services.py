"""Methodology operations: creating, validating, publishing and copying versions."""
from django.db import transaction
from django.utils import timezone
from django.utils.translation import gettext as _

from config.i18n import LANGUAGE_CODES

from library.models import CHOICE_TYPES, NUMERIC_TYPES, AnswerType

from . import formulas
from .models import (
    AggregationType,
    Methodology,
    MethodologyNode,
    MethodologyVersion,
    NodeType,
    NormalizationType,
    ScoringRule,
    VersionStatus,
)

WEIGHTED = {
    AggregationType.WEIGHTED_ARITHMETIC_MEAN,
    AggregationType.WEIGHTED_GEOMETRIC_MEAN,
    AggregationType.WEIGHTED_HARMONIC_MEAN,
    AggregationType.WEIGHTED_SUM,
}


class VersionLocked(Exception):
    """Raised when something tries to change a published or archived version."""

    def __init__(self, version):
        super().__init__(_('%(version)s can no longer be changed. Create a new version to edit it.') % {'version': version})


def ensure_editable(version):
    if not version.is_editable:
        raise VersionLocked(version)


@transaction.atomic
def create_methodology(*, result_scale=None, **fields):
    """Creates the methodology with a draft version 1.0 and its root node.
    fields: model fields, including the translations name_en, name_ru, …"""
    methodology = Methodology.objects.create(**fields)
    create_first_version(methodology, result_scale)
    return methodology


def create_first_version(methodology, result_scale=None):
    version = MethodologyVersion.objects.create(methodology=methodology, version='1.0', result_scale=result_scale)
    # The root node is named like the methodology, in every language.
    names = {f'name_{code}': getattr(methodology, f'name_{code}') for code in LANGUAGE_CODES}
    MethodologyNode.objects.create(
        version=version, node_type=NodeType.GROUP, code='ROOT', aggregation_type=AggregationType.WEIGHTED_ARITHMETIC_MEAN,
        **names)
    return version


def ensure_scoring_rule(node):
    """Question nodes always get a scoring rule, criteria lookup by default."""
    if node.node_type == NodeType.QUESTION and not hasattr(node, 'scoring_rule'):
        ScoringRule.objects.create(node=node, normalization_type=NormalizationType.CRITERIA_LOOKUP)


def question_changed(node):
    """A different question invalidates criteria tied to the old question's options."""
    rule = getattr(node, 'scoring_rule', None)
    if rule is not None:
        rule.criteria.all().delete()


# ── Questionnaires ────────────────────────────────────────────

def latest_published_versions(object_type=None):
    """The newest published version of every methodology, optionally for one object type.
    These are the questionnaires respondents can start."""
    versions = MethodologyVersion.objects.filter(status=VersionStatus.PUBLISHED).select_related(
        'methodology__object_type').order_by('methodology__code', '-published_at', '-id')
    if object_type is not None:
        versions = versions.filter(methodology__object_type=object_type)
    latest = {}
    for version in versions:
        latest.setdefault(version.methodology_id, version)
    return list(latest.values())


# ── Validation ────────────────────────────────────────────────

def validate_version(version):
    """Returns (errors, warnings). Errors block publishing."""
    errors, warnings = [], []
    nodes = list(version.nodes.select_related('question', 'scoring_rule').prefetch_related(
        'assessment_methods', 'scoring_rule__criteria', 'question__options'))
    children = {}
    for n in nodes:
        children.setdefault(n.parent_id, []).append(n)

    roots = children.get(None, [])
    if len(roots) != 1:
        errors.append(_('The tree must have exactly one root node (found %(count)s).') % {'count': len(roots)})
    if version.result_scale_id is None:
        errors.append(_('Choose a result scale for the version.'))

    for n in nodes:
        if n.parent_id is not None and not n.weight > 0:
            errors.append(f'{n.code}: ' + _('weight must be greater than 0.'))

        if n.node_type == NodeType.GROUP:
            kids = children.get(n.id, [])
            if not kids:
                errors.append(f'{n.code}: ' + _('group has no children.'))
            if not n.aggregation_type:
                errors.append(f'{n.code}: ' + _('choose how the group combines its children.'))
            if n.aggregation_type == AggregationType.CUSTOM_FORMULA:
                if not n.aggregation_formula:
                    errors.append(f'{n.code}: ' + _('custom formula is empty.'))
                else:
                    try:
                        formulas.check(n.aggregation_formula, {'s', 'w'})
                    except formulas.FormulaError as e:
                        errors.append(f'{n.code}: ' + _('custom formula: %(error)s.') % {'error': e})
            if n.aggregation_type in WEIGHTED and kids:
                total = sum(float(c.weight) for c in kids)
                if abs(total - 1) > 0.001:
                    errors.append(f'{n.code}: ' + _('child weights add up to %(total)s, expected 1.') % {'total': f'{round(total, 3):g}'})
            continue

        q = n.question
        if q is None:
            errors.append(f'{n.code}: ' + _('no question linked.'))
            continue
        if q.answer_type == AnswerType.TEXT:
            warnings.append(f'{n.code}: ' + _('text question, stored but not scored.'))
            continue
        if not n.assessment_methods.all():
            warnings.append(f'{n.code}: ' + _('no assessment method describes how to obtain the value.'))

        rule = getattr(n, 'scoring_rule', None)
        if rule is None or not rule.normalization_type:
            errors.append(f'{n.code}: ' + _('no scoring rule.'))
            continue
        errors.extend(f'{n.code}: {p}' for p in rule_problems(q, rule))

    return errors, warnings


def rule_problems(question, rule):
    problems = []
    criteria = list(rule.criteria.all())
    numeric = question.answer_type in NUMERIC_TYPES
    lo, hi, target = rule.raw_min, rule.raw_max, rule.target_value

    match rule.normalization_type:
        case NormalizationType.CRITERIA_LOOKUP:
            if not criteria:
                return [_('the criteria lookup has no criteria.')]
            if numeric:
                problems += range_problems(criteria)
            if question.answer_type in CHOICE_TYPES:
                covered = {c.option_id for c in criteria}
                problems += [_('option “%(option)s” has no criterion.') % {'option': o.label}
                             for o in question.options.all() if o.id not in covered]
            if question.answer_type == AnswerType.BOOLEAN:
                if not any(c.boolean_value is True for c in criteria):
                    problems.append(_('no criterion for “Yes”.'))
                if not any(c.boolean_value is False for c in criteria):
                    problems.append(_('no criterion for “No”.'))
        case NormalizationType.LINEAR_MIN_MAX:
            if not numeric:
                problems.append(_('a linear rule needs a numeric or scale answer.'))
            if lo is None or hi is None:
                problems.append(_('set the worst and the best value.'))
            elif lo == hi:
                problems.append(_('the worst and the best value must differ.'))
        case NormalizationType.LINEAR_TARGET:
            if not numeric:
                problems.append(_('a linear rule needs a numeric or scale answer.'))
            if None in (lo, hi, target):
                problems.append(_('set the lower limit, the target and the upper limit.'))
            elif not lo < target < hi:
                problems.append(_('the target must lie between the lower and the upper limit.'))
        case NormalizationType.FORMULA:
            if not rule.formula:
                problems.append(_('the formula is empty.'))
            else:
                try:
                    formulas.check(rule.formula, {'x', 'lo', 'hi'})
                except formulas.FormulaError as e:
                    problems.append(_('formula: %(error)s.') % {'error': e})
    return problems


def range_problems(criteria):
    """Numeric ranges must cover the answer line without overlaps or gaps."""
    inf = float('inf')
    ranges = sorted(
        (c for c in criteria if c.option_id is None and c.boolean_value is None),
        key=lambda c: -inf if c.range_from is None else float(c.range_from))
    problems = []
    for a, b in zip(ranges, ranges[1:]):
        a_to = inf if a.range_to is None else float(a.range_to)
        b_from = -inf if b.range_from is None else float(b.range_from)
        if a_to > b_from:
            problems.append(_('ranges “%(a)s” and “%(b)s” overlap.') % {'a': a.label or a.id, 'b': b.label or b.id})
        elif a_to < b_from:
            problems.append(_('gap between %(a)s and %(b)s: answers there get no score.') % {'a': f'{a_to:g}', 'b': f'{b_from:g}'})
    return problems


# ── Lifecycle ─────────────────────────────────────────────────

def publish_version(version):
    """Publishes a valid draft. Returns the validation errors; empty means published."""
    ensure_editable(version)
    errors, _ = validate_version(version)
    if errors:
        return errors
    version.status = VersionStatus.PUBLISHED
    version.published_at = timezone.now()
    version.save(update_fields=['status', 'published_at'])
    return []


def archive_version(version):
    version.status = VersionStatus.ARCHIVED
    version.save(update_fields=['status'])


def next_version_label(methodology):
    """1.0, 1.3 → 1.4. Labels that aren't major.minor are ignored."""
    best = (1, -1)
    for label in methodology.versions.values_list('version', flat=True):
        try:
            major, minor = (int(p) for p in label.split('.'))
        except ValueError:
            continue
        best = max(best, (major, minor))
    return f'{best[0]}.{best[1] + 1}'


@transaction.atomic
def new_version_from(source):
    """Deep copy of a version into a new draft: nodes, assessment methods, rules and criteria."""
    copy = MethodologyVersion.objects.create(
        methodology=source.methodology, version=next_version_label(source.methodology),
        weighting_method=source.weighting_method, result_scale=source.result_scale, notes=source.notes)

    nodes = list(source.nodes.select_related('scoring_rule').prefetch_related(
        'assessment_methods', 'scoring_rule__criteria'))
    new_ids = {}
    # Parents first, so every copied node can point at its copied parent.
    pending = sorted(nodes, key=lambda n: n.parent_id is not None)
    while pending:
        rest = []
        for n in pending:
            if n.parent_id is not None and n.parent_id not in new_ids:
                rest.append(n)
                continue
            old_id = n.pk
            twin = MethodologyNode.objects.get(pk=old_id)
            twin.pk = None
            twin.version = copy
            twin.parent_id = new_ids.get(n.parent_id)
            twin.save()
            new_ids[old_id] = twin.pk
            for m in n.assessment_methods.all():
                m.pk = None
                m.node_id = twin.pk
                m.save()
            rule = getattr(n, 'scoring_rule', None)
            if rule is not None:
                criteria = list(rule.criteria.all())
                rule.pk = None
                rule.node_id = twin.pk
                rule.save()
                for c in criteria:
                    c.pk = None
                    c.scoring_rule = rule
                    c.save()
        if len(rest) == len(pending):
            raise ValueError('The node tree has a cycle or a parent outside the version.')
        pending = rest
    return copy
