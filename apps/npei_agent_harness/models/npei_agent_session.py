# -*- coding: utf-8 -*-
"""Odoo-side session ACL.

Each record maps one harness session id to the set of ``res.users`` allowed to
drive it. This is the ORM half of the two-layer ACL: record rules scope which
mappings a user sees, and the proxy controller re-checks
:meth:`_user_can_access` before forwarding any session-scoped call. The harness
enforces its own ACL independently (out of scope for this phase).

Access is defined entirely by ``user_ids``; the record creator (Odoo's built-in
``create_uid``) is always allowed so the mapping's author never locks itself
out. There is no separate owner field.
"""
from odoo import api, fields, models


class NpeiAgentSession(models.Model):
    _name = 'npei.agent.session'
    _description = 'DeepSeek Harness Session (Odoo ACL)'
    _order = 'write_date desc'

    session_id = fields.Char(
        string='Harness Session ID',
        required=True,
        index=True,
        copy=False,
        help="Opaque session id owned by the harness.",
    )
    name = fields.Char(string='Title')
    user_ids = fields.Many2many(
        'res.users',
        'npei_agent_session_user_rel',
        'session_id',
        'user_id',
        string='Allowed Users',
        help="Users allowed to access this session. The record creator "
             "(create_uid) is always allowed even when absent from this list.",
    )
    preset_id = fields.Many2one(
        'npei.agent.preset',
        string='Agent Preset',
        ondelete='set null',
    )
    workspace_path = fields.Char(string='Workspace Path')
    active = fields.Boolean(default=True)

    _sql_constraints = [
        (
            'session_id_uniq',
            'unique(session_id)',
            'A mapping for this harness session id already exists.',
        ),
    ]

    @api.model
    def _user_can_access(self, session_id, user):
        """Return whether ``user`` may act on the harness ``session_id``.

        Access is granted when the user is an NPEI Agent Manager, created the
        mapping (``create_uid``), or is listed in ``user_ids``. Fails closed: an
        unmapped session id is denied to non-managers.

        :param str session_id: the harness session id from a call payload.
        :param user: a ``res.users`` recordset (singleton).
        :rtype: bool
        """
        if user.has_group('npei_agent_harness.group_npei_agent_manager'):
            return True
        record = self.sudo().search([('session_id', '=', session_id)], limit=1)
        if not record:
            return False
        return user == record.create_uid or user in record.user_ids
