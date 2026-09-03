# -*- coding: utf-8 -*-
"""Model discovery wizard.

Manager-only wizard that probes a provider endpoint for the models it offers via
the harness ``llm/discoverModels`` (a live network probe, not the static
catalog). Results are formatted into a read-only text box; the raw list is kept
so **Adopt** can append the discovered models into a target provider's
configurable catalog (``npei.agent.provider.model``), which pushes them into the
provider's settings namespace.
"""
import json

from odoo import _, api, fields, models
from odoo.exceptions import AccessError, UserError

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
    result_json = fields.Text(
        string='Discovered Models (raw)',
        readonly=True,
        help="The raw discovered models list, kept so Adopt can append them "
             "into a provider's configurable catalog.",
    )
    target_provider_id = fields.Many2one(
        'npei.agent.provider',
        string='Adopt Into Provider',
        help="Provider whose configurable models the discovered entries are "
             "appended to when Adopt runs.",
    )

    def _check_manager(self):
        """Raise unless the current user is an NPEI Agent Manager."""
        if not self.env.user.has_group(MANAGER_GROUP):
            raise AccessError(
                _("Only NPEI Agent Managers can discover models."))

    @api.model
    def _format_models(self, discovered):
        """Format ``llm/discoverModels`` entries into a display block.

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
        """Probe the provider via ``llm/discoverModels`` and show the result.

        Manager-gated. Sends ``settingsNs`` plus only the non-blank optional
        keys (``provider``/``baseURL``/``api``/``apiKey``), formats the returned
        models into :attr:`result_text`, and re-opens the wizard showing them.
        """
        self.ensure_one()
        self._check_manager()
        request = {}
        if self.provider:
            request['provider'] = self.provider
        if self.base_url:
            request['baseURL'] = self.base_url
        if self.api_type:
            request['api'] = self.api_type
        if self.api_key:
            request['apiKey'] = self.api_key
        value = self.env['npei.agent.harness.client'].sudo()._rpc(
            'llm/discoverModels', {'settingsNs': self.settings_ns, 'request': request})
        discovered = value or []
        self.result_text = self._format_models(discovered)
        self.result_json = json.dumps(discovered)
        return {
            'type': 'ir.actions.act_window',
            'res_model': 'npei.agent.discover.models',
            'res_id': self.id,
            'view_mode': 'form',
            'target': 'new',
        }

    def action_adopt(self):
        """Append the discovered models into :attr:`target_provider_id`'s catalog.

        Manager-gated. Requires a prior Discover (``result_json``) and a target
        provider. Each discovered model becomes an ``npei.agent.provider.model``
        row unless the provider already configures that id; creating the rows
        pushes the updated ``models`` array to the harness. Re-opens the wizard.

        :raises UserError: when no target provider is set or nothing was
            discovered yet.
        """
        self.ensure_one()
        self._check_manager()
        if not self.target_provider_id:
            raise UserError(_("Choose a provider to adopt the models into."))
        try:
            discovered = json.loads(self.result_json or '[]')
        except (ValueError, TypeError):
            discovered = []
        if not discovered:
            raise UserError(_("Discover models first, then Adopt."))
        ProviderModel = self.env['npei.agent.provider.model']
        existing_ids = set(ProviderModel.search([
            ('provider_id', '=', self.target_provider_id.id)]).mapped('model_id'))
        adopted = 0
        for entry in discovered:
            model_id = entry.get('id') if isinstance(entry, dict) else None
            if not model_id or model_id in existing_ids:
                continue
            ProviderModel.create({
                'provider_id': self.target_provider_id.id,
                'model_id': model_id,
                'name': entry.get('name') or False,
                'context_window': entry.get('contextWindow') or 0,
                'max_tokens': entry.get('maxTokens') or 0,
            })
            existing_ids.add(model_id)
            adopted += 1
        return {
            'type': 'ir.actions.act_window',
            'res_model': 'npei.agent.discover.models',
            'res_id': self.id,
            'view_mode': 'form',
            'target': 'new',
        }
