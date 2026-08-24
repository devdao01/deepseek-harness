# -*- coding: utf-8 -*-
"""Config-plane management: credentials, providers, models, settings, discover.

The harness client is mocked, so these assert exactly what Odoo sends per method
and how the returned values are mirrored. All actions are manager-gated, so the
test user is granted the NPEI Agent Manager group in setUp.
"""
from unittest.mock import patch

from odoo.exceptions import UserError
from odoo.tests.common import TransactionCase


class TestConfigManagement(TransactionCase):
    def setUp(self):
        super().setUp()
        # Config actions are manager-gated (_check_manager); grant the group so
        # they run instead of raising AccessError.
        self.env.user.groups_id = [
            (4, self.env.ref('npei_agent_harness.group_npei_agent_manager').id)]
        self._calls = []

        client_cls = type(self.env['npei.agent.harness.client'])

        def fake_rpc(model, method, payload=None):
            self._calls.append((method, payload))
            if method == 'credentials.describe':
                refs = (payload or {}).get('refs') or []
                return {'credentials': {
                    ref: {'configured': True, 'source': 'env', 'writable': True}
                    for ref in refs
                }}
            if method in ('credentials.set', 'credentials.unset'):
                return {}
            if method == 'llm.providers':
                return {'providers': [{
                    'provider': 'deepseek',
                    'displayName': 'DeepSeek',
                    'settingsNs': 'llm.deepseek',
                    'settingsPath': ['llm', 'deepseek'],
                    'active': True,
                    'declared': True,
                }]}
            if method == 'llm.models':
                return {
                    'groups': [{
                        'id': 'deepseek',
                        'name': 'DeepSeek',
                        'models': [
                            {'id': 'deepseek-chat', 'name': 'Chat',
                             'description': 'general'},
                            {'id': 'deepseek-reasoner', 'name': 'Reasoner',
                             'reasoning': True},
                        ],
                    }],
                    'failures': [{'id': 'broken', 'name': 'Broken',
                                  'message': 'boom'}],
                }
            if method == 'llm.discoverModels':
                return {'models': [
                    {'id': 'm1', 'name': 'Model One',
                     'contextWindow': 4096, 'maxTokens': 2048},
                    {'id': 'm2'},
                ]}
            if method == 'settings.describe':
                return {
                    'writable': True,
                    'hasDocument': True,
                    'namespaces': [{
                        'ns': 'llm',
                        'schema': {},
                        'value': {'model': 'deepseek-chat'},
                        'user': {'model': 'deepseek-chat'},
                        'applies': 'live',
                        'secrets': [],
                        'revision': 3,
                    }],
                }
            if method == 'settings.replace':
                request = payload or {}
                return {
                    'ns': request.get('ns'),
                    'value': request.get('section'),
                    'user': request.get('section'),
                    'applies': 'live',
                    'revision': (request.get('expectedRevision') or 0) + 1,
                }
            return {}

        patcher = patch.object(client_cls, '_rpc', fake_rpc)
        patcher.start()
        self.addCleanup(patcher.stop)

    def _calls_for(self, method):
        """Every captured payload for ``method``, in call order."""
        return [payload for call_method, payload in self._calls
                if call_method == method]

    # ------------------------------------------------------------------
    # Credentials
    # ------------------------------------------------------------------
    def test_credential_write_pushes_value_without_storing_it(self):
        cred = self.env['npei.agent.credential'].create({'ref': 'DEEPSEEK_API_KEY'})
        self._calls.clear()

        cred.write({'value': 'sk-secret'})

        self.assertEqual(
            self._calls_for('credentials.set'),
            [{'ref': 'DEEPSEEK_API_KEY', 'value': 'sk-secret'}])
        self.assertFalse(cred.value)                 # popped, never stored
        self.assertTrue(cred.configured)
        self.assertEqual(cred.source, 'env')
        self.assertTrue(cred.writable)

    def test_credential_create_with_value_pushes_it(self):
        cred = self.env['npei.agent.credential'].create({
            'ref': 'OPENAI_API_KEY', 'value': 'sk-new'})

        self.assertEqual(
            self._calls_for('credentials.set'),
            [{'ref': 'OPENAI_API_KEY', 'value': 'sk-new'}])
        self.assertFalse(cred.value)

    def test_credential_write_without_value_skips_set(self):
        cred = self.env['npei.agent.credential'].create({'ref': 'DEEPSEEK_API_KEY'})
        self._calls.clear()

        cred.write({'ref': 'DEEPSEEK_API_KEY'})

        self.assertEqual(self._calls_for('credentials.set'), [])

    def test_credential_unset_calls_harness(self):
        cred = self.env['npei.agent.credential'].create({
            'ref': 'DEEPSEEK_API_KEY', 'configured': True})

        cred.action_unset()

        self.assertEqual(
            self._calls_for('credentials.unset'),
            [{'ref': 'DEEPSEEK_API_KEY'}])

    def test_credential_sync_updates_status(self):
        cred = self.env['npei.agent.credential'].create({'ref': 'DEEPSEEK_API_KEY'})
        self._calls.clear()

        self.env['npei.agent.credential'].action_sync_from_harness()

        self.assertEqual(
            self._calls_for('credentials.describe'),
            [{'refs': ['DEEPSEEK_API_KEY']}])
        self.assertTrue(cred.configured)
        self.assertEqual(cred.source, 'env')
        self.assertTrue(cred.writable)

    # ------------------------------------------------------------------
    # Providers
    # ------------------------------------------------------------------
    def test_provider_sync_upserts(self):
        Provider = self.env['npei.agent.provider']

        Provider.action_sync_from_harness()

        self.assertEqual(self._calls_for('llm.providers'), [{}])
        provider = Provider.search([('provider', '=', 'deepseek')])
        self.assertEqual(len(provider), 1)
        self.assertEqual(provider.display_name, 'DeepSeek')
        self.assertEqual(provider.settings_ns, 'llm.deepseek')
        self.assertEqual(provider.settings_path, 'llm/deepseek')
        self.assertTrue(provider.route_active)
        self.assertTrue(provider.declared)

        # A second sync updates in place instead of duplicating.
        Provider.action_sync_from_harness()
        self.assertEqual(
            len(Provider.search([('provider', '=', 'deepseek')])), 1)

    # ------------------------------------------------------------------
    # Models
    # ------------------------------------------------------------------
    def test_model_sync_upserts_per_group(self):
        Model = self.env['npei.agent.model']

        Model.action_sync_from_harness()

        self.assertEqual(self._calls_for('llm.models'), [{}])
        models = Model.search([('provider', '=', 'deepseek')])
        self.assertEqual(len(models), 2)
        chat = Model.search([
            ('provider', '=', 'deepseek'), ('model_id', '=', 'deepseek-chat')])
        self.assertEqual(chat.name, 'Chat')
        self.assertEqual(chat.description, 'general')

    # ------------------------------------------------------------------
    # Discover wizard
    # ------------------------------------------------------------------
    def test_discover_sends_only_non_blank_keys(self):
        wizard = self.env['npei.agent.discover.models'].create({
            'settings_ns': 'llm.deepseek',
            'provider': 'deepseek',
        })

        action = wizard.action_discover()

        self.assertEqual(
            self._calls_for('llm.discoverModels'),
            [{'settingsNs': 'llm.deepseek', 'provider': 'deepseek'}])
        self.assertIn('m1', wizard.result_text)
        self.assertIn('Model One', wizard.result_text)
        self.assertEqual(action['res_model'], 'npei.agent.discover.models')
        self.assertEqual(action['res_id'], wizard.id)

    # ------------------------------------------------------------------
    # Settings namespaces
    # ------------------------------------------------------------------
    def test_setting_sync_upserts(self):
        Setting = self.env['npei.agent.setting']

        Setting.action_sync_from_harness()

        self.assertEqual(self._calls_for('settings.describe'), [{}])
        namespace = Setting.search([('ns', '=', 'llm')])
        self.assertEqual(len(namespace), 1)
        self.assertEqual(namespace.applies, 'live')
        self.assertEqual(namespace.revision, 3)
        self.assertTrue(namespace.has_document)
        self.assertIn('deepseek-chat', namespace.value_json)
        self.assertIn('deepseek-chat', namespace.user_json)

    def test_setting_save_replaces_with_expected_revision(self):
        Setting = self.env['npei.agent.setting']
        Setting.action_sync_from_harness()
        namespace = Setting.search([('ns', '=', 'llm')])
        namespace.user_json = '{"model": "deepseek-reasoner"}'
        self._calls.clear()

        namespace.action_save()

        self.assertEqual(
            self._calls_for('settings.replace'),
            [{'ns': 'llm',
              'section': {'model': 'deepseek-reasoner'},
              'expectedRevision': 3}])
        self.assertEqual(namespace.revision, 4)

    def test_setting_save_rejects_invalid_json(self):
        Setting = self.env['npei.agent.setting']
        Setting.action_sync_from_harness()
        namespace = Setting.search([('ns', '=', 'llm')])
        namespace.user_json = 'not json'
        self._calls.clear()

        with self.assertRaises(UserError):
            namespace.action_save()
        self.assertEqual(self._calls_for('settings.replace'), [])
