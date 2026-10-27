"""Versioned methodologies: the weighted property tree, assessment mechanics and scoring rules."""
from django.db import models
from django.utils import timezone
from django.utils.translation import gettext_lazy as _

from catalogs.models import AssessmentMethod, ObjectType, RatingScale, ScaleLevel
from library.models import Question, QuestionOption


class AggregationType(models.TextChoices):
    WEIGHTED_ARITHMETIC_MEAN = 'weighted_arithmetic_mean', _('Weighted average')
    WEIGHTED_GEOMETRIC_MEAN = 'weighted_geometric_mean', _('Weighted geometric mean')
    WEIGHTED_HARMONIC_MEAN = 'weighted_harmonic_mean', _('Weighted harmonic mean')
    WEIGHTED_SUM = 'weighted_sum', _('Weighted sum')
    MIN = 'min', _('Minimum')
    MAX = 'max', _('Maximum')
    CUSTOM_FORMULA = 'custom_formula', _('Custom formula')


class WeightingMethod(models.TextChoices):
    EQUAL = 'equal', _('Equal')
    DIRECT_EXPERT = 'direct_expert', _('Direct expert')
    RANKING = 'ranking', _('Ranking')
    PAIRWISE_AHP = 'pairwise_ahp', _('Pairwise comparison (AHP)')
    CUSTOM = 'custom', _('Custom')


class NormalizationType(models.TextChoices):
    NONE = 'none', _('Use the answer as the score')
    LINEAR_MIN_MAX = 'linear_min_max', _('Linear between worst and best')
    LINEAR_TARGET = 'linear_target', _('Linear towards a target')
    CRITERIA_LOOKUP = 'criteria_lookup', _('Criteria lookup')
    FORMULA = 'formula', _('Formula')


class VersionStatus(models.TextChoices):
    DRAFT = 'draft', _('Draft')
    PUBLISHED = 'published', _('Published')
    ARCHIVED = 'archived', _('Archived')


class NodeType(models.TextChoices):
    GROUP = 'group', _('Group')
    QUESTION = 'question', _('Question')


class Methodology(models.Model):
    code = models.CharField(_('code'), max_length=64, unique=True)
    name = models.CharField(_('name'), max_length=255)
    description = models.TextField(_('description'), blank=True, null=True)
    object_type = models.ForeignKey(
        ObjectType, on_delete=models.PROTECT, blank=True, null=True, related_name='methodologies',
        verbose_name=_('object type'), help_text=_('what kind of objects it assesses'))
    created_at = models.DateTimeField(_('created at'), default=timezone.now)

    class Meta:
        db_table = 'methodologies'
        ordering = ['code']
        verbose_name = _('methodology')
        verbose_name_plural = _('methodologies')

    def __str__(self):
        return f'{self.code} – {self.name}'


class MethodologyVersion(models.Model):
    """Published versions are immutable so past scores stay reproducible."""

    methodology = models.ForeignKey(
        Methodology, on_delete=models.CASCADE, related_name='versions', verbose_name=_('methodology'))
    version = models.CharField(_('version'), max_length=32)
    status = models.CharField(_('status'), max_length=16, choices=VersionStatus.choices, default=VersionStatus.DRAFT)
    weighting_method = models.CharField(
        _('weighting method'), max_length=16, choices=WeightingMethod.choices, default=WeightingMethod.DIRECT_EXPERT)
    result_scale = models.ForeignKey(
        RatingScale, on_delete=models.PROTECT, blank=True, null=True, related_name='+',
        verbose_name=_('result scale'), help_text=_('scale of the final integral score'))
    notes = models.TextField(_('notes'), blank=True, null=True)
    published_at = models.DateTimeField(_('published at'), blank=True, null=True)
    created_at = models.DateTimeField(_('created at'), default=timezone.now)

    class Meta:
        db_table = 'methodology_versions'
        ordering = ['methodology', 'created_at', 'id']
        verbose_name = _('methodology version')
        verbose_name_plural = _('methodology versions')
        permissions = [
            ('publish_methodologyversion', _('Can publish methodology versions')),
            ('archive_methodologyversion', _('Can archive methodology versions')),
        ]
        constraints = [
            models.UniqueConstraint(fields=['methodology', 'version'], name='methodology_versions_uniq'),
        ]

    def __str__(self):
        return f'{self.methodology.code} v{self.version} ({self.get_status_display()})'

    @property
    def is_editable(self):
        return self.status == VersionStatus.DRAFT

    @property
    def root(self):
        return self.nodes.filter(parent__isnull=True).first()


class MethodologyNode(models.Model):
    """Hierarchical property tree of a methodology version. parent = NULL is the root."""

    version = models.ForeignKey(
        MethodologyVersion, on_delete=models.CASCADE, related_name='nodes', verbose_name=_('version'))
    parent = models.ForeignKey(
        'self', on_delete=models.CASCADE, blank=True, null=True, related_name='children', verbose_name=_('parent'))
    node_type = models.CharField(_('node type'), max_length=16, choices=NodeType.choices)
    code = models.CharField(_('code'), max_length=64)
    name = models.CharField(_('name'), max_length=255)
    description = models.TextField(_('description'), blank=True, null=True)
    question = models.ForeignKey(
        Question, on_delete=models.PROTECT, blank=True, null=True, related_name='nodes', verbose_name=_('question'),
        help_text=_('set only for node_type = question'))
    weight = models.DecimalField(
        _('weight'), max_digits=8, decimal_places=6, default=1, help_text=_('relative weight among siblings'))
    aggregation_type = models.CharField(
        _('aggregation'), max_length=32, choices=AggregationType.choices, blank=True, null=True,
        help_text=_('how children are combined (groups only)'))
    aggregation_formula = models.TextField(
        _('aggregation formula'), blank=True, null=True, help_text=_('used when aggregation_type = custom_formula'))
    score_scale = models.ForeignKey(
        RatingScale, on_delete=models.PROTECT, blank=True, null=True, related_name='+', verbose_name=_('score scale'),
        help_text=_('scale this node score is expressed in; defaults to the version result scale'))
    is_mandatory = models.BooleanField(_('mandatory'), default=True)
    veto_threshold = models.DecimalField(
        _('knock-out threshold'), max_digits=12, decimal_places=4, blank=True, null=True,
        help_text=_('if score below this, parent/root is failed (knock-out criterion)'))
    sort_order = models.IntegerField(_('sort order'), default=0)

    class Meta:
        db_table = 'methodology_nodes'
        ordering = ['version', 'sort_order', 'id']
        verbose_name = _('methodology node')
        verbose_name_plural = _('methodology nodes')
        constraints = [
            models.UniqueConstraint(fields=['version', 'code'], name='methodology_nodes_version_code_uniq'),
        ]
        indexes = [models.Index(fields=['version', 'parent'], name='methodology_nodes_parent_idx')]

    def __str__(self):
        return f'{self.code} – {self.name}'

    @property
    def scale(self):
        return self.score_scale or self.version.result_scale


class NodeAssessmentMethod(models.Model):
    """Assessment mechanics for a specific node: how its value is obtained."""

    node = models.ForeignKey(
        MethodologyNode, on_delete=models.CASCADE, related_name='assessment_methods', verbose_name=_('node'))
    assessment_method = models.ForeignKey(
        AssessmentMethod, on_delete=models.PROTECT, related_name='+', verbose_name=_('assessment method'))
    is_primary = models.BooleanField(_('primary'), default=True)
    instructions = models.TextField(
        _('instructions'), blank=True, null=True, help_text=_('step-by-step procedure, tools, sampling'))
    required_evidence = models.TextField(
        _('required evidence'), blank=True, null=True, help_text=_('photos, protocols, documents to attach'))

    class Meta:
        db_table = 'node_assessment_methods'
        ordering = ['node', '-is_primary', 'id']
        verbose_name = _('node assessment method')
        verbose_name_plural = _('node assessment methods')
        constraints = [
            models.UniqueConstraint(fields=['node', 'assessment_method'], name='node_assessment_methods_uniq'),
        ]

    def __str__(self):
        return f'{self.node.code}: {self.assessment_method.code}'


class ScoringRule(models.Model):
    """How a raw answer is converted to a score for a question node."""

    node = models.OneToOneField(
        MethodologyNode, on_delete=models.CASCADE, related_name='scoring_rule', verbose_name=_('node'))
    normalization_type = models.CharField(_('scoring method'), max_length=32, choices=NormalizationType.choices)
    raw_min = models.DecimalField(
        _('worst value'), max_digits=14, decimal_places=4, blank=True, null=True, help_text=_('worst acceptable raw value'))
    raw_max = models.DecimalField(
        _('best value'), max_digits=14, decimal_places=4, blank=True, null=True, help_text=_('best raw value'))
    target_value = models.DecimalField(
        _('target value'), max_digits=14, decimal_places=4, blank=True, null=True,
        help_text=_('ideal value for linear_target'))
    higher_is_better = models.BooleanField(_('higher is better'), default=True)
    formula = models.TextField(_('formula'), blank=True, null=True, help_text=_('expression for normalization_type = formula'))
    description = models.TextField(_('description'), blank=True, null=True)

    class Meta:
        db_table = 'scoring_rules'
        ordering = ['node']
        verbose_name = _('scoring rule')
        verbose_name_plural = _('scoring rules')

    def __str__(self):
        return f'{self.node.code}: {self.normalization_type}'


class ScoreCriterion(models.Model):
    """Score criteria: condition on the raw answer -> score."""

    scoring_rule = models.ForeignKey(
        ScoringRule, on_delete=models.CASCADE, related_name='criteria', verbose_name=_('scoring rule'))
    range_from = models.DecimalField(
        _('from'), max_digits=14, decimal_places=4, blank=True, null=True, help_text=_('numeric lower bound (inclusive)'))
    range_to = models.DecimalField(
        _('up to'), max_digits=14, decimal_places=4, blank=True, null=True, help_text=_('numeric upper bound (exclusive)'))
    option = models.ForeignKey(
        QuestionOption, on_delete=models.PROTECT, blank=True, null=True, related_name='+', verbose_name=_('option'),
        help_text=_('match for choice answers'))
    boolean_value = models.BooleanField(_('yes / no answer'), blank=True, null=True, help_text=_('match for boolean answers'))
    scale_level = models.ForeignKey(
        ScaleLevel, on_delete=models.PROTECT, blank=True, null=True, related_name='+', verbose_name=_('level'),
        help_text=_('resulting level on the node scale'))
    score = models.DecimalField(_('score'), max_digits=12, decimal_places=4, help_text=_('resulting score'))
    label = models.CharField(_('label'), max_length=255, blank=True, null=True)
    description = models.TextField(
        _('description'), blank=True, null=True, help_text=_('human-readable criterion, e.g. "cracks wider than 2 mm"'))
    sort_order = models.IntegerField(_('sort order'), default=0)

    class Meta:
        db_table = 'score_criteria'
        ordering = ['scoring_rule', 'sort_order', 'id']
        verbose_name = _('score criterion')
        verbose_name_plural = _('score criteria')

    def __str__(self):
        return f'{self.scoring_rule.node.code}: {self.label or self.score}'
