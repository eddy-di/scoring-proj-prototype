from django.contrib.auth import get_user_model

from accounts.roles import ADMIN, assign_role


def make_user(username='expert', **extra):
    """A standard user (respondent): no role."""
    return get_user_model().objects.create_user(username, f'{username}@example.com', 'pw-Example-123', **extra)


def make_admin(username='admin'):
    """A member of the built-in Admin role."""
    return assign_role(make_user(username), ADMIN)
