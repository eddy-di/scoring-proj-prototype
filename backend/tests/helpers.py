from pathlib import Path

from django.contrib.auth import get_user_model

from accounts.roles import ADMIN, assign_role

# The worked example many tests use: the buildings and their completed assessments.
# Only for tests: the catalogs and the demo data have no building objects.
BUILDING_FIXTURES = ['catalogs', 'question_library', 'tech_res_methodology', str(Path(__file__).parent / 'fixtures' / 'building_example.json')]


def make_user(username='expert', **extra):
    """A standard user (respondent): no role."""
    return get_user_model().objects.create_user(username, f'{username}@example.com', 'pw-Example-123', **extra)


def make_admin(username='admin'):
    """A member of the built-in Admin role."""
    return assign_role(make_user(username), ADMIN)
