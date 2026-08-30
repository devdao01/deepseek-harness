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
            if method == 'credentials/describe':
                refs = (payload or {}).get('refs') or []
                return {
                    ref: {'configured': True, 'source': 'env', 'writable': True}
                    for ref in refs
                }
            if method in ('credentials/set', 'credentials/unset'):
                return None
            if method == 'llm/listConfigurableProviders':
                return [{
                    'provider': 'deepseek',
                    'displayName': 'DeepSeek',
                    'settingsNs': 'llm.deepseek',
                    'settingsPath': ['llm', 'deepseek'],
                    'declared': True,
                }]
            if method == 'llm/listProviders':
                return [{'id': 'deepseek', 'name': 'DeepSeek'}]
            if method == 'session/modelCatalog':
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
            if method == 'session/list':
                return {'items': [
                    {'sessionId': 'session-1', 'running': True, 'blank': False},
                    {'sessionId': 'session-2', 'running': False, 'blank': True},
                ]}
            if method == 'session/canOpenWorkspacePath':
                return False
            if method == 'llm/discoverModels':
                return [
                    {'id': 'm1', 'name': 'Model One',
                     'contextWindow': 4096, 'maxTokens': 2048},
                    {'id': 'm2'},
                ]
            if method == 'settings/describe':
                return {
                    'writable': True,
                    'hasDocument': True,
                    'namespaces': [{
                        'ns': 'agent-default-model',
                        'schema': {},
                        'value': {'provider': 'deepseek',
                                  'model': 'deepseek-chat',
                                  'reasoningEffort': 'high'},
                        'user': {},
                        'applies': 'live',
                        'secrets': [],
                        'revision': 1,
                    }, {
                        'ns': 'llm-deepseek',
                        'schema': {},
                        'value': {},
                        'user': {},
                        'applies': 'live',
                        'secrets': [],
                        'revision': 5,
                    }, {
                        'ns': 'llm-pi-ai',
                        'schema': {},
                        'value': {},
                        'user': {},
                        'applies': 'live',
                        'secrets': [],
                        'revision': 7,
                    }, {
                        'ns': 'llm',
                        'schema': {},
                        'value': {'model': 'deepseek-chat'},
                        'user': {'model': 'deepseek-chat'},
                        'applies': 'live',
                        'secrets': [],
                        'revision': 3,
                    }],
                }
            if method == 'settings/mutate':
                return {}
            if method == 'settings/replace':
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
            self._calls_for('credentials/set'),
            [{'ref': 'DEEPSEEK_API_KEY', 'value': 'sk-secret'}])
        self.assertFalse(cred.value)                 # popped, never stored
        self.assertTrue(cred.configured)
        self.assertEqual(cred.source, 'env')
        self.assertTrue(cred.writable)

    def test_credential_create_with_value_pushes_it(self):
        cred = self.env['npei.agent.credential'].create({
            'ref': 'OPENAI_API_KEY', 'value': 'sk-new'})

        self.assertEqual(
            self._calls_for('credentials/set'),
            [{'ref': 'OPENAI_API_KEY', 'value': 'sk-new'}])
        self.assertFalse(cred.value)

    def test_credential_write_without_value_skips_set(self):
        cred = self.env['npei.agent.credential'].create({'ref': 'DEEPSEEK_API_KEY'})
        self._calls.clear()

        cred.write({'ref': 'DEEPSEEK_API_KEY'})

        self.assertEqual(self._calls_for('credentials/set'), [])

    def test_credential_unset_calls_harness(self):
        cred = self.env['npei.agent.credential'].create({
            'ref': 'DEEPSEEK_API_KEY', 'configured': True})

        cred.action_unset()

        self.assertEqual(
            self._calls_for('credentials/unset'),
            [{'ref': 'DEEPSEEK_API_KEY'}])

    def test_credential_sync_updates_status(self):
        cred = self.env['npei.agent.credential'].create({'ref': 'DEEPSEEK_API_KEY'})
        self._calls.clear()

        self.env['npei.agent.credential'].action_sync_from_harness()

        self.assertEqual(
            self._calls_for('credentials/describe'),
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

        self.assertEqual(self._calls_for('llm/listConfigurableProviders'), [{}])
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

    def test_provider_sync_links_settings_namespace(self):
        setting = self.env['npei.agent.setting'].create({'ns': 'zzz-ns'})

        def fake(model, method, payload=None):
            if method == 'llm/listConfigurableProviders':
                return [{
                    'provider': 'zzz-p', 'displayName': 'ZP',
                    'settingsNs': 'zzz-ns',
                    'settingsPath': ['providers', 'zzz-p'],
                    'declared': True}]
            if method == 'llm/listProviders':
                return [{'id': 'zzz-p', 'name': 'ZP'}]
            return {}

        client_cls = type(self.env['npei.agent.harness.client'])
        with patch.object(client_cls, '_rpc', fake):
            self.env['npei.agent.provider'].action_sync_from_harness()

        prov = self.env['npei.agent.provider'].search([('provider', '=', 'zzz-p')])
        self.assertEqual(prov.settings_id, setting)
        self.assertIn(prov, setting.provider_ids)

    def test_setting_sync_backfills_provider_link(self):
        prov = self.env['npei.agent.provider'].create({
            'provider': 'zzz-b', 'display_name': 'ZB', 'settings_ns': 'zzz-bns'})
        self.assertFalse(prov.settings_id)

        def fake(model, method, payload=None):
            if method == 'settings/describe':
                return {'hasDocument': False, 'namespaces': [{
                    'ns': 'zzz-bns', 'value': {}, 'user': {},
                    'applies': 'live', 'revision': 1}]}
            return {}

        client_cls = type(self.env['npei.agent.harness.client'])
        with patch.object(client_cls, '_rpc', fake):
            self.env['npei.agent.setting'].action_sync_from_harness()

        setting = self.env['npei.agent.setting'].search([('ns', '=', 'zzz-bns')])
        self.assertEqual(prov.settings_id, setting)

    # ------------------------------------------------------------------
    # Models
    # ------------------------------------------------------------------
    def test_model_sync_upserts_per_group(self):
        Model = self.env['npei.agent.model']

        Model.action_sync_from_harness()

        self.assertEqual(self._calls_for('session/modelCatalog'), [{}])
        models = Model.search([('provider', '=', 'deepseek')])
        self.assertEqual(len(models), 2)
        chat = Model.search([
            ('provider', '=', 'deepseek'), ('model_id', '=', 'deepseek-chat')])
        self.assertEqual(chat.name, 'Chat')
        self.assertEqual(chat.description, 'general')

    def test_model_sync_links_when_provider_exists(self):
        prov = self.env['npei.agent.provider'].create({
            'provider': 'zzz-fwd', 'display_name': 'Z',
            'settings_ns': 'llm-pi-ai'})

        def fake(model, method, payload=None):
            if method == 'session/modelCatalog':
                return {'groups': [{'id': 'zzz-fwd',
                                    'models': [{'id': 'm-x'}]}], 'failures': []}
            return {}

        client_cls = type(self.env['npei.agent.harness.client'])
        with patch.object(client_cls, '_rpc', fake):
            self.env['npei.agent.model'].action_sync_from_harness()

        m = self.env['npei.agent.model'].search([
            ('provider', '=', 'zzz-fwd'), ('model_id', '=', 'm-x')])
        self.assertEqual(m.provider_id, prov)
        self.assertEqual(prov.catalog_model_ids, m)
        self.assertEqual(prov.catalog_model_count, 1)

    def test_model_link_backfilled_when_provider_synced_after(self):
        def fake(model, method, payload=None):
            if method == 'session/modelCatalog':
                return {'groups': [{'id': 'zzz-back',
                                    'models': [{'id': 'm-b'}]}], 'failures': []}
            if method == 'llm/listConfigurableProviders':
                return [{
                    'provider': 'zzz-back', 'displayName': 'ZB',
                    'settingsNs': 'llm-pi-ai',
                    'settingsPath': ['providers', 'zzz-back'],
                    'declared': True}]
            if method == 'llm/listProviders':
                return [{'id': 'zzz-back', 'name': 'ZB'}]
            return {}

        client_cls = type(self.env['npei.agent.harness.client'])
        with patch.object(client_cls, '_rpc', fake):
            # Models first: no provider mirror yet, so the link is blank.
            self.env['npei.agent.model'].action_sync_from_harness()
            m = self.env['npei.agent.model'].search([
                ('provider', '=', 'zzz-back'), ('model_id', '=', 'm-b')])
            self.assertFalse(m.provider_id)
            # Providers next: the sync backfills the link.
            self.env['npei.agent.provider'].action_sync_from_harness()

        prov = self.env['npei.agent.provider'].search([
            ('provider', '=', 'zzz-back')])
        self.assertEqual(m.provider_id, prov)

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
            self._calls_for('llm/discoverModels'),
            [{'settingsNs': 'llm.deepseek', 'request': {'provider': 'deepseek'}}])
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
            self._calls_for('settings/mutate'),
            [{'ns': 'llm-deepseek', 'ops': [{
                'op': 'set', 'path': ['models'],
                'value': [{'id': 'deepseek-chat', 'name': 'Chat',
                           'contextWindow': 4096}]}],
              'expectedRevision': 5}])

    def test_provider_model_nested_path(self):
        provider = self._make_provider(ns='llm-pi-ai', path='routes/foo')
        self._calls.clear()

        self.env['npei.agent.provider.model'].create({
            'provider_id': provider.id, 'model_id': 'm1'})

        self.assertEqual(
            self._calls_for('settings/mutate'),
            [{'ns': 'llm-pi-ai', 'ops': [{
                'op': 'set', 'path': ['routes', 'foo', 'models'],
                'value': [{'id': 'm1'}]}],
              'expectedRevision': 7}])

    def test_provider_model_emptying_unsets(self):
        provider = self._make_provider()
        row = self.env['npei.agent.provider.model'].create({
            'provider_id': provider.id, 'model_id': 'deepseek-chat'})
        self._calls.clear()

        row.unlink()

        self.assertEqual(
            self._calls_for('settings/mutate'),
            [{'ns': 'llm-deepseek', 'ops': [{
                'op': 'unset', 'path': ['models']}],
              'expectedRevision': 5}])

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
        mutate = self._calls_for('settings/mutate')
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
            if method == 'settings/describe':
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
            [m for m, _p in self._calls if m == 'settings/mutate'], [])

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
            self._calls_for('settings/mutate'),
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
                }}],
              'expectedRevision': 7}])
        # A typed key is pushed under the derived reference.
        self.assertEqual(
            self._calls_for('credentials/set'),
            [{'ref': 'OPENROUTER_API_KEY', 'value': 'sk-or-secret'}])

    def test_route_wizard_derives_ref_and_skips_blank_key(self):
        wizard = self.env['npei.agent.provider.route'].create({
            'route_key': 'together-ai',
            'api_protocol': 'openai-completions',
            'base_url': 'https://api.together.xyz/v1',
        })
        self._calls.clear()

        wizard.action_create_route()

        op = self._calls_for('settings/mutate')[0]['ops'][0]
        self.assertEqual(op['path'], ['providers', 'together-ai'])
        self.assertEqual(op['value']['apiKeyEnv'], 'TOGETHER_AI_API_KEY')
        self.assertNotIn('compat', op['value'])  # no thinking format chosen
        self.assertNotIn('models', op['value'])
        self.assertEqual(self._calls_for('credentials/set'), [])  # no key typed

    def test_route_wizard_template_prefills_then_key_only(self):
        template = self.env.ref(
            'npei_agent_harness.route_tpl_openrouter')
        wizard = self.env['npei.agent.provider.route'].new({})
        wizard.template_id = template
        wizard._onchange_template_id()

        # The template pre-fills everything but the key.
        self.assertEqual(wizard.route_key, 'openrouter')
        self.assertEqual(wizard.base_url, 'https://openrouter.ai/api/v1')
        self.assertEqual(wizard.thinking_format, 'openrouter')
        self.assertEqual(wizard.api_key_env, 'OPENROUTER_API_KEY')

        # Persist the pre-filled draft (as the form save would) + a typed key.
        saved = self.env['npei.agent.provider.route'].create({
            'template_id': template.id,
            'route_key': wizard.route_key,
            'display_name': wizard.display_name,
            'api_protocol': wizard.api_protocol,
            'base_url': wizard.base_url,
            'thinking_format': wizard.thinking_format,
            'api_key_env': wizard.api_key_env,
            'api_key': 'sk-or-x',
        })
        self._calls.clear()
        saved.action_create_route()

        op = self._calls_for('settings/mutate')[0]['ops'][0]
        self.assertEqual(op['path'], ['providers', 'openrouter'])
        self.assertEqual(op['value']['baseURL'], 'https://openrouter.ai/api/v1')
        self.assertEqual(op['value']['compat'], {'thinkingFormat': 'openrouter'})
        self.assertEqual(
            self._calls_for('credentials/set'),
            [{'ref': 'OPENROUTER_API_KEY', 'value': 'sk-or-x'}])

    def test_route_wizard_blank_base_url_omitted(self):
        wizard = self.env['npei.agent.provider.route'].create({
            'route_key': 'catalogprov',
            'api_protocol': 'openai-completions',
            # no base_url: a pi-ai catalog provider inherits its endpoint
        })
        self._calls.clear()

        wizard.action_create_route()

        op = self._calls_for('settings/mutate')[0]['ops'][0]
        self.assertNotIn('baseURL', op['value'])

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
    # Clear data (system-only)
    # ------------------------------------------------------------------
    def test_clear_data_keeps_seeded_templates_only(self):
        self.env.user.groups_id = [
            (4, self.env.ref('base.group_system').id)]
        seeded = self.env.ref('npei_agent_harness.route_tpl_openrouter')
        custom_tpl = self.env['npei.agent.provider.route.template'].create({
            'name': 'Custom', 'route_key': 'customx',
            'api_protocol': 'openai-completions'})
        prov = self._make_provider(ns='llm-pi-ai')
        self.env['npei.agent.provider.model'].create({
            'provider_id': prov.id, 'model_id': 'm'})
        setting = self.env['npei.agent.setting'].create({'ns': 'zzz-clr'})
        session = self.env['npei.agent.session'].with_context(
            npei_syncing=True).create({'session_id': 'sess-clr', 'name': 'S'})
        self._calls.clear()

        self.env['res.config.settings'].create({}).action_clear_data()

        self.assertTrue(seeded.exists())         # XML-seeded template kept
        self.assertFalse(custom_tpl.exists())    # hand-added template cleared
        self.assertFalse(prov.exists())
        self.assertFalse(setting.exists())
        self.assertFalse(session.exists())
        # A local reset makes no harness call.
        self.assertEqual(self._calls, [])

    def test_clear_data_denied_for_non_system(self):
        settings = self.env['res.config.settings'].create({})
        plain = self.env['res.users'].browse(15)
        with self.assertRaises(AccessError):
            settings.with_user(plain).action_clear_data()

    # ------------------------------------------------------------------
    # Host status panel
    # ------------------------------------------------------------------
    def _patch_host_status(self, status=200, rows=46):
        client_cls = type(self.env['npei.agent.harness.client'])
        patcher = patch.object(
            client_cls, '_host_status', lambda model: (status, rows))
        patcher.start()
        self.addCleanup(patcher.stop)

    def test_host_status_refresh_maps_snapshot(self):
        self._patch_host_status()
        panel = self.env['npei.agent.host.status'].create({})
        self._calls.clear()

        action = panel.action_refresh()

        self.assertTrue(panel.reachable)
        self.assertEqual(panel.http_status, 200)
        self.assertEqual(panel.injection_rows, 46)
        self.assertEqual(panel.provider, 'deepseek')
        self.assertEqual(panel.model, 'deepseek-chat')
        self.assertEqual(panel.reasoning_effort, 'high')
        self.assertEqual(panel.session_count, 2)
        self.assertEqual(panel.running_sessions, 1)
        self.assertFalse(panel.can_open_path)
        self.assertEqual(action['res_model'], 'npei.agent.host.status')
        self.assertEqual(action['res_id'], panel.id)

    def test_host_status_default_get_fetches_snapshot(self):
        self._patch_host_status()
        defaults = self.env['npei.agent.host.status'].default_get(
            ['reachable', 'session_count', 'can_open_path'])

        self.assertTrue(defaults['reachable'])
        self.assertEqual(defaults['session_count'], 2)
        self.assertFalse(defaults['can_open_path'])

    def test_host_status_unreachable_stops_at_probe(self):
        self._patch_host_status(status=401, rows=None)
        panel = self.env['npei.agent.host.status'].create({})
        self._calls.clear()

        panel.action_refresh()

        self.assertFalse(panel.reachable)
        self.assertEqual(panel.http_status, 401)
        # No management RPC runs behind a failed probe.
        self.assertEqual(self._calls, [])

    def test_host_status_denied_for_non_manager(self):
        plain = self.env['res.users'].browse(15)  # an existing non-manager user
        with self.assertRaises(AccessError):
            self.env['npei.agent.host.status'].with_user(
                plain).default_get(['reachable'])

    # ------------------------------------------------------------------
    # Settings namespaces
    # ------------------------------------------------------------------
    def test_setting_sync_upserts(self):
        Setting = self.env['npei.agent.setting']

        Setting.action_sync_from_harness()

        self.assertEqual(self._calls_for('settings/describe'), [{}])
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
            self._calls_for('settings/replace'),
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
        self.assertEqual(self._calls_for('settings/replace'), [])


class TestAdminTicket(TransactionCase):
    """The management wildcard ticket Odoo presents on every wire call."""

    class _FakeJar:
        def __init__(self):
            self.values = {}

        def set(self, name, value):
            self.values[name] = value

    class _FakeWire:
        def __init__(self):
            self.http = type('H', (), {})()
            self.http.cookies = TestAdminTicket._FakeJar()

    def test_attach_sets_a_verifiable_wildcard_ticket(self):
        import base64
        import hashlib
        import hmac as hmac_mod
        import json as json_mod

        secret = 'x' * 32
        self.env['ir.config_parameter'].sudo().set_param(
            'npei_agent_harness.ticket_secret', secret)
        wire = self._FakeWire()
        self.env['npei.agent.harness.client']._attach_admin_ticket(wire)
        ticket = wire.http.cookies.values.get('mtil-ticket')
        self.assertTrue(ticket)
        version, body, mac = ticket.split('.')
        self.assertEqual(version, 'v1')
        expected = base64.urlsafe_b64encode(hmac_mod.new(
            secret.encode(), ('v1.%s' % body).encode(), hashlib.sha256,
        ).digest()).rstrip(b'=').decode()
        self.assertEqual(mac, expected)
        payload = json_mod.loads(base64.urlsafe_b64decode(body + '=' * (-len(body) % 4)))
        self.assertEqual(payload['u'], '*')

    def test_attach_skips_without_a_usable_secret(self):
        self.env['ir.config_parameter'].sudo().set_param(
            'npei_agent_harness.ticket_secret', 'too-short')
        wire = self._FakeWire()
        self.env['npei.agent.harness.client']._attach_admin_ticket(wire)
        self.assertNotIn('mtil-ticket', wire.http.cookies.values)
