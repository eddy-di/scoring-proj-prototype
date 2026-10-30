from django.utils.translation import gettext as _
from rest_framework import serializers

from catalogs.models import AssessmentMethod, ScaleLevel
from library.models import CHOICE_TYPES, AnswerType, QuestionOption
from methodologies.models import Methodology, MethodologyNode, NodeType
from methodologies.services import latest_published_versions

from .models import Assessment, NodeResult, Response, ResponseEvidence, ResponseOption
from .services import with_progress


class AssessmentSerializer(serializers.ModelSerializer):
    """An assessment always uses the latest published version of its methodology. To start one, send
    the object and, when several questionnaires exist for its type, the methodology."""

    methodology = serializers.PrimaryKeyRelatedField(
        queryset=Methodology.objects.all(), write_only=True, required=False,
        help_text='Create only. Optional when only one questionnaire exists for the object type.')
    respondent_name = serializers.CharField(source='respondent.display_name', read_only=True, default=None)
    answered_count = serializers.SerializerMethodField()
    question_count = serializers.SerializerMethodField()

    class Meta:
        model = Assessment
        fields = ['id', 'respondent', 'respondent_name', 'object', 'methodology', 'methodology_version', 'status',
                  'title', 'assessed_at', 'total_score', 'total_scale_level', 'notes', 'created_at', 'completed_at',
                  'answered_count', 'question_count']
        read_only_fields = ['respondent', 'methodology_version', 'status', 'total_score', 'total_scale_level',
                            'created_at', 'completed_at']

    # Progress, from services.with_progress(); an instance that wasn't loaded through it is counted on its own.
    def _progress(self, obj):
        if not hasattr(obj, 'answered_count'):
            counts = with_progress(Assessment.objects.filter(pk=obj.pk)).values('answered_count', 'question_count').first()
            obj.answered_count, obj.question_count = counts['answered_count'], counts['question_count']
        return obj

    def get_answered_count(self, obj) -> int:
        return self._progress(obj).answered_count

    def get_question_count(self, obj) -> int:
        return self._progress(obj).question_count

    def validate(self, attrs):
        if self.instance is not None:
            if 'object' in attrs and attrs['object'] != self.instance.object:
                raise serializers.ValidationError({'object': _('Cannot be changed after the assessment is started.')})
            attrs.pop('methodology', None)
            return attrs
        obj = attrs['object']
        methodology = attrs.pop('methodology', None)
        candidates = latest_published_versions(obj.object_type)
        if methodology is not None:
            candidates = [v for v in candidates if v.methodology_id == methodology.pk]
            if not candidates:
                raise serializers.ValidationError({'methodology': _(
                    'This questionnaire has no published version for objects of type “%(type)s”.') % {
                        'type': obj.object_type.name}})
        elif not candidates:
            raise serializers.ValidationError({'object': _(
                'There is no published questionnaire for objects of type “%(type)s” yet.') % {
                    'type': obj.object_type.name}})
        elif len(candidates) > 1:
            raise serializers.ValidationError({'methodology': _('Choose which questionnaire to fill in.')})
        attrs['methodology_version'] = candidates[0]
        return attrs


class QuestionnaireSerializer(serializers.Serializer):
    """The latest published version of a methodology, as respondents see it."""

    methodology = serializers.IntegerField(source='methodology_id')
    code = serializers.CharField(source='methodology.code')
    name = serializers.CharField(source='methodology.name')
    description = serializers.CharField(source='methodology.description', allow_null=True)
    object_type = serializers.IntegerField(source='methodology.object_type_id', allow_null=True)
    object_type_name = serializers.CharField(source='methodology.object_type.name', default=None)
    version = serializers.IntegerField(source='id')
    version_label = serializers.CharField(source='version')
    published_at = serializers.DateTimeField()
    question_count = serializers.SerializerMethodField()

    def get_question_count(self, version) -> int:
        return version.nodes.filter(node_type=NodeType.QUESTION).count()


class ResponseSerializer(serializers.ModelSerializer):
    class Meta:
        model = Response
        fields = ['id', 'assessment', 'node', 'assessment_method', 'numeric_value', 'boolean_value', 'option',
                  'scale_level', 'text_value', 'is_not_applicable', 'matched_criterion', 'score', 'comment',
                  'created_at', 'updated_at']
        read_only_fields = fields


class ResponseOptionSerializer(serializers.ModelSerializer):
    class Meta:
        model = ResponseOption
        fields = ['id', 'response', 'option']
        read_only_fields = fields


class ResponseEvidenceSerializer(serializers.ModelSerializer):
    class Meta:
        model = ResponseEvidence
        fields = ['id', 'response', 'kind', 'uri', 'description', 'created_at']
        read_only_fields = ['created_at']


class NodeResultSerializer(serializers.ModelSerializer):
    class Meta:
        model = NodeResult
        fields = ['id', 'assessment', 'node', 'score', 'weighted_score', 'scale_level', 'is_vetoed', 'computed_at']
        read_only_fields = fields


class AnswerSerializer(serializers.Serializer):
    """Part of an answer. Only the fields sent are changed; `options` replaces the multi-choice selection."""

    node = serializers.PrimaryKeyRelatedField(queryset=MethodologyNode.objects.select_related('question'))
    numeric_value = serializers.DecimalField(max_digits=14, decimal_places=4, required=False, allow_null=True)
    boolean_value = serializers.BooleanField(required=False, allow_null=True)
    option = serializers.PrimaryKeyRelatedField(queryset=QuestionOption.objects.all(), required=False, allow_null=True)
    options = serializers.PrimaryKeyRelatedField(queryset=QuestionOption.objects.all(), many=True, required=False)
    scale_level = serializers.PrimaryKeyRelatedField(queryset=ScaleLevel.objects.all(), required=False, allow_null=True)
    text_value = serializers.CharField(required=False, allow_null=True, allow_blank=True)
    is_not_applicable = serializers.BooleanField(required=False)
    assessment_method = serializers.PrimaryKeyRelatedField(
        queryset=AssessmentMethod.objects.all(), required=False, allow_null=True)
    comment = serializers.CharField(required=False, allow_null=True, allow_blank=True)

    def validate(self, attrs):
        assessment = self.context['assessment']
        node = attrs['node']
        if node.version_id != assessment.methodology_version_id or node.node_type != NodeType.QUESTION:
            raise serializers.ValidationError({'node': _('Not a question of this assessment.')})
        question = node.question
        errors = {}
        chosen = [o for o in [attrs.get('option'), *attrs.get('options', [])] if o is not None]
        if chosen and question.answer_type not in CHOICE_TYPES:
            errors['option'] = _('This question has no options.')
        elif any(o.question_id != question.pk for o in chosen):
            errors['option'] = _('The option belongs to another question.')
        level = attrs.get('scale_level')
        if level is not None and (question.answer_type != AnswerType.SCALE_LEVEL
                                  or level.scale_id != question.default_scale_id):
            errors['scale_level'] = _('The level is not on this question’s scale.')
        method = attrs.get('assessment_method')
        attached = set(node.assessment_methods.values_list('assessment_method_id', flat=True))
        if method is not None and attached and method.pk not in attached:
            errors['assessment_method'] = _('This method is not described for the question.')
        if errors:
            raise serializers.ValidationError(errors)
        return attrs


class EvaluationSerializer(serializers.Serializer):
    total = serializers.FloatField(allow_null=True)
    level = serializers.DictField(allow_null=True)
    is_vetoed = serializers.BooleanField()
    nodes = serializers.DictField(help_text='node id → {score, weighted_score, is_vetoed, below_veto, error, level}')
