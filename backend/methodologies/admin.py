"""Django admin for methodologies.

Records that belong to a published or archived version are shown read-only,
the same rule the admin panel API enforces. Use the "Create new version"
action to get an editable copy. Translated texts get one input per language.
"""
from django.contrib import admin, messages
from django.utils.html import format_html_join
from django.utils.translation import gettext as _
from django.utils.translation import gettext_lazy
from modeltranslation.admin import (
    TranslationAdmin,
    TranslationStackedInline,
    TranslationTabularInline,
)

from . import services
from .models import (
    Methodology,
    MethodologyNode,
    MethodologyVersion,
    NodeAssessmentMethod,
    ScoreCriterion,
    ScoringRule,
    VersionStatus,
)


class LockedByVersionMixin:
    """Read-only unless the object's methodology version is a draft. Works for admins and inlines,
    where `obj` is the parent object."""

    def version_for(self, obj):
        raise NotImplementedError

    def _editable(self, obj):
        return obj is None or self.version_for(obj).is_editable

    def has_change_permission(self, request, obj=None):
        return super().has_change_permission(request, obj) and self._editable(obj)

    def has_delete_permission(self, request, obj=None):
        return super().has_delete_permission(request, obj) and self._editable(obj)

    def has_add_permission(self, request, obj=None):
        args = (request, obj) if isinstance(self, admin.options.InlineModelAdmin) else (request,)
        return super().has_add_permission(*args) and self._editable(obj)


class VersionInline(admin.TabularInline):
    model = MethodologyVersion
    fields = ['version', 'status', 'weighting_method', 'result_scale', 'published_at']
    readonly_fields = fields
    extra = 0
    show_change_link = True
    can_delete = False

    def has_add_permission(self, request, obj=None):
        return False


@admin.register(Methodology)
class MethodologyAdmin(TranslationAdmin):
    list_display = ['code', 'name', 'object_type', 'created_at']
    list_filter = ['object_type']
    search_fields = ['code', 'name']
    inlines = [VersionInline]

    def save_model(self, request, obj, form, change):
        super().save_model(request, obj, form, change)
        if not change:
            services.create_first_version(obj)
            messages.info(request, _('Draft version 1.0 with a root node was created.'))


class NodeInline(LockedByVersionMixin, TranslationTabularInline):
    model = MethodologyNode
    fields = ['code', 'name', 'node_type', 'parent', 'question', 'weight', 'aggregation_type', 'veto_threshold',
              'is_mandatory', 'sort_order']
    extra = 0
    show_change_link = True

    def version_for(self, obj):
        return obj

    def formfield_for_foreignkey(self, db_field, request, **kwargs):
        # Only offer groups of the same version as parents.
        if db_field.name == 'parent':
            version_id = request.resolver_match.kwargs.get('object_id')
            kwargs['queryset'] = MethodologyNode.objects.filter(version_id=version_id, node_type='group')
        return super().formfield_for_foreignkey(db_field, request, **kwargs)


@admin.register(MethodologyVersion)
class MethodologyVersionAdmin(LockedByVersionMixin, TranslationAdmin):
    list_display = ['methodology', 'version', 'status', 'weighting_method', 'result_scale', 'published_at']
    list_filter = ['status', 'methodology']
    readonly_fields = ['status', 'published_at', 'created_at', 'validation']
    inlines = [NodeInline]
    actions = ['validate', 'publish', 'archive', 'new_version']

    def version_for(self, obj):
        return obj

    @admin.display(description=gettext_lazy('Validation'))
    def validation(self, obj):
        if obj.pk is None:
            return '–'
        errors, warnings = services.validate_version(obj)
        if not errors and not warnings:
            return _('Ready to publish.') if obj.is_editable else _('Valid.')
        items = [(_('Error'), e) for e in errors] + [(_('Warning'), w) for w in warnings]
        return format_html_join('', '<div><strong>{}:</strong> {}</div>', items)

    @admin.action(description=gettext_lazy('Validate selected versions'))
    def validate(self, request, queryset):
        for version in queryset:
            errors, warnings = services.validate_version(version)
            if errors:
                self.message_user(request, _('%(version)s: problems to fix: %(errors)s') % {
                    'version': version, 'errors': ' '.join(errors)}, messages.ERROR)
            else:
                self.message_user(request, _('%(version)s: valid, warnings: %(count)s.') % {
                    'version': version, 'count': len(warnings)}, messages.SUCCESS)

    @admin.action(description=gettext_lazy('Publish selected drafts'))
    def publish(self, request, queryset):
        for version in queryset:
            if not version.is_editable:
                self.message_user(request, _('%(version)s: only drafts can be published.') % {'version': version},
                                  messages.WARNING)
                continue
            errors = services.publish_version(version)
            if errors:
                self.message_user(request, _('%(version)s was not published: %(errors)s') % {
                    'version': version, 'errors': ' '.join(errors)}, messages.ERROR)
            else:
                self.message_user(request, _('%(version)s is published.') % {'version': version}, messages.SUCCESS)

    @admin.action(description=gettext_lazy('Archive selected published versions'))
    def archive(self, request, queryset):
        for version in queryset.filter(status=VersionStatus.PUBLISHED):
            services.archive_version(version)
            self.message_user(request, _('%(version)s is archived.') % {'version': version}, messages.SUCCESS)

    @admin.action(description=gettext_lazy('Create new version (draft copy)'))
    def new_version(self, request, queryset):
        for version in queryset:
            copy = services.new_version_from(version)
            self.message_user(request, _('Created %(copy)s from %(version)s.') % {'copy': copy, 'version': version},
                              messages.SUCCESS)


class NodeAssessmentMethodInline(LockedByVersionMixin, TranslationStackedInline):
    model = NodeAssessmentMethod
    extra = 0

    def version_for(self, obj):
        return obj.version


class ScoringRuleInline(LockedByVersionMixin, TranslationStackedInline):
    model = ScoringRule
    extra = 0
    show_change_link = True

    def version_for(self, obj):
        return obj.version


@admin.register(MethodologyNode)
class MethodologyNodeAdmin(LockedByVersionMixin, TranslationAdmin):
    list_display = ['code', 'name', 'version', 'node_type', 'parent', 'weight', 'aggregation_type', 'veto_threshold']
    list_filter = ['version', 'node_type']
    search_fields = ['code', 'name']
    raw_id_fields = ['parent']
    inlines = [NodeAssessmentMethodInline, ScoringRuleInline]

    def version_for(self, obj):
        return obj.version


@admin.register(NodeAssessmentMethod)
class NodeAssessmentMethodAdmin(LockedByVersionMixin, TranslationAdmin):
    list_display = ['node', 'assessment_method', 'is_primary', 'node_version']
    list_filter = ['assessment_method', 'is_primary', 'node__version']
    raw_id_fields = ['node']

    def version_for(self, obj):
        return obj.node.version

    @admin.display(description=gettext_lazy('Version'), ordering='node__version')
    def node_version(self, obj):
        return obj.node.version


class ScoreCriterionInline(LockedByVersionMixin, TranslationTabularInline):
    model = ScoreCriterion
    fields = ['sort_order', 'range_from', 'range_to', 'option', 'boolean_value', 'score', 'scale_level', 'label',
              'description']
    extra = 0

    def version_for(self, obj):
        return obj.node.version


@admin.register(ScoringRule)
class ScoringRuleAdmin(LockedByVersionMixin, TranslationAdmin):
    list_display = ['node', 'normalization_type', 'raw_min', 'raw_max', 'target_value', 'higher_is_better',
                    'node_version']
    list_filter = ['normalization_type', 'node__version']
    raw_id_fields = ['node']
    inlines = [ScoreCriterionInline]

    def version_for(self, obj):
        return obj.node.version

    @admin.display(description=gettext_lazy('Version'), ordering='node__version')
    def node_version(self, obj):
        return obj.node.version


@admin.register(ScoreCriterion)
class ScoreCriterionAdmin(LockedByVersionMixin, TranslationAdmin):
    list_display = ['scoring_rule', 'label', 'range_from', 'range_to', 'option', 'boolean_value', 'score',
                    'scale_level']
    list_filter = ['scoring_rule__node__version']
    raw_id_fields = ['scoring_rule']

    def version_for(self, obj):
        return obj.scoring_rule.node.version
