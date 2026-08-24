# -*- coding: utf-8 -*-
"""Add a provider route wizard.

Declares one OpenAI-/Anthropic-compatible provider route (OpenRouter, Together,
a self-hosted gateway, …) on the ``llm-pi-ai`` adapter without hand-editing raw
settings JSON. The route profile is written with a **path-scoped**
``settings.mutate`` (``{op:'set', path:['providers', <key>], value:{…}}``) so it
adds the route and leaves every other route in the section untouched — unlike the
whole-section replace behind :class:`npei.agent.setting`.

After the write the wizard syncs the provider mirror so the new route appears
under Providers, where its models are configured through
``npei.agent.provider.model``.

The ``api`` protocol list and ``compat.thinkingFormat`` list mirror the pi-ai
adapter's ``supportedProtocols()`` / ``SUPPORTED_THINKING_FORMATS`` (protocol
constants; kept in sync with the adapter by hand).
"""
import re

from odoo import _, api, fields, models
from odoo.exceptions import AccessError, UserError

MANAGER_GROUP = 'npei_agent_harness.group_npei_agent_manager'

# The pi-ai settings namespace that owns configured provider routes.
PI_AI_NS = 'llm-pi-ai'

# Wire protocols a hand-declared route may name (pi-ai supportedProtocols()).
PROTOCOLS = [
    ('openai-completions', 'OpenAI Completions'),
    ('openai-responses', 'OpenAI Responses'),
    ('anthropic-messages', 'Anthropic Messages'),
]

# Reasoning-dispatch formats (pi-ai SUPPORTED_THINKING_FORMATS); blank lets pi-ai
# guess from the base URL.
THINKING_FORMATS = [
    ('openai', 'openai'),
    ('deepseek', 'deepseek'),
    ('openrouter', 'openrouter'),
    ('together', 'together'),
    ('zai', 'zai'),
    ('qwen', 'qwen'),
    ('string-thinking', 'string-thinking'),
    ('ant-ling', 'ant-ling'),
]

ROUTE_KEY_PATTERN = re.compile(r'^[a-z0-9][a-z0-9-]*$')


class NpeiProviderRoute(models.TransientModel):
    _name = 'npei.agent.provider.route'
    _description = 'DeepSeek Harness Add Provider Route'

    settings_ns = fields.Char(
        string='Settings Namespace',
        required=True,
        default=PI_AI_NS,
        help="The pi-ai adapter namespace that owns provider routes. Leave as "
             "llm-pi-ai unless the deployment renamed it.",
    )
    route_key = fields.Char(
        string='Route Key',
        required=True,
        help="Route id under providers.<key>, lower-case (e.g. openrouter). "
             "Also stamped on every model's provider.",
    )
    display_name = fields.Char(
        string='Display Name',
        help="Human-readable name shown in selectors.",
    )
    api_protocol = fields.Selection(
        PROTOCOLS,
        string='Wire Protocol',
        required=True,
        default='openai-completions',
        help="Endpoint wire format (sent as the profile `api` key). OpenRouter "
             "and most gateways speak openai-completions. Named api_protocol so "
             "it does not shadow the odoo `api` module.",
    )
    base_url = fields.Char(
        string='Base URL',
        required=True,
        help="Endpoint base, e.g. https://openrouter.ai/api/v1.",
    )
    api_key_env = fields.Char(
        string='Credential Reference',
        help="Credential-reference name the route resolves its key through "
             "(apiKeyEnv). Blank derives <ROUTE_KEY>_API_KEY.",
    )
    api_key = fields.Char(
        string='API Key',
        help="Optional key value pushed to the credential store now "
             "(credentials.set); never persisted in Odoo.",
    )
    thinking_format = fields.Selection(
        THINKING_FORMATS,
        string='Thinking Format',
        help="compat.thinkingFormat for the route's models; blank lets pi-ai "
             "guess from the base URL. OpenRouter uses openrouter.",
    )
    models_text = fields.Text(
        string='Models',
        help="One model per line: `id` or `id | Display Name` "
             "(e.g. openai/gpt-4o | GPT-4o). Optional — add more later under "
             "the provider's Configured Models.",
    )

    def _check_manager(self):
        """Raise unless the current user is an NPEI Agent Manager."""
        if not self.env.user.has_group(MANAGER_GROUP):
            raise AccessError(
                _("Only NPEI Agent Managers can add provider routes."))

    @api.model
    def _derive_key_ref(self, route_key):
        """The conventional credential reference for a route (``<KEY>_API_KEY``)."""
        upper = re.sub(r'[^A-Z0-9]+', '_', (route_key or '').upper())
        return '%s_API_KEY' % upper.strip('_')

    @api.onchange('route_key')
    def _onchange_route_key(self):
        """Prefill the display name and credential reference from the key."""
        if self.route_key and not self.display_name:
            self.display_name = self.route_key
        if self.route_key and not self.api_key_env:
            self.api_key_env = self._derive_key_ref(self.route_key)

    @api.model
    def _parse_models(self, models_text):
        """Parse the models textarea into ``models[]`` entries.

        Each non-blank line is ``id`` or ``id | Name``.

        :rtype: list
        """
        entries = []
        for line in (models_text or '').splitlines():
            line = line.strip()
            if not line:
                continue
            if '|' in line:
                model_id, name = (part.strip() for part in line.split('|', 1))
            else:
                model_id, name = line, ''
            if not model_id:
                continue
            entry = {'id': model_id}
            if name:
                entry['name'] = name
            entries.append(entry)
        return entries

    def action_create_route(self):
        """Declare the route on the harness, then sync the provider mirror.

        Manager-gated. Validates the key, builds the route profile, writes it
        with a path-scoped ``settings.mutate`` (so sibling routes are left
        intact), pushes the API key with ``credentials.set`` when one was typed,
        and syncs providers so the route appears under Providers.

        :raises UserError: when the route key is malformed.
        """
        self.ensure_one()
        self._check_manager()
        route_key = (self.route_key or '').strip()
        if not ROUTE_KEY_PATTERN.match(route_key):
            raise UserError(_(
                "The route key %s must be lower-case letters, digits, or "
                "hyphens, starting with a letter or digit.", route_key))
        api_key_env = (self.api_key_env or '').strip() or self._derive_key_ref(route_key)

        profile = {'api': self.api_protocol, 'baseURL': (self.base_url or '').strip()}
        if self.display_name:
            profile['displayName'] = self.display_name
        if api_key_env:
            profile['apiKeyEnv'] = api_key_env
        if self.thinking_format:
            profile['compat'] = {'thinkingFormat': self.thinking_format}
        models = self._parse_models(self.models_text)
        if models:
            profile['models'] = models

        client = self.env['npei.agent.harness.client'].sudo()
        client._rpc('settings.mutate', {
            'ns': self.settings_ns,
            'ops': [{'op': 'set', 'path': ['providers', route_key], 'value': profile}],
        })
        if self.api_key:
            client._rpc('credentials.set', {'ref': api_key_env, 'value': self.api_key})

        self.env['npei.agent.provider'].action_sync_from_harness()
        return {
            'type': 'ir.actions.client',
            'tag': 'display_notification',
            'params': {
                'title': _("MTIL Agent"),
                'message': _(
                    "Route %(key)s added. Configure its models under "
                    "Providers > %(key)s > Configured Models.", key=route_key),
                'type': 'success',
                'sticky': False,
            },
        }
