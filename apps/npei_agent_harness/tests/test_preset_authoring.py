# -*- coding: utf-8 -*-
"""Odoo-side preset authoring: name->id slug and the agentPreset.copy call.

The harness client is mocked, so these assert the slug rule and what Odoo sends
when a preset is created without a ``preset_id`` (author) versus with one (mirror).
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
        # When set, agentPreset.update raises to exercise the best-effort path.
        self._fail_update = False

        client_cls = type(self.env['npei.agent.harness.client'])

        def fake_rpc(model, method, payload=None):
            self._calls.append((method, payload))
            if method == 'agentPreset.list':
                return {'presets': [{'id': 'base', 'isDefault': True, 'trust': 'system'}] + self._extra_presets}
            if method == 'agentPreset.copy':
                agent_preset = (payload or {})['agentPreset']
                return {
                    'agentPreset': agent_preset,
                    'workspace': {'path': '/home/u/workspace/%s' % agent_preset},
                }
            if method == 'agentPreset.update':
                if self._fail_update:
                    raise UserError("simulated agentPreset.update failure")
                return {
                    'name': (payload or {}).get('name'),
                    'description': (payload or {}).get('description'),
                }
            return {}

        patcher = patch.object(client_cls, '_rpc', fake_rpc)
        patcher.start()
        self.addCleanup(patcher.stop)

    def _update_calls(self):
        """Every captured agentPreset.update payload, in call order."""
        return [payload for method, payload in self._calls if method == 'agentPreset.update']

    def test_slugify_strips_vietnamese_diacritics(self):
        slug = self.Preset._slugify
        self.assertEqual(slug('Hồ Sơ X'), 'ho-so-x')
        self.assertEqual(slug('Tiếp Tân'), 'tiep-tan')
        self.assertEqual(slug('Đặng  Văn--Bảy'), 'dang-van-bay')
        self.assertEqual(slug('   '), '')

    def test_create_without_preset_id_authors_on_harness(self):
        preset = self.Preset.create({'name': 'Hồ Sơ X', 'description': 'ghi chú'})

        copy_calls = [payload for method, payload in self._calls if method == 'agentPreset.copy']
        self.assertEqual(len(copy_calls), 1)
        self.assertEqual(copy_calls[0], {'from': 'base', 'agentPreset': 'ho-so-x', 'name': 'Hồ Sơ X'})
        self.assertEqual(preset.preset_id, 'ho-so-x')
        self.assertEqual(preset.workspace_path, '/home/u/workspace/ho-so-x')
        self.assertEqual(preset.trust, 'user')
        self.assertEqual(preset.description, 'ghi chú')
        # copy carries no description, so the display text is pushed after.
        self.assertEqual(
            self._update_calls(),
            [{'agentPreset': 'ho-so-x', 'name': 'Hồ Sơ X', 'description': 'ghi chú'}],
        )

    def test_create_with_preset_id_mirrors_without_authoring(self):
        self.Preset.create({'preset_id': 'existing', 'name': 'Existing'})

        self.assertEqual([m for m, _ in self._calls if m == 'agentPreset.copy'], [])
        # A mirror/adopt create pushes nothing back to the harness.
        self.assertEqual(self._update_calls(), [])

    def test_write_description_pushes_update(self):
        preset = self.Preset.create({'preset_id': 'adopted', 'name': 'Old', 'description': 'old'})
        self._calls.clear()

        preset.write({'description': 'new'})

        self.assertEqual(
            self._update_calls(),
            [{'agentPreset': 'adopted', 'name': 'Old', 'description': 'new'}],
        )

    def test_sync_does_not_echo_update(self):
        # Sync is manager-gated (_check_manager); grant the group so the mirror
        # path actually runs and we can assert it does NOT echo to the harness.
        self.env.user.groups_id = [
            (4, self.env.ref('npei_agent_harness.group_npei_agent_manager').id)]

        self.Preset.action_sync_from_harness()

        self.assertEqual(self._update_calls(), [])

    def test_slug_already_on_harness_raises_before_copy(self):
        # An orphan from an earlier failed create: the slug exists on the
        # harness but not in the Odoo mirror. 'Base' -> slug 'base' (seeded).
        with self.assertRaises(UserError):
            self.Preset.create({'name': 'Base'})
        self.assertEqual([m for m, _ in self._calls if m == 'agentPreset.copy'], [])

    def test_create_survives_failed_display_push(self):
        # copy succeeds (external, unrollbackable); a failed update must NOT roll
        # the Odoo record back and orphan the harness copy.
        self._fail_update = True

        preset = self.Preset.create({'name': 'Kế Toán', 'description': 'sổ sách'})

        self.assertTrue(preset.exists())
        self.assertEqual(preset.preset_id, 'ke-toan')
        copy_calls = [payload for method, payload in self._calls if method == 'agentPreset.copy']
        self.assertEqual(copy_calls, [{'from': 'base', 'agentPreset': 'ke-toan', 'name': 'Kế Toán'}])

    def test_duplicate_slug_raises_before_authoring(self):
        self.Preset.create({'preset_id': 'ho-so-x', 'name': 'seed'})
        self._calls.clear()

        with self.assertRaises(UserError):
            self.Preset.create({'name': 'Hồ Sơ X'})
        self.assertEqual([m for m, _ in self._calls if m == 'agentPreset.copy'], [])
