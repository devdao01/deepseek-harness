# -*- coding: utf-8 -*-
"""Skill mirror sync on the real wire.

``skills/list`` is Session-addressed and read-only (no skill authoring
endpoint exists on the harness); these assert the borrowed-session addressing
and the mirror upsert.
"""
from unittest.mock import patch

from odoo.exceptions import UserError
from odoo.tests.common import TransactionCase


class TestSkillSync(TransactionCase):
    def setUp(self):
        super().setUp()
        self.Skill = self.env['npei.agent.skill']
        self._calls = []
        self._skills = [
            {'name': 'find-skills', 'description': 'Discover skills.',
             'modelInvocable': True},
            {'name': 'deploy', 'description': 'Ship it.', 'modelInvocable': False},
        ]

        client_cls = type(self.env['npei.agent.harness.client'])

        def fake_rpc(model, method, args=None):
            self._calls.append((method, args))
            if method == 'skills/list':
                return {'skills': self._skills}
            return {}

        patcher = patch.object(client_cls, '_rpc', fake_rpc)
        patcher.start()
        self.addCleanup(patcher.stop)
        self.env.user.groups_id |= self.env.ref(
            'npei_agent_harness.group_npei_agent_manager')

    def test_sync_requires_a_mapped_session(self):
        with self.assertRaises(UserError):
            self.Skill.action_sync_from_harness()

    def test_sync_addresses_the_most_recent_session(self):
        self.env['npei.agent.session'].with_context(npei_syncing=True).create(
            {'session_id': 'session-a'})
        self.Skill.action_sync_from_harness()
        lists = [args for name, args in self._calls if name == 'skills/list']
        self.assertEqual(lists, [{'request': {'sessionId': 'session-a'}}])

    def test_sync_upserts_catalog(self):
        self.env['npei.agent.session'].with_context(npei_syncing=True).create(
            {'session_id': 'session-a'})
        self.Skill.action_sync_from_harness()
        record = self.Skill.search([('skill_key', '=', 'find-skills')])
        self.assertEqual(record.description, 'Discover skills.')
        self.assertTrue(record.model_invocable)
        self.assertEqual(self.Skill.search_count([]), 2)
        # Re-sync updates in place instead of duplicating.
        self._skills[0]['description'] = 'Updated.'
        self.Skill.action_sync_from_harness()
        self.assertEqual(record.description, 'Updated.')
        self.assertEqual(self.Skill.search_count([]), 2)
