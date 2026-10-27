from django.contrib import admin
from django.contrib.auth import get_user_model
from django.test import TestCase
from django.urls import reverse

from methodologies.models import MethodologyNode, MethodologyVersion
from tests.helpers import make_admin

FIXTURES = ['catalogs', 'question_library', 'tech_res_methodology', 'example_assessments']


class DjangoAdminTests(TestCase):
    fixtures = FIXTURES

    def setUp(self):
        self.client.force_login(get_user_model().objects.create_superuser('root', 'root@example.com', 'pw'))

    def test_every_model_is_registered(self):
        from django.apps import apps
        ours = [m for app in ('catalogs', 'library', 'methodologies', 'assessments')
                for m in apps.get_app_config(app).get_models()]
        self.assertEqual(len(ours), 20)
        for model in ours:
            self.assertIn(model, admin.site._registry, model.__name__)

    def test_changelist_add_and_change_pages_render(self):
        for model, model_admin in admin.site._registry.items():
            info = model._meta.app_label, model._meta.model_name
            self.assertEqual(self.client.get(reverse('admin:%s_%s_changelist' % info)).status_code, 200, info)
            self.assertEqual(self.client.get(reverse('admin:%s_%s_add' % info)).status_code, 200, info)
            obj = model.objects.first()
            if obj is not None:
                url = reverse('admin:%s_%s_change' % info, args=[obj.pk])
                self.assertEqual(self.client.get(url).status_code, 200, info)

    def test_published_version_is_read_only(self):
        node = MethodologyNode.objects.get(code='STR_CRACK_WIDTH')
        url = reverse('admin:methodologies_methodologynode_change', args=[node.pk])
        page = self.client.get(url).content.decode()
        self.assertNotIn('name="_save"', page)

    def test_new_version_action(self):
        v1 = MethodologyVersion.objects.get()
        self.client.post(reverse('admin:methodologies_methodologyversion_changelist'),
                         {'action': 'new_version', '_selected_action': [v1.pk]})
        v2 = MethodologyVersion.objects.get(version='1.1')
        self.assertEqual(v2.status, 'draft')
        url = reverse('admin:methodologies_methodologyversion_change', args=[v2.pk])
        self.assertIn('name="_save"', self.client.get(url).content.decode())


class RoleAccessInDjangoAdminTests(TestCase):
    fixtures = FIXTURES

    def test_admin_role_manages_qualimetry_but_not_users(self):
        self.client.force_login(make_admin())
        index = self.client.get(reverse('admin:index')).content.decode()
        self.assertIn('/admin/methodologies/', index)
        self.assertNotIn('/admin/accounts/user/', index)
        self.assertNotIn('/admin/auth/group/', index)
        self.assertEqual(self.client.get(reverse('admin:accounts_user_changelist')).status_code, 403)
        self.assertEqual(self.client.get(reverse('admin:catalogs_unit_add')).status_code, 200)

    def test_superuser_manages_users_and_roles(self):
        self.client.force_login(get_user_model().objects.create_superuser('root', 'root@example.com', 'pw'))
        self.assertEqual(self.client.get(reverse('admin:accounts_user_changelist')).status_code, 200)
        page = self.client.get(reverse('admin:auth_group_changelist')).content.decode()
        self.assertIn('Admin', page)
