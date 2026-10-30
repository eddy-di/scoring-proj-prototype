"""Respondent API (respondent flow R1–R8), mounted at /api/respondent/.

Every user works on their own assessments only. Users whose role has the
assessments.view_all_assessments permission (e.g. Admin) can also read
everyone's. New assessments always use the latest published version of a
methodology ("questionnaire"). Answers are written with POST
assessments/{id}/answer/, which scores them immediately. Completed
assessments are read-only until they are reopened.
"""
from django.utils.translation import gettext as _
from drf_spectacular.utils import extend_schema
from rest_framework import generics, mixins, status, viewsets
from rest_framework.exceptions import PermissionDenied
from rest_framework.permissions import SAFE_METHODS
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response as ApiResponse

from catalogs.models import AssessmentObject
from config.api import QueryFilterMixin
from methodologies.services import latest_published_versions
from methodologies.scoring import nearest_level

from . import serializers, services
from .models import Assessment, AssessmentStatus, NodeResult, Response, ResponseEvidence, ResponseOption


def _locked():
    return ApiResponse({'detail': _('The assessment is completed. Reopen it to change answers.')},
                       status=status.HTTP_409_CONFLICT)


class OwnRecordsMixin:
    """Limits the queryset to the user's own assessments. Reading everyone's needs
    assessments.view_all_assessments; changing someone else's is never allowed here."""

    owner_path = 'respondent'

    def get_queryset(self):
        qs = super().get_queryset()
        user = self.request.user
        if self.request.method in SAFE_METHODS and user.has_perm('assessments.view_all_assessments'):
            return qs
        return qs.filter(**{self.owner_path: user})


@extend_schema(responses=serializers.QuestionnaireSerializer(many=True),
               summary='Questionnaires that can be started: the latest published version of each methodology')
class QuestionnaireList(generics.GenericAPIView):
    """?object=<id> limits the list to questionnaires for that object's type."""

    permission_classes = [IsAuthenticated]
    serializer_class = serializers.QuestionnaireSerializer

    def get(self, request):
        object_type = None
        if request.query_params.get('object'):
            obj = AssessmentObject.objects.filter(pk=request.query_params['object']).first()
            if obj is None:
                return ApiResponse({'detail': _('Object not found.')}, status=status.HTTP_404_NOT_FOUND)
            object_type = obj.object_type
        versions = latest_published_versions(object_type)
        return ApiResponse(self.get_serializer(versions, many=True).data)


def _level(level):
    return level and {'id': level.pk, 'value': float(level.value), 'label': level.label}


class AssessmentViewSet(OwnRecordsMixin, QueryFilterMixin, viewsets.ModelViewSet):
    queryset = Assessment.objects.select_related('respondent', 'object', 'methodology_version__methodology')
    serializer_class = serializers.AssessmentSerializer
    permission_classes = [IsAuthenticated]
    filter_params = {'object': 'object_id', 'methodology_version': 'methodology_version_id', 'status': 'status',
                     'respondent': 'respondent_id', 'methodology': 'methodology_version__methodology_id'}
    search_fields = ['title', 'object__name', 'respondent__username', 'respondent__first_name', 'respondent__last_name']

    def get_queryset(self):
        return services.with_progress(super().get_queryset())

    @extend_schema(summary='Counts and the latest assessments, for the dashboard (same filters as the list)')
    @action(detail=False)
    def summary(self, request):
        qs = self.filter_queryset(self.get_queryset())
        return ApiResponse({
            'count': qs.count(),
            'completed': qs.filter(status=AssessmentStatus.COMPLETED).count(),
            'latest': self.get_serializer(qs[:5], many=True).data,
        })

    def perform_create(self, serializer):
        serializer.save(respondent=self.request.user)

    @extend_schema(request=serializers.AnswerSerializer, responses=serializers.ResponseSerializer,
                   summary='Save (part of) an answer and score it')
    @action(detail=True, methods=['post'])
    def answer(self, request, pk=None):
        assessment = self.get_object()
        if assessment.status == AssessmentStatus.COMPLETED:
            return _locked()
        data = serializers.AnswerSerializer(data=request.data, context={'assessment': assessment})
        data.is_valid(raise_exception=True)
        values = dict(data.validated_data)
        node = values.pop('node')
        options = values.pop('options', None)
        response = services.save_answer(
            assessment, node, option_ids=None if options is None else [o.pk for o in options], **values)
        return ApiResponse(serializers.ResponseSerializer(response).data)

    @extend_schema(responses=serializers.EvaluationSerializer,
                   summary='Provisional scores of every node from the answers so far')
    @action(detail=True)
    def evaluation(self, request, pk=None):
        assessment = self.get_object()
        root, results = services.evaluate(assessment)
        nodes = {n.pk: n for n in assessment.methodology_version.nodes.select_related(
            'score_scale', 'version__result_scale')}
        payload = {
            str(node_id): {**r, 'level': _level(nearest_level(nodes[node_id].scale, r['score']))}
            for node_id, r in results.items()
        }
        total = results[root.pk] if root else None
        return ApiResponse({
            'total': total and total['score'],
            'level': total and _level(nearest_level(root.scale, total['score'])),
            'is_vetoed': bool(total and total['is_vetoed']),
            'nodes': payload,
        })

    @extend_schema(request=None, responses={200: serializers.AssessmentSerializer},
                   summary='Check mandatory answers, calculate every node and save the total')
    @action(detail=True, methods=['post'])
    def complete(self, request, pk=None):
        assessment = self.get_object()
        if assessment.status == AssessmentStatus.COMPLETED:
            return _locked()
        issues = services.complete(assessment)
        if issues:
            return ApiResponse({'issues': issues}, status=status.HTTP_400_BAD_REQUEST)
        return ApiResponse(self.get_serializer(assessment).data)

    @extend_schema(request=None, responses=serializers.AssessmentSerializer)
    @action(detail=True, methods=['post'])
    def reopen(self, request, pk=None):
        assessment = self.get_object()
        services.reopen(assessment)
        return ApiResponse(self.get_serializer(assessment).data)


class ResponseViewSet(OwnRecordsMixin, QueryFilterMixin, viewsets.ReadOnlyModelViewSet):
    owner_path = 'assessment__respondent'
    queryset = Response.objects.all()
    serializer_class = serializers.ResponseSerializer
    permission_classes = [IsAuthenticated]
    filter_params = {'assessment': 'assessment_id', 'node': 'node_id'}


class ResponseOptionViewSet(OwnRecordsMixin, QueryFilterMixin, viewsets.ReadOnlyModelViewSet):
    owner_path = 'response__assessment__respondent'
    queryset = ResponseOption.objects.all()
    serializer_class = serializers.ResponseOptionSerializer
    permission_classes = [IsAuthenticated]
    filter_params = {'response': 'response_id', 'assessment': 'response__assessment_id'}


class ResponseEvidenceViewSet(OwnRecordsMixin, QueryFilterMixin, mixins.CreateModelMixin, mixins.DestroyModelMixin,
                              viewsets.ReadOnlyModelViewSet):
    owner_path = 'response__assessment__respondent'
    queryset = ResponseEvidence.objects.select_related('response__assessment')
    serializer_class = serializers.ResponseEvidenceSerializer
    permission_classes = [IsAuthenticated]
    filter_params = {'response': 'response_id', 'assessment': 'response__assessment_id'}

    def create(self, request, *args, **kwargs):
        data = self.get_serializer(data=request.data)
        data.is_valid(raise_exception=True)
        assessment = data.validated_data['response'].assessment
        if assessment.respondent_id != request.user.pk:
            raise PermissionDenied(_('You can only add evidence to your own assessments.'))
        if assessment.status == AssessmentStatus.COMPLETED:
            return _locked()
        return super().create(request, *args, **kwargs)

    def destroy(self, request, *args, **kwargs):
        if self.get_object().response.assessment.status == AssessmentStatus.COMPLETED:
            return _locked()
        return super().destroy(request, *args, **kwargs)


class NodeResultViewSet(OwnRecordsMixin, QueryFilterMixin, viewsets.ReadOnlyModelViewSet):
    owner_path = 'assessment__respondent'
    queryset = NodeResult.objects.all()
    serializer_class = serializers.NodeResultSerializer
    permission_classes = [IsAuthenticated]
    filter_params = {'assessment': 'assessment_id'}
