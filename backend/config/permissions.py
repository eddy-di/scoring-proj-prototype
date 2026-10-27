"""API permissions are Django permissions, so roles (groups) decide what a user can do.

Reading: any signed-in user. Each viewset's queryset hides what a user may not
see, e.g. respondents never see draft methodologies or other people's assessments.

Writing: the Django model permission for the action – add_<model> for POST,
change_<model> for PUT/PATCH, delete_<model> for DELETE – or the permission a
viewset names for a custom action in `action_permissions`, e.g.
{'publish': 'methodologies.publish_methodologyversion'}.
"""
from rest_framework.permissions import SAFE_METHODS, BasePermission

VERBS = {'POST': 'add', 'PUT': 'change', 'PATCH': 'change', 'DELETE': 'delete'}


def required_permission(request, view):
    """The permission a write needs, or None for reads."""
    action_permissions = getattr(view, 'action_permissions', {})
    if getattr(view, 'action', None) in action_permissions:
        return action_permissions[view.action]
    if request.method in SAFE_METHODS:
        return None
    opts = view.get_queryset().model._meta
    return f'{opts.app_label}.{VERBS[request.method]}_{opts.model_name}'


class RolePermission(BasePermission):
    def has_permission(self, request, view):
        user = request.user
        if not (user and user.is_authenticated):
            return False
        perm = required_permission(request, view)
        return perm is None or user.has_perm(perm)


class RolePermissionOrAnyoneCreates(RolePermission):
    """Like RolePermission, but any signed-in user may also create records (e.g. register an object)."""

    def has_permission(self, request, view):
        if request.method == 'POST' and getattr(view, 'action', None) == 'create':
            return bool(request.user and request.user.is_authenticated)
        return super().has_permission(request, view)

