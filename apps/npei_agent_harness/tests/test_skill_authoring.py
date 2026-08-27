# -*- coding: utf-8 -*-
"""Odoo-side skill authoring: push SKILL.md to the harness.

The harness client is mocked, so these assert only what Odoo pushes and when: a
skill given a preset authors a SKILL.md via skill.write on create/write and
removes it via skill.remove on unlink; a mirror row (no preset) never pushes;
Pull Content reads back via skill.read.
"""
from unittest.mock import patch

from odoo.exceptions import UserError
from odoo.tests.common import TransactionCase


class TestSkillAuthoring(TransactionCase):
    def setUp(self):
        super().setUp()
        self.Skill = self.env['npei.agent.skill']
        self.Preset = self.env['npei.agent.preset']
        self._calls = []
        self._skill_read = {'description': 'D', 'whenToUse': 'W', 'content': 'BODY'}
        # Pull Content is manager-gated.
        self.env.user.groups_id = [
            (4, self.env.ref('npei_agent_harness.group_npei_agent_manager').id)]

        client_cls = type(self.env['npei.agent.harness.client'])

        def fake_rpc(model, method, payload=None):
            self._calls.append((method, payload))
            if method == 'skill.read':
                return dict(self._skill_read)
            if method == 'skill.list':
                return {'skills': []}
            if method == 'workspace.list':
                return {'items': [], 'archivedSessionIds': []}
            return {}

        patcher = patch.object(client_cls, '_rpc', fake_rpc)
        patcher.start()
        self.addCleanup(patcher.stop)

        # A user preset with a known workspace id (mirror path, no authoring push).
        self.preset = self.Preset.create({
            'preset_id': 'ho-so-x', 'name': 'Hồ Sơ X', 'trust': 'user',
            'workspace_id': 'ws-1', 'workspace_path': '/w/ho-so-x',
        })

    def _writes(self):
        return [payload for method, payload in self._calls if method == 'skill.write']

    def test_authored_skill_pushes_on_create(self):
        self.Skill.create({
            'skill_key': 'tao-bao-cao', 'name': 'Tạo báo cáo',
            'description': 'desc', 'when_to_use': 'khi lap bao cao',
            'content': 'BODY', 'preset_id': self.preset.id,
        })

        writes = self._writes()
        self.assertEqual(len(writes), 1)
        self.assertEqual(writes[0], {
            'workspaceId': 'ws-1', 'name': 'tao-bao-cao',
            'description': 'desc', 'content': 'BODY', 'whenToUse': 'khi lap bao cao',
        })

    def test_mirror_skill_without_preset_does_not_push(self):
        self.Skill.create({'skill_key': 's1', 'name': 'S1', 'content': 'x'})
        self.assertEqual(self._writes(), [])

    def test_write_content_republishes(self):
        skill = self.Skill.create({
            'skill_key': 'tao-bao-cao', 'name': 'X', 'content': 'A',
            'preset_id': self.preset.id})

        skill.write({'content': 'B'})

        self.assertEqual(self._writes()[-1]['content'], 'B')

    def test_unlink_removes_skill_file(self):
        skill = self.Skill.create({
            'skill_key': 'tao-bao-cao', 'name': 'X', 'content': 'A',
            'preset_id': self.preset.id})

        skill.unlink()

        removes = [payload for method, payload in self._calls if method == 'skill.remove']
        self.assertEqual(removes[-1], {'workspaceId': 'ws-1', 'name': 'tao-bao-cao'})

    def test_pull_content_fills_fields(self):
        skill = self.Skill.create({
            'skill_key': 'tao-bao-cao', 'name': 'X', 'content': '',
            'preset_id': self.preset.id})

        skill.action_pull_content()

        self.assertEqual(skill.content, 'BODY')
        self.assertEqual(skill.description, 'D')
        self.assertEqual(skill.when_to_use, 'W')

    def test_authoring_without_workspace_raises(self):
        preset2 = self.Preset.create({
            'preset_id': 'no-ws', 'name': 'No WS', 'trust': 'user'})
        with self.assertRaises(UserError):
            self.Skill.create({
                'skill_key': 's', 'name': 'S', 'content': 'x', 'preset_id': preset2.id})
