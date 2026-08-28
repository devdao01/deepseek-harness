# -*- coding: utf-8 -*-
"""Odoo-side skill authoring: push SKILL.md to the harness.

The harness client is mocked, so these assert only what Odoo pushes and when: a
skill given a preset authors a SKILL.md via skill.write on create/write and
removes it via skill.remove on unlink; a mirror row (no preset) never pushes;
Pull Content reads back via skill.read.
"""
from unittest.mock import patch

from odoo.exceptions import UserError, ValidationError
from odoo.tests.common import TransactionCase


class TestSkillAuthoring(TransactionCase):
    def setUp(self):
        super().setUp()
        self.Skill = self.env['npei.agent.skill']
        self.Preset = self.env['npei.agent.preset']
        self._calls = []
        self._skill_read = {'description': 'D', 'whenToUse': 'W', 'content': 'BODY'}
        # skill.list roster a sync test can pre-seed; default empty.
        self._skill_list = []
        # skill.listWorkspace roster per workspaceId a sync test can pre-seed.
        self._workspace_skills = {}
        # Pull Content is manager-gated.
        self.env.user.groups_id = [
            (4, self.env.ref('npei_agent_harness.group_npei_agent_manager').id)]

        client_cls = type(self.env['npei.agent.harness.client'])

        def fake_rpc(model, method, payload=None):
            self._calls.append((method, payload))
            if method == 'skill.read':
                return dict(self._skill_read)
            if method == 'skill.list':
                return {'skills': list(self._skill_list)}
            if method == 'skill.listWorkspace':
                ws = (payload or {}).get('workspaceId')
                return {'skills': list(self._workspace_skills.get(ws, []))}
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

    def test_rename_skill_key_removes_old_then_writes_new(self):
        skill = self.Skill.create({
            'skill_key': 'old-name', 'name': 'X', 'content': 'A',
            'preset_id': self.preset.id})
        self._calls.clear()  # isolate the rename from the create push

        skill.write({'skill_key': 'new-name'})

        removes = [payload for method, payload in self._calls if method == 'skill.remove']
        self.assertEqual(removes, [{'workspaceId': 'ws-1', 'name': 'old-name'}])
        self.assertEqual(self._writes()[-1]['name'], 'new-name')

    def test_duplicate_drops_preset_and_mints_fresh_key(self):
        skill = self.Skill.create({
            'skill_key': 'tao-bao-cao', 'name': 'Tạo báo cáo', 'content': 'A',
            'preset_id': self.preset.id})
        self._calls.clear()  # isolate the duplicate from the create push

        copy = skill.copy()

        self.assertNotEqual(copy.id, skill.id)
        self.assertFalse(copy.preset_id)          # a duplicate is a mirror row
        self.assertEqual(copy.skill_key, 'tao-bao-cao-copy')
        self.assertEqual(self._writes(), [])      # no preset ⇒ no harness push

    def test_duplicate_deduplicates_when_copy_key_taken(self):
        skill = self.Skill.create({
            'skill_key': 'tao-bao-cao', 'name': 'X', 'content': 'A',
            'preset_id': self.preset.id})
        skill.copy()  # takes tao-bao-cao-copy

        second = skill.copy()

        self.assertEqual(second.skill_key, 'tao-bao-cao-copy-2')

    def test_create_derives_skill_key_from_name(self):
        skill = self.Skill.create({'name': 'Tạo Báo Cáo Đầu Kỳ', 'content': 'x'})
        self.assertEqual(skill.skill_key, 'tao-bao-cao-dau-ky')

    def test_create_derived_key_is_deduplicated(self):
        self.Skill.create({'skill_key': 'bao-cao', 'name': 'A'})
        skill = self.Skill.create({'name': 'Báo Cáo'})
        self.assertEqual(skill.skill_key, 'bao-cao-2')

    def test_create_without_key_or_name_raises(self):
        with self.assertRaises(UserError):
            self.Skill.create({'content': 'x'})

    def test_removing_preset_removes_harness_file(self):
        skill = self.Skill.create({
            'skill_key': 'tao-bao-cao', 'name': 'X', 'content': 'A',
            'preset_id': self.preset.id})
        self._calls.clear()  # isolate the un-assign from the create push

        skill.write({'preset_id': False})

        removes = [payload for method, payload in self._calls if method == 'skill.remove']
        self.assertEqual(removes, [{'workspaceId': 'ws-1', 'name': 'tao-bao-cao'}])
        self.assertEqual(self._writes(), [])      # dropped preset ⇒ nothing re-pushed

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

    def test_sync_pulls_content_from_harness(self):
        self.env['npei.agent.session'].create({'session_id': 'sess-1'})
        self._skill_list = [{
            'name': 'repo-skill', 'description': 'meta-d',
            'whenToUse': 'meta-w', 'modelInvocable': True}]

        self.Skill.action_sync_from_harness()

        skill = self.Skill.search([('skill_key', '=', 'repo-skill')])
        self.assertTrue(skill)
        self.assertFalse(skill.preset_id)             # a synced row is a mirror
        # skill.read (session-addressed) fills the body and wins for frontmatter.
        self.assertEqual(skill.content, 'BODY')
        self.assertEqual(skill.description, 'D')
        self.assertEqual(skill.when_to_use, 'W')
        reads = [p for m, p in self._calls if m == 'skill.read']
        self.assertEqual(reads, [{'sessionId': 'sess-1', 'name': 'repo-skill'}])

    def test_sync_keeps_list_metadata_when_read_unavailable(self):
        self.env['npei.agent.session'].create({'session_id': 'sess-1'})
        self._skill_list = [{
            'name': 'home-skill', 'description': 'meta-d',
            'whenToUse': 'meta-w', 'modelInvocable': True}]
        # A skill the catalog lists but read cannot resolve (e.g. outside the
        # session's project) keeps its list metadata and an empty content.
        original = type(self.env['npei.agent.harness.client'])._rpc

        def rpc_read_fails(model, method, payload=None):
            if method == 'skill.read':
                self._calls.append((method, payload))
                raise UserError("skill \"home-skill\" is not in session catalog")
            return original(model, method, payload)

        with patch.object(type(self.env['npei.agent.harness.client']), '_rpc', rpc_read_fails):
            self.Skill.action_sync_from_harness()

        skill = self.Skill.search([('skill_key', '=', 'home-skill')])
        self.assertTrue(skill)
        self.assertEqual(skill.description, 'meta-d')  # falls back to list metadata
        self.assertEqual(skill.when_to_use, 'meta-w')
        self.assertFalse(skill.content)

    def test_sync_attributes_skill_to_its_preset(self):
        # No session ⇒ no global mirror pass; only the per-preset attribution runs.
        self._workspace_skills = {'ws-1': [{
            'name': 'tao-bao-cao', 'description': 'meta', 'modelInvocable': True}]}

        self.Skill.action_sync_from_harness()

        skill = self.Skill.search([('skill_key', '=', 'tao-bao-cao')])
        self.assertEqual(skill.preset_id, self.preset)   # attributed to its preset
        self.assertEqual(skill.content, 'BODY')          # body via workspace read
        reads = [p for m, p in self._calls if m == 'skill.read']
        self.assertIn({'workspaceId': 'ws-1', 'name': 'tao-bao-cao'}, reads)

    def test_sync_same_key_under_two_presets_makes_two_rows(self):
        preset2 = self.Preset.create({
            'preset_id': 'ho-so-y', 'name': 'Hồ Sơ Y', 'trust': 'user',
            'workspace_id': 'ws-2', 'workspace_path': '/w/ho-so-y'})
        self._workspace_skills = {
            'ws-1': [{'name': 'tao-bao-cao', 'description': 'a', 'modelInvocable': True}],
            'ws-2': [{'name': 'tao-bao-cao', 'description': 'b', 'modelInvocable': True}],
        }

        self.Skill.action_sync_from_harness()

        rows = self.Skill.search([('skill_key', '=', 'tao-bao-cao')])
        self.assertEqual(len(rows), 2)
        self.assertEqual(set(rows.mapped('preset_id')), {self.preset, preset2})

    def test_sync_global_mirror_skips_preset_attributed_names(self):
        self.env['npei.agent.session'].create({'session_id': 'sess-1'})
        # The same name is authored in a preset workspace AND visible in the
        # session catalog; the mirror pass must not also create a preset-less row.
        self._workspace_skills = {'ws-1': [{
            'name': 'tao-bao-cao', 'description': 'a', 'modelInvocable': True}]}
        self._skill_list = [{
            'name': 'tao-bao-cao', 'description': 'x', 'modelInvocable': True}]

        self.Skill.action_sync_from_harness()

        rows = self.Skill.search([('skill_key', '=', 'tao-bao-cao')])
        self.assertEqual(rows.preset_id, self.preset)    # one row, attributed
        self.assertEqual(len(rows), 1)

    def test_same_key_allowed_across_presets_but_blocked_within(self):
        preset2 = self.Preset.create({
            'preset_id': 'ho-so-y', 'name': 'Hồ Sơ Y', 'trust': 'user',
            'workspace_id': 'ws-2', 'workspace_path': '/w/ho-so-y'})
        self.Skill.create({
            'skill_key': 'k', 'name': 'A', 'content': 'a', 'preset_id': self.preset.id})
        # A different preset may reuse the key.
        self.Skill.create({
            'skill_key': 'k', 'name': 'B', 'content': 'b', 'preset_id': preset2.id})
        # The same preset may not.
        with self.assertRaises(ValidationError):
            self.Skill.create({
                'skill_key': 'k', 'name': 'C', 'content': 'c', 'preset_id': self.preset.id})
