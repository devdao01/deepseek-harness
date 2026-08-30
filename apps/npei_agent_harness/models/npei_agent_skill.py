# -*- coding: utf-8 -*-
"""Skill mirror.

Odoo-side catalog of the skills the harness serves. The management surface the
harness exposes is **read-only**: ``skills/list`` is Session-addressed and
returns each skill's ``name``, ``description``, and ``modelInvocable`` flag —
there is no skill read/write/remove endpoint, so skill files are authored on
the harness host (workspace ``.agents/skills/`` directories), not from Odoo.

:meth:`action_sync_from_harness` borrows the most recently updated mapped
session to address the catalog and upserts one mirror row per skill.
"""
import logging
import uuid

from odoo import _, api, fields, models
from odoo.exceptions import AccessError, UserError

_logger = logging.getLogger(__name__)

MANAGER_GROUP = 'npei_agent_harness.group_npei_agent_manager'


class NpeiAgentSkill(models.Model):
    _name = 'npei.agent.skill'
    _inherit = ['mail.thread', 'mail.activity.mixin']
    _description = 'DeepSeek Harness Skill'
    _order = 'seq, name'

    skill_key = fields.Char(
        string='Skill Key',
        index=True,
        copy=False, tracking=True,
        help="Skill identity as the harness catalog reports it (the "
             "``SkillEntry.name``).",
    )
    name = fields.Char(string='Name', tracking=True)
    description = fields.Text(
        string='Description', tracking=True,
        help="The skill's catalog description — the hint telling the model "
             "when to invoke it (synced from ``skills/list``).",
    )
    model_invocable = fields.Boolean(
        string='Model Invocable', readonly=True, copy=False, tracking=True,
        help="Whether the harness lets the model invoke this skill directly.",
    )
    active = fields.Boolean(default=True, tracking=True)
    seq = fields.Integer('Trình tự*:', default=1)
    is_locked = fields.Boolean('Đã Khóa*:', tracking=True)
    uuid = fields.Char('Mã Chuỗi Ngẫu nhiên*:', copy=False, tracking=True,
                       default=lambda self: str(uuid.uuid4()))

    _sql_constraints = [
        (
            'skill_key_uniq',
            'unique(skill_key)',
            'A skill with this key already exists.',
        ),
    ]

    def _check_manager(self):
        """Raise unless the current user is an NPEI Agent Manager."""
        if not self.env.user.has_group(MANAGER_GROUP):
            raise AccessError(
                _("Only NPEI Agent Managers can sync skills from the harness."))

    @api.model
    def _catalog_session_id(self):
        """Return a harness session id able to address the skill catalog.

        ``skills/list`` is Session-addressed, so the most recently updated
        mapped session is borrowed; syncing sessions first provides one.
        """
        record = self.env['npei.agent.session'].sudo().search(
            [('session_id', '!=', False)], order='harness_updated_at desc, write_date desc',
            limit=1)
        if not record:
            raise UserError(_(
                "No harness session is mapped in Odoo yet. Run Sessions > "
                "Sync from Harness first — the skill catalog is read through "
                "a session."))
        return record.session_id

    @api.model
    def action_sync_from_harness(self):
        """Upsert local skills from the harness ``skills/list``.

        Manager-gated. Returns a client notification action summarising the
        sync so it can back an ``ir.actions.server`` menu item.
        """
        self._check_manager()
        client = self.env['npei.agent.harness.client'].sudo()
        value = client._rpc('skills/list', {
            'request': {'sessionId': self._catalog_session_id()},
        })
        entries = (value or {}).get('skills') or []
        synced = 0
        for entry in entries:
            key = entry.get('name')
            if not key:
                continue
            vals = {
                'name': key,
                'description': entry.get('description') or False,
                'model_invocable': bool(entry.get('modelInvocable')),
            }
            existing = self.with_context(active_test=False).search(
                [('skill_key', '=', key)], limit=1)
            if existing:
                existing.write(vals)
            else:
                self.create(dict(vals, skill_key=key))
            synced += 1
        return {
            'type': 'ir.actions.client',
            'tag': 'display_notification',
            'params': {
                'title': _("Skills synced"),
                'message': _("%s skill(s) synced from the harness.", synced),
                'type': 'success',
                'sticky': False,
            },
        }

    def act_lock(self):
        self.write({'is_locked': True})

    def act_unlock(self):
        self.write({'is_locked': False})
