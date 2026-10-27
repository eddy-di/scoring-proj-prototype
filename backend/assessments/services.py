"""Scores responses and computes node results for assessments.

There is no respondent API yet; these functions are what it will call. The
example-assessment fixture was generated with them.
"""
from django.db import transaction
from django.utils import timezone
from django.utils.translation import gettext as _

from library.models import AnswerType
from methodologies import formulas
from methodologies.models import NodeType
from methodologies.scoring import Answer, aggregate, has_answer, nearest_level, score_answer

from .models import AssessmentStatus, NodeResult, Response, ResponseOption


def rescore(response):
    result = score_answer(response.node, Answer.from_response(response))
    response.score = result.score
    response.matched_criterion = result.criterion
    response.save(update_fields=['score', 'matched_criterion'])
    return result


@transaction.atomic
def save_answer(assessment, node, option_ids=None, **values):
    """Creates or updates the response for a question node, then re-scores it.

    values: columns of `responses`; option_ids: the full selection for multi_choice.
    """
    response, created = Response.objects.get_or_create(assessment=assessment, node=node)
    if created:
        primary = node.assessment_methods.filter(is_primary=True).first()
        response.assessment_method_id = primary.assessment_method_id if primary else None
    for name, value in values.items():
        setattr(response, name, value)
    response.updated_at = timezone.now()
    response.save()
    if option_ids is not None:
        response.selected_options.all().delete()
        ResponseOption.objects.bulk_create(ResponseOption(response=response, option_id=i) for i in option_ids)
    rescore(response)
    if assessment.status == AssessmentStatus.DRAFT:
        assessment.status = AssessmentStatus.IN_PROGRESS
        assessment.save(update_fields=['status'])
    return response


def evaluate(assessment):
    """Computes every node bottom-up without saving.

    Returns {node_id: dict(score, weighted_score, is_vetoed, below_veto, error)}.
    Unscored children are left out and their siblings' weights rescaled. A child
    below its veto threshold, or itself vetoed, vetoes its parent, up to the root.
    """
    version = assessment.methodology_version
    nodes = list(version.nodes.all())
    children = {}
    for n in nodes:
        children.setdefault(n.parent_id, []).append(n)
    scores = dict(Response.objects.filter(assessment=assessment).values_list('node_id', 'score'))
    results = {}

    def walk(node):
        score, is_vetoed, error = None, False, None
        if node.node_type == NodeType.QUESTION:
            score = scores.get(node.id)
            score = None if score is None else float(score)
        else:
            kids = [(c, walk(c)) for c in children.get(node.id, [])]
            is_vetoed = any(r['is_vetoed'] or r['below_veto'] for _, r in kids)
            scored = [(r['score'], float(c.weight)) for c, r in kids if r['score'] is not None]
            try:
                score = aggregate(node.aggregation_type, scored, node.aggregation_formula)
            except formulas.FormulaError as e:
                error = str(e)
        below_veto = score is not None and node.veto_threshold is not None and score < float(node.veto_threshold)
        results[node.id] = {
            'score': score,
            'weighted_score': None if score is None else score * float(node.weight),
            'is_vetoed': is_vetoed,
            'below_veto': below_veto,
            'error': error,
        }
        return results[node.id]

    root = next(iter(children.get(None, [])), None)
    if root is not None:
        walk(root)
    return root, results


def completion_issues(assessment):
    """Problems that block completing the assessment."""
    issues = []
    responses = {r.node_id: r for r in assessment.responses.prefetch_related('selected_options')}
    for node in assessment.methodology_version.nodes.filter(node_type=NodeType.QUESTION).select_related('question'):
        r = responses.get(node.id)
        a = Answer.from_response(r)
        answered = r is not None and (r.is_not_applicable or (node.question and has_answer(node.question, a)))
        if not answered:
            if node.is_mandatory:
                issues.append(f'{node.code}: ' + _('mandatory question is not answered.'))
        elif not r.is_not_applicable and node.question.answer_type != AnswerType.TEXT and r.score is None:
            issues.append(f'{node.code}: ' + _('answered but could not be scored (%(reason)s)') % {'reason': score_answer(node, a).note})
    return issues


def _q(value):
    return None if value is None else round(value, 4)


@transaction.atomic
def complete(assessment):
    """Saves node_results and the total. Returns the blocking issues; empty means completed."""
    issues = completion_issues(assessment)
    if issues:
        return issues
    root, results = evaluate(assessment)
    nodes = {n.id: n for n in assessment.methodology_version.nodes.select_related('score_scale', 'version__result_scale')}
    now = timezone.now()
    assessment.node_results.all().delete()
    NodeResult.objects.bulk_create(
        NodeResult(
            assessment=assessment, node_id=node_id,
            score=_q(r['score']), weighted_score=_q(r['weighted_score']),
            scale_level=nearest_level(nodes[node_id].scale, r['score']),
            is_vetoed=r['is_vetoed'], computed_at=now,
        )
        for node_id, r in results.items()
    )
    total = results[root.id]['score']
    assessment.total_score = _q(total)
    assessment.total_scale_level = nearest_level(root.scale, total)
    assessment.status = AssessmentStatus.COMPLETED
    assessment.completed_at = now
    assessment.save()
    return []


@transaction.atomic
def reopen(assessment):
    assessment.node_results.all().delete()
    assessment.status = AssessmentStatus.IN_PROGRESS
    assessment.total_score = None
    assessment.total_scale_level = None
    assessment.completed_at = None
    assessment.save()
