"""Admin panel API for methodologies (admin flow A8–A14).

Everything inside a version (nodes, assessment methods, scoring rules,
criteria) can only be changed while the version is a draft. Changing a
published or archived version returns 409 Conflict.
"""
from django.utils.translation import gettext as _
from drf_spectacular.utils import extend_schema
from rest_framework import mixins, serializers as drf_serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from config.api import QueryFilterMixin

from . import serializers, services
from .models import (
    Methodology,
    MethodologyNode,
    MethodologyVersion,
    NodeAssessmentMethod,
    NodeType,
    ScoreCriterion,
    ScoringRule,
    VersionStatus,
)
from .scoring import Answer, describe_condition, nearest_level, score_answer


class HideDraftsMixin:
    """Users who may not see drafts (respondents) only see published and archived versions
    and what is inside them. `version_path` leads from the model to its version."""

    version_path = None

    def get_queryset(self):
        qs = super().get_queryset()
        if self.request.user.has_perm('methodologies.view_methodologyversion'):
            return qs
        prefix = f'{self.version_path}__' if self.version_path else ''
        return qs.exclude(**{f'{prefix}status': VersionStatus.DRAFT})


class MethodologyViewSet(QueryFilterMixin, viewsets.ModelViewSet):
    """Creating a methodology also creates draft version 1.0 with its root node."""

    queryset = Methodology.objects.select_related('object_type').prefetch_related('versions')
    serializer_class = serializers.MethodologySerializer
    filter_params = {'object_type': 'object_type_id'}
    search_fields = ['code', 'name']

    def get_queryset(self):
        qs = super().get_queryset()
        if self.request.user.has_perm('methodologies.view_methodologyversion'):
            return qs
        return qs.filter(versions__status=VersionStatus.PUBLISHED).distinct()

    def perform_create(self, serializer):
        serializer.instance = services.create_methodology(**serializer.validated_data)

    def perform_update(self, serializer):
        serializer.validated_data.pop('result_scale', None)
        serializer.save()

    def perform_destroy(self, instance):
        locked = instance.versions.exclude(status=VersionStatus.DRAFT).first()
        if locked is not None:
            raise services.VersionLocked(locked)
        instance.delete()


class DraftOnlyMixin:
    """Allows writes only to records of a draft version."""

    def version_of(self, instance):
        raise NotImplementedError

    def version_from_data(self, data):
        raise NotImplementedError

    def perform_create(self, serializer):
        services.ensure_editable(self.version_from_data(serializer.validated_data))
        serializer.save()

    def perform_update(self, serializer):
        services.ensure_editable(self.version_of(serializer.instance))
        serializer.save()

    def perform_destroy(self, instance):
        services.ensure_editable(self.version_of(instance))
        instance.delete()


class MethodologyVersionViewSet(HideDraftsMixin, QueryFilterMixin, DraftOnlyMixin, mixins.ListModelMixin, mixins.RetrieveModelMixin,
                                mixins.UpdateModelMixin, mixins.DestroyModelMixin, viewsets.GenericViewSet):
    """Versions are created with their methodology or with `new-version`; they can't be posted directly."""

    queryset = MethodologyVersion.objects.select_related('methodology', 'result_scale')
    serializer_class = serializers.MethodologyVersionSerializer
    filter_params = {'methodology': 'methodology_id', 'status': 'status'}
    action_permissions = {
        'publish': 'methodologies.publish_methodologyversion',
        'archive': 'methodologies.archive_methodologyversion',
        'new_version': 'methodologies.add_methodologyversion',
    }

    def version_of(self, instance):
        return instance

    @extend_schema(responses=serializers.TreeNodeSerializer, summary='Whole property tree of the version')
    @action(detail=True)
    def tree(self, request, pk=None):
        version = self.get_object()
        nodes = list(version.nodes.select_related('question__unit', 'scoring_rule').prefetch_related(
            'scoring_rule__criteria__option', 'scoring_rule__criteria__scoring_rule__node__question__unit',
            'assessment_methods__assessment_method'))
        children = {}
        for n in nodes:
            children.setdefault(n.parent_id, []).append(n)
        root = next(iter(children.get(None, [])), None)
        if root is None:
            return Response(None)
        return Response(serializers.TreeNodeSerializer(root, context={'children': children, 'request': request}).data)

    @extend_schema(responses=serializers.ValidationResultSerializer, summary='Check whether the version can be published')
    @action(detail=True)
    def validation(self, request, pk=None):
        errors, warnings = services.validate_version(self.get_object())
        return Response({'can_publish': not errors, 'errors': errors, 'warnings': warnings})

    @extend_schema(request=None, responses={200: serializers.MethodologyVersionSerializer,
                                            400: serializers.ValidationResultSerializer})
    @action(detail=True, methods=['post'])
    def publish(self, request, pk=None):
        version = self.get_object()
        errors = services.publish_version(version)
        if errors:
            _, warnings = services.validate_version(version)
            return Response({'can_publish': False, 'errors': errors, 'warnings': warnings},
                            status=status.HTTP_400_BAD_REQUEST)
        return Response(self.get_serializer(version).data)

    @extend_schema(request=None, responses=serializers.MethodologyVersionSerializer)
    @action(detail=True, methods=['post'])
    def archive(self, request, pk=None):
        version = self.get_object()
        if version.status != VersionStatus.PUBLISHED:
            return Response({'detail': _('Only published versions can be archived.')}, status=status.HTTP_409_CONFLICT)
        services.archive_version(version)
        return Response(self.get_serializer(version).data)

    @extend_schema(request=None, responses={201: serializers.MethodologyVersionSerializer},
                   summary='Copy this version into a new draft')
    @action(detail=True, methods=['post'], url_path='new-version')
    def new_version(self, request, pk=None):
        copy = services.new_version_from(self.get_object())
        return Response(self.get_serializer(copy).data, status=status.HTTP_201_CREATED)


class NodeViewSet(HideDraftsMixin, QueryFilterMixin, DraftOnlyMixin, viewsets.ModelViewSet):
    """Nodes of the property tree. New question nodes get a criteria-lookup scoring rule.
    Linking a different question deletes the rule's criteria. Deleting a group deletes its subtree."""

    queryset = MethodologyNode.objects.select_related('version', 'scoring_rule')
    serializer_class = serializers.NodeSerializer
    filter_params = {'version': 'version_id', 'parent': 'parent_id', 'node_type': 'node_type'}
    version_path = 'version'
    action_permissions = {'try_rule': 'methodologies.view_scoringrule'}
    search_fields = ['code', 'name']

    def version_of(self, instance):
        return instance.version

    def version_from_data(self, data):
        return data['version']

    def perform_create(self, serializer):
        super().perform_create(serializer)
        services.ensure_scoring_rule(serializer.instance)

    def perform_update(self, serializer):
        old_question = serializer.instance.question_id
        super().perform_update(serializer)
        if serializer.instance.question_id != old_question:
            services.question_changed(serializer.instance)

    def perform_destroy(self, instance):
        if instance.parent_id is None:
            raise drf_serializers.ValidationError({'detail': _('The root node cannot be deleted.')})
        super().perform_destroy(instance)

    @extend_schema(request=serializers.TryAnswerSerializer, responses=serializers.TryResultSerializer,
                   summary='Try the rule: score a trial answer without saving it')
    @action(detail=True, methods=['post'], url_path='try-rule')
    def try_rule(self, request, pk=None):
        node = self.get_object()
        if node.node_type != NodeType.QUESTION:
            return Response({'detail': _('Only question nodes are scored.')}, status=status.HTTP_400_BAD_REQUEST)
        data = serializers.TryAnswerSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        v = data.validated_data
        answer = Answer(
            numeric_value=None if v.get('numeric_value') is None else float(v['numeric_value']),
            boolean_value=v.get('boolean_value'),
            option_id=v['option'].pk if v.get('option') else None,
            option_ids=[o.pk for o in v.get('options', [])],
            scale_level_id=v['scale_level'].pk if v.get('scale_level') else None,
            text_value=v.get('text_value'),
            is_not_applicable=v.get('is_not_applicable', False),
        )
        result = score_answer(node, answer)
        level = nearest_level(node.scale, result.score)
        c = result.criterion
        return Response({
            'score': result.score,
            'scale_level': level and {'id': level.pk, 'value': float(level.value), 'label': level.label},
            'matched_criterion': c and {'id': c.pk, 'label': c.label, 'condition': describe_condition(c, node.question)},
            'note': result.note,
        })


class NodeAssessmentMethodViewSet(HideDraftsMixin, QueryFilterMixin, DraftOnlyMixin, viewsets.ModelViewSet):
    queryset = NodeAssessmentMethod.objects.select_related('node__version', 'assessment_method')
    serializer_class = serializers.NodeAssessmentMethodSerializer
    filter_params = {'node': 'node_id', 'version': 'node__version_id'}
    version_path = 'node__version'

    def version_of(self, instance):
        return instance.node.version

    def version_from_data(self, data):
        return data['node'].version


class ScoringRuleViewSet(HideDraftsMixin, QueryFilterMixin, DraftOnlyMixin, viewsets.ModelViewSet):
    queryset = ScoringRule.objects.select_related('node__version', 'node__question').prefetch_related('criteria')
    serializer_class = serializers.ScoringRuleSerializer
    filter_params = {'node': 'node_id', 'version': 'node__version_id'}
    version_path = 'node__version'

    def version_of(self, instance):
        return instance.node.version

    def version_from_data(self, data):
        return data['node'].version


class ScoreCriterionViewSet(HideDraftsMixin, QueryFilterMixin, DraftOnlyMixin, viewsets.ModelViewSet):
    queryset = ScoreCriterion.objects.select_related(
        'scoring_rule__node__version', 'scoring_rule__node__question__unit', 'option')
    serializer_class = serializers.ScoreCriterionSerializer
    filter_params = {'scoring_rule': 'scoring_rule_id', 'node': 'scoring_rule__node_id'}
    version_path = 'scoring_rule__node__version'

    def version_of(self, instance):
        return instance.scoring_rule.node.version

    def version_from_data(self, data):
        return data['scoring_rule'].node.version
