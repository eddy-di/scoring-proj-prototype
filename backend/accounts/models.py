"""Users and roles.

- Every person has a User. Self-registered users have no role: they are
  respondents who fill in assessments.
- A role is a Django Group. Its permissions decide what members may do in
  the qualimetry admin. RoleProfile adds a description and marks staff roles:
  members of a staff role get is_staff automatically (see accounts.roles).
- Superusers manage users and roles in Django admin.
"""
from django.conf import settings
from django.contrib.auth.models import AbstractUser, Group
from django.db import models
from django.utils.translation import gettext_lazy as _


class User(AbstractUser):
    organization = models.CharField(_('organization'), max_length=255, blank=True)
    position = models.CharField(_('position'), max_length=255, blank=True)
    phone = models.CharField(_('phone'), max_length=64, blank=True)
    preferred_language = models.CharField(
        _('preferred language'), max_length=8, choices=settings.LANGUAGES, default=settings.LANGUAGE_CODE,
        help_text=_('The interface switches to this language when the user signs in.'))

    class Meta:
        db_table = 'users'
        verbose_name = _('user')
        verbose_name_plural = _('users')

    @property
    def display_name(self):
        return self.get_full_name() or self.username


class RoleProfile(models.Model):
    """Extra settings of a role (a Django Group)."""

    group = models.OneToOneField(Group, on_delete=models.CASCADE, related_name='role_profile', verbose_name=_('role'))
    description = models.TextField(_('description'), blank=True)
    is_staff_role = models.BooleanField(
        _('staff role'), default=True,
        help_text=_('Members can sign in to the admin dashboard and Django admin. Their permissions decide what they '
                    'can do there.'))

    class Meta:
        db_table = 'role_profiles'
        verbose_name = _('role settings')
        verbose_name_plural = _('role settings')

    def __str__(self):
        return self.group.name
