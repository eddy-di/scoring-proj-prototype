"""Admin panel API for catalogs (admin flow A1–A4)."""
from django.db.models import Count
from rest_framework import viewsets

from config.api import QueryFilterMixin
from config.permissions import RolePermissionOrAnyoneCreates

from . import serializers
from .models import AssessmentMethod, AssessmentObject, ObjectType, RatingScale, ScaleLevel, Unit


class UnitViewSet(QueryFilterMixin, viewsets.ModelViewSet):
    queryset = Unit.objects.all()
    serializer_class = serializers.UnitSerializer
    search_fields = ['code', 'name']


class ObjectTypeViewSet(QueryFilterMixin, viewsets.ModelViewSet):
    queryset = ObjectType.objects.all()
    serializer_class = serializers.ObjectTypeSerializer
    search_fields = ['code', 'name']


class AssessmentObjectViewSet(QueryFilterMixin, viewsets.ModelViewSet):
    queryset = AssessmentObject.objects.select_related('object_type')
    serializer_class = serializers.AssessmentObjectSerializer
    # Respondents register the objects they assess (respondent step R1).
    permission_classes = [RolePermissionOrAnyoneCreates]
    filter_params = {'object_type': 'object_type_id'}
    search_fields = ['name', 'external_ref']

    def get_queryset(self):
        qs = super().get_queryset()
        # How many assessments use each object, for roles that may see everyone's assessments.
        if self.request.user.has_perm('assessments.view_all_assessments'):
            qs = qs.annotate(assessment_count=Count('assessments'))
        return qs

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)


class RatingScaleViewSet(QueryFilterMixin, viewsets.ModelViewSet):
    queryset = RatingScale.objects.prefetch_related('levels')
    serializer_class = serializers.RatingScaleSerializer
    filter_params = {'scale_type': 'scale_type'}
    search_fields = ['code', 'name']


class ScaleLevelViewSet(QueryFilterMixin, viewsets.ModelViewSet):
    queryset = ScaleLevel.objects.select_related('scale')
    serializer_class = serializers.ScaleLevelSerializer
    filter_params = {'scale': 'scale_id'}


class AssessmentMethodViewSet(QueryFilterMixin, viewsets.ModelViewSet):
    queryset = AssessmentMethod.objects.all()
    serializer_class = serializers.AssessmentMethodSerializer
    search_fields = ['code', 'name']
