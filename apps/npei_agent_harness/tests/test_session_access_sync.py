# -*- coding: utf-8 -*-
"""Session ACL (Odoo-plane) and harness effects on the real wire.

The harness client is mocked; these assert the fail-closed access rule and the
exact endpoints/args Odoo sends: ``session/create {"request": {...}}`` when a
mapping is saved without an id, ``session/rename {"request": {...}}`` on a
title change, and the ``session/list {"_request": {}}`` mirror sync.
"""
from unittest.mock import patch

from odoo.tests.common import TransactionCase


class TestSessionAccessSync(TransactionCase):
    def setUp(self):
        super().setUp()
        self.Session = self.env['npei.agent.session']
        self._calls = []
        self._list_items = []

        client_cls = type(self.env['npei.agent.harness.client'])

        def fake_rpc(model, method, args=None):
            self._calls.append((method, args))
            if method == 'session/create':
                return {'sessionId': 'session-new-1'}
            if method == 'session/rename':
                return {'title': ((args or {}).get('request') or {}).get('title'), 'seq': 1}
            if method == 'session/list':
                return {'items': self._list_items}
            return {}

        patcher = patch.object(client_cls, '_rpc', fake_rpc)
        patcher.start()
        self.addCleanup(patcher.stop)

        self.manager_group = self.env.ref('npei_agent_harness.group_npei_agent_manager')
        self.user_a = self.env['res.users'].create({
            'name': 'User A', 'login': 'npei_user_a'})
        self.user_b = self.env['res.users'].create({
            'name': 'User B', 'login': 'npei_user_b'})

    def _calls_for(self, method):
        return [args for name, args in self._calls if name == method]

    # ------------------------------------------------------------------
    # ACL
    # ------------------------------------------------------------------
    def test_unmapped_session_denied_to_non_manager(self):
        self.assertFalse(self.Session._user_can_access('session-x', self.user_a))

    def test_manager_always_allowed(self):
        manager = self.env['res.users'].create({
            'name': 'Manager', 'login': 'npei_manager',
            'groups_id': [(4, self.manager_group.id)]})
        self.assertTrue(self.Session._user_can_access('session-x', manager))

    def test_public_mapping_allows_everyone(self):
        self.Session.create({'session_id': 'session-pub'})
        self.assertTrue(self.Session._user_can_access('session-pub', self.user_a))

    def test_restricted_mapping_allows_listed_and_creator_only(self):
        record = self.Session.with_user(self.env.user).create({
            'session_id': 'session-priv',
            'user_ids': [(4, self.user_a.id)],
        })
        self.assertTrue(self.Session._user_can_access('session-priv', self.user_a))
        self.assertFalse(self.Session._user_can_access('session-priv', self.user_b))
        self.assertTrue(self.Session._user_can_access('session-priv', record.create_uid))

    # ------------------------------------------------------------------
    # Harness effects
    # ------------------------------------------------------------------
    def test_create_without_session_id_creates_on_harness(self):
        preset = self.env['npei.agent.preset'].with_context(npei_syncing=True).create(
            {'name': 'Standard', 'preset_id': 'standard', 'trust': 'system'})
        record = self.Session.create({'name': 'New', 'preset_id': preset.id})
        self.assertEqual(record.session_id, 'session-new-1')
        creates = self._calls_for('session/create')
        self.assertEqual(creates, [{'request': {'agentPreset': 'standard'}}])

    def test_title_write_pushes_rename(self):
        record = self.Session.create({'session_id': 'session-t'})
        self._calls.clear()
        record.name = 'Tiêu đề mới'
        renames = self._calls_for('session/rename')
        self.assertEqual(renames, [
            {'request': {'sessionId': 'session-t', 'title': 'Tiêu đề mới'}}])

    def test_sync_upserts_items(self):
        self.env.user.groups_id |= self.manager_group
        self._list_items = [{
            'sessionId': 'session-h1',
            'updatedAt': 1788061604833,
            'running': True,
            'blank': False,
            'cwd': '/srv/workspace',
            'projections': {'values': {'title': 'Ping', 'agentPreset': 'standard'}},
        }]
        self.Session.action_sync_from_harness()
        record = self.Session.search([('session_id', '=', 'session-h1')])
        self.assertEqual(record.name, 'Ping')
        self.assertTrue(record.running)
        self.assertEqual(record.workspace_path, '/srv/workspace')
        # The sync never echoes a rename back to the harness.
        self.assertFalse(self._calls_for('session/rename'))
        # Re-sync updates in place.
        self.Session.action_sync_from_harness()
        self.assertEqual(self.Session.search_count(
            [('session_id', '=', 'session-h1')]), 1)
