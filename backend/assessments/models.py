"""Assessments: a methodology version applied to an object, with answers and computed results."""
from django.conf import settings
from django.db import models
from django.utils import timezone
from django.utils.translation import gettext_lazy as _

from catalogs.models import AssessmentMethod, AssessmentObject, ScaleLevel
from library.models import QuestionOption
from methodologies.models import MethodologyNode, MethodologyVersion, ScoreCriterion


class AssessmentStatus(models.TextChoices):
    DRAFT = 'draft', _('Draft')
    IN_PROGRESS = 'in_progress', _('In progress')
    COMPLETED = 'completed', _('Completed')
    CANCELLED = 'cancelled', _('Cancelled')


class Assessment(models.Model):
    respondent = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, blank=True, null=True, related_name='assessments',
        verbose_name=_('respondent'), help_text=_('the user who fills in the assessment'))
    object = models.ForeignKey(
        AssessmentObject, on_delete=models.PROTECT, related_name='assessments', verbose_name=_('object'))
    methodology_version = models.ForeignKey(
        MethodologyVersion, on_delete=models.PROTECT, related_name='assessments', verbose_name=_('methodology version'))
    status = models.CharField(_('status'), max_length=16, choices=AssessmentStatus.choices, default=AssessmentStatus.DRAFT)
    title = models.CharField(_('title'), max_length=255, blank=True, null=True)
    assessed_at = models.DateField(_('assessed on'), blank=True, null=True)
    total_score = models.DecimalField(
        _('total score'), max_digits=12, decimal_places=4, blank=True, null=True,
        help_text=_('denormalized root node result'))
    total_scale_level = models.ForeignKey(
        ScaleLevel, on_delete=models.PROTECT, blank=True, null=True, related_name='+', verbose_name=_('total level'))
    notes = models.TextField(_('notes'), blank=True, null=True)
    created_at = models.DateTimeField(_('created at'), default=timezone.now)
    completed_at = models.DateTimeField(_('completed at'), blank=True, null=True)

    class Meta:
        db_table = 'assessments'
        ordering = ['-created_at', '-id']
        verbose_name = _('assessment')
        verbose_name_plural = _('assessments')
        permissions = [
            ('view_all_assessments', _('Can see every user’s assessments')),
        ]

    def __str__(self):
        return self.title or _('Assessment #%(id)s') % {'id': self.pk}


class Response(models.Model):
    """Raw answer + resulting score per question in an assessment."""

    assessment = models.ForeignKey(
        Assessment, on_delete=models.CASCADE, related_name='responses', verbose_name=_('assessment'))
    node = models.ForeignKey(
        MethodologyNode, on_delete=models.PROTECT, related_name='+', verbose_name=_('node'), help_text=_('question node'))
    assessment_method = models.ForeignKey(
        AssessmentMethod, on_delete=models.PROTECT, blank=True, null=True, related_name='+',
        verbose_name=_('assessment method'), help_text=_('mechanics actually used'))
    numeric_value = models.DecimalField(_('number'), max_digits=14, decimal_places=4, blank=True, null=True)
    boolean_value = models.BooleanField(_('yes / no'), blank=True, null=True)
    option = models.ForeignKey(
        QuestionOption, on_delete=models.PROTECT, blank=True, null=True, related_name='+', verbose_name=_('option'),
        help_text=_('single_choice'))
    scale_level = models.ForeignKey(
        ScaleLevel, on_delete=models.PROTECT, blank=True, null=True, related_name='+', verbose_name=_('level'),
        help_text=_('scale_level answers'))
    text_value = models.TextField(_('text'), blank=True, null=True)
    is_not_applicable = models.BooleanField(_('not applicable'), default=False)
    matched_criterion = models.ForeignKey(
        ScoreCriterion, on_delete=models.PROTECT, blank=True, null=True, related_name='+',
        verbose_name=_('matched criterion'), help_text=_('criterion that produced the score'))
    score = models.DecimalField(
        _('score'), max_digits=12, decimal_places=4, blank=True, null=True, help_text=_('normalized score of this question'))
    comment = models.TextField(_('comment'), blank=True, null=True)
    created_at = models.DateTimeField(_('created at'), default=timezone.now)
    updated_at = models.DateTimeField(_('updated at'), blank=True, null=True)

    class Meta:
        db_table = 'responses'
        ordering = ['assessment', 'node__sort_order', 'id']
        verbose_name = _('response')
        verbose_name_plural = _('responses')
        constraints = [
            models.UniqueConstraint(fields=['assessment', 'node'], name='responses_assessment_node_uniq'),
        ]

    def __str__(self):
        return f'{self.assessment}: {self.node.code}'


class ResponseOption(models.Model):
    """Selected options for multi_choice answers.

    The schema uses (response_id, option_id) as a composite primary key. Django
    admin can't edit composite-key models yet, so this table has a surrogate id
    and a unique constraint on the pair instead.
    """

    response = models.ForeignKey(
        Response, on_delete=models.CASCADE, related_name='selected_options', verbose_name=_('response'))
    option = models.ForeignKey(QuestionOption, on_delete=models.PROTECT, related_name='+', verbose_name=_('option'))

    class Meta:
        db_table = 'response_options'
        verbose_name = _('selected option')
        verbose_name_plural = _('selected options')
        constraints = [
            models.UniqueConstraint(fields=['response', 'option'], name='response_options_pk'),
        ]

    def __str__(self):
        return f'{self.response}: {self.option.code}'


class ResponseEvidence(models.Model):
    response = models.ForeignKey(Response, on_delete=models.CASCADE, related_name='evidence', verbose_name=_('response'))
    kind = models.CharField(_('kind'), max_length=32, help_text=_('photo, document, measurement_protocol, link'))
    uri = models.TextField(_('file or link'))
    description = models.TextField(_('description'), blank=True, null=True)
    created_at = models.DateTimeField(_('created at'), default=timezone.now)

    class Meta:
        db_table = 'response_evidence'
        ordering = ['response', 'id']
        verbose_name = _('evidence')
        verbose_name_plural = _('evidence')

    def __str__(self):
        return f'{self.kind}: {self.uri}'


class NodeResult(models.Model):
    """Computed result for every node (groups and root) of a completed assessment."""

    assessment = models.ForeignKey(
        Assessment, on_delete=models.CASCADE, related_name='node_results', verbose_name=_('assessment'))
    node = models.ForeignKey(MethodologyNode, on_delete=models.PROTECT, related_name='+', verbose_name=_('node'))
    score = models.DecimalField(
        _('score'), max_digits=12, decimal_places=4, blank=True, null=True, help_text=_('aggregated score of the node'))
    weighted_score = models.DecimalField(
        _('weighted score'), max_digits=12, decimal_places=4, blank=True, null=True,
        help_text=_('score * weight, contribution to parent'))
    scale_level = models.ForeignKey(
        ScaleLevel, on_delete=models.PROTECT, blank=True, null=True, related_name='+', verbose_name=_('level'))
    is_vetoed = models.BooleanField(_('knocked out'), default=False, help_text=_('failed a knock-out threshold'))
    computed_at = models.DateTimeField(_('computed at'), default=timezone.now)

    class Meta:
        db_table = 'node_results'
        ordering = ['assessment', 'node__sort_order', 'id']
        verbose_name = _('node result')
        verbose_name_plural = _('node results')
        constraints = [
            models.UniqueConstraint(fields=['assessment', 'node'], name='node_results_assessment_node_uniq'),
        ]

    def __str__(self):
        return f'{self.assessment}: {self.node.code}'
