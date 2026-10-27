"""Question library: reusable questions, their categories and answer options."""
from django.db import models
from django.utils import timezone
from django.utils.translation import gettext_lazy as _

from catalogs.models import RatingScale, Unit


class AnswerType(models.TextChoices):
    NUMERIC = 'numeric', _('Number')
    SINGLE_CHOICE = 'single_choice', _('Single choice')
    MULTI_CHOICE = 'multi_choice', _('Multiple choice')
    BOOLEAN = 'boolean', _('Yes / no')
    SCALE_LEVEL = 'scale_level', _('Rating on a scale')
    TEXT = 'text', _('Free text')


CHOICE_TYPES = {AnswerType.SINGLE_CHOICE, AnswerType.MULTI_CHOICE}
NUMERIC_TYPES = {AnswerType.NUMERIC, AnswerType.SCALE_LEVEL}


class QuestionCategory(models.Model):
    parent = models.ForeignKey(
        'self', on_delete=models.SET_NULL, blank=True, null=True, related_name='children', verbose_name=_('parent'))
    name = models.CharField(_('name'), max_length=255, help_text=_('Structure, Energy efficiency, Comfort...'))
    description = models.TextField(_('description'), blank=True, null=True)

    class Meta:
        db_table = 'question_categories'
        ordering = ['id']
        verbose_name = _('question category')
        verbose_name_plural = _('question categories')

    def __str__(self):
        return self.name


class Question(models.Model):
    """Reusable across methodologies. Carries no weights or scores."""

    category = models.ForeignKey(
        QuestionCategory, on_delete=models.SET_NULL, blank=True, null=True, related_name='questions',
        verbose_name=_('category'))
    code = models.CharField(_('code'), max_length=64, unique=True)
    text = models.TextField(_('question'), help_text=_('the question / indicator wording'))
    description = models.TextField(_('guidance'), blank=True, null=True, help_text=_('guidance and context'))
    answer_type = models.CharField(_('answer type'), max_length=16, choices=AnswerType.choices)
    unit = models.ForeignKey(
        Unit, on_delete=models.PROTECT, blank=True, null=True, verbose_name=_('unit'), help_text=_('for numeric answers'))
    default_scale = models.ForeignKey(
        RatingScale, on_delete=models.PROTECT, blank=True, null=True, verbose_name=_('scale'),
        help_text=_('for scale_level answers'))
    is_active = models.BooleanField(_('active'), default=True)
    created_at = models.DateTimeField(_('created at'), default=timezone.now)

    class Meta:
        db_table = 'questions'
        ordering = ['code']
        verbose_name = _('question')
        verbose_name_plural = _('questions')

    def __str__(self):
        return self.code


class QuestionOption(models.Model):
    """Choices for single_choice / multi_choice questions."""

    question = models.ForeignKey(Question, on_delete=models.CASCADE, related_name='options', verbose_name=_('question'))
    code = models.CharField(_('code'), max_length=64)
    label = models.CharField(_('label'), max_length=255)
    sort_order = models.IntegerField(_('sort order'), default=0)

    class Meta:
        db_table = 'question_options'
        ordering = ['question', 'sort_order', 'id']
        verbose_name = _('question option')
        verbose_name_plural = _('question options')
        constraints = [
            models.UniqueConstraint(fields=['question', 'code'], name='question_options_question_code_uniq'),
        ]

    def __str__(self):
        return f'{self.question.code}: {self.label}'
