# -*- coding: utf-8 -*-
"""Odoo-side session registry and ACL.

Each record maps one harness session id to the set of ``res.users`` allowed to
drive it. The ACL is an **Odoo-plane** control: record rules scope which
mappings a user sees, and :meth:`_user_can_access` re-checks a session-scoped
proxy call before Odoo forwards it to the harness with the full connection.
(The harness itself has no per-user access store — access enforcement lives
where the per-user identity lives, which is Odoo.)

Harness effects (verified wire): a mapping saved without a ``session_id``
creates the session (``session/create``), a ``name`` change pushes the
harness title (``session/rename``), and a ``user_ids`` change pushes the
harness access record (``session/setAccess`` — the harness scopes its own
``session/list`` per signed-in SPA user by that record).
:meth:`action_sync_from_harness` upserts mirrors for every session the
harness lists (``session/list`` under the management wildcard ticket, rows
carrying ``allowedUsers``).

Access is defined by ``user_ids`` with Odoo as the authority: a non-empty
set restricts the session to those users (plus the creator); an EMPTY set
makes it public. Odoo pushes the list to the harness; the sync adopts the
harness list only into mappings whose local set is empty.
"""
import logging
import uuid
from datetime import datetime

from odoo import _, api, fields, models
from odoo.exceptions import AccessError, UserError

_logger = logging.getLogger(__name__)

MANAGER_GROUP = 'npei_agent_harness.group_npei_agent_manager'


class NpeiAgentSession(models.Model):
    _name = 'npei.agent.session'
    _inherit = ['mail.thread', 'mail.activity.mixin']
    _description = 'DeepSeek Harness Session (Odoo ACL)'
    _order = 'seq, write_date desc'

    session_id = fields.Char(
        string='Harness Session ID',
        index=True,
        copy=False,
        help="Opaque session id owned by the harness. Left blank on create, "
             "Odoo calls session/create and fills it; set it by hand only to "
             "adopt an existing harness session.", tracking=True
    )
    name = fields.Char(
        string='Title', tracking=True,
        help="Pushed to the harness session title on change (session/rename).",
    )
    user_ids = fields.Many2many(
        'res.users',
        'npei_agent_session_user_rel',
        'session_id',
        'user_id',
        string='Allowed Users',
        help="Users allowed to access this session through the Odoo proxy. "
             "The record creator (create_uid) is always allowed even when "
             "absent from this list. Leave empty to make the session public.",
        tracking=True
    )
    preset_id = fields.Many2one(
        'npei.agent.preset',
        string='Agent Preset',
        ondelete='set null', tracking=True
    )
    workspace_path = fields.Char(string='Workspace Path', tracking=True)
    running = fields.Boolean(
        string='Running', readonly=True, copy=False,
        help="Live state reported by the last harness sync.",
    )
    blank = fields.Boolean(
        string='Blank', readonly=True, copy=False,
        help="Whether the harness reports this session as never prompted.",
    )
    harness_updated_at = fields.Datetime(
        string='Harness Updated At', readonly=True, copy=False,
        help="Last activity timestamp reported by the harness sync.",
    )
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
        has an empty ``user_ids`` (public), the user created the mapping, or
        the user is listed in ``user_ids``. Fails closed: an unmapped session
        id is denied to non-managers.
        """
        if user.has_group(MANAGER_GROUP):
            return True
        record = self.sudo().search([('session_id', '=', session_id)], limit=1)
        if not record:
            return False
        if not record.user_ids:
            return True
        return user == record.create_uid or user in record.user_ids

    # ------------------------------------------------------------------
    # Harness effects
    # ------------------------------------------------------------------
    def _push_title(self):
        """Best-effort: set each session's harness title from ``name``.

        The title is cosmetic, so a failure here is logged and swallowed
        rather than rolled back. Skips blank names. Suppressed under
        ``npei_syncing`` (mirror-only operations).
        """
        if self.env.context.get('npei_syncing'):
            return
        client = self.env['npei.agent.harness.client'].sudo()
        for record in self:
            if not record.session_id or not (record.name or '').strip():
                continue
            try:
                client._rpc('session/rename', {'request': {
                    'sessionId': record.session_id,
                    'title': record.name,
                }})
            except UserError as exc:
                _logger.warning(
                    "Failed to push title for session %s: %s", record.session_id, exc)

    def _push_access(self):
        """Push each mapping's ``user_ids`` as the harness access record.

        ``session/setAccess`` replaces the record whole; an empty list makes
        the session unrestricted again. Fail-loud (unlike the cosmetic
        title): a harness that did not take the access change must not look
        like it did. Suppressed under ``npei_syncing``.
        """
        if self.env.context.get('npei_syncing'):
            return
        client = self.env['npei.agent.harness.client'].sudo()
        for record in self:
            if not record.session_id:
                continue
            client._rpc('session/setAccess', {'request': {
                'sessionId': record.session_id,
                'allowedUsers': [str(user.id) for user in record.user_ids],
            }})

    @api.onchange('preset_id')
    def _onchange_preset_id_workspace(self):
        """Fill the workspace from the chosen preset's recorded default."""
        if self.preset_id and self.preset_id.workspace_path:
            self.workspace_path = self.preset_id.workspace_path

    @api.model
    def _default_workspace_from_preset(self, vals):
        """Default a blank ``workspace_path`` from the preset mirror in-place."""
        if vals.get('workspace_path') or not vals.get('preset_id'):
            return
        preset = self.env['npei.agent.preset'].browse(vals['preset_id'])
        if preset.workspace_path:
            vals['workspace_path'] = preset.workspace_path

    @api.model
    def _create_harness_session(self, vals):
        """Create a session on the harness and return its id.

        ``session/create`` takes ``{"request": {agentPreset?, cwd?}}``; the
        harness derives the working directory from the preset when ``cwd`` is
        omitted, so a ``cwd`` equal to the preset's own workspace is dropped.
        """
        request = {}
        cwd = vals.get('workspace_path')
        preset_key = None
        preset_workspace = None
        if vals.get('preset_id'):
            preset = self.env['npei.agent.preset'].browse(vals['preset_id'])
            preset_key = preset.preset_id or None
            preset_workspace = preset.workspace_path or None
        if preset_key:
            request['agentPreset'] = preset_key
        if cwd and cwd != preset_workspace:
            request['cwd'] = cwd
        value = self.env['npei.agent.harness.client'].sudo()._rpc(
            'session/create', {'request': request})
        session_id = (value or {}).get('sessionId')
        if not session_id:
            raise UserError(_("The harness session/create returned no sessionId."))
        return session_id

    @api.model_create_multi
    def create(self, vals_list):
        """Create the mappings, creating harness sessions for blank ids."""
        for vals in vals_list:
            self._default_workspace_from_preset(vals)
            if not vals.get('session_id') and not self.env.context.get('npei_syncing'):
                vals['session_id'] = self._create_harness_session(vals)
        records = super().create(vals_list)
        records._push_title()
        records.filtered(lambda r: r.user_ids)._push_access()
        return records

    def write(self, vals):
        """Write, then push the harness title/access when they changed."""
        result = super().write(vals)
        if 'name' in vals:
            self._push_title()
        if 'user_ids' in vals:
            self._push_access()
        return result

    # ------------------------------------------------------------------
    # Sync from harness
    # ------------------------------------------------------------------
    @api.model
    def action_sync_from_harness(self):
        """Upsert local mappings from the harness ``session/list``.

        Manager-gated. New harness sessions become public mappings (empty
        ``user_ids``); existing mappings refresh their mirror-only fields and
        adopt the harness title when the local one is blank.
        """
        if not self.env.user.has_group(MANAGER_GROUP):
            raise AccessError(
                _("Only NPEI Agent Managers can sync sessions from the harness."))
        value = self.env['npei.agent.harness.client']._rpc('session/list', {'_request': {}})
        items = (value or {}).get('items') or []
        model = self.with_context(npei_syncing=True)
        presets = {p.preset_id: p.id for p in self.env['npei.agent.preset']
                   .with_context(active_test=False).search([('preset_id', '!=', False)])}
        synced = 0
        for item in items:
            session_id = item.get('sessionId')
            if not session_id:
                continue
            projections = ((item.get('projections') or {}).get('values') or {})
            updated_ms = item.get('updatedAt')
            vals = {
                'running': bool(item.get('running')),
                'blank': bool(item.get('blank')),
                'workspace_path': item.get('cwd') or False,
                'harness_updated_at': (
                    datetime.utcfromtimestamp(updated_ms / 1000.0)
                    if isinstance(updated_ms, (int, float)) else False),
            }
            preset_key = projections.get('agentPreset')
            if preset_key and preset_key in presets:
                vals['preset_id'] = presets[preset_key]
            # Rows arrive under the management wildcard ticket, so restricted
            # sessions carry their allowedUsers (res.users ids as strings).
            allowed_ids = [int(u) for u in (item.get('allowedUsers') or [])
                           if str(u).isdigit()]
            allowed_users = self.env['res.users'].browse(allowed_ids).exists()
            existing = model.with_context(active_test=False).search(
                [('session_id', '=', session_id)], limit=1)
            if existing:
                if not existing.name and projections.get('title'):
                    vals['name'] = projections['title']
                # Odoo is the ACL authority: adopt the harness list only into
                # a mapping whose local set is still empty.
                if allowed_users and not existing.user_ids:
                    vals['user_ids'] = [(6, 0, allowed_users.ids)]
                existing.write(vals)
            else:
                model.create(dict(
                    vals,
                    session_id=session_id,
                    name=projections.get('title') or False,
                    user_ids=[(6, 0, allowed_users.ids)],
                ))
            synced += 1
        return {
            'type': 'ir.actions.client',
            'tag': 'display_notification',
            'params': {
                'title': _("Sessions synced"),
                'message': _("%s session(s) synced from the harness.", synced),
                'type': 'success',
                'sticky': False,
            },
        }

    def act_lock(self):
        self.write({'is_locked': True})

    def act_unlock(self):
        self.write({'is_locked': False})
