from django.test import TestCase

from assessments import services
from assessments.models import Assessment
from catalogs.models import AssessmentObject, ObjectType
from library.models import Question
from methodologies.models import MethodologyNode, MethodologyVersion
from methodologies.services import validate_version

FIXTURES = ['catalogs', 'apartment_questions', 'apartment_existing_methodology', 'apartment_development_methodology']


class ApartmentMethodologyTests(TestCase):
    fixtures = FIXTURES

    def version(self, code):
        return MethodologyVersion.objects.get(methodology__code=code)

    def start(self, code):
        version = self.version(code)
        obj = AssessmentObject.objects.create(object_type=version.methodology.object_type, name='Test apartment')
        return Assessment.objects.create(object=obj, methodology_version=version)

    def answer(self, assessment, code, **values):
        node = MethodologyNode.objects.get(version=assessment.methodology_version, code=code)
        return services.save_answer(assessment, node, **values)

    def test_the_library_has_every_catalogue_question(self):
        self.assertEqual(Question.objects.count(), 284)

    def test_both_versions_are_drafts_that_can_be_published(self):
        for code, type_code in [('APT_EXISTING', 'apartment_existing'), ('APT_DEVELOPMENT', 'apartment_development')]:
            version = self.version(code)
            self.assertEqual(version.status, 'draft')
            self.assertEqual(version.methodology.object_type, ObjectType.objects.get(code=type_code))
            self.assertEqual(validate_version(version), ([], []), code)

    def test_no_objects_are_included(self):
        self.assertFalse(AssessmentObject.objects.exists())

    def test_only_knock_outs_block_completion(self):
        a = self.start('APT_EXISTING')
        issues = services.completion_issues(a)
        codes = {n.code for n in a.methodology_version.nodes.filter(is_mandatory=True, node_type='question')}
        self.assertEqual({i.split(':')[0] for i in issues}, codes)
        self.assertIn('EX_LEG_SELLER_OWNER', codes)

    def fill_knock_outs(self, assessment, **overrides):
        for node in assessment.methodology_version.nodes.filter(is_mandatory=True, node_type='question').select_related('question'):
            values = overrides.get(node.code)
            if values is None and node.code == 'EX_STR_SEISMIC':
                values = {'option_id': node.question.options.get(code='meets').id}
            if values is None:
                good = {'EX_STR_CRACK_WIDTH': {'numeric_value': 0}, 'DV_CTR_PAYMENTS_PROTECTED': {'numeric_value': 100},
                        'BLD_FIRE_SAFETY': {'scale_level_id': 5}, 'EX_LEG_COURT_ACTIONS': {'boolean_value': False},
                        'EX_STR_ALTERATIONS': {'boolean_value': False}}
                values = good.get(node.code, {'boolean_value': True})
            self.answer(assessment, node.code, **values)

    def test_good_answers_complete_without_a_veto(self):
        for code in ('APT_EXISTING', 'APT_DEVELOPMENT'):
            a = self.start(code)
            self.fill_knock_outs(a)
            self.answer(a, 'LOC_TRANSIT_WALK', numeric_value=5)
            self.assertEqual(services.complete(a), [], code)
            self.assertFalse(a.node_results.get(node__code='ROOT').is_vetoed)
            self.assertEqual(float(a.total_score), 5)

    def test_failed_knock_out_vetoes_the_root(self):
        a = self.start('APT_EXISTING')
        self.fill_knock_outs(a, EX_LEG_SELLER_OWNER={'boolean_value': False})
        self.assertEqual(services.complete(a), [])
        self.assertTrue(a.node_results.get(node__code='ROOT').is_vetoed)

    def test_unknown_answers_stay_out_of_the_score(self):
        a = self.start('APT_EXISTING')
        self.fill_knock_outs(a)
        self.answer(a, 'LOC_TRANSIT_WALK', numeric_value=30)
        self.assertEqual(services.complete(a), [])
        location = a.node_results.get(node__code='LOCATION')
        self.assertEqual(float(location.score), 1)
