"""Built-in roles and the rule that staff status follows roles.

A role is a Django Group with a RoleProfile. Its permissions are ordinary
Django model permissions (view/add/change/delete per model) plus a few custom
ones, such as methodologies.publish_methodologyversion. The API and the
frontend check these permissions, never the role name, so a new role (e.g.
"Real estate methodologists" with methodology permissions only) works
without code changes: a superuser creates the group in Django admin and
ticks its permissions.

Roles listed in ROLES are created after every `migrate`. Their permissions
are only ever added to, so changes a superuser makes in Django admin are kept.
"""
from django.apps import apps
from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group, Permission

from .models import RoleProfile

# The qualimetry part of the project. Users and roles (auth, accounts) are not in it:
# they are managed by superusers only.
QUALIMETRY_APPS = ['catalogs', 'library', 'methodologies', 'assessments']

ADMIN = 'Admin'

ROLES = {
    ADMIN: {
        'description': 'Full access to the qualimetry part: catalogs, question library, methodologies '
                       '(including publishing and archiving) and every assessment. Cannot manage users or roles.',
        'apps': QUALIMETRY_APPS,
    },
}


def permissions_of_apps(app_labels):
    return Permission.objects.filter(content_type__app_label__in=app_labels)


def ensure_roles(**kwargs):
    """Creates the built-in roles and adds any missing permissions to them."""
    for name, spec in ROLES.items():
        group, _ = Group.objects.get_or_create(name=name)
        RoleProfile.objects.get_or_create(group=group, defaults={'description': spec['description']})
        group.permissions.add(*permissions_of_apps(spec['apps']))


def sync_staff(user):
    """Staff status follows roles: superusers and members of a staff role are staff."""
    is_staff = user.is_superuser or user.groups.filter(role_profile__is_staff_role=True).exists()
    if user.is_staff != is_staff:
        user.is_staff = is_staff
        user.save(update_fields=['is_staff'])


def assign_role(user, role_name):
    user.groups.add(Group.objects.get(name=role_name))
    user.refresh_from_db()
    return user


# ── Signals (connected in AccountsConfig.ready) ────────────────

def groups_changed(sender, instance, action, reverse, pk_set, **kwargs):
    if action not in ('post_add', 'post_remove', 'post_clear'):
        return
    User = get_user_model()
    if not reverse:  # user.groups changed
        sync_staff(instance)
    elif pk_set:  # group.user_set changed for these users
        for user in User.objects.filter(pk__in=pk_set):
            sync_staff(user)
    else:  # group.user_set.clear(): re-check every non-superuser staff member
        for user in User.objects.filter(is_staff=True, is_superuser=False):
            sync_staff(user)


def role_profile_saved(sender, instance, **kwargs):
    for user in instance.group.user_set.all():
        sync_staff(user)


def user_saved(sender, instance, created, update_fields=None, **kwargs):
    if update_fields == frozenset({'is_staff'}):
        return
    sync_staff(instance)


def connect():
    from django.db.models.signals import m2m_changed, post_migrate, post_save

    User = get_user_model()
    m2m_changed.connect(groups_changed, sender=User.groups.through, dispatch_uid='accounts.groups_changed')
    post_save.connect(role_profile_saved, sender=RoleProfile, dispatch_uid='accounts.role_profile_saved')
    post_save.connect(user_saved, sender=User, dispatch_uid='accounts.user_saved')
    post_migrate.connect(ensure_roles, sender=apps.get_app_config('accounts'), dispatch_uid='accounts.ensure_roles')
