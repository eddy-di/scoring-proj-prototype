"""Reference data: units, rating scales, assessment methods, object types and objects."""
from django.conf import settings
from django.db import models
from django.utils import timezone
from django.utils.translation import gettext_lazy as _


class ScaleType(models.TextChoices):
    BINARY = 'binary', _('Binary')
    NOMINAL = 'nominal', _('Nominal')
    ORDINAL = 'ordinal', _('Ordinal')
    INTERVAL = 'interval', _('Interval')
    RATIO = 'ratio', _('Ratio')


class Unit(models.Model):
    code = models.CharField(_('code'), max_length=32, unique=True, help_text=_('mm, m2, %, pcs, kWh/m2'))
    name = models.CharField(_('name'), max_length=128)
    description = models.TextField(_('description'), blank=True, null=True)

    class Meta:
        db_table = 'units'
        ordering = ['code']
        verbose_name = _('unit')
        verbose_name_plural = _('units')

    def __str__(self):
        return self.code


class ObjectType(models.Model):
    code = models.CharField(_('code'), max_length=64, unique=True, help_text=_('building, apartment, product...'))
    name = models.CharField(_('name'), max_length=255)
    description = models.TextField(_('description'), blank=True, null=True)

    class Meta:
        db_table = 'object_types'
        ordering = ['code']
        verbose_name = _('object type')
        verbose_name_plural = _('object types')

    def __str__(self):
        return self.name


class AssessmentObject(models.Model):
    object_type = models.ForeignKey(
        ObjectType, on_delete=models.PROTECT, related_name='assessment_objects', verbose_name=_('object type'))
    name = models.CharField(_('name'), max_length=255)
    external_ref = models.CharField(
        _('external reference'), max_length=255, blank=True, null=True, help_text=_('cadastral number, SKU, etc.'))
    attributes = models.JSONField(_('attributes'), blank=True, null=True, help_text=_('free-form descriptive attributes'))
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, blank=True, null=True, related_name='+',
        verbose_name=_('created by'))
    created_at = models.DateTimeField(_('created at'), default=timezone.now)

    class Meta:
        db_table = 'assessment_objects'
        ordering = ['name']
        verbose_name = _('assessment object')
        verbose_name_plural = _('assessment objects')

    def __str__(self):
        return self.name


class RatingScale(models.Model):
    code = models.CharField(_('code'), max_length=64, unique=True)
    name = models.CharField(_('name'), max_length=255)
    scale_type = models.CharField(_('scale type'), max_length=16, choices=ScaleType.choices)
    min_value = models.DecimalField(_('lowest score'), max_digits=12, decimal_places=4, blank=True, null=True)
    max_value = models.DecimalField(_('highest score'), max_digits=12, decimal_places=4, blank=True, null=True)
    step = models.DecimalField(_('step'), max_digits=12, decimal_places=4, blank=True, null=True)
    higher_is_better = models.BooleanField(_('higher is better'), default=True)
    description = models.TextField(_('description'), blank=True, null=True)

    class Meta:
        db_table = 'rating_scales'
        ordering = ['code']
        verbose_name = _('rating scale')
        verbose_name_plural = _('rating scales')

    def __str__(self):
        return self.name


class ScaleLevel(models.Model):
    scale = models.ForeignKey(RatingScale, on_delete=models.CASCADE, related_name='levels', verbose_name=_('scale'))
    value = models.DecimalField(_('value'), max_digits=12, decimal_places=4)
    label = models.CharField(_('label'), max_length=128, help_text=_('Poor, Fair, Good, Excellent'))
    description = models.TextField(_('description'), blank=True, null=True, help_text=_('what this level means'))
    sort_order = models.IntegerField(_('sort order'), default=0)

    class Meta:
        db_table = 'scale_levels'
        ordering = ['scale', 'value']
        verbose_name = _('scale level')
        verbose_name_plural = _('scale levels')
        constraints = [
            models.UniqueConstraint(fields=['scale', 'value'], name='scale_levels_scale_value_uniq'),
        ]

    def __str__(self):
        return f'{self.scale.code}: {self.value:g} {self.label}'


class AssessmentMethod(models.Model):
    """Catalog of assessment mechanics: HOW a value is obtained."""

    code = models.CharField(_('code'), max_length=64, unique=True)
    name = models.CharField(_('name'), max_length=255)
    description = models.TextField(_('description'), blank=True, null=True)
    requires_evidence = models.BooleanField(_('requires evidence'), default=False)

    class Meta:
        db_table = 'assessment_methods'
        ordering = ['code']
        verbose_name = _('assessment method')
        verbose_name_plural = _('assessment methods')

    def __str__(self):
        return self.name
