# -*- coding: utf-8 -*-
"""Grantable-tool catalog for structured preset authoring.

Mirrors ``agentPresets/toolCatalog`` — the tools the harness's default
composition registers — so router sub-agent lines can grant tools by picking
from a list instead of memorizing names. Sync is manager-gated; records are
upserted by ``name`` and never deleted (a tool gone from the harness merely
stops matching new grants).
"""
import uuid

from odoo import _, api, fields, models
from odoo.exceptions import AccessError

MANAGER_GROUP = 'npei_agent_harness.group_npei_agent_manager'


class NpeiAgentTool(models.Model):
    _name = 'npei.agent.tool'
    _description = 'DeepSeek Harness Grantable Tool'
    _order = 'name'

    name = fields.Char(
        string='Tool Name', required=True, index=True,
        help="Tool name as toolFilter.allow grants it (e.g. bash, web_search).",
    )
    description = fields.Text(
        string='Description', readonly=True,
        help="Model-facing description reported by the harness sync.",
    )
    is_default = fields.Boolean(
        string='Default Grant',
        help="Pre-selected in Granted Tools when a new router sub-agent line "
             "is created. Local flag — the harness sync never touches it.",
    )
    active = fields.Boolean(default=True, tracking=True)
    seq = fields.Integer('Sequence*:', default=1)
    is_locked = fields.Boolean('Locked*:', tracking=True)
    uuid = fields.Char('Random Code*:', copy=False, tracking=True,
                       default=lambda self: str(uuid.uuid4()))

    _sql_constraints = [
        ('name_uniq', 'unique(name)', 'A tool with this name already exists.'),
    ]

    @api.model
    def action_sync_from_harness(self):
        """Upsert the catalog from ``agentPresets/toolCatalog``."""
        if not self.env.user.has_group(MANAGER_GROUP):
            raise AccessError(
                _("Only NPEI Agent Managers can sync tools from the harness."))
        value = self.env['npei.agent.harness.client']._rpc('agentPresets/toolCatalog', {})
        entries = (value or {}).get('tools') or []
        synced = 0
        for entry in entries:
            name = entry.get('name')
            if not name:
                continue
            vals = {'description': entry.get('description') or False}
            existing = self.search([('name', '=', name)], limit=1)
            if existing:
                existing.write(vals)
            else:
                self.create(dict(vals, name=name))
            synced += 1
        return {
            'type': 'ir.actions.client',
            'tag': 'display_notification',
            'params': {
                'title': _("Tools synced"),
                'message': _("%s tool(s) synced from the harness.", synced),
                'type': 'success',
                'sticky': False,
            },
        }

    def act_lock(self):
        self.write({'is_locked': True})

    def act_unlock(self):
        self.write({'is_locked': False})
