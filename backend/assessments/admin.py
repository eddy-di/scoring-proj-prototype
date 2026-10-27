from django.contrib import admin, messages
from django.utils.translation import gettext as _
from django.utils.translation import gettext_lazy

from . import services
from .models import Assessment, NodeResult, Response, ResponseEvidence, ResponseOption


class ResponseInline(admin.TabularInline):
    model = Response
    fields = ['node', 'numeric_value', 'boolean_value', 'option', 'scale_level', 'text_value', 'is_not_applicable',
              'assessment_method', 'score', 'matched_criterion']
    readonly_fields = ['score', 'matched_criterion']
    raw_id_fields = ['node', 'option', 'scale_level', 'matched_criterion']
    extra = 0
    show_change_link = True


class NodeResultInline(admin.TabularInline):
    model = NodeResult
    fields = ['node', 'score', 'weighted_score', 'scale_level', 'is_vetoed', 'computed_at']
    readonly_fields = fields
    extra = 0
    can_delete = False

    def has_add_permission(self, request, obj=None):
        return False


@admin.register(Assessment)
class AssessmentAdmin(admin.ModelAdmin):
    list_display = ['__str__', 'respondent', 'object', 'methodology_version', 'status', 'total_score',
                    'total_scale_level', 'assessed_at', 'completed_at']
    list_filter = ['status', 'methodology_version', 'respondent']
    search_fields = ['title', 'object__name', 'respondent__username']
    raw_id_fields = ['respondent']
    readonly_fields = ['total_score', 'total_scale_level', 'completed_at']
    inlines = [ResponseInline, NodeResultInline]
    actions = ['rescore_and_complete', 'reopen']

    @admin.action(description=gettext_lazy('Re-score answers and complete'))
    def rescore_and_complete(self, request, queryset):
        for assessment in queryset:
            for response in assessment.responses.select_related('node__question', 'node__scoring_rule'):
                services.rescore(response)
            issues = services.complete(assessment)
            if issues:
                self.message_user(request, f'{assessment}: ' + ' '.join(issues), messages.ERROR)
            else:
                self.message_user(
                    request, _('%(assessment)s: total %(total)s (%(level)s).') % {
                        'assessment': assessment, 'total': f'{assessment.total_score:g}', 'level': assessment.total_scale_level},
                    messages.SUCCESS)

    @admin.action(description=gettext_lazy('Reopen (delete computed results)'))
    def reopen(self, request, queryset):
        for assessment in queryset:
            services.reopen(assessment)
        self.message_user(request, _('Assessments reopened: %(count)s.') % {'count': queryset.count()}, messages.SUCCESS)


class ResponseOptionInline(admin.TabularInline):
    model = ResponseOption
    extra = 0


class ResponseEvidenceInline(admin.TabularInline):
    model = ResponseEvidence
    extra = 0


@admin.register(Response)
class ResponseAdmin(admin.ModelAdmin):
    list_display = ['assessment', 'node', 'numeric_value', 'boolean_value', 'option', 'is_not_applicable', 'score',
                    'matched_criterion']
    list_filter = ['assessment', 'is_not_applicable']
    readonly_fields = ['score', 'matched_criterion', 'created_at', 'updated_at']
    raw_id_fields = ['assessment', 'node', 'option', 'scale_level']
    inlines = [ResponseOptionInline, ResponseEvidenceInline]

    def save_related(self, request, form, formsets, change):
        super().save_related(request, form, formsets, change)
        services.rescore(form.instance)


@admin.register(ResponseOption)
class ResponseOptionAdmin(admin.ModelAdmin):
    list_display = ['response', 'option']
    raw_id_fields = ['response', 'option']


@admin.register(ResponseEvidence)
class ResponseEvidenceAdmin(admin.ModelAdmin):
    list_display = ['response', 'kind', 'uri', 'created_at']
    list_filter = ['kind']
    raw_id_fields = ['response']


@admin.register(NodeResult)
class NodeResultAdmin(admin.ModelAdmin):
    list_display = ['assessment', 'node', 'score', 'weighted_score', 'scale_level', 'is_vetoed', 'computed_at']
    list_filter = ['assessment', 'is_vetoed']
    raw_id_fields = ['assessment', 'node', 'scale_level']
