# -*- coding: utf-8 -*-
"""Preset authoring against the real harness wire.

The harness client is mocked, so these assert the slug rule and the exact
endpoints/args Odoo sends: ``agentPresets/copy {from, id, name}`` on authoring,
``agentPresets/deletePreset {id}`` on user-preset unlink, and the
``agentPresets/list`` mirror sync.
"""
from unittest.mock import patch

from odoo.exceptions import UserError
from odoo.tests.common import TransactionCase


class TestPresetAuthoring(TransactionCase):
    def setUp(self):
        super().setUp()
        self.Preset = self.env['npei.agent.preset']
        self._calls = []
        # Extra harness roster entries a test can pre-seed to simulate a slug
        # already taken on the harness; the default is a single system preset.
        self._extra_presets = []

        client_cls = type(self.env['npei.agent.harness.client'])

        def fake_rpc(model, method, args=None):
            self._calls.append((method, args))
            if method == 'agentPresets/list':
                return {'presets': [
                    {'id': 'base', 'isDefault': True, 'trust': 'system',
                     'name': 'Base', 'description': 'Default'},
                ] + self._extra_presets}
            if method == 'agentPresets/copy':
                return None  # the harness copy endpoint is void
            if method == 'agentPresets/deletePreset':
                return None
            return {}

        patcher = patch.object(client_cls, '_rpc', fake_rpc)
        patcher.start()
        self.addCleanup(patcher.stop)

    def _calls_for(self, method):
        return [args for name, args in self._calls if name == method]

    def test_slugify_strips_vietnamese_diacritics(self):
        self.assertEqual(self.Preset._slugify('Hồ Sơ X'), 'ho-so-x')
        self.assertEqual(self.Preset._slugify('Tiếp Tân'), 'tiep-tan')
        self.assertEqual(self.Preset._slugify('Đội A'), 'doi-a')

    def test_create_without_preset_id_authors_on_harness(self):
        record = self.Preset.create({'name': 'Hồ Sơ 1'})
        self.assertEqual(record.preset_id, 'ho-so-1')
        self.assertEqual(record.trust, 'user')
        copies = self._calls_for('agentPresets/copy')
        self.assertEqual(copies, [{'from': 'base', 'id': 'ho-so-1', 'name': 'Hồ Sơ 1'}])

    def test_create_with_preset_id_mirrors_without_authoring(self):
        self.Preset.create({'name': 'Adopted', 'preset_id': 'adopted'})
        self.assertFalse(self._calls_for('agentPresets/copy'))

    def test_duplicate_slug_in_odoo_raises_before_authoring(self):
        self.Preset.create({'name': 'Kept', 'preset_id': 'kept'})
        with self.assertRaises(UserError):
            self.Preset.create({'name': 'Kept'})
        self.assertFalse(self._calls_for('agentPresets/copy'))

    def test_slug_already_on_harness_raises_before_copy(self):
        self._extra_presets.append({'id': 'ho-so-2', 'trust': 'user'})
        with self.assertRaises(UserError):
            self.Preset.create({'name': 'Hồ Sơ 2'})
        self.assertFalse(self._calls_for('agentPresets/copy'))

    def test_unlink_user_preset_deletes_on_harness(self):
        record = self.Preset.create({'name': 'Gone'})
        record.unlink()
        self.assertEqual(self._calls_for('agentPresets/deletePreset'), [{'id': 'gone'}])

    def test_unlink_system_mirror_does_not_delete_on_harness(self):
        record = self.Preset.with_context(npei_syncing=True).create(
            {'name': 'Base', 'preset_id': 'base', 'trust': 'system'})
        record.with_context(npei_syncing=False).unlink()
        self.assertFalse(self._calls_for('agentPresets/deletePreset'))

    def test_name_write_pushes_rename_for_user_presets_only(self):
        record = self.Preset.create({'name': 'Hồ Sơ 1'})
        self.assertEqual(record.workspace_path, '~/workspace/ho-so-1')
        self._calls.clear()
        record.name = 'Hồ Sơ Mới'
        self.assertEqual(self._calls_for('agentPresets/rename'), [
            {'agentPreset': 'ho-so-1', 'name': 'Hồ Sơ Mới'}])
        # The id — and the id-derived workspace path — never changes.
        self.assertEqual(record.preset_id, 'ho-so-1')
        self.assertEqual(record.workspace_path, '~/workspace/ho-so-1')

        system = self.Preset.with_context(npei_syncing=True).create(
            {'name': 'Base', 'preset_id': 'base', 'trust': 'system'})
        # Re-browse to drop the sync context, so the negative assertion tests
        # the trust check rather than the context suppression.
        system = self.Preset.browse(system.id)
        self._calls.clear()
        system.name = 'Base đổi tên'
        self.assertFalse(self._calls_for('agentPresets/rename'))

    def test_description_travels_with_copy_and_rename(self):
        record = self.Preset.create({'name': 'Hồ Sơ 9', 'description': 'Mô tả 9'})
        copies = self._calls_for('agentPresets/copy')
        self.assertEqual(copies[-1].get('description'), 'Mô tả 9')
        self._calls.clear()
        record.description = 'Mô tả mới'
        renames = self._calls_for('agentPresets/rename')
        self.assertEqual(renames, [{
            'agentPreset': 'ho-so-9', 'name': 'Hồ Sơ 9', 'description': 'Mô tả mới'}])

    def test_active_toggle_pushes_set_active(self):
        record = self.Preset.with_context(npei_syncing=True).create(
            {'name': 'Base', 'preset_id': 'base', 'trust': 'system'})
        # The sync context sticks to the created recordset and would suppress
        # the push; a user edit runs on a clean env, so model that here.
        record = self.Preset.browse(record.id)
        self._calls.clear()
        record.active = False
        self.assertEqual(self._calls_for('agentPresets/setActive'), [
            {'agentPreset': 'base', 'active': False}])
        self._calls.clear()
        record.active = True
        self.assertEqual(self._calls_for('agentPresets/setActive'), [
            {'agentPreset': 'base', 'active': True}])

    def test_sync_adopts_roster_active(self):
        self.env.user.groups_id |= self.env.ref(
            'npei_agent_harness.group_npei_agent_manager')
        self._extra_presets = [
            {'id': 'dormant', 'trust': 'user', 'name': 'Dormant', 'active': False}]
        self.Preset.action_sync_from_harness()
        record = self.Preset.with_context(active_test=False).search(
            [('preset_id', '=', 'dormant')])
        self.assertFalse(record.active)
        # The sync never echoes the state back.
        self.assertFalse(self._calls_for('agentPresets/setActive'))

    def test_sync_upserts_roster(self):
        self.env.user.groups_id |= self.env.ref(
            'npei_agent_harness.group_npei_agent_manager')
        self.Preset.action_sync_from_harness()
        record = self.Preset.with_context(active_test=False).search(
            [('preset_id', '=', 'base')])
        self.assertEqual(record.name, 'Base')
        self.assertTrue(record.is_default)
        self.assertEqual(record.trust, 'system')
        # Syncing again updates in place instead of duplicating.
        self.Preset.action_sync_from_harness()
        self.assertEqual(self.Preset.with_context(active_test=False).search_count(
            [('preset_id', '=', 'base')]), 1)
