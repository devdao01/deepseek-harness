# -*- coding: utf-8 -*-
"""Harness host status panel.

Manager-only, read-only snapshot of the DeepSeek Harness host via the
``host.describe`` unary method: the harness app version, working directory, the
default provider/model applied to new agents, the count of currently attached
sessions, and whether the deployment can hand a path to a native desktop.

There is nothing to configure here — this is an operations dashboard. Opening
the panel fetches once (``default_get``); the Refresh button re-fetches.
"""
from odoo import _, api, fields, models
from odoo.exceptions import AccessError

MANAGER_GROUP = 'npei_agent_harness.group_npei_agent_manager'


class NpeiHostStatus(models.TransientModel):
    _name = 'npei.agent.host.status'
    _description = 'DeepSeek Harness Host Status'

    version = fields.Char(
        string='Harness Version',
        readonly=True,
        help="The harness host app (apps/cli) package.json version.",
    )
    cwd = fields.Char(
        string='Working Directory',
        readonly=True,
        help="Host process working directory: the root for session "
             "persistence and tool execution.",
    )
    provider = fields.Char(
        string='Default Provider',
        readonly=True,
        help="Provider applied to a new agent that names none; blank when the "
             "host configures no explicit default.",
    )
    model = fields.Char(
        string='Default Model',
        readonly=True,
        help="Model applied to a new agent that names none; blank when the "
             "host configures no explicit default.",
    )
    attached_sessions = fields.Integer(
        string='Attached Sessions',
        readonly=True,
        help="Count of currently attached sessions (those with a live agent).",
    )
    can_open_path = fields.Boolean(
        string='Can Open Native Path',
        readonly=True,
        help="Whether this deployment can hand a path to a user-visible "
             "native desktop (false on a headless backend).",
    )

    def _check_manager(self):
        """Raise unless the current user is an NPEI Agent Manager."""
        if not self.env.user.has_group(MANAGER_GROUP):
            raise AccessError(
                _("Only NPEI Agent Managers can view the harness host status."))

    @api.model
    def _describe_values(self):
        """Fetch ``host.describe`` and map it onto this model's fields.

        Manager-gated. The optional ``provider``/``model`` keys are absent when
        the host configures no explicit default; they map to a blank Char.

        :rtype: dict
        """
        self._check_manager()
        value = self.env['npei.agent.harness.client'].sudo()._rpc(
            'host.describe', {})
        return {
            'version': value.get('version') or '',
            'cwd': value.get('cwd') or '',
            'provider': value.get('provider') or '',
            'model': value.get('model') or '',
            'attached_sessions': value.get('attachedSessions') or 0,
            'can_open_path': bool(value.get('canOpenPath')),
        }

    @api.model
    def default_get(self, fields_list):
        """Populate a freshly opened panel with a live ``host.describe`` snapshot."""
        defaults = super().default_get(fields_list)
        defaults.update(self._describe_values())
        return defaults

    def action_refresh(self):
        """Re-fetch ``host.describe`` and re-open the panel showing the result."""
        self.ensure_one()
        self.write(self._describe_values())
        return {
            'type': 'ir.actions.act_window',
            'res_model': 'npei.agent.host.status',
            'res_id': self.id,
            'view_mode': 'form',
            'target': 'new',
        }
