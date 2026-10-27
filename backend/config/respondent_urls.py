"""Routes of the respondent API, mounted at /api/respondent/."""
from django.urls import path
from rest_framework.routers import DefaultRouter

from assessments import api

router = DefaultRouter()
router.register('assessments', api.AssessmentViewSet)
router.register('responses', api.ResponseViewSet)
router.register('response-options', api.ResponseOptionViewSet)
router.register('response-evidence', api.ResponseEvidenceViewSet)
router.register('node-results', api.NodeResultViewSet)

urlpatterns = [path('questionnaires/', api.QuestionnaireList.as_view(), name='questionnaires'), *router.urls]
