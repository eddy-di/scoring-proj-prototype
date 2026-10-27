"""Example data for demos and training: reloads the fixtures and creates the demo users."""
from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.db import transaction

from accounts.roles import ADMIN, assign_role
from assessments.models import Assessment
from catalogs.models import AssessmentMethod, AssessmentObject, ObjectType, RatingScale, Unit
from library.models import Question, QuestionCategory
from methodologies.models import Methodology

FIXTURES = ['catalogs', 'question_library', 'tech_res_methodology', 'example_assessments']

# username, password, role, what they can do
DEMO_USERS = [
    ('root', 'root', 'superuser', 'manages users and roles in Django admin, and everything else'),
    ('admin', 'admin', ADMIN, 'catalogs, questions, methodologies and all assessments; not users'),
    ('expert', 'expert', None, 'standard user: fills in assessments, owns the example assessments'),
]
# The example assessments belong to this user.
DEMO_RESPONDENT = 'expert'


@transaction.atomic
def reset_demo_data():
    """Deletes every domain record and loads the example fixtures again. Users are kept."""
    # Order matters: PROTECT foreign keys point from later tables to earlier ones.
    for model in (Assessment, Methodology, Question, QuestionCategory, AssessmentObject,
                  Unit, ObjectType, RatingScale, AssessmentMethod):
        model.objects.all().delete()
    call_command('loaddata', *FIXTURES, verbosity=0)
    give_example_assessments_to_demo_respondent()


def give_example_assessments_to_demo_respondent():
    user = get_user_model().objects.filter(username=DEMO_RESPONDENT).first()
    if user is not None:
        Assessment.objects.filter(respondent__isnull=True).update(respondent=user)


def ensure_demo_users():
    """Creates the demo users that don't exist yet. Returns the usernames created."""
    User = get_user_model()
    created = []
    for username, password, role, _what in DEMO_USERS:
        if User.objects.filter(username=username).exists():
            continue
        if role == 'superuser':
            User.objects.create_superuser(username, f'{username}@example.com', password)
        else:
            user = User.objects.create_user(username, f'{username}@example.com', password, first_name=username.title())
            if role:
                assign_role(user, role)
        created.append(username)
    give_example_assessments_to_demo_respondent()
    return created
