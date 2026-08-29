# -*- coding: utf-8 -*-
"""Odoo-side preset authoring: name->id slug and the presetWorkspace/copy call.

The harness client is mocked, so these assert the slug rule and what Odoo sends
when a preset is created without a ``preset_id`` (author) versus with one (mirror).

Harness 0.1.2 exposes no preset metadata write (the former ``agentPreset.update``
is gone) and no ``disabled`` state, so authoring pushes only the ``copy`` and the
workspace-title rename; editing description or the local ``active`` archive flag
pushes nothing.
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
        # Harness workspace roster a test can pre-seed for the resolve-by-path path.
        self._workspaces = []

        client_cls = type(self.env['npei.agent.harness.client'])

        def fake_rpc(model, method, payload=None):
            self._calls.append((method, payload))
            if method == 'agentPreset.list':
                # presetWorkspace/list: {presets:[{id, workspaceId, name?, ...}]}
                return {'presets': [{'id': 'base', 'isDefault': True,
                                     'trust': 'system'}] + self._extra_presets}
            if method == 'workspace.list':
                return {'items': self._workspaces, 'archivedSessionIds': []}
            if method == 'agentPreset.copy':
                # presetWorkspace/copy request {from, id, name?} -> {agentPreset,
                # workspace} where `workspace` is the provisioned workspace id STRING.
                preset_id = (payload or {})['id']
                return {'agentPreset': preset_id, 'workspace': 'ws-%s' % preset_id}
            return {}

        patcher = patch.object(client_cls, '_rpc', fake_rpc)
        patcher.start()
        self.addCleanup(patcher.stop)

    def _methods(self):
        """Every RPC method captured, in call order."""
        return [method for method, _payload in self._calls]

    def _payloads_for(self, method):
        """Every captured payload for ``method``, in call order."""
        return [payload for m, payload in self._calls if m == method]

    def test_slugify_strips_vietnamese_diacritics(self):
        slug = self.Preset._slugify
        self.assertEqual(slug('Hồ Sơ X'), 'ho-so-x')
        self.assertEqual(slug('Tiếp Tân'), 'tiep-tan')
        self.assertEqual(slug('Đặng  Văn--Bảy'), 'dang-van-bay')
        self.assertEqual(slug('   '), '')

    def test_create_without_preset_id_authors_on_harness(self):
        preset = self.Preset.create({'name': 'Hồ Sơ X', 'description': 'ghi chú'})

        copy_calls = self._payloads_for('agentPreset.copy')
        self.assertEqual(len(copy_calls), 1)
        # 0.1.2 copy is keyed {from, id, name} (was {from, agentPreset, name}).
        self.assertEqual(copy_calls[0], {'from': 'base', 'id': 'ho-so-x', 'name': 'Hồ Sơ X'})
        self.assertEqual(preset.preset_id, 'ho-so-x')
        # 0.1.2 copy returns the workspace id only (no path).
        self.assertEqual(preset.workspace_id, 'ws-ho-so-x')
        self.assertFalse(preset.workspace_path)
        self.assertEqual(preset.trust, 'user')
        self.assertEqual(preset.description, 'ghi chú')

    def test_authoring_pushes_workspace_title_from_name(self):
        preset = self.Preset.create({'name': 'Hồ Sơ X'})

        # The provisioned workspace is renamed to the preset's display name so the
        # SPA sidebar groups sessions under the Odoo name, not the bare slug.
        rename_calls = self._payloads_for('workspace.rename')
        self.assertEqual(len(rename_calls), 1)
        self.assertEqual(rename_calls[0], {'workspaceId': 'ws-ho-so-x', 'title': 'Hồ Sơ X'})
        self.assertEqual(preset.workspace_id, 'ws-ho-so-x')

    def test_write_name_republishes_workspace_title(self):
        preset = self.Preset.create({'name': 'Hồ Sơ X'})

        preset.write({'name': 'Hồ Sơ Y'})

        rename_calls = self._payloads_for('workspace.rename')
        # Authoring pushed once; the name write pushed the new title again.
        self.assertEqual(rename_calls[-1], {'workspaceId': 'ws-ho-so-x', 'title': 'Hồ Sơ Y'})

    def test_name_write_resolves_missing_workspace_id_by_path(self):
        # A preset authored before workspace_id was stored: mirrored (preset_id
        # given, so no authoring) with a path but no workspace_id.
        self._workspaces = [{'workspaceId': 'ws-1', 'path': '/home/u/workspace/ho-so-x'}]
        preset = self.Preset.create({
            'preset_id': 'ho-so-x',
            'name': 'Hồ Sơ X',
            'trust': 'user',
            'workspace_path': '/home/u/workspace/ho-so-x',
        })

        preset.write({'name': 'Hồ Sơ Y'})

        # The id is recovered from workspace.list by path, backfilled, and used.
        self.assertEqual(preset.workspace_id, 'ws-1')
        rename_calls = self._payloads_for('workspace.rename')
        self.assertEqual(rename_calls[-1], {'workspaceId': 'ws-1', 'title': 'Hồ Sơ Y'})

    def test_create_with_preset_id_mirrors_without_authoring(self):
        self.Preset.create({'preset_id': 'existing', 'name': 'Existing'})

        # A mirror/adopt create authors nothing and pushes no workspace rename.
        self.assertNotIn('agentPreset.copy', self._methods())
        self.assertNotIn('workspace.rename', self._methods())

    def test_write_description_pushes_nothing(self):
        # 0.1.2 has no preset metadata write, so editing the description is a
        # local-only change: no harness call.
        preset = self.Preset.create({'preset_id': 'adopted', 'name': 'Old',
                                     'description': 'old'})
        self._calls.clear()

        preset.write({'description': 'new'})

        self.assertEqual(self._calls, [])

    def test_archive_user_preset_stays_local(self):
        # No disabled round-trip in 0.1.2: archiving a user preset only hides the
        # Odoo mirror row and pushes nothing.
        preset = self.Preset.create({'preset_id': 'zzz-arch', 'name': 'Toggle',
                                     'trust': 'user'})
        self._calls.clear()

        preset.write({'active': False})

        self.assertEqual(self._calls, [])

    def test_archive_system_preset_does_not_push(self):
        preset = self.Preset.create({'preset_id': 'zzz-system-test', 'name': 'Shipped',
                                     'trust': 'system'})
        self._calls.clear()

        preset.write({'active': False})

        self.assertEqual(self._calls, [])

    def test_sync_leaves_active_untouched(self):
        # 0.1.2 has no disabled state, so a sync must not flip the local archive
        # flag. A locally archived mirror stays archived across syncs.
        self.env.user.groups_id = [
            (4, self.env.ref('npei_agent_harness.group_npei_agent_manager').id)]
        self._extra_presets = [
            {'id': 'zzz-user', 'trust': 'user', 'name': 'User One',
             'workspaceId': 'ws-zzz'}]
        archived = self.Preset.create({'preset_id': 'zzz-user', 'name': 'User One',
                                       'trust': 'user', 'active': False})

        self.Preset.action_sync_from_harness()

        self.assertFalse(archived.active)   # not un-archived by the sync
        self.assertEqual(archived.workspace_id, 'ws-zzz')

    def test_sync_does_not_author(self):
        # Sync is manager-gated (_check_manager); grant the group so the mirror
        # path runs and we can assert it authors/pushes nothing.
        self.env.user.groups_id = [
            (4, self.env.ref('npei_agent_harness.group_npei_agent_manager').id)]

        self.Preset.action_sync_from_harness()

        self.assertNotIn('agentPreset.copy', self._methods())

    def test_slug_already_on_harness_raises_before_copy(self):
        # An orphan from an earlier failed create: the slug exists on the
        # harness but not in the Odoo mirror. 'Base' -> slug 'base' (seeded).
        with self.assertRaises(UserError):
            self.Preset.create({'name': 'Base'})
        self.assertNotIn('agentPreset.copy', self._methods())

    def test_create_authors_with_id_key(self):
        preset = self.Preset.create({'name': 'Kế Toán', 'description': 'sổ sách'})

        self.assertTrue(preset.exists())
        self.assertEqual(preset.preset_id, 'ke-toan')
        copy_calls = self._payloads_for('agentPreset.copy')
        self.assertEqual(copy_calls, [{'from': 'base', 'id': 'ke-toan', 'name': 'Kế Toán'}])

    def test_duplicate_slug_raises_before_authoring(self):
        self.Preset.create({'preset_id': 'ho-so-x', 'name': 'seed'})
        self._calls.clear()

        with self.assertRaises(UserError):
            self.Preset.create({'name': 'Hồ Sơ X'})
        self.assertNotIn('agentPreset.copy', self._methods())
