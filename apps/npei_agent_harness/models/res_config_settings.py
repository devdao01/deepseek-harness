# -*- coding: utf-8 -*-
"""Harness connection settings.

Surfaces the two ``ir.config_parameter`` keys the gateway needs through the
standard Settings screen. The ``config_parameter`` attribute makes each field
read from and write to the parameter store transparently.
"""
from odoo import _, fields, models


class ResConfigSettings(models.TransientModel):
    _inherit = 'res.config.settings'

    npei_harness_base_url = fields.Char(
        string='Harness Base URL',
        config_parameter='npei_agent_harness.base_url',
        help="Base URL of the DeepSeek Harness, e.g. https://harness.internal:8787. "
             "The gateway appends /api/<method>.",
    )
    npei_harness_api_token = fields.Char(
        string='Harness API Token',
        config_parameter='npei_agent_harness.api_token',
        help="Bearer token for the harness. On the harness host it lives at "
             "~/.dsh/api-token. Never exposed to the browser.",
    )

    def action_test_harness_connection(self):
        """Ping the harness with the saved settings and report the result.

        Calls ``host.describe`` through the shared client (Bearer token,
        server-side) and raises the harness identity as a sticky notification.
        Any misconfiguration or transport failure surfaces as the client's
        UserError, so the button doubles as a one-click connectivity check.
        """
        self.ensure_one()
        value = self.env['npei.agent.harness.client']._rpc('host.describe', {})
        message = _(
            "Connected. Model: %(model)s · cwd: %(cwd)s · version: %(version)s"
        ) % {
            'model': value.get('model', '?'),
            'cwd': value.get('cwd', '?'),
            'version': value.get('version', '?'),
        }
        return {
            'type': 'ir.actions.client',
            'tag': 'display_notification',
            'params': {
                'title': _("MTIL Agent"),
                'message': message,
                'type': 'success',
                'sticky': False,
            },
        }
