# -*- coding: utf-8 -*-
"""Config-plane management: credentials, providers, models, settings, discover.

The harness client is mocked, so these assert exactly what Odoo sends per method
and how the returned values are mirrored. All actions are manager-gated, so the
test user is granted the NPEI Agent Manager group in setUp.
"""
from unittest.mock import patch

from odoo.exceptions import AccessError, UserError
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
            if method == 'host.describe':
                return {
                    'version': '17.0.0',
                    'cwd': '/home/dsh',
                    'provider': 'deepseek',
                    'model': 'deepseek-chat',
                    'attachedSessions': 3,
                    'canOpenPath': False,
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
            if method == 'settings.mutate':
                return {}
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
    # Configurable provider models (settings.mutate)
    # ------------------------------------------------------------------
    def _make_provider(self, ns='llm-deepseek', path=False):
        # A test-only provider id: mie-master already carries a real 'deepseek'
        # provider, so a fresh unique id avoids the unique(provider) collision.
        return self.env['npei.agent.provider'].create({
            'provider': 'dsh-test-provider', 'display_name': 'Test Provider',
            'settings_ns': ns, 'settings_path': path})

    def test_provider_model_create_sets_array(self):
        provider = self._make_provider()
        self._calls.clear()

        self.env['npei.agent.provider.model'].create({
            'provider_id': provider.id, 'model_id': 'deepseek-chat',
            'name': 'Chat', 'context_window': 4096})

        self.assertEqual(
            self._calls_for('settings.mutate'),
            [{'ns': 'llm-deepseek', 'ops': [{
                'op': 'set', 'path': ['models'],
                'value': [{'id': 'deepseek-chat', 'name': 'Chat',
                           'contextWindow': 4096}]}]}])

    def test_provider_model_nested_path(self):
        provider = self._make_provider(ns='llm-pi-ai', path='routes/foo')
        self._calls.clear()

        self.env['npei.agent.provider.model'].create({
            'provider_id': provider.id, 'model_id': 'm1'})

        self.assertEqual(
            self._calls_for('settings.mutate'),
            [{'ns': 'llm-pi-ai', 'ops': [{
                'op': 'set', 'path': ['routes', 'foo', 'models'],
                'value': [{'id': 'm1'}]}]}])

    def test_provider_model_emptying_unsets(self):
        provider = self._make_provider()
        row = self.env['npei.agent.provider.model'].create({
            'provider_id': provider.id, 'model_id': 'deepseek-chat'})
        self._calls.clear()

        row.unlink()

        self.assertEqual(
            self._calls_for('settings.mutate'),
            [{'ns': 'llm-deepseek', 'ops': [{
                'op': 'unset', 'path': ['models']}]}])

    def test_provider_model_without_ns_fails_loud(self):
        provider = self._make_provider(ns=False)
        with self.assertRaises(UserError):
            self.env['npei.agent.provider.model'].create({
                'provider_id': provider.id, 'model_id': 'x'})

    def test_provider_model_create_denied_for_non_manager(self):
        provider = self._make_provider()
        plain = self.env['res.users'].browse(15)
        with self.assertRaises(AccessError):
            self.env['npei.agent.provider.model'].with_user(plain).create({
                'provider_id': provider.id, 'model_id': 'x'})

    def test_adopt_appends_discovered_and_pushes(self):
        provider = self._make_provider()
        wizard = self.env['npei.agent.discover.models'].create({
            'settings_ns': 'llm-deepseek', 'target_provider_id': provider.id})
        wizard.action_discover()  # fills result_json from the mock (m1, m2)
        self._calls.clear()

        wizard.action_adopt()

        rows = self.env['npei.agent.provider.model'].search([
            ('provider_id', '=', provider.id)])
        self.assertEqual(set(rows.mapped('model_id')), {'m1', 'm2'})
        # Two creates → the final pushed array carries both discovered ids.
        mutate = self._calls_for('settings.mutate')
        self.assertTrue(mutate)
        self.assertEqual(
            {m['id'] for m in mutate[-1]['ops'][0]['value']}, {'m1', 'm2'})

    def test_adopt_skips_already_configured_ids(self):
        provider = self._make_provider()
        self.env['npei.agent.provider.model'].create({
            'provider_id': provider.id, 'model_id': 'm1', 'name': 'Kept'})
        wizard = self.env['npei.agent.discover.models'].create({
            'settings_ns': 'llm-deepseek', 'target_provider_id': provider.id})
        wizard.action_discover()

        wizard.action_adopt()

        m1 = self.env['npei.agent.provider.model'].search([
            ('provider_id', '=', provider.id), ('model_id', '=', 'm1')])
        self.assertEqual(m1.name, 'Kept')  # not overwritten by adopt

    def test_provider_model_sync_mirrors_effective(self):
        provider = self._make_provider()
        original = self._calls

        def describe_with_models(model, method, payload=None):
            original.append((method, payload))
            if method == 'settings.describe':
                return {'namespaces': [{
                    'ns': 'llm-deepseek',
                    'value': {'models': [
                        {'id': 'deepseek-chat', 'name': 'Chat',
                         'contextWindow': 4096, 'maxTokens': 2048}]},
                    'user': {},
                }]}
            return {}

        client_cls = type(self.env['npei.agent.harness.client'])
        with patch.object(client_cls, '_rpc', describe_with_models):
            self.env['npei.agent.provider.model'].action_sync_from_harness()

        rows = self.env['npei.agent.provider.model'].search([
            ('provider_id', '=', provider.id)])
        self.assertEqual(rows.mapped('model_id'), ['deepseek-chat'])
        self.assertEqual(rows.context_window, 4096)
        # The mirror write is not echoed back as a mutate.
        self.assertEqual(
            [m for m, _p in self._calls if m == 'settings.mutate'], [])

    # ------------------------------------------------------------------
    # Add provider route wizard
    # ------------------------------------------------------------------
    def test_route_wizard_mutates_and_sets_credential(self):
        wizard = self.env['npei.agent.provider.route'].create({
            'route_key': 'openrouter',
            'display_name': 'OpenRouter',
            'api_protocol': 'openai-completions',
            'base_url': 'https://openrouter.ai/api/v1',
            'thinking_format': 'openrouter',
            'api_key': 'sk-or-secret',
            'models_text': 'openai/gpt-4o | GPT-4o\nanthropic/claude-3.5-sonnet',
        })
        self._calls.clear()

        wizard.action_create_route()

        self.assertEqual(
            self._calls_for('settings.mutate'),
            [{'ns': 'llm-pi-ai', 'ops': [{
                'op': 'set', 'path': ['providers', 'openrouter'],
                'value': {
                    'api': 'openai-completions',
                    'baseURL': 'https://openrouter.ai/api/v1',
                    'displayName': 'OpenRouter',
                    'apiKeyEnv': 'OPENROUTER_API_KEY',
                    'compat': {'thinkingFormat': 'openrouter'},
                    'models': [
                        {'id': 'openai/gpt-4o', 'name': 'GPT-4o'},
                        {'id': 'anthropic/claude-3.5-sonnet'}],
                }}]}])
        # A typed key is pushed under the derived reference.
        self.assertEqual(
            self._calls_for('credentials.set'),
            [{'ref': 'OPENROUTER_API_KEY', 'value': 'sk-or-secret'}])

    def test_route_wizard_derives_ref_and_skips_blank_key(self):
        wizard = self.env['npei.agent.provider.route'].create({
            'route_key': 'together-ai',
            'api_protocol': 'openai-completions',
            'base_url': 'https://api.together.xyz/v1',
        })
        self._calls.clear()

        wizard.action_create_route()

        op = self._calls_for('settings.mutate')[0]['ops'][0]
        self.assertEqual(op['path'], ['providers', 'together-ai'])
        self.assertEqual(op['value']['apiKeyEnv'], 'TOGETHER_AI_API_KEY')
        self.assertNotIn('compat', op['value'])  # no thinking format chosen
        self.assertNotIn('models', op['value'])
        self.assertEqual(self._calls_for('credentials.set'), [])  # no key typed

    def test_route_wizard_rejects_bad_key(self):
        wizard = self.env['npei.agent.provider.route'].create({
            'route_key': 'Open Router',  # spaces + caps
            'api_protocol': 'openai-completions',
            'base_url': 'https://x',
        })
        with self.assertRaises(UserError):
            wizard.action_create_route()

    def test_route_wizard_denied_for_non_manager(self):
        plain = self.env['res.users'].browse(15)
        with self.assertRaises(AccessError):
            self.env['npei.agent.provider.route'].with_user(plain).create({
                'route_key': 'x', 'api_protocol': 'openai-completions',
                'base_url': 'https://x'})

    # ------------------------------------------------------------------
    # Host status panel
    # ------------------------------------------------------------------
    def test_host_status_refresh_maps_describe(self):
        panel = self.env['npei.agent.host.status'].create({})
        self._calls.clear()

        action = panel.action_refresh()

        self.assertEqual(self._calls_for('host.describe'), [{}])
        self.assertEqual(panel.version, '17.0.0')
        self.assertEqual(panel.cwd, '/home/dsh')
        self.assertEqual(panel.provider, 'deepseek')
        self.assertEqual(panel.model, 'deepseek-chat')
        self.assertEqual(panel.attached_sessions, 3)
        self.assertFalse(panel.can_open_path)
        self.assertEqual(action['res_model'], 'npei.agent.host.status')
        self.assertEqual(action['res_id'], panel.id)

    def test_host_status_default_get_fetches_snapshot(self):
        defaults = self.env['npei.agent.host.status'].default_get(
            ['version', 'attached_sessions', 'can_open_path'])

        self.assertEqual(self._calls_for('host.describe'), [{}])
        self.assertEqual(defaults['version'], '17.0.0')
        self.assertEqual(defaults['attached_sessions'], 3)
        self.assertFalse(defaults['can_open_path'])

    def test_host_status_absent_default_model_maps_blank(self):
        # A host with no explicit default omits provider/model; they map blank.
        original = self._calls

        def describe_without_default(model, method, payload=None):
            original.append((method, payload))
            if method == 'host.describe':
                return {'version': '17.0.0', 'cwd': '/home/dsh',
                        'attachedSessions': 0, 'canOpenPath': True}
            return {}

        client_cls = type(self.env['npei.agent.harness.client'])
        with patch.object(client_cls, '_rpc', describe_without_default):
            panel = self.env['npei.agent.host.status'].create({})
            panel.action_refresh()

        self.assertFalse(panel.provider)
        self.assertFalse(panel.model)
        self.assertTrue(panel.can_open_path)

    def test_host_status_denied_for_non_manager(self):
        plain = self.env['res.users'].browse(15)  # an existing non-manager user
        with self.assertRaises(AccessError):
            self.env['npei.agent.host.status'].with_user(
                plain)._describe_values()

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
