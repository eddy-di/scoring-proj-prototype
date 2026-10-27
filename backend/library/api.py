"""Admin panel API for the question library (admin flow A5–A7)."""
from rest_framework import viewsets

from config.api import QueryFilterMixin

from . import serializers
from .models import Question, QuestionCategory, QuestionOption


class QuestionCategoryViewSet(QueryFilterMixin, viewsets.ModelViewSet):
    queryset = QuestionCategory.objects.all()
    serializer_class = serializers.QuestionCategorySerializer
    filter_params = {'parent': 'parent_id'}
    search_fields = ['name']


class QuestionViewSet(QueryFilterMixin, viewsets.ModelViewSet):
    queryset = Question.objects.select_related('category', 'unit', 'default_scale').prefetch_related('options')
    serializer_class = serializers.QuestionSerializer
    filter_params = {'category': 'category_id', 'answer_type': 'answer_type', 'is_active': 'is_active'}
    search_fields = ['code', 'text', 'description']
    ordering_fields = ['code', 'created_at']


class QuestionOptionViewSet(QueryFilterMixin, viewsets.ModelViewSet):
    queryset = QuestionOption.objects.select_related('question')
    serializer_class = serializers.QuestionOptionSerializer
    filter_params = {'question': 'question_id'}
