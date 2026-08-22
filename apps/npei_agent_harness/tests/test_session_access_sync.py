# -*- coding: utf-8 -*-
"""Harness ACL sync on npei.agent.session create/write/unlink.

The harness client is mocked, so these assert only what Odoo pushes and when:
the correct session.setAccess payload on the access-defining transitions, and
silence on unrelated writes.
"""
from unittest.mock import patch

from odoo.tests.common import TransactionCase


class TestSessionAccessSync(TransactionCase):
    def setUp(self):
        super().setUp()
        self.Session = self.env['npei.agent.session']
        # Use two existing users rather than creating new ones: creating
        # res.users trips mail's notification_type NOT NULL (and other
        # custom-module constraints) on this deployment's DB. Ids 2 and 15 are
        # stable, distinct users; the tests only need their ids.
        self.user_a = self.env['res.users'].browse(2)
        self.user_b = self.env['res.users'].browse(15)
        self.assertTrue(self.user_a.exists() and self.user_b.exists(),
                        "test expects res.users id 2 and 15 to exist")
        self._calls = []

        client_cls = type(self.env['npei.agent.harness.client'])

        def fake_rpc(model, method, payload=None):
            self._calls.append((method, payload))
            if method == 'session.create':
                return {'sessionId': 'session-generated'}
            return {'userIds': (payload or {}).get('userIds', [])}

        patcher = patch.object(client_cls, '_rpc', fake_rpc)
        patcher.start()
        self.addCleanup(patcher.stop)

    def _set_access_calls(self):
        """Every captured session.setAccess payload, in call order."""
        return [payload for method, payload in self._calls if method == 'session.setAccess']

    def test_create_without_session_id_creates_on_harness(self):
        # Arrange / Act: no session_id -> Odoo creates one on the harness.
        record = self.Session.create({
            'workspace_path': '/tmp/ws',
            'user_ids': [(6, 0, [self.user_a.id])],
        })

        # Assert: session.create called with the workspace as cwd, id stored.
        create_calls = [payload for method, payload in self._calls if method == 'session.create']
        self.assertEqual(len(create_calls), 1)
        self.assertEqual(create_calls[0].get('cwd'), '/tmp/ws')
        self.assertEqual(record.session_id, 'session-generated')
        # And the access set is pushed for the generated id.
        set_calls = self._set_access_calls()
        self.assertEqual(set_calls[-1]['sessionId'], 'session-generated')
        self.assertEqual(set_calls[-1]['userIds'], [str(self.user_a.id)])

    def test_workspace_defaults_from_preset_and_drives_cwd(self):
        preset = self.env['npei.agent.preset'].create({
            'preset_id': 'ho-so-x',
            'name': 'Hồ Sơ X',
            'workspace_path': '/home/u/workspace/ho-so-x',
        })

        record = self.Session.create({
            'preset_id': preset.id,
            'user_ids': [(6, 0, [self.user_a.id])],
        })

        # The blank workspace is filled from the preset mirror, and that path
        # plus the preset key drive session.create.
        self.assertEqual(record.workspace_path, '/home/u/workspace/ho-so-x')
        create_calls = [payload for method, payload in self._calls if method == 'session.create']
        self.assertEqual(create_calls[0].get('cwd'), '/home/u/workspace/ho-so-x')
        self.assertEqual(create_calls[0].get('agentPreset'), 'ho-so-x')

    def test_create_with_session_id_adopts_without_harness_create(self):
        self.Session.create({
            'session_id': 'session-adopt',
            'user_ids': [(6, 0, [self.user_a.id])],
        })

        self.assertEqual([m for m, _ in self._calls if m == 'session.create'], [])

    def test_create_pushes_title_from_name(self):
        self.Session.create({
            'session_id': 'session-title',
            'name': 'Hồ sơ khách X',
            'user_ids': [(6, 0, [self.user_a.id])],
        })

        rename_calls = [payload for method, payload in self._calls if method == 'session.rename']
        self.assertEqual(rename_calls, [{'sessionId': 'session-title', 'title': 'Hồ sơ khách X'}])

    def test_create_without_name_skips_title(self):
        self.Session.create({
            'session_id': 'session-noname',
            'user_ids': [(6, 0, [self.user_a.id])],
        })

        self.assertEqual([m for m, _ in self._calls if m == 'session.rename'], [])

    def test_write_name_republishes_title(self):
        record = self.Session.create({
            'session_id': 'session-retitle',
            'name': 'Old',
            'user_ids': [(6, 0, [self.user_a.id])],
        })
        self._calls.clear()

        record.write({'name': 'New'})

        rename_calls = [payload for method, payload in self._calls if method == 'session.rename']
        self.assertEqual(rename_calls, [{'sessionId': 'session-retitle', 'title': 'New'}])

    def test_create_pushes_user_ids_as_strings(self):
        # Arrange / Act
        self.Session.create({
            'session_id': 'session-create',
            'user_ids': [(6, 0, [self.user_a.id, self.user_b.id])],
        })

        # Assert
        calls = self._set_access_calls()
        self.assertEqual(len(calls), 1)
        self.assertEqual(calls[0]['sessionId'], 'session-create')
        self.assertEqual(
            sorted(calls[0]['userIds']),
            sorted([str(self.user_a.id), str(self.user_b.id)]),
        )

    def test_write_user_ids_republishes(self):
        record = self.Session.create({
            'session_id': 'session-write',
            'user_ids': [(6, 0, [self.user_a.id])],
        })
        self._calls.clear()

        record.write({'user_ids': [(6, 0, [self.user_b.id])]})

        calls = self._set_access_calls()
        self.assertEqual(len(calls), 1)
        self.assertEqual(calls[0]['userIds'], [str(self.user_b.id)])

    def test_write_unrelated_field_does_not_push(self):
        record = self.Session.create({
            'session_id': 'session-name',
            'user_ids': [(6, 0, [self.user_a.id])],
        })
        self._calls.clear()

        record.write({'name': 'Renamed title'})

        self.assertEqual(self._set_access_calls(), [])

    def test_archiving_revokes_all(self):
        record = self.Session.create({
            'session_id': 'session-archive',
            'user_ids': [(6, 0, [self.user_a.id])],
        })
        self._calls.clear()

        record.write({'active': False})

        calls = self._set_access_calls()
        self.assertEqual(len(calls), 1)
        self.assertEqual(calls[0]['sessionId'], 'session-archive')
        self.assertEqual(calls[0]['userIds'], [])

    def test_unlink_revokes_before_delete(self):
        record = self.Session.create({
            'session_id': 'session-unlink',
            'user_ids': [(6, 0, [self.user_a.id])],
        })
        self._calls.clear()

        record.unlink()

        calls = self._set_access_calls()
        self.assertEqual(len(calls), 1)
        self.assertEqual(calls[0], {'sessionId': 'session-unlink', 'userIds': []})

    def test_session_id_rename_revokes_old_then_sets_new(self):
        record = self.Session.create({
            'session_id': 'session-old',
            'user_ids': [(6, 0, [self.user_a.id])],
        })
        self._calls.clear()

        record.write({'session_id': 'session-new'})

        calls = self._set_access_calls()
        # Old id revoked (empty), then the new id set with the current users.
        self.assertEqual(calls[0], {'sessionId': 'session-old', 'userIds': []})
        self.assertEqual(calls[1]['sessionId'], 'session-new')
        self.assertEqual(calls[1]['userIds'], [str(self.user_a.id)])
