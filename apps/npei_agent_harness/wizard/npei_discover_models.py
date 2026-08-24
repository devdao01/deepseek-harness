# -*- coding: utf-8 -*-
"""Model discovery wizard.

Manager-only wizard that probes a provider endpoint for the models it offers via
the harness ``llm.discoverModels`` (a live network probe, not the static
catalog). Results are formatted into a read-only text box; there is no adoption
in this version — configure a discovered model through the settings namespaces
(``npei.agent.setting``).
"""
from odoo import _, api, fields, models
from odoo.exceptions import AccessError

MANAGER_GROUP = 'npei_agent_harness.group_npei_agent_manager'


class NpeiDiscoverModels(models.TransientModel):
    _name = 'npei.agent.discover.models'
    _description = 'DeepSeek Harness Discover Models'

    settings_ns = fields.Char(
        string='Settings Namespace',
        required=True,
        help="Settings namespace whose provider defaults seed the probe.",
    )
    provider = fields.Char(
        string='Provider',
        help="Optional provider id override.",
    )
    base_url = fields.Char(
        string='Base URL',
        help="Optional base URL override for the probe endpoint.",
    )
    api_type = fields.Char(
        string='API',
        help="Optional provider API flavour override (sent as the `api` param). "
             "Named api_type so it does not shadow the odoo `api` module.",
    )
    api_key = fields.Char(
        string='API Key',
        help="Optional API key used only for this probe; never persisted.",
    )
    result_text = fields.Text(
        string='Discovered Models',
        readonly=True,
        help="One line per discovered model: id, name, context window, max "
             "tokens.",
    )

    def _check_manager(self):
        """Raise unless the current user is an NPEI Agent Manager."""
        if not self.env.user.has_group(MANAGER_GROUP):
            raise AccessError(
                _("Only NPEI Agent Managers can discover models."))

    @api.model
    def _format_models(self, discovered):
        """Format ``llm.discoverModels`` entries into a display block.

        :param discovered: the returned ``models`` list.
        :rtype: str
        """
        if not discovered:
            return _("No models returned.")
        lines = []
        for model in discovered:
            parts = [model.get('id') or '']
            if model.get('name'):
                parts.append(model['name'])
            if model.get('contextWindow') is not None:
                parts.append(_("context=%s") % model['contextWindow'])
            if model.get('maxTokens') is not None:
                parts.append(_("maxTokens=%s") % model['maxTokens'])
            lines.append('  '.join(part for part in parts if part))
        return '\n'.join(lines)

    def action_discover(self):
        """Probe the provider via ``llm.discoverModels`` and show the result.

        Manager-gated. Sends ``settingsNs`` plus only the non-blank optional
        keys (``provider``/``baseURL``/``api``/``apiKey``), formats the returned
        models into :attr:`result_text`, and re-opens the wizard showing them.
        """
        self.ensure_one()
        self._check_manager()
        payload = {'settingsNs': self.settings_ns}
        if self.provider:
            payload['provider'] = self.provider
        if self.base_url:
            payload['baseURL'] = self.base_url
        if self.api_type:
            payload['api'] = self.api_type
        if self.api_key:
            payload['apiKey'] = self.api_key
        value = self.env['npei.agent.harness.client'].sudo()._rpc(
            'llm.discoverModels', payload)
        self.result_text = self._format_models(value.get('models') or [])
        return {
            'type': 'ir.actions.act_window',
            'res_model': 'npei.agent.discover.models',
            'res_id': self.id,
            'view_mode': 'form',
            'target': 'new',
        }
