from django.test import TestCase

from assessments import services
from assessments.models import Assessment
from methodologies import formulas
from methodologies.models import MethodologyNode
from methodologies.scoring import Answer, aggregate, score_answer

FIXTURES = ['catalogs', 'question_library', 'tech_res_methodology', 'example_assessments']
SUPPLIER_FIXTURES = FIXTURES + ['supplier_catalogs', 'supplier_questions', 'supplier_methodology', 'supplier_assessments']


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



class SupplierExampleTests(TestCase):
    """The second example domain: suppliers instead of buildings, same engine."""
    fixtures = SUPPLIER_FIXTURES

    def recompute(self, assessment):
        for response in assessment.responses.all():
            services.rescore(response)
        _root, results = services.evaluate(assessment)
        return {n.code: results[n.id] for n in assessment.methodology_version.nodes.all()}

    def node(self, code):
        return MethodologyNode.objects.get(version__methodology__code='SUPPLIER_EVAL', code=code)

    def test_reliable_supplier_scores_good(self):
        a = Assessment.objects.get(object__external_ref='SUP-0101')
        r = self.recompute(a)
        self.assertEqual({c: round(r[c]['score'], 4) for c in ('DEL', 'QUA', 'PRC', 'CMP', 'ROOT')},
                         {'DEL': 4.12, 'QUA': 4.3867, 'PRC': 4.3285, 'CMP': 5, 'ROOT': 4.3431})
        self.assertFalse(r['ROOT']['is_vetoed'])
        self.assertEqual(a.total_scale_level.label, 'Good')

    def test_high_reject_rate_knocks_the_supplier_out(self):
        a = Assessment.objects.get(object__external_ref='SUP-0102')
        r = self.recompute(a)
        self.assertAlmostEqual(r['SUP_REJECT_RATE']['score'], 1.4)
        self.assertTrue(r['QUA']['is_vetoed'])
        self.assertTrue(r['ROOT']['is_vetoed'])
        self.assertFalse(r['DEL']['is_vetoed'])

    def test_unfinished_review_lists_the_missing_answers(self):
        a = Assessment.objects.get(object__external_ref='SUP-0103')
        self.assertEqual(len(services.complete(a)), 5)  # 9 questions, 3 answered, the certificate is optional

    def test_rules(self):
        reject = self.node('SUP_REJECT_RATE')  # formula
        self.assertEqual([score_answer(reject, Answer(numeric_value=x)).score for x in (0, 5, 10, 30)], [5, 3, 1, 1])
        price = self.node('SUP_PRICE_LEVEL')  # linear_target
        self.assertEqual([score_answer(price, Answer(numeric_value=x)).score for x in (95, 70, 130, 60)], [5, 1, 1, 1])
        lead = self.node('SUP_LEAD_TIME')  # criteria lookup, lower is better
        self.assertEqual([score_answer(lead, Answer(numeric_value=x)).score for x in (3, 7, 29, 90)], [5, 4, 3, 1])
        incidents = self.node('SUP_INCIDENTS')  # multi_choice: the worst selected option applies
        self.assertEqual(score_answer(incidents, Answer(option_ids=[14, 17])).score, 1)
        communication = self.node('SUP_COMMUNICATION')  # the scale level is the score
        self.assertEqual(score_answer(communication, Answer(scale_level_id=4)).score, 4)

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
