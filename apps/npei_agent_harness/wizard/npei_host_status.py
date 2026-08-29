# -*- coding: utf-8 -*-
"""Harness host status panel.

Manager-only, read-only operations snapshot of the DeepSeek Harness host.

Harness 0.1.2 deleted the ``host.describe`` unary method, so the panel is
DEGRADED to what the surviving Remotes expose:

* default provider/model — from ``session/modelCatalog`` (``default``),
* attached-session count — from ``session/list`` (``items`` length),
* native-open capability — from ``session/canOpenWorkspacePath``.

The harness app **version** and **working directory** are no longer exposed by
any 0.1.2 endpoint; those fields stay blank and the form flags the gap. There is
nothing to configure here. Opening the panel fetches once (``default_get``); the
Refresh button re-fetches.
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
        help="Not exposed by harness 0.1.2 (the host.describe endpoint was "
             "removed); always blank.",
    )
    cwd = fields.Char(
        string='Working Directory',
        readonly=True,
        help="Not exposed by harness 0.1.2 (the host.describe endpoint was "
             "removed); always blank.",
    )
    unavailable_note = fields.Char(
        string='Note',
        readonly=True,
        help="Explains which fields harness 0.1.2 no longer exposes.",
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

    # Fixed message: harness 0.1.2 no longer exposes the host app version or cwd.
    _UNAVAILABLE_NOTE = (
        "Harness version and working directory are not exposed by harness 0.1.2 "
        "(host.describe was removed).")

    @api.model
    def _describe_values(self):
        """Assemble the degraded 0.1.2 host snapshot from the surviving Remotes.

        Manager-gated. Default provider/model come from ``session/modelCatalog``
        (absent default keys map to a blank Char); the attached-session count is
        the length of ``session/list`` items; native-open capability is
        ``session/canOpenWorkspacePath``. Version/cwd have no 0.1.2 source and
        stay blank.

        :rtype: dict
        """
        self._check_manager()
        client = self.env['npei.agent.harness.client'].sudo()
        catalog = client._rpc('session.modelCatalog', {})
        default = catalog.get('default') or {}
        sessions = client._rpc('session.list', {})
        can_open = client._rpc('session.canOpenWorkspacePath', {})
        return {
            'version': '',
            'cwd': '',
            'provider': default.get('provider') or '',
            'model': default.get('model') or '',
            'attached_sessions': len(sessions.get('items') or []),
            'can_open_path': bool(can_open),
            'unavailable_note': self._UNAVAILABLE_NOTE,
        }

    @api.model
    def default_get(self, fields_list):
        """Populate a freshly opened panel with a live host snapshot."""
        defaults = super().default_get(fields_list)
        defaults.update(self._describe_values())
        return defaults

    def action_refresh(self):
        """Re-fetch the degraded host snapshot and re-open the panel."""
        self.ensure_one()
        self.write(self._describe_values())
        return {
            'type': 'ir.actions.act_window',
            'res_model': 'npei.agent.host.status',
            'res_id': self.id,
            'view_mode': 'form',
            'target': 'new',
        }
