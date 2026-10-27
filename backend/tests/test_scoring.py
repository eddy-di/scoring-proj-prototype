from django.test import TestCase

from assessments import services
from assessments.models import Assessment
from methodologies import formulas
from methodologies.models import MethodologyNode
from methodologies.scoring import Answer, aggregate, score_answer

FIXTURES = ['catalogs', 'question_library', 'tech_res_methodology', 'example_assessments']


class WorkedExampleTests(TestCase):
    fixtures = FIXTURES

    def recompute(self, assessment):
        for response in assessment.responses.all():
            services.rescore(response)
        root, results = services.evaluate(assessment)
        return {n.code: results[n.id] for n in assessment.methodology_version.nodes.all()}

    def test_block_a_scores_3_9_good(self):
        a = Assessment.objects.get(object__external_ref='RC-0042')
        r = self.recompute(a)
        self.assertEqual({c: round(r[c]['score'], 4) for c in r}, {
            'STR_CRACK_WIDTH': 3, 'STR_ROOF_STATE': 4, 'SAF_FIRE_ALARM': 5, 'EN_HEAT_USE': 3.5,
            'STR': 3.4, 'SAF': 5, 'EN': 3.5, 'ROOT': 3.9,
        })
        self.assertFalse(r['ROOT']['is_vetoed'])
        self.assertEqual(float(a.total_score), 3.9)
        self.assertEqual(a.total_scale_level.label, 'Good')

    def test_missing_fire_alarm_vetoes_the_building(self):
        a = Assessment.objects.get(object__external_ref='GL-0007')
        r = self.recompute(a)
        self.assertAlmostEqual(r['ROOT']['score'], 2.7)
        self.assertTrue(r['SAF']['is_vetoed'])
        self.assertTrue(r['ROOT']['is_vetoed'])
        self.assertTrue(a.node_results.get(node__code='ROOT').is_vetoed)

    def test_reopen_and_complete(self):
        a = Assessment.objects.get(object__external_ref='RC-0042')
        services.reopen(a)
        self.assertFalse(a.node_results.exists())
        self.assertEqual(services.complete(a), [])
        self.assertEqual(float(a.total_score), 3.9)

    def test_unanswered_mandatory_question_blocks_completion(self):
        a = Assessment.objects.get(object__external_ref='RC-0042')
        a.responses.filter(node__code='EN_HEAT_USE').delete()
        self.assertEqual(services.complete(a), ['EN_HEAT_USE: mandatory question is not answered.'])


class RuleTests(TestCase):
    fixtures = FIXTURES[:3]

    def node(self, code):
        return MethodologyNode.objects.get(code=code)

    def test_crack_ranges(self):
        node = self.node('STR_CRACK_WIDTH')
        for value, expected in [(0, 5), (0.1, 4), (0.49, 4), (0.5, 3), (2, 2), (5, 1), (40, 1)]:
            self.assertEqual(score_answer(node, Answer(numeric_value=value)).score, expected, value)

    def test_linear_min_max_clamps(self):
        node = self.node('EN_HEAT_USE')
        self.assertEqual(score_answer(node, Answer(numeric_value=300)).score, 1)
        self.assertEqual(score_answer(node, Answer(numeric_value=90)).score, 5)
        self.assertAlmostEqual(score_answer(node, Answer(numeric_value=170)).score, 3)

    def test_not_applicable_and_unanswered(self):
        node = self.node('SAF_FIRE_ALARM')
        self.assertIsNone(score_answer(node, Answer(is_not_applicable=True)).score)
        self.assertEqual(score_answer(node, Answer()).note, 'Not answered yet.')


class AggregationAndFormulaTests(TestCase):
    def test_weights_are_rescaled_over_scored_children(self):
        self.assertAlmostEqual(aggregate('weighted_arithmetic_mean', [(3, 0.5), (5, 0.3)]), 3.75)
        self.assertEqual(aggregate('min', [(3, 1), (2, 1)]), 2)
        self.assertIsNone(aggregate('weighted_sum', []))

    def test_custom_formula(self):
        self.assertAlmostEqual(aggregate('custom_formula', [(2, 1), (4, 1)], 'sum(a * b for a, b in zip(s, w))'), 3)
        self.assertEqual(formulas.evaluate('hi if x > 10 else lo', x=11, lo=1, hi=5), 5)

    def test_formulas_reject_unsafe_code(self):
        for bad in ['__import__("os")', 'x.__class__', 'open("f")', 'lambda: 1', 'x +']:
            with self.assertRaises(formulas.FormulaError, msg=bad):
                formulas.evaluate(bad, x=1, lo=1, hi=5)
