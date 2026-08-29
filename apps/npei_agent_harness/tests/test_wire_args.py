# -*- coding: utf-8 -*-
"""Unit tests for the 0.1.2 Remote args-shaping (``_remote_args``).

The Typert gateway requires ``payload.args`` to be a PLAIN OBJECT keyed by the
target method's exact parameter names. These assert the three shapes and the
named-parameter exceptions, so a regression in the wire adapter is caught without
a running harness.
"""
from odoo.tests.common import TransactionCase

from odoo.addons.npei_agent_harness.models.harness_client import _remote_args


class TestRemoteArgs(TransactionCase):
    def test_noarg_endpoints_ignore_payload(self):
        for endpoint in ('session/modelCatalog', 'settings/describe',
                         'session/canOpenWorkspacePath',
                         'settings/openSettingsDocument',
                         'settings/canOpenAgentPresetDirectory'):
            self.assertEqual(_remote_args(endpoint, {'ignored': 1}), {})

    def test_named_param_endpoints_spread_flat_payload(self):
        self.assertEqual(
            _remote_args('credentials/set', {'ref': 'K', 'value': 'v'}),
            {'ref': 'K', 'value': 'v'})
        self.assertEqual(
            _remote_args('credentials/describe', {'refs': ['A', 'B']}),
            {'refs': ['A', 'B']})
        self.assertEqual(
            _remote_args('settings/replace',
                         {'ns': 'llm', 'section': {}, 'expectedRevision': 3}),
            {'ns': 'llm', 'section': {}, 'expectedRevision': 3})

    def test_single_request_endpoints_wrap_under_request(self):
        # Custom controllers (skillAuthoring/sessionAccess/presetWorkspace/
        # workspace) each take one ``request`` object.
        self.assertEqual(
            _remote_args('presetWorkspace/copy',
                         {'from': 'base', 'id': 'x', 'name': 'X'}),
            {'request': {'from': 'base', 'id': 'x', 'name': 'X'}})
        self.assertEqual(
            _remote_args('skillAuthoring/read', {'workspaceId': 'w', 'name': 'n'}),
            {'request': {'workspaceId': 'w', 'name': 'n'}})

    def test_session_list_uses_underscore_request_key(self):
        self.assertEqual(
            _remote_args('session/list', {}), {'_request': {}})

    def test_none_payload_defaults_to_empty(self):
        self.assertEqual(_remote_args('presetWorkspace/list', None),
                         {'request': {}})
        self.assertEqual(_remote_args('credentials/unset', None), {})
