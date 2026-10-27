from django.contrib import admin
from modeltranslation.admin import TranslationAdmin, TranslationTabularInline

from .models import AssessmentMethod, AssessmentObject, ObjectType, RatingScale, ScaleLevel, Unit


@admin.register(Unit)
class UnitAdmin(TranslationAdmin):
    list_display = ['code', 'name', 'description']
    search_fields = ['code', 'name']


@admin.register(ObjectType)
class ObjectTypeAdmin(TranslationAdmin):
    list_display = ['code', 'name', 'description']
    search_fields = ['code', 'name']


@admin.register(AssessmentObject)
class AssessmentObjectAdmin(admin.ModelAdmin):
    list_display = ['name', 'object_type', 'external_ref', 'created_at']
    list_filter = ['object_type']
    search_fields = ['name', 'external_ref']


class ScaleLevelInline(TranslationTabularInline):
    model = ScaleLevel
    extra = 0
    ordering = ['value']


@admin.register(RatingScale)
class RatingScaleAdmin(TranslationAdmin):
    list_display = ['code', 'name', 'scale_type', 'min_value', 'max_value', 'step', 'higher_is_better']
    list_filter = ['scale_type']
    search_fields = ['code', 'name']
    inlines = [ScaleLevelInline]


@admin.register(ScaleLevel)
class ScaleLevelAdmin(TranslationAdmin):
    list_display = ['scale', 'value', 'label', 'sort_order']
    list_filter = ['scale']
    search_fields = ['label']


@admin.register(AssessmentMethod)
class AssessmentMethodAdmin(TranslationAdmin):
    list_display = ['code', 'name', 'requires_evidence']
    list_filter = ['requires_evidence']
    search_fields = ['code', 'name']
