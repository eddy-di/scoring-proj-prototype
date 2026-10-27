"""Content fields stored in every language from settings.LANGUAGES (django-modeltranslation)."""
from modeltranslation.translator import TranslationOptions, register

from .models import AssessmentMethod, ObjectType, RatingScale, ScaleLevel, Unit


@register(Unit)
class UnitTranslation(TranslationOptions):
    fields = ('name', 'description')


@register(ObjectType)
class ObjectTypeTranslation(TranslationOptions):
    fields = ('name', 'description')


@register(RatingScale)
class RatingScaleTranslation(TranslationOptions):
    fields = ('name', 'description')


@register(ScaleLevel)
class ScaleLevelTranslation(TranslationOptions):
    fields = ('label', 'description')


@register(AssessmentMethod)
class AssessmentMethodTranslation(TranslationOptions):
    fields = ('name', 'description')
