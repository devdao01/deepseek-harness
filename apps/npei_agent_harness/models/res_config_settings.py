# -*- coding: utf-8 -*-
"""Harness connection settings.

Surfaces the two ``ir.config_parameter`` keys the gateway needs through the
standard Settings screen. The ``config_parameter`` attribute makes each field
read from and write to the parameter store transparently.
"""
from odoo import _, fields, models
from odoo.exceptions import AccessError

# Records seeded by this data file are preserved by Clear Data.
TEMPLATE_DATA_MODULE = 'npei_agent_harness'
TEMPLATE_MODEL = 'npei.agent.provider.route.template'


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

    def action_clear_data(self):
        """Delete every persistent ``npei.agent.*`` record except the XML-seeded
        provider route templates.

        System-only (``base.group_system``): a destructive maintenance reset of
        the Odoo-side mirror/ACL/config records. It does NOT touch the harness —
        provider-model unlinks run under ``npei_syncing`` so no ``settings.mutate``
        is pushed. The route templates created by
        ``data/provider_route_templates.xml`` are kept (identified by their
        ``ir.model.data`` external ids); a manager's hand-added templates, having
        no seed external id, are cleared with the rest.

        :raises AccessError: when the caller is not in ``base.group_system``.
        :returns: a success notification with the deleted-record count.
        """
        self.ensure_one()
        if not self.env.user.has_group('base.group_system'):
            raise AccessError(_(
                "Only the system administrator can clear MTIL Agent data."))

        kept_template_ids = set(self.env['ir.model.data'].sudo().search([
            ('module', '=', TEMPLATE_DATA_MODULE),
            ('model', '=', TEMPLATE_MODEL),
        ]).mapped('res_id'))

        model_names = self.env['ir.model'].sudo().search(
            [('model', '=like', 'npei.agent.%')]).mapped('model')
        deleted = 0
        for name in model_names:
            model = self.env[name]
            # Transient wizards hold no durable data; abstract models have no
            # table. Neither participates in the reset.
            if model._transient or model._abstract:
                continue
            records = model.sudo().with_context(npei_syncing=True).search([])
            if name == TEMPLATE_MODEL:
                records = records.filtered(lambda r: r.id not in kept_template_ids)
            deleted += len(records)
            records.unlink()

        return {
            'type': 'ir.actions.client',
            'tag': 'display_notification',
            'params': {
                'title': _("MTIL Agent"),
                'message': _("Cleared %s record(s); route templates kept.", deleted),
                'type': 'success',
                'sticky': False,
            },
        }
