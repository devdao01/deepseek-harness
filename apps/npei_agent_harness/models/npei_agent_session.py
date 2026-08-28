# -*- coding: utf-8 -*-
"""Odoo-side session ACL, mirrored to the harness access store.

Each record maps one harness session id to the set of ``res.users`` allowed to
drive it. Two enforcement planes stay in sync:

* **Odoo ORM** — record rules scope which mappings a user sees, and
  :meth:`_user_can_access` re-checks a session-scoped proxy call.
* **Harness** — on every create/write/unlink this pushes the allowed set to the
  harness ``session.setAccess`` (full-token RPC), so a browser talking to the
  harness DIRECTLY with a per-user ticket is filtered by the SAME set. The
  pushed ids are ``str(res.users.id)`` and MUST equal the ``u`` claim the ticket
  minter signs (same user-id space).

Access is defined entirely by ``user_ids``. A non-empty set restricts the
session to those users (plus the creator); an EMPTY set makes it public — every
Odoo user may see and use it through the proxy (which authenticates to the
harness with the full token, so ``canRead`` always passes). Pushing sends
exactly ``user_ids`` (not the creator): a manager configuring a mapping for
other users is not itself granted runtime access unless listed. An archived
mapping, an unlink, or a public (empty) mapping pushes an empty set to the
harness — which the harness ticket plane reads as "revoke all per-user ticket
access". That asymmetry is intentional: "public" applies to the Odoo-proxied
path, and a browser talking to the harness DIRECTLY with a per-user ticket
stays fail-closed. Harness sync is fail-loud: an unreachable harness raises and
rolls the Odoo write back rather than leaving the two planes divergent;
:meth:`action_push_access` re-pushes on demand.
"""
import logging
import uuid

from odoo import _, api, fields, models
from odoo.exceptions import UserError

_logger = logging.getLogger(__name__)


class NpeiAgentSession(models.Model):
    _name = 'npei.agent.session'
    _inherit = ['mail.thread', 'mail.activity.mixin']
    _description = 'DeepSeek Harness Session (Odoo ACL)'
    _order = 'seq, write_date desc'

    # Fields whose change alters the harness-visible access set; a write touching
    # any of them re-pushes to session.setAccess.
    _ACCESS_FIELDS = ('session_id', 'user_ids', 'active')

    session_id = fields.Char(
        string='Harness Session ID',
        index=True,
        copy=False,
        help="Opaque session id owned by the harness. Left blank on create, "
             "Odoo calls session.create and fills it; set it by hand only to "
             "adopt an existing harness session.", tracking=True
    )
    name = fields.Char(string='Title',  tracking=True)
    user_ids = fields.Many2many(
        'res.users',
        'npei_agent_session_user_rel',
        'session_id',
        'user_id',
        string='Allowed Users',
        help="Users allowed to access this session. The record creator "
             "(create_uid) is always allowed even when absent from this list. "
             "Leave empty to make the session public — every user may see and "
             "use it.", tracking=True
    )
    preset_id = fields.Many2one(
        'npei.agent.preset',
        string='Agent Preset',
        ondelete='set null', tracking=True
    )
    workspace_path = fields.Char(string='Workspace Path', tracking=True)
    active = fields.Boolean(default=True, tracking=True)
    seq = fields.Integer('Trình tự*:', default=1)
    is_locked = fields.Boolean('Đã Khóa*:', tracking=True)
    uuid = fields.Char('Mã Chuỗi Ngẫu nhiên*:', copy=False, tracking=True,
                       default=lambda self: str(uuid.uuid4()))

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

        Access is granted when the user is an NPEI Agent Manager, the mapping
        has an empty ``user_ids`` (public — any user may use it), the user
        created the mapping (``create_uid``), or the user is listed in
        ``user_ids``. Fails closed: an unmapped session id is denied to
        non-managers.

        :param str session_id: the harness session id from a call payload.
        :param user: a ``res.users`` recordset (singleton).
        :rtype: bool
        """
        if user.has_group('npei_agent_harness.group_npei_agent_manager'):
            return True
        record = self.sudo().search([('session_id', '=', session_id)], limit=1)
        if not record:
            return False
        if not record.user_ids:
            return True
        return user == record.create_uid or user in record.user_ids

    # ------------------------------------------------------------------
    # Harness ACL sync
    # ------------------------------------------------------------------
    def _harness_user_ids(self):
        """Return the allowed set to push to the harness, as wire strings.

        Exactly ``user_ids`` (each ``res.users.id`` as a string), or the empty
        list for an archived mapping OR a public (empty ``user_ids``) one —
        which the harness reads as "revoke all per-user ticket access". A public
        session stays reachable through the Odoo proxy (full token); see the
        module docstring for why the two planes differ here.
        """
        self.ensure_one()
        if not self.active:
            return []
        return [str(uid) for uid in sorted(self.user_ids.ids)]

    def _push_access(self):
        """Push each record's allowed-user set to the harness access store.

        Suppressed under ``npei_syncing`` (a mirror-only operation such as Clear
        Data), so a bulk local change makes no harness call.
        """
        if self.env.context.get('npei_syncing'):
            return
        client = self.env['npei.agent.harness.client'].sudo()
        for record in self:
            if not record.session_id:
                continue
            client._rpc('session.setAccess', {
                'sessionId': record.session_id,
                'userIds': record._harness_user_ids(),
            })

    @api.model
    def _revoke_harness_access(self, session_id):
        """Revoke all per-user access for one harness session id (empty set).

        Suppressed under ``npei_syncing`` so Clear Data deletes the local mapping
        without a harness call (the reset must work even when the harness is
        unreachable).
        """
        if self.env.context.get('npei_syncing') or not session_id:
            return
        self.env['npei.agent.harness.client'].sudo()._rpc('session.setAccess', {
            'sessionId': session_id,
            'userIds': [],
        })

    def _push_title(self):
        """Best-effort: set each session's harness title from ``name``.

        The title is cosmetic, so a failure here is logged and swallowed rather
        than rolled back — unlike access, a bad title must not orphan or undo a
        created session. Skips blank names (the harness rejects an empty title).
        Suppressed under ``npei_syncing`` (mirror-only operations).
        """
        if self.env.context.get('npei_syncing'):
            return
        client = self.env['npei.agent.harness.client'].sudo()
        for record in self:
            if not record.session_id or not (record.name or '').strip():
                continue
            try:
                client._rpc('session.rename', {
                    'sessionId': record.session_id,
                    'title': record.name,
                })
            except UserError as exc:
                # Cosmetic-only: the mapping and its access still stand.
                _logger.warning(
                    "Failed to push title for session %s: %s", record.session_id, exc)

    @api.onchange('preset_id')
    def _onchange_preset_id_workspace(self):
        """Fill the workspace from the chosen preset's recorded default.

        Uses the mirror's ``workspace_path`` — the absolute path the harness
        provisioned (`<presetWorkspacesRoot>/<preset id>`) — so the form shows
        the same directory the session will attach to, with no re-slugging in
        Odoo (the segment is the preset id, and Odoo cannot resolve ``~``).
        """
        if self.preset_id and self.preset_id.workspace_path:
            self.workspace_path = self.preset_id.workspace_path

    @api.model
    def _default_workspace_from_preset(self, vals):
        """Default a blank ``workspace_path`` from the preset mirror in-place.

        The programmatic counterpart to :meth:`_onchange_preset_id_workspace`
        (onchange fires only in the form): keeps the stored record and the
        ``session.create`` cwd accurate when a mapping is created in code. A
        preset with no recorded workspace (system presets) leaves it blank — the
        harness then derives the directory from ``agentPreset`` on create.

        :param dict vals: the create values, mutated in place.
        """
        if vals.get('workspace_path') or not vals.get('preset_id'):
            return
        preset = self.env['npei.agent.preset'].browse(vals['preset_id'])
        if preset.workspace_path:
            vals['workspace_path'] = preset.workspace_path

    @api.model
    def _create_harness_session(self, vals):
        """Create a session on the harness and return its id.

        The auto-create path for a mapping saved without a ``session_id``: calls
        ``session.create`` and returns the harness-generated id.

        Workspace grouping: the harness attaches a session to a preset's
        registered workspace ONLY when the ``session.create`` carries NO ``cwd``
        (a present ``cwd`` is treated as a deliberate override, so the harness
        skips the attach and the session lands ungrouped under "Other sessions").
        A mapping's ``workspace_path`` is defaulted FROM its preset's workspace
        (see :meth:`_default_workspace_from_preset`), so for the common case we
        pass the preset ALONE and let the harness attach the session under that
        preset's workspace. A ``cwd`` is sent only when it differs from the
        preset's own workspace (a real override) or when there is no preset.

        :param dict vals: the create values (``workspace_path``, ``preset_id``).
        :rtype: str
        :raises UserError: when the harness returns no session id.
        """
        payload = {}
        cwd = vals.get('workspace_path')
        preset_key = None
        preset_workspace = None
        preset_ref = vals.get('preset_id')
        if preset_ref:
            preset = self.env['npei.agent.preset'].browse(preset_ref)
            preset_key = preset.preset_id or None
            preset_workspace = preset.workspace_path or None
        if preset_key:
            payload['agentPreset'] = preset_key
        # Omit cwd when it IS the preset's own workspace, so the harness attaches
        # the session there (grouping it under that workspace) instead of leaving
        # it ungrouped. Send cwd only for a real override or a preset-less session.
        if cwd and cwd != preset_workspace:
            payload['cwd'] = cwd
        value = self.env['npei.agent.harness.client'].sudo()._rpc('session.create', payload)
        session_id = value.get('sessionId')
        if not session_id:
            raise UserError(_("The harness session.create returned no sessionId."))
        return session_id

    @api.model_create_multi
    def create(self, vals_list):
        """Create the mappings, then mirror their access sets to the harness.

        A mapping saved without a ``session_id`` is created on the harness first
        (``session.create``) and the returned id filled in; a mapping given one
        adopts that existing harness session as-is.
        """
        for vals in vals_list:
            self._default_workspace_from_preset(vals)
            if not vals.get('session_id'):
                vals['session_id'] = self._create_harness_session(vals)
        records = super().create(vals_list)
        records._push_access()
        records._push_title()
        return records

    def write(self, vals):
        """Write, then re-push when an access-defining field changed.

        A ``session_id`` rename revokes the old id first, so a stale grant is
        never left pointing at a session this mapping no longer owns.
        """
        renamed = (
            self.filtered(lambda r: r.session_id != vals['session_id'])
            if 'session_id' in vals else self.browse()
        )
        stale_session_ids = renamed.mapped('session_id')
        result = super().write(vals)
        if set(self._ACCESS_FIELDS) & set(vals):
            for session_id in stale_session_ids:
                self._revoke_harness_access(session_id)
            self._push_access()
        if 'name' in vals:
            self._push_title()
        return result

    def unlink(self):
        """Revoke each mapping's harness access before deleting the record."""
        for record in self:
            record._revoke_harness_access(record.session_id)
        return super().unlink()

    def action_push_access(self):
        """Re-push the current access sets to the harness (manual repair)."""
        self._push_access()
        return {
            'type': 'ir.actions.client',
            'tag': 'display_notification',
            'params': {
                'title': _("MTIL Agent"),
                'message': _("Access pushed to the harness for %s session(s).", len(self)),
                'type': 'success',
                'sticky': False,
            },
        }

    def act_lock(self):
        self.write({'is_locked': True})

    def act_unlock(self):
        self.write({'is_locked': False})
