"""Content fields stored in every language from settings.LANGUAGES (django-modeltranslation)."""
from modeltranslation.translator import TranslationOptions, register

from .models import Methodology, MethodologyNode, MethodologyVersion, NodeAssessmentMethod, ScoreCriterion, ScoringRule


@register(Methodology)
class MethodologyTranslation(TranslationOptions):
    fields = ('name', 'description')


@register(MethodologyVersion)
class MethodologyVersionTranslation(TranslationOptions):
    fields = ('notes',)


@register(MethodologyNode)
class MethodologyNodeTranslation(TranslationOptions):
    fields = ('name', 'description')


@register(NodeAssessmentMethod)
class NodeAssessmentMethodTranslation(TranslationOptions):
    fields = ('instructions', 'required_evidence')


@register(ScoringRule)
class ScoringRuleTranslation(TranslationOptions):
    fields = ('description',)


@register(ScoreCriterion)
class ScoreCriterionTranslation(TranslationOptions):
    fields = ('label', 'description')
