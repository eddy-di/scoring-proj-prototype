"""Routes of the admin panel API, mounted at /api/admin/."""
from django.urls import path
from drf_spectacular.utils import extend_schema
from rest_framework.decorators import api_view
from rest_framework.response import Response
from rest_framework.routers import DefaultRouter

from assessments.models import AssessmentStatus
from catalogs import api as catalogs
from catalogs.models import ScaleType
from library import api as library
from library.models import AnswerType
from methodologies import api as methodologies
from methodologies.models import AggregationType, NodeType, NormalizationType, VersionStatus, WeightingMethod

router = DefaultRouter()
# Catalogs (A1–A4)
router.register('units', catalogs.UnitViewSet)
router.register('object-types', catalogs.ObjectTypeViewSet)
router.register('assessment-objects', catalogs.AssessmentObjectViewSet)
router.register('rating-scales', catalogs.RatingScaleViewSet)
router.register('scale-levels', catalogs.ScaleLevelViewSet)
router.register('assessment-methods', catalogs.AssessmentMethodViewSet)
# Question library (A5–A7)
router.register('question-categories', library.QuestionCategoryViewSet)
router.register('questions', library.QuestionViewSet)
router.register('question-options', library.QuestionOptionViewSet)
# Methodologies (A8–A14)
router.register('methodologies', methodologies.MethodologyViewSet)
router.register('versions', methodologies.MethodologyVersionViewSet)
router.register('nodes', methodologies.NodeViewSet)
router.register('node-assessment-methods', methodologies.NodeAssessmentMethodViewSet)
router.register('scoring-rules', methodologies.ScoringRuleViewSet)
router.register('score-criteria', methodologies.ScoreCriterionViewSet)

ENUMS = {
    'scale_type': ScaleType,
    'answer_type': AnswerType,
    'node_type': NodeType,
    'aggregation_type': AggregationType,
    'weighting_method': WeightingMethod,
    'normalization_type': NormalizationType,
    'version_status': VersionStatus,
    'assessment_status': AssessmentStatus,
}


@extend_schema(summary='Values and labels of every enum, for dropdowns',
               responses={200: {'type': 'object', 'additionalProperties': {'type': 'array', 'items': {
                   'type': 'object', 'properties': {'value': {'type': 'string'}, 'label': {'type': 'string'}}}}}})
@api_view(['GET'])
def choices(request):
    return Response({
        name: [{'value': value, 'label': label} for value, label in enum.choices]
        for name, enum in ENUMS.items()
    })


urlpatterns = [path('choices/', choices, name='choices'), *router.urls]
