from django.utils.translation import gettext as _
from rest_framework import serializers

from config.api import sync_children
from config.i18n import TranslatedSerializerMixin, writable_fields
from methodologies.models import VersionStatus

from .models import CHOICE_TYPES, AnswerType, Question, QuestionCategory, QuestionOption


class QuestionCategorySerializer(TranslatedSerializerMixin, serializers.ModelSerializer):
    question_count = serializers.IntegerField(source='questions.count', read_only=True)

    class Meta:
        model = QuestionCategory
        fields = ['id', 'parent', 'name', 'description', 'question_count']

    def validate_parent(self, parent):
        node = parent
        while node is not None:
            if self.instance is not None and node.pk == self.instance.pk:
                raise serializers.ValidationError(_('A category cannot be inside itself.'))
            node = node.parent
        return parent


class QuestionOptionSerializer(TranslatedSerializerMixin, serializers.ModelSerializer):
    class Meta:
        model = QuestionOption
        fields = ['id', 'question', 'code', 'label', 'sort_order']

    def validate_question(self, question):
        if question.answer_type not in CHOICE_TYPES:
            raise serializers.ValidationError(_('Only single choice and multiple choice questions have options.'))
        return question


class NestedOptionSerializer(TranslatedSerializerMixin, serializers.ModelSerializer):
    id = serializers.IntegerField(required=False)

    class Meta:
        model = QuestionOption
        fields = ['id', 'code', 'label', 'sort_order']


class QuestionSerializer(TranslatedSerializerMixin, serializers.ModelSerializer):
    """A library question with its options. Sending `options` replaces the whole list:
    options with an id are updated, new ones created, missing ones deleted."""

    options = NestedOptionSerializer(many=True, required=False)
    used_in = serializers.SerializerMethodField(help_text='Methodology versions whose tree links this question.')

    class Meta:
        model = Question
        fields = ['id', 'category', 'code', 'text', 'description', 'answer_type', 'unit', 'default_scale',
                  'is_active', 'created_at', 'options', 'used_in']
        read_only_fields = ['created_at']

    def get_used_in(self, question) -> list[dict]:
        return [
            {'version': n.version_id, 'methodology': n.version.methodology.code,
             'version_label': n.version.version, 'status': n.version.status, 'node': n.code}
            for n in question.nodes.select_related('version__methodology')
        ]

    def validate(self, attrs):
        get = lambda name: attrs.get(name, getattr(self.instance, name, None))  # noqa: E731
        answer_type = get('answer_type')
        errors = {}
        if get('unit') is not None and answer_type != AnswerType.NUMERIC:
            errors['unit'] = _('Only numeric questions have a unit.')
        if answer_type == AnswerType.SCALE_LEVEL and get('default_scale') is None:
            errors['default_scale'] = _('Scale-level questions need a scale.')
        if get('default_scale') is not None and answer_type != AnswerType.SCALE_LEVEL:
            errors['default_scale'] = _('Only scale-level questions have a scale.')

        options = attrs.get('options')
        if options is not None:
            if options and answer_type not in CHOICE_TYPES:
                errors['options'] = _('Only single choice and multiple choice questions have options.')
            codes = [o['code'] for o in options]
            if len(codes) != len(set(codes)):
                errors['options'] = _('Option codes must be unique within a question.')
            if self.instance is not None:
                own = set(self.instance.options.values_list('id', flat=True))
                if any(o['id'] not in own for o in options if 'id' in o):
                    errors['options'] = _('Unknown option id for this question.')

        # Published versions must keep meaning what they meant when they were scored.
        if self.instance is not None and 'answer_type' in attrs and attrs['answer_type'] != self.instance.answer_type:
            if self.instance.nodes.exclude(version__status=VersionStatus.DRAFT).exists():
                errors['answer_type'] = _('The question is used by a published version; its answer type is locked.')
        if errors:
            raise serializers.ValidationError(errors)
        return attrs

    def create(self, validated_data):
        options = validated_data.pop('options', [])
        question = super().create(validated_data)
        sync_children(question.options, options, writable_fields(NestedOptionSerializer))
        return question

    def update(self, instance, validated_data):
        options = validated_data.pop('options', None)
        question = super().update(instance, validated_data)
        if options is not None:
            sync_children(question.options, options, writable_fields(NestedOptionSerializer))
        return question
