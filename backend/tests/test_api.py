from django.contrib.auth import get_user_model

from rest_framework.test import APITestCase

from methodologies.models import MethodologyNode, MethodologyVersion
from tests.helpers import make_admin, make_user

FIXTURES = ['catalogs', 'question_library', 'tech_res_methodology', 'example_assessments']
API = '/api/admin'


def tr(field, en, ru=None, ky=None):
    """A translated field in every language: tr('name', 'Metre') → name_en, name_ru, name_ky."""
    return {f'{field}_en': en, f'{field}_ru': ru or f'{en} (ru)', f'{field}_ky': ky or f'{en} (ky)'}


class AdminApiTestCase(APITestCase):
    fixtures = FIXTURES

    def setUp(self):
        self.client.force_authenticate(make_admin())
        self.v1 = MethodologyVersion.objects.get(version='1.0')

    def node(self, code, version=None):
        return MethodologyNode.objects.get(code=code, version=version or self.v1)


class AccessTests(AdminApiTestCase):
    def test_every_list_endpoint_works(self):
        root = self.client.get(f'{API}/').json()
        for name, url in root.items():
            self.assertEqual(self.client.get(url).status_code, 200, name)
        self.assertIn('answer_type', self.client.get(f'{API}/choices/').json())

    def test_respondents_read_but_only_staff_write(self):
        self.client.force_authenticate(make_user('respondent'))
        self.assertEqual(self.client.get(f'{API}/questions/').status_code, 200)
        self.assertEqual(self.client.post(f'{API}/units/', {'code': 'm', 'name': 'Metre'}).status_code, 403)
        r = self.client.post(f'{API}/assessment-objects/', {'object_type': 1, 'name': 'House 9'}, format='json')
        self.assertEqual(r.status_code, 201)
        self.assertEqual(self.client.delete(f'{API}/assessment-objects/{r.json()["id"]}/').status_code, 403)
        self.client.force_authenticate(None)
        self.assertEqual(self.client.get(f'{API}/questions/').status_code, 403)


class CatalogAndLibraryTests(AdminApiTestCase):
    def test_scale_with_nested_levels(self):
        r = self.client.post(f'{API}/rating-scales/', {
            'code': 'pct_100', **tr('name', '0–100 %'), 'scale_type': 'ratio', 'min_value': 0, 'max_value': 100,
            'levels': [{'value': 0, **tr('label', 'None')}, {'value': 100, **tr('label', 'Full')}],
        }, format='json')
        self.assertEqual(r.status_code, 201, r.content)
        self.assertEqual([lv['label'] for lv in r.json()['levels']], ['None', 'Full'])

    def test_question_with_options(self):
        r = self.client.post(f'{API}/questions/', {
            'code': 'COM_NOISE', **tr('text', 'How noisy is the street?'), 'answer_type': 'single_choice',
            'options': [{'code': 'quiet', **tr('label', 'Quiet')}, {'code': 'loud', **tr('label', 'Loud'), 'sort_order': 1}],
        }, format='json')
        self.assertEqual(r.status_code, 201, r.content)
        q = r.json()
        quiet = q['options'][0]
        r = self.client.patch(f'{API}/questions/{q["id"]}/', {
            'options': [{'id': quiet['id'], 'code': 'quiet', **tr('label', 'Quiet street')}],
        }, format='json')
        self.assertEqual([o['label'] for o in r.json()['options']], ['Quiet street'])

    def test_options_only_for_choice_questions(self):
        r = self.client.post(f'{API}/questions/', {
            'code': 'X', **tr('text', 'x'), 'answer_type': 'numeric', 'options': [{'code': 'a', **tr('label', 'A')}],
        }, format='json')
        self.assertEqual(r.status_code, 400)

    def test_question_used_by_published_version_is_protected(self):
        crack = self.node('STR_CRACK_WIDTH').question
        r = self.client.patch(f'{API}/questions/{crack.id}/', {'answer_type': 'text'}, format='json')
        self.assertEqual(r.status_code, 400)
        self.assertEqual(self.client.delete(f'{API}/questions/{crack.id}/').status_code, 409)
        r = self.client.get(f'{API}/questions/{crack.id}/').json()
        self.assertEqual(r['used_in'][0]['status'], 'published')


class MethodologyTests(AdminApiTestCase):
    def test_create_methodology_makes_draft_with_root(self):
        r = self.client.post(f'{API}/methodologies/', {
            'code': 'OFFICE', **tr('name', 'Office condition', 'Состояние офиса', 'Кеңсенин абалы'), 'result_scale': 1},
            format='json')
        self.assertEqual(r.status_code, 201, r.content)
        version = r.json()['versions'][0]
        self.assertEqual((version['version'], version['status']), ('1.0', 'draft'))
        tree = self.client.get(f'{API}/versions/{version["id"]}/tree/').json()
        self.assertEqual((tree['code'], tree['children']), ('ROOT', []))
        self.assertEqual((tree['name_ru'], tree['name_ky']), ('Состояние офиса', 'Кеңсенин абалы'))

    def test_tree(self):
        tree = self.client.get(f'{API}/versions/{self.v1.id}/tree/').json()
        self.assertEqual([c['code'] for c in tree['children']], ['STR', 'SAF', 'EN'])
        crack = tree['children'][0]['children'][0]
        self.assertEqual(crack['scoring_rule']['criteria'][2]['condition'], '0.5 ≤ x < 2 mm')
        self.assertEqual(crack['assessment_methods'][0]['method_code'], 'measurement')

    def test_published_version_is_locked(self):
        crack = self.node('STR_CRACK_WIDTH')
        self.assertEqual(self.client.patch(f'{API}/nodes/{crack.id}/', {'weight': 0.5}).status_code, 409)
        self.assertEqual(self.client.post(f'{API}/score-criteria/', {
            'scoring_rule': crack.scoring_rule.id, 'range_from': 100, 'score': 1}).status_code, 409)
        self.assertEqual(self.client.delete(f'{API}/versions/{self.v1.id}/').status_code, 409)
        self.assertEqual(self.client.patch(f'{API}/versions/{self.v1.id}/', {'notes': 'x'}).status_code, 409)

    def test_try_rule(self):
        crack, heat, roof = self.node('STR_CRACK_WIDTH'), self.node('EN_HEAT_USE'), self.node('STR_ROOF_STATE')
        r = self.client.post(f'{API}/nodes/{crack.id}/try-rule/', {'numeric_value': 1.2}, format='json').json()
        self.assertEqual((r['score'], r['matched_criterion']['label'], r['scale_level']['label']),
                         (3, 'Local cracks', 'Satisfactory'))
        r = self.client.post(f'{API}/nodes/{heat.id}/try-rule/', {'numeric_value': 150}, format='json').json()
        self.assertEqual(r['score'], 3.5)
        leaking = roof.question.options.get(code='leaking')
        r = self.client.post(f'{API}/nodes/{roof.id}/try-rule/', {'option': leaking.id}, format='json').json()
        self.assertEqual(r['score'], 1)

    def test_new_version_edit_validate_publish(self):
        """Admin flow A12–A14: copy v1.0, add a Comfort group with the humidity question, publish v1.1."""
        r = self.client.post(f'{API}/versions/{self.v1.id}/new-version/')
        self.assertEqual(r.status_code, 201)
        v2 = MethodologyVersion.objects.get(pk=r.json()['id'])
        self.assertEqual((v2.version, v2.status, v2.nodes.count()), ('1.1', 'draft', 8))
        self.assertEqual(self.node('STR_CRACK_WIDTH', v2).scoring_rule.criteria.count(), 5)
        self.assertEqual(self.node('STR', v2).parent, self.node('ROOT', v2))

        root = self.node('ROOT', v2)
        group = self.client.post(f'{API}/nodes/', {
            'version': v2.id, 'parent': root.id, 'node_type': 'group', 'code': 'COM', **tr('name', 'Comfort'),
            'weight': 0.1}, format='json').json()
        self.assertEqual(group['aggregation_type'], 'weighted_arithmetic_mean')
        q = self.client.get(f'{API}/questions/', {'search': 'COM_INDOOR_HUMIDITY'}).json()[0]
        node = self.client.post(f'{API}/nodes/', {
            'version': v2.id, 'parent': group['id'], 'node_type': 'question', 'code': 'COM_INDOOR_HUMIDITY',
            **tr('name', 'Indoor humidity'), 'question': q['id']}, format='json').json()
        self.assertIsNotNone(node['scoring_rule'])
        r = self.client.patch(f'{API}/scoring-rules/{node["scoring_rule"]}/', {
            'normalization_type': 'linear_target', 'raw_min': 20, 'target_value': 45, 'raw_max': 70}, format='json')
        self.assertEqual(r.status_code, 200, r.content)

        validation = self.client.get(f'{API}/versions/{v2.id}/validation/').json()
        self.assertFalse(validation['can_publish'])
        self.assertIn('ROOT: child weights add up to 1.1, expected 1.', validation['errors'])
        self.assertEqual(self.client.post(f'{API}/versions/{v2.id}/publish/').status_code, 400)

        self.client.patch(f'{API}/nodes/{self.node("EN", v2).id}/', {'weight': 0.1}, format='json')
        self.client.post(f'{API}/node-assessment-methods/', {
            'node': node['id'], 'assessment_method': 1, 'instructions': 'Hygrometer in three rooms.'}, format='json')
        r = self.client.post(f'{API}/versions/{v2.id}/publish/')
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(r.json()['status'], 'published')

        r = self.client.post(f'{API}/nodes/{node["id"]}/try-rule/', {'numeric_value': 45}, format='json').json()
        self.assertEqual(r['score'], 5)
        self.assertEqual(self.client.post(f'{API}/versions/{self.v1.id}/archive/').json()['status'], 'archived')

    def test_node_rules(self):
        v2 = MethodologyVersion.objects.get(pk=self.client.post(f'{API}/versions/{self.v1.id}/new-version/').json()['id'])
        root, crack, strg = self.node('ROOT', v2), self.node('STR_CRACK_WIDTH', v2), self.node('STR', v2)
        bad = [
            {'version': v2.id, 'parent': None, 'node_type': 'group', 'code': 'R2', 'name': 'second root'},
            {'version': v2.id, 'parent': crack.id, 'node_type': 'group', 'code': 'G', 'name': 'under a question'},
            {'version': v2.id, 'parent': root.id, 'node_type': 'group', 'code': 'STR', 'name': 'duplicate code'},
            {'version': v2.id, 'parent': self.node('ROOT').id, 'node_type': 'group', 'code': 'G', 'name': 'other version'},
        ]
        for data in bad:
            self.assertEqual(self.client.post(f'{API}/nodes/', data, format='json').status_code, 400, data['name'])
        r = self.client.patch(f'{API}/nodes/{strg.id}/', {'parent': crack.id}, format='json')
        self.assertEqual(r.status_code, 400)
        self.assertEqual(self.client.delete(f'{API}/nodes/{root.id}/').status_code, 400)

        # Linking another question clears the criteria tied to the old one.
        heat_q = self.node('EN_HEAT_USE').question_id
        self.client.patch(f'{API}/nodes/{self.node("STR_ROOF_STATE", v2).id}/', {'question': heat_q}, format='json')
        self.assertEqual(self.node('STR_ROOF_STATE', v2).scoring_rule.criteria.count(), 0)

        # Deleting a group deletes its subtree.
        self.assertEqual(self.client.delete(f'{API}/nodes/{strg.id}/').status_code, 204)
        self.assertEqual(v2.nodes.count(), 5)

    def test_criterion_validation_and_default_level(self):
        v2 = MethodologyVersion.objects.get(pk=self.client.post(f'{API}/versions/{self.v1.id}/new-version/').json()['id'])
        rule = self.node('STR_CRACK_WIDTH', v2).scoring_rule
        roof_option = self.node('STR_ROOF_STATE').question.options.first()
        r = self.client.post(f'{API}/score-criteria/', {'scoring_rule': rule.id, 'option': roof_option.id, 'score': 1},
                             format='json')
        self.assertEqual(r.status_code, 400)
        r = self.client.post(f'{API}/score-criteria/', {'scoring_rule': rule.id, 'range_from': 9, 'range_to': 3,
                                                        'score': 1}, format='json')
        self.assertEqual(r.status_code, 400)
        rule.criteria.filter(range_to__isnull=True).delete()
        r = self.client.post(f'{API}/score-criteria/', {'scoring_rule': rule.id, 'range_from': 5, 'score': 1.4,
                                                        'label': 'Critical'}, format='json')
        self.assertEqual(r.status_code, 201, r.content)
        self.assertEqual((r.json()['condition'], r.json()['scale_level']), ('5 ≤ x < ∞ mm', 1))


class TranslationTests(AdminApiTestCase):
    def test_required_texts_need_every_language(self):
        r = self.client.post(f'{API}/units/', {'code': 'm', 'name_en': 'Metre', 'name_ru': 'Метр'}, format='json')
        self.assertEqual(r.status_code, 400)
        self.assertEqual(list(r.json()), ['name_ky'])
        # Optional texts stay optional.
        r = self.client.post(f'{API}/units/', {'code': 'm', **tr('name', 'Metre', 'Метр', 'Метр')}, format='json')
        self.assertEqual(r.status_code, 201, r.content)
        self.assertIsNone(r.json()['description_ky'])
        # Blanking a required translation later is refused too.
        r = self.client.patch(f'{API}/units/{r.json()["id"]}/', {'name_ru': ' '}, format='json')
        self.assertEqual(list(r.json()), ['name_ru'])

    def test_content_follows_the_request_language(self):
        crack = self.node('STR_CRACK_WIDTH').question
        for lang, text in [('en', 'What is the width'), ('ru', 'Какова ширина'), ('ky', 'Көтөрүүчү дубалдардагы')]:
            r = self.client.get(f'{API}/questions/{crack.id}/', HTTP_ACCEPT_LANGUAGE=lang).json()
            self.assertTrue(r['text'].startswith(text), (lang, r['text']))
            self.assertIn('text_ky', r)

    def test_messages_follow_the_language_cookie(self):
        self.client.cookies['django_language'] = 'ru'
        r = self.client.post(f'{API}/units/', {'code': 'm', 'name_en': 'Metre'}, format='json')
        self.assertEqual(r.json()['name_ru'], 'Обязательно на языке: Русский.')
        validation = self.client.get(f'{API}/versions/{self.v1.id}/validation/').json()
        self.assertTrue(validation['can_publish'])

    def test_new_nodes_get_a_default_name_in_every_language(self):
        v2 = self.client.post(f'{API}/versions/{self.v1.id}/new-version/').json()['id']
        root = self.node('ROOT', MethodologyVersion.objects.get(pk=v2))
        r = self.client.post(f'{API}/nodes/', {'version': v2, 'parent': root.id, 'node_type': 'group', 'code': 'G1'},
                             format='json').json()
        self.assertEqual((r['name_en'], r['name_ru'], r['name_ky']), ('New group', 'Новая группа', 'Жаңы топ'))

    def test_me_describes_the_languages(self):
        me = self.client.get('/api/auth/me/', HTTP_ACCEPT_LANGUAGE='ky').json()
        self.assertEqual(me['language'], 'ky')
        self.assertEqual([x['code'] for x in me['languages']], ['en', 'ru', 'ky'])
        self.assertEqual(me['required_languages'], ['en', 'ru', 'ky'])
        self.assertEqual(me['translated_fields']['questions'], {'text': True, 'description': False})


class FrontendTranslationTests(APITestCase):
    def test_every_frontend_text_is_translated(self):
        """Run "python manage.py frontend_messages" and translate the new texts if this fails."""
        from pathlib import Path

        import polib
        from django.conf import settings

        from assessments.management.commands.frontend_messages import collect

        texts = collect(Path(settings.FRONTEND_DIR) / 'js')
        self.assertGreater(len(texts), 500)
        for code, _name in settings.LANGUAGES:
            if code == settings.LANGUAGE_CODE:
                continue
            po = polib.pofile(str(Path(settings.LOCALE_PATHS[0]) / code / 'LC_MESSAGES' / 'djangojs.po'))
            translated = {e.msgid for e in po if e.msgstr}
            self.assertEqual(sorted(set(texts) - translated), [], code)

    def test_js_catalog_follows_the_language_cookie(self):
        self.client.cookies['django_language'] = 'ky'
        catalog = self.client.get('/api/i18n/catalog/').json()['catalog']
        self.assertEqual(catalog['Sign in'], 'Кирүү')
        self.client.cookies['django_language'] = 'ru'
        self.assertEqual(self.client.get('/api/i18n/catalog/').json()['catalog']['Sign in'], 'Войти')
