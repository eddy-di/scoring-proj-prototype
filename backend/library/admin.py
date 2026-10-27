from django.contrib import admin
from modeltranslation.admin import TranslationAdmin, TranslationTabularInline

from .models import Question, QuestionCategory, QuestionOption


@admin.register(QuestionCategory)
class QuestionCategoryAdmin(TranslationAdmin):
    list_display = ['name', 'parent', 'description']
    list_filter = ['parent']
    search_fields = ['name']


class QuestionOptionInline(TranslationTabularInline):
    model = QuestionOption
    extra = 0


@admin.register(Question)
class QuestionAdmin(TranslationAdmin):
    list_display = ['code', 'text', 'answer_type', 'category', 'unit', 'is_active']
    list_filter = ['answer_type', 'category', 'is_active']
    search_fields = ['code', 'text', 'description']
    autocomplete_fields = ['category']
    inlines = [QuestionOptionInline]


@admin.register(QuestionOption)
class QuestionOptionAdmin(TranslationAdmin):
    list_display = ['question', 'code', 'label', 'sort_order']
    list_filter = ['question']
    search_fields = ['code', 'label', 'question__code']
