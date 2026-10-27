from django.utils.translation import gettext as _
from rest_framework import serializers

from config.api import sync_children
from config.i18n import TranslatedSerializerMixin, writable_fields

from .models import AssessmentMethod, AssessmentObject, ObjectType, RatingScale, ScaleLevel, Unit


class UnitSerializer(TranslatedSerializerMixin, serializers.ModelSerializer):
    class Meta:
        model = Unit
        fields = ['id', 'code', 'name', 'description']


class ObjectTypeSerializer(TranslatedSerializerMixin, serializers.ModelSerializer):
    class Meta:
        model = ObjectType
        fields = ['id', 'code', 'name', 'description']


class AssessmentObjectSerializer(serializers.ModelSerializer):
    class Meta:
        model = AssessmentObject
        fields = ['id', 'object_type', 'name', 'external_ref', 'attributes', 'created_by', 'created_at']
        read_only_fields = ['created_by', 'created_at']


class AssessmentMethodSerializer(TranslatedSerializerMixin, serializers.ModelSerializer):
    class Meta:
        model = AssessmentMethod
        fields = ['id', 'code', 'name', 'description', 'requires_evidence']


class ScaleLevelSerializer(TranslatedSerializerMixin, serializers.ModelSerializer):
    class Meta:
        model = ScaleLevel
        fields = ['id', 'scale', 'value', 'label', 'description', 'sort_order']


class NestedScaleLevelSerializer(TranslatedSerializerMixin, serializers.ModelSerializer):
    id = serializers.IntegerField(required=False)

    class Meta:
        model = ScaleLevel
        fields = ['id', 'value', 'label', 'description', 'sort_order']


class RatingScaleSerializer(TranslatedSerializerMixin, serializers.ModelSerializer):
    """A scale with its levels. Sending `levels` replaces the whole list:
    levels with an id are updated, new ones created, missing ones deleted."""

    levels = NestedScaleLevelSerializer(many=True, required=False)

    class Meta:
        model = RatingScale
        fields = ['id', 'code', 'name', 'scale_type', 'min_value', 'max_value', 'step',
                  'higher_is_better', 'description', 'levels']

    def validate(self, attrs):
        lo = attrs.get('min_value', getattr(self.instance, 'min_value', None))
        hi = attrs.get('max_value', getattr(self.instance, 'max_value', None))
        if lo is not None and hi is not None and lo >= hi:
            raise serializers.ValidationError({'max_value': _('Must be greater than the lowest score.')})
        levels = attrs.get('levels')
        if levels is not None:
            values = [level['value'] for level in levels]
            if len(values) != len(set(values)):
                raise serializers.ValidationError({'levels': _('Level values must be unique within a scale.')})
            if self.instance is not None:
                own = set(self.instance.levels.values_list('id', flat=True))
                if any(level.get('id') not in own for level in levels if 'id' in level):
                    raise serializers.ValidationError({'levels': _('Unknown level id for this scale.')})
        return attrs

    def create(self, validated_data):
        levels = validated_data.pop('levels', [])
        scale = super().create(validated_data)
        sync_children(scale.levels, levels, writable_fields(NestedScaleLevelSerializer))
        return scale

    def update(self, instance, validated_data):
        levels = validated_data.pop('levels', None)
        scale = super().update(instance, validated_data)
        if levels is not None:
            sync_children(scale.levels, levels, writable_fields(NestedScaleLevelSerializer))
        return scale
