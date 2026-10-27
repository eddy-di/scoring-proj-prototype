from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group, Permission
from django.test import override_settings
from rest_framework.test import APITestCase

from accounts.models import RoleProfile
from assessments.models import Assessment
from catalogs.models import AssessmentObject, Unit
from methodologies.models import MethodologyNode
from tests.helpers import make_admin, make_user

FIXTURES = ['catalogs', 'question_library', 'tech_res_methodology', 'example_assessments']
API = '/api/respondent'


class RespondentTestCase(APITestCase):
    fixtures = FIXTURES

    def setUp(self):
        self.user = make_user('expert')
        self.client.force_authenticate(self.user)
        self.node = {n.code: n for n in MethodologyNode.objects.all()}

    def start(self, obj=1, **extra):
        return self.client.post(f'{API}/assessments/', {'object': obj, **extra}, format='json')

    def answer(self, assessment_id, code, **values):
        return self.client.post(f'{API}/assessments/{assessment_id}/answer/',
                                {'node': self.node[code].id, **values}, format='json')


class RespondentFlowTests(RespondentTestCase):
    def test_full_flow(self):
        r = self.start(title='Re-check')
        self.assertEqual(r.status_code, 201, r.content)
        self.assertEqual((r.json()['respondent'], r.json()['methodology_version']), (self.user.id, 1))
        aid = r.json()['id']

        r = self.answer(aid, 'STR_CRACK_WIDTH', numeric_value=1.2)
        self.assertEqual((r.json()['score'], r.json()['assessment_method']), (3, 1))
        self.assertEqual(Assessment.objects.get(pk=aid).status, 'in_progress')

        evaluation = self.client.get(f'{API}/assessments/{aid}/evaluation/').json()
        self.assertEqual(evaluation['total'], 3)

        r = self.client.post(f'{API}/assessments/{aid}/complete/')
        self.assertEqual((r.status_code, len(r.json()['issues'])), (400, 3))

        roof = self.node['STR_ROOF_STATE'].question.options.get(code='minor_wear')
        self.answer(aid, 'STR_ROOF_STATE', option=roof.id)
        self.answer(aid, 'SAF_FIRE_ALARM', boolean_value=True)
        self.answer(aid, 'EN_HEAT_USE', numeric_value=150, comment='Meter readings 2025/26')
        r = self.client.post(f'{API}/assessments/{aid}/complete/')
        self.assertEqual((r.json()['total_score'], r.json()['status']), (3.9, 'completed'))
        self.assertEqual(len(self.client.get(f'{API}/node-results/', {'assessment': aid}).json()), 8)

        self.assertEqual(self.answer(aid, 'EN_HEAT_USE', numeric_value=100).status_code, 409)
        self.client.post(f'{API}/assessments/{aid}/reopen/')
        self.assertEqual(self.answer(aid, 'EN_HEAT_USE', numeric_value=100).status_code, 200)

    def test_evidence_and_partial_answers(self):
        aid = self.start(obj=2).json()['id']
        response = self.answer(aid, 'STR_CRACK_WIDTH').json()  # no value yet: just creates the response
        self.assertIsNone(response['score'])
        r = self.client.post(f'{API}/response-evidence/', {'response': response['id'], 'kind': 'photo', 'uri': 'a.jpg'})
        self.assertEqual(r.status_code, 201)
        self.answer(aid, 'STR_CRACK_WIDTH', comment='east wall')
        self.answer(aid, 'STR_CRACK_WIDTH', numeric_value=6)
        r = self.client.get(f'{API}/responses/', {'assessment': aid}).json()[0]
        self.assertEqual((r['comment'], r['score']), ('east wall', 1))

    def test_answer_validation(self):
        aid = self.start().json()['id']
        roof_option = self.node['STR_ROOF_STATE'].question.options.first()
        self.assertEqual(self.answer(aid, 'EN_HEAT_USE', option=roof_option.id).status_code, 400)
        self.assertEqual(self.answer(aid, 'STR', numeric_value=1).status_code, 400)


class QuestionnaireTests(RespondentTestCase):
    def publish_copy(self):
        """Publishes v1.1, a copy of v1.0."""
        admin = APITestCase.client_class()
        admin.force_authenticate(make_admin())
        v2 = admin.post('/api/admin/versions/1/new-version/').json()['id']
        self.assertEqual(admin.post(f'/api/admin/versions/{v2}/publish/').status_code, 200)
        return v2

    def test_questionnaires_are_the_latest_published_versions(self):
        listed = self.client.get(f'{API}/questionnaires/').json()
        self.assertEqual([(q['code'], q['version_label'], q['question_count']) for q in listed], [('TECH_RES', '1.0', 4)])
        v2 = self.publish_copy()
        listed = self.client.get(f'{API}/questionnaires/', {'object': 1}).json()
        self.assertEqual([(q['version'], q['version_label']) for q in listed], [(v2, '1.1')])
        self.assertEqual(self.start().json()['methodology_version'], v2)

    def test_object_type_without_questionnaire(self):
        office = AssessmentObject.objects.create(object_type_id=2, name='Office 1')
        self.assertEqual(self.client.get(f'{API}/questionnaires/', {'object': office.id}).json(), [])
        r = self.start(obj=office.id)
        self.assertEqual((r.status_code, list(r.json())), (400, ['object']))

    def test_drafts_are_hidden_from_respondents(self):
        admin = APITestCase.client_class()
        admin.force_authenticate(make_admin())
        draft = admin.post('/api/admin/versions/1/new-version/').json()['id']
        versions = {v['id'] for v in self.client.get('/api/admin/versions/').json()}
        self.assertEqual(versions, {1})
        nodes = self.client.get('/api/admin/nodes/').json()
        self.assertTrue(all(n['version'] == 1 for n in nodes))
        self.assertEqual(self.client.get(f'/api/admin/versions/{draft}/tree/').status_code, 404)
        self.assertEqual(len(admin.get('/api/admin/versions/').json()), 2)


class OwnershipTests(RespondentTestCase):
    def test_users_see_and_change_only_their_own_assessments(self):
        mine = self.start().json()['id']
        other = make_user('someone-else')
        theirs = Assessment.objects.create(respondent=other, object_id=1, methodology_version_id=1)

        listed = {a['id'] for a in self.client.get(f'{API}/assessments/').json()}
        self.assertEqual(listed, {mine})
        self.assertEqual(self.client.get(f'{API}/assessments/{theirs.id}/').status_code, 404)
        self.assertEqual(self.answer(theirs.id, 'STR_CRACK_WIDTH', numeric_value=1).status_code, 404)
        self.assertEqual(self.client.get(f'{API}/responses/', {'assessment': theirs.id}).json(), [])

    def test_admin_role_reads_everyone_but_answers_only_its_own(self):
        other = Assessment.objects.create(respondent=self.user, object_id=1, methodology_version_id=1)
        self.client.force_authenticate(make_admin())
        listed = self.client.get(f'{API}/assessments/').json()
        self.assertIn(other.id, {a['id'] for a in listed})
        self.assertEqual(next(a for a in listed if a['id'] == other.id)['respondent_name'], 'expert')
        self.assertEqual(self.client.get(f'{API}/assessments/{other.id}/evaluation/').status_code, 200)
        self.assertEqual(self.answer(other.id, 'STR_CRACK_WIDTH', numeric_value=1).status_code, 404)

    def test_respondents_cannot_change_methodologies_or_catalogs(self):
        self.assertEqual(self.client.post('/api/admin/units/', {'code': 'm'}).status_code, 403)
        self.assertEqual(self.client.post('/api/admin/versions/1/new-version/').status_code, 403)
        self.assertEqual(self.client.post(f'/api/admin/nodes/{self.node["STR_CRACK_WIDTH"].id}/try-rule/',
                                          {'numeric_value': 1}, format='json').status_code, 403)
        r = self.client.post('/api/admin/assessment-objects/', {'object_type': 1, 'name': 'House 9'}, format='json')
        self.assertEqual((r.status_code, r.json()['created_by']), (201, self.user.id))


class RoleTests(APITestCase):
    fixtures = FIXTURES

    def test_a_new_role_with_some_permissions_works_without_code_changes(self):
        """E.g. a division that may edit methodologies but not publish them or touch catalogs."""
        role = Group.objects.create(name='Methodologists')
        RoleProfile.objects.create(group=role, is_staff_role=True)
        role.permissions.set(Permission.objects.filter(
            content_type__app_label='methodologies').exclude(codename__startswith='publish_'))
        user = make_user('anna')
        user.groups.add(role)
        user.refresh_from_db()
        self.assertTrue(user.is_staff)

        self.client.force_authenticate(user)
        v2 = self.client.post('/api/admin/versions/1/new-version/').json()['id']
        self.assertEqual(self.client.post(f'/api/admin/versions/{v2}/publish/').status_code, 403)
        self.assertEqual(self.client.post('/api/admin/units/', {'code': 'm'}).status_code, 403)
        self.assertEqual(len(self.client.get('/api/admin/versions/').json()), 2)  # sees drafts

    def test_staff_status_follows_roles(self):
        user = make_admin('bob')
        self.assertTrue(user.is_staff)
        user.groups.clear()
        user.refresh_from_db()
        self.assertFalse(user.is_staff)


class AccountTests(APITestCase):
    fixtures = FIXTURES

    def register(self, **extra):
        data = {'username': 'aigul', 'password': 'Strong-pass-2026', 'email': 'aigul@example.com',
                'first_name': 'Aigul', 'preferred_language': 'ky', **extra}
        return self.client.post('/api/auth/register/', data, format='json')

    def test_register_signs_in_as_a_standard_user(self):
        r = self.register()
        self.assertEqual(r.status_code, 201, r.content)
        me = r.json()
        self.assertEqual((me['username'], me['is_staff'], me['roles'], me['permissions']), ('aigul', False, [], []))
        self.assertEqual(r.cookies['django_language'].value, 'ky')
        self.assertEqual(self.client.get(f'{API}/questionnaires/').status_code, 200)

    def test_register_validation(self):
        self.register()
        self.client.post('/api/auth/logout/')
        r = self.register(username='other')
        self.assertEqual(list(r.json()), ['email'])  # already used
        r = self.register(username='other', email='other@example.com', password='123')
        self.assertEqual(list(r.json()), ['password'])  # too short and too common

    def test_profile_and_password(self):
        self.register()
        r = self.client.patch('/api/auth/me/', {'organization': 'Gosstroy', 'preferred_language': 'ru'}, format='json')
        self.assertEqual((r.json()['profile']['organization'], r.cookies['django_language'].value), ('Gosstroy', 'ru'))
        r = self.client.post('/api/auth/password/', {'current_password': 'wrong', 'new_password': 'Another-pass-2026'})
        self.assertEqual(r.status_code, 400)
        r = self.client.post('/api/auth/password/', {'current_password': 'Strong-pass-2026', 'new_password': 'Another-pass-2026'})
        self.assertEqual(r.status_code, 204)
        self.assertTrue(self.client.get('/api/auth/me/').json()['authenticated'])  # still signed in
        self.client.post('/api/auth/logout/')
        r = self.client.post('/api/auth/login/', {'username': 'aigul', 'password': 'Another-pass-2026'})
        self.assertEqual(r.status_code, 200)

    def test_me_lists_roles_and_permissions(self):
        self.client.force_authenticate(make_admin())
        me = self.client.get('/api/auth/me/').json()
        self.assertEqual(me['roles'], ['Admin'])
        self.assertIn('methodologies.publish_methodologyversion', me['permissions'])
        self.assertNotIn('accounts.change_user', me['permissions'])

    def test_login_logout(self):
        get_user_model().objects.create_user('expert', password='expert')
        self.assertFalse(self.client.get('/api/auth/me/').json()['authenticated'])
        self.assertIn('csrftoken', self.client.cookies)
        self.assertEqual(self.client.post('/api/auth/login/', {'username': 'expert', 'password': 'x'}).status_code, 400)
        r = self.client.post('/api/auth/login/', {'username': 'expert', 'password': 'expert'})
        self.assertEqual((r.json()['username'], r.json()['is_staff']), ('expert', False))
        self.client.post('/api/auth/logout/')
        self.assertEqual(self.client.get(f'{API}/assessments/').status_code, 403)


class DemoTests(APITestCase):
    fixtures = FIXTURES

    @override_settings(DEMO_RESET_ENABLED=True)
    def test_demo_reset(self):
        self.client.force_authenticate(make_admin())
        Unit.objects.create(code='m', name='Metre')
        Assessment.objects.all().delete()
        self.assertEqual(self.client.post('/api/demo/reset/').status_code, 204)
        self.assertFalse(Unit.objects.filter(code='m').exists())
        self.assertEqual(Assessment.objects.count(), 2)

    @override_settings(DEMO_RESET_ENABLED=False)
    def test_demo_reset_can_be_disabled(self):
        self.client.force_authenticate(make_admin())
        self.assertEqual(self.client.post('/api/demo/reset/').status_code, 403)

    def test_frontend_is_served(self):
        self.assertContains(self.client.get('/'), '<div id="app">')
        self.assertEqual(self.client.get('/js/main.js').status_code, 200)
