# -*- coding: utf-8 -*-
"""Agent preset mirror.

Odoo-side management surface for harness agent presets. The harness stays the
source of truth; :meth:`action_sync_from_harness` upserts the local mirror from
``agentPreset.list``.
"""
from odoo import _, api, fields, models
from odoo.exceptions import AccessError

MANAGER_GROUP = 'npei_agent_harness.group_npei_agent_manager'


class NpeiAgentPreset(models.Model):
    _name = 'npei.agent.preset'
    _description = 'DeepSeek Harness Agent Preset'
    _order = 'name'

    preset_id = fields.Char(
        string='Harness Preset ID',
        required=True,
        index=True,
        copy=False,
        help="Preset id owned by the harness (``AgentPresetEntry.id``).",
    )
    name = fields.Char(string='Name')
    description = fields.Text(string='Description')
    workspace_path = fields.Char(
        string='Default Workspace Path',
        help="Canonical path of the preset's provisioned default workspace "
             "(user presets only).",
    )
    trust = fields.Selection(
        [('system', 'System'), ('user', 'User')],
        string='Trust',
        default='user',
    )
    active = fields.Boolean(default=True)

    _sql_constraints = [
        (
            'preset_id_uniq',
            'unique(preset_id)',
            'A preset with this harness preset id already exists.',
        ),
    ]

    def _check_manager(self):
        """Raise unless the current user is an NPEI Agent Manager."""
        if not self.env.user.has_group(MANAGER_GROUP):
            raise AccessError(
                _("Only NPEI Agent Managers can sync presets from the harness."))

    @api.model
    def action_sync_from_harness(self):
        """Upsert local presets from the harness ``agentPreset.list``.

        Manager-gated. Returns a client notification action summarising the
        sync so it can back an ``ir.actions.server`` menu item.
        """
        self._check_manager()
        value = self.env['npei.agent.harness.client']._rpc('agentPreset.list', {})
        entries = value.get('presets') or []
        synced = 0
        for entry in entries:
            preset_id = entry.get('id')
            if not preset_id:
                continue
            vals = {
                'name': entry.get('name') or preset_id,
                'description': entry.get('description') or False,
                'workspace_path': entry.get('workspacePath') or False,
                'trust': entry.get('trust') or 'user',
            }
            existing = self.search([('preset_id', '=', preset_id)], limit=1)
            if existing:
                existing.write(vals)
            else:
                self.create(dict(vals, preset_id=preset_id))
            synced += 1
        return {
            'type': 'ir.actions.client',
            'tag': 'display_notification',
            'params': {
                'title': _("Presets synced"),
                'message': _("%s preset(s) synced from the harness.", synced),
                'type': 'success',
                'sticky': False,
            },
        }
