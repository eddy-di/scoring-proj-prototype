"""Users and roles in Django admin. Only superusers can see these pages: the built-in
Admin role has no permissions on accounts or auth models."""
from django.contrib import admin
from django.contrib.auth.admin import GroupAdmin as BaseGroupAdmin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin
from django.contrib.auth.models import Group
from django.utils.translation import gettext_lazy as _

from .models import RoleProfile, User


@admin.register(User)
class UserAdmin(BaseUserAdmin):
    list_display = ['username', 'email', 'first_name', 'last_name', 'roles', 'is_staff', 'is_superuser', 'is_active',
                    'date_joined']
    list_filter = ['is_staff', 'is_superuser', 'is_active', 'groups']
    readonly_fields = ['is_staff', 'last_login', 'date_joined']
    fieldsets = (
        (None, {'fields': ('username', 'password')}),
        (_('Personal info'), {'fields': ('first_name', 'last_name', 'email', 'organization', 'position', 'phone',
                                         'preferred_language')}),
        (_('Roles and access'), {
            'fields': ('is_active', 'groups', 'is_superuser', 'is_staff', 'user_permissions'),
            'description': _('Roles decide what a user can do. Staff status is set automatically: superusers and '
                             'members of a staff role are staff. Users without a role are respondents.'),
        }),
        (_('Important dates'), {'fields': ('last_login', 'date_joined')}),
    )

    @admin.display(description=_('roles'))
    def roles(self, obj):
        return ', '.join(g.name for g in obj.groups.all()) or '–'


class RoleProfileInline(admin.StackedInline):
    model = RoleProfile
    can_delete = False
    verbose_name_plural = _('role settings')


admin.site.unregister(Group)


@admin.register(Group)
class RoleAdmin(BaseGroupAdmin):
    """A Django group is a role."""

    list_display = ['name', 'is_staff_role', 'member_count', 'permission_count']
    inlines = [RoleProfileInline]

    @admin.display(description=_('staff role'), boolean=True)
    def is_staff_role(self, obj):
        return getattr(getattr(obj, 'role_profile', None), 'is_staff_role', False)

    @admin.display(description=_('members'))
    def member_count(self, obj):
        return obj.user_set.count()

    @admin.display(description=_('permissions'))
    def permission_count(self, obj):
        return obj.permissions.count()
