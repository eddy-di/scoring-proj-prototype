"""Shared pieces of the admin panel API."""
from django.db.models import ProtectedError
from django.utils.translation import gettext as _
from rest_framework import filters, status
from rest_framework.pagination import LimitOffsetPagination
from rest_framework.response import Response
from rest_framework.views import exception_handler as drf_exception_handler
from rest_framework.views import set_rollback

from methodologies.services import VersionLocked


class OptionalPagination(LimitOffsetPagination):
    """Pages only when the request asks: ?limit=50&offset=100 returns {count, next, previous, results}.

    Without ?limit= a list is returned whole, as before, so small reference tables stay one request.
    """

    max_limit = 500


class QueryFilterMixin:
    """Exact-match filters from query parameters: `filter_params = {'param': 'orm_lookup'}`.

    Boolean parameters accept true/false, and an empty value or `null` matches NULL.
    Also adds ?search= over `search_fields` and ?ordering= over `ordering_fields`.
    """

    filter_params = {}
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]

    def get_queryset(self):
        qs = super().get_queryset()
        for param, lookup in self.filter_params.items():
            if param not in self.request.query_params:
                continue
            value = self.request.query_params[param]
            if value in ('', 'null'):
                qs = qs.filter(**{f'{lookup}__isnull': True})
            elif value.lower() in ('true', 'false'):
                qs = qs.filter(**{lookup: value.lower() == 'true'})
            else:
                qs = qs.filter(**{lookup: value})
        return qs


def sync_children(manager, items, fields):
    """Makes the children in `manager` (e.g. question.options) match `items`.

    Items with an existing id are updated, items without one are created, and
    children missing from `items` are deleted.
    """
    existing = {child.pk: child for child in manager.all()}
    wanted = {item.get('id') for item in items}
    # Delete first so a new child may reuse a removed child's code.
    for pk, child in existing.items():
        if pk not in wanted:
            child.delete()
    for item in items:
        child = existing.get(item.get('id'))
        if child is None:
            manager.create(**{f: item[f] for f in fields if f in item})
            continue
        for f in fields:
            if f in item:
                setattr(child, f, item[f])
        child.save()


def exception_handler(exc, context):
    """Turns domain errors into 409 Conflict instead of a server error, rolling back the request."""
    if isinstance(exc, VersionLocked):
        set_rollback()
        return Response({'detail': str(exc)}, status=status.HTTP_409_CONFLICT)
    if isinstance(exc, ProtectedError):
        used_by = sorted({f'{o._meta.verbose_name}: {o}' for o in list(exc.protected_objects)[:10]})
        set_rollback()
        return Response(
            {'detail': _('This record is still in use and cannot be deleted.'), 'used_by': used_by},
            status=status.HTTP_409_CONFLICT)
    return drf_exception_handler(exc, context)
