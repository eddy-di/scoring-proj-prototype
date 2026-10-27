"""Content fields stored in every language from settings.LANGUAGES (django-modeltranslation)."""
from modeltranslation.translator import TranslationOptions, register

from .models import Question, QuestionCategory, QuestionOption


@register(QuestionCategory)
class QuestionCategoryTranslation(TranslationOptions):
    fields = ('name', 'description')


@register(Question)
class QuestionTranslation(TranslationOptions):
    fields = ('text', 'description')


@register(QuestionOption)
class QuestionOptionTranslation(TranslationOptions):
    fields = ('label',)
