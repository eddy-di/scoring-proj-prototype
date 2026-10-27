from django.utils.translation import gettext as _
from django.utils.translation import gettext_lazy
from rest_framework import serializers

from catalogs.models import RatingScale, ScaleLevel
from config.i18n import LANGUAGE_CODES, TranslatedSerializerMixin, in_every_language
from library.models import CHOICE_TYPES, NUMERIC_TYPES, AnswerType, QuestionOption

from . import formulas
from .models import (
    AggregationType,
    Methodology,
    MethodologyNode,
    MethodologyVersion,
    NodeAssessmentMethod,
    NodeType,
    ScoreCriterion,
    ScoringRule,
)
from .scoring import describe_condition, nearest_level

NEW_NODE_NAMES = {NodeType.GROUP: gettext_lazy('New group'), NodeType.QUESTION: gettext_lazy('New question')}


class VersionSummarySerializer(serializers.ModelSerializer):
    class Meta:
        model = MethodologyVersion
        fields = ['id', 'version', 'status', 'published_at']


class MethodologySerializer(TranslatedSerializerMixin, serializers.ModelSerializer):
    versions = VersionSummarySerializer(many=True, read_only=True)
    result_scale = serializers.PrimaryKeyRelatedField(
        queryset=RatingScale.objects.all(), write_only=True, required=False, allow_null=True,
        help_text='Create only: result scale of the first version.')

    class Meta:
        model = Methodology
        fields = ['id', 'code', 'name', 'description', 'object_type', 'created_at', 'versions', 'result_scale']
        read_only_fields = ['created_at']


class MethodologyVersionSerializer(TranslatedSerializerMixin, serializers.ModelSerializer):
    methodology_code = serializers.CharField(source='methodology.code', read_only=True)
    is_editable = serializers.BooleanField(read_only=True)
    node_count = serializers.IntegerField(source='nodes.count', read_only=True)
    assessment_count = serializers.IntegerField(source='assessments.count', read_only=True)

    class Meta:
        model = MethodologyVersion
        fields = ['id', 'methodology', 'methodology_code', 'version', 'status', 'weighting_method', 'result_scale',
                  'notes', 'published_at', 'created_at', 'is_editable', 'node_count', 'assessment_count']
        read_only_fields = ['methodology', 'status', 'published_at', 'created_at']


class NodeSerializer(TranslatedSerializerMixin, serializers.ModelSerializer):
    scoring_rule = serializers.PrimaryKeyRelatedField(read_only=True)

    class Meta:
        model = MethodologyNode
        fields = ['id', 'version', 'parent', 'node_type', 'code', 'name', 'description', 'question', 'weight',
                  'aggregation_type', 'aggregation_formula', 'score_scale', 'is_mandatory', 'veto_threshold',
                  'sort_order', 'scoring_rule']

    def to_internal_value(self, data):
        # A new node without a name is called "New group" / "New question" in every language.
        if self.instance is None and not any(data.get(f'name_{code}') for code in LANGUAGE_CODES):
            default = NEW_NODE_NAMES.get(data.get('node_type'))
            if default is not None:
                data = data.copy()
                for code, text in in_every_language(default).items():
                    data[f'name_{code}'] = text
        return super().to_internal_value(data)

    def validate(self, attrs):
        instance = self.instance
        get = lambda name: attrs.get(name, getattr(instance, name, None))  # noqa: E731
        version, parent, node_type = get('version'), get('parent'), get('node_type')
        errors = {}

        if instance is not None:
            if 'version' in attrs and attrs['version'] != instance.version:
                errors['version'] = _('A node cannot move to another version.')
            if 'node_type' in attrs and attrs['node_type'] != instance.node_type:
                errors['node_type'] = _('Delete the node and add a new one to change its type.')

        if parent is None:
            roots = version.nodes.filter(parent__isnull=True)
            if instance is not None:
                roots = roots.exclude(pk=instance.pk)
            if roots.exists():
                errors['parent'] = _('The version already has a root node; choose a parent group.')
        else:
            if parent.version_id != version.pk:
                errors['parent'] = _('The parent must belong to the same version.')
            elif parent.node_type != NodeType.GROUP:
                errors['parent'] = _('Only group nodes can have children.')
            ancestor = parent
            while instance is not None and ancestor is not None:
                if ancestor.pk == instance.pk:
                    errors['parent'] = _('A node cannot be moved inside itself.')
                    break
                ancestor = ancestor.parent

        code = get('code')
        clash = version.nodes.filter(code=code)
        if instance is not None:
            clash = clash.exclude(pk=instance.pk)
        if clash.exists():
            errors['code'] = _('Code %(code)s is already used in this version.') % {'code': code}

        if node_type == NodeType.GROUP:
            if get('question') is not None:
                errors['question'] = _('Group nodes do not link a question.')
            if get('aggregation_type') == AggregationType.CUSTOM_FORMULA and get('aggregation_formula'):
                try:
                    formulas.check(get('aggregation_formula'), {'s', 'w'})
                except formulas.FormulaError as e:
                    errors['aggregation_formula'] = str(e)
        else:
            if get('aggregation_type') or get('aggregation_formula'):
                errors['aggregation_type'] = _('Only group nodes aggregate children.')

        if get('weight') is not None and get('weight') < 0:
            errors['weight'] = _('Weight cannot be negative.')
        if errors:
            raise serializers.ValidationError(errors)

        if instance is None and node_type == NodeType.GROUP and not attrs.get('aggregation_type'):
            attrs['aggregation_type'] = AggregationType.WEIGHTED_ARITHMETIC_MEAN
        return attrs


class NodeAssessmentMethodSerializer(TranslatedSerializerMixin, serializers.ModelSerializer):
    method_code = serializers.CharField(source='assessment_method.code', read_only=True)
    method_name = serializers.CharField(source='assessment_method.name', read_only=True)

    class Meta:
        model = NodeAssessmentMethod
        fields = ['id', 'node', 'assessment_method', 'method_code', 'method_name', 'is_primary', 'instructions',
                  'required_evidence']

    def validate(self, attrs):
        node = attrs.get('node', getattr(self.instance, 'node', None))
        if self.instance is not None and node != self.instance.node:
            raise serializers.ValidationError({'node': _('Cannot move to another node.')})
        if node.node_type != NodeType.QUESTION:
            raise serializers.ValidationError({'node': _('Assessment methods describe question nodes.')})
        method = attrs.get('assessment_method', getattr(self.instance, 'assessment_method', None))
        clash = node.assessment_methods.filter(assessment_method=method)
        if self.instance is not None:
            clash = clash.exclude(pk=self.instance.pk)
        if clash.exists():
            raise serializers.ValidationError({'assessment_method': _('This method is already attached to the node.')})
        return attrs


class ScoreCriterionSerializer(TranslatedSerializerMixin, serializers.ModelSerializer):
    condition = serializers.SerializerMethodField(help_text='Human-readable condition, e.g. "0.5 ≤ x < 2 mm".')

    class Meta:
        model = ScoreCriterion
        fields = ['id', 'scoring_rule', 'range_from', 'range_to', 'option', 'boolean_value', 'scale_level', 'score',
                  'label', 'description', 'sort_order', 'condition']
        extra_kwargs = {'scale_level': {'help_text': 'Defaults to the node scale level nearest to the score.'}}

    def get_condition(self, c) -> str:
        return describe_condition(c, c.scoring_rule.node.question)

    def validate(self, attrs):
        get = lambda name: attrs.get(name, getattr(self.instance, name, None))  # noqa: E731
        rule = get('scoring_rule')
        if self.instance is not None and rule != self.instance.scoring_rule:
            raise serializers.ValidationError({'scoring_rule': _('Cannot move to another rule.')})
        node = rule.node
        question = node.question
        option, boolean_value = get('option'), get('boolean_value')
        range_from, range_to = get('range_from'), get('range_to')
        has_range = range_from is not None or range_to is not None
        errors = {}

        if sum([option is not None, boolean_value is not None, has_range]) > 1:
            errors['non_field_errors'] = _('Use one kind of condition: a numeric range, an option or a yes/no value.')
        if question is not None:
            if option is not None and question.answer_type not in CHOICE_TYPES:
                errors['option'] = _('Options apply to choice questions only.')
            elif option is not None and option.question_id != question.pk:
                errors['option'] = _('The option does not belong to question %(code)s.') % {'code': question.code}
            if boolean_value is not None and question.answer_type != AnswerType.BOOLEAN:
                errors['boolean_value'] = _('Yes/no conditions apply to yes/no questions only.')
            if has_range and question.answer_type not in NUMERIC_TYPES:
                errors['range_from'] = _('Ranges apply to numeric and scale-level questions only.')
        if range_from is not None and range_to is not None and range_from >= range_to:
            errors['range_to'] = _('Must be greater than “from”: a range includes “from” and stops just below “up to”.')

        scale = node.scale
        level = get('scale_level')
        if level is not None and scale is not None and level.scale_id != scale.pk:
            errors['scale_level'] = _('The level must belong to the node scale %(scale)s.') % {'scale': scale.code}
        if errors:
            raise serializers.ValidationError(errors)

        if 'scale_level' not in attrs and self.instance is None and scale is not None:
            attrs['scale_level'] = nearest_level(scale, float(attrs['score']))
        return attrs


class ScoringRuleSerializer(TranslatedSerializerMixin, serializers.ModelSerializer):
    criteria = ScoreCriterionSerializer(many=True, read_only=True)

    class Meta:
        model = ScoringRule
        fields = ['id', 'node', 'normalization_type', 'raw_min', 'raw_max', 'target_value', 'higher_is_better',
                  'formula', 'description', 'criteria']

    def validate(self, attrs):
        node = attrs.get('node', getattr(self.instance, 'node', None))
        if self.instance is not None and node != self.instance.node:
            raise serializers.ValidationError({'node': _('Cannot move to another node.')})
        if node.node_type != NodeType.QUESTION:
            raise serializers.ValidationError({'node': _('Only question nodes have scoring rules.')})
        formula = attrs.get('formula', getattr(self.instance, 'formula', None))
        if formula:
            try:
                formulas.check(formula, {'x', 'lo', 'hi'})
            except formulas.FormulaError as e:
                raise serializers.ValidationError({'formula': str(e)}) from None
        return attrs


class TreeNodeSerializer(NodeSerializer):
    """A node with its rule, criteria, assessment methods and children, for the tree editor."""

    question_code = serializers.CharField(source='question.code', read_only=True, default=None)
    answer_type = serializers.CharField(source='question.answer_type', read_only=True, default=None)
    scoring_rule = ScoringRuleSerializer(read_only=True)
    assessment_methods = NodeAssessmentMethodSerializer(many=True, read_only=True)
    children = serializers.SerializerMethodField()

    class Meta(NodeSerializer.Meta):
        fields = NodeSerializer.Meta.fields + ['question_code', 'answer_type', 'assessment_methods', 'children']

    def get_children(self, node) -> list[dict]:
        kids = self.context['children'].get(node.pk, [])
        return TreeNodeSerializer(kids, many=True, context=self.context).data


class TryAnswerSerializer(serializers.Serializer):
    """A trial answer for "Try the rule". Fill the field that matches the question's answer type."""

    numeric_value = serializers.DecimalField(max_digits=14, decimal_places=4, required=False, allow_null=True)
    boolean_value = serializers.BooleanField(required=False, allow_null=True, default=None)
    option = serializers.PrimaryKeyRelatedField(queryset=QuestionOption.objects.all(), required=False, allow_null=True)
    options = serializers.PrimaryKeyRelatedField(queryset=QuestionOption.objects.all(), many=True, required=False)
    scale_level = serializers.PrimaryKeyRelatedField(queryset=ScaleLevel.objects.all(), required=False, allow_null=True)
    text_value = serializers.CharField(required=False, allow_null=True, allow_blank=True)
    is_not_applicable = serializers.BooleanField(required=False, default=False)


class TryResultSerializer(serializers.Serializer):
    score = serializers.FloatField(allow_null=True)
    scale_level = serializers.DictField(allow_null=True)
    matched_criterion = serializers.DictField(allow_null=True)
    note = serializers.CharField(allow_null=True)


class ValidationResultSerializer(serializers.Serializer):
    can_publish = serializers.BooleanField()
    errors = serializers.ListField(child=serializers.CharField())
    warnings = serializers.ListField(child=serializers.CharField())
