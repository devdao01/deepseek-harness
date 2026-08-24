# -*- coding: utf-8 -*-
"""LLM provider mirror.

Odoo-side catalog of harness LLM providers, synced from ``llm.providers``. The
harness stays the source of truth for provider routing; this mirror is a
read-only management surface plus Odoo archiving.

The harness ``active`` flag (whether the route is live) is stored as
:attr:`route_active` so it does not clash with Odoo's own ``active`` archive
field.
"""
from odoo import _, api, fields, models
from odoo.exceptions import AccessError

MANAGER_GROUP = 'npei_agent_harness.group_npei_agent_manager'


class NpeiAgentProvider(models.Model):
    _name = 'npei.agent.provider'
    _description = 'DeepSeek Harness LLM Provider'
    _order = 'provider'

    provider = fields.Char(
        string='Provider',
        required=True,
        index=True,
        copy=False,
        help="Provider id owned by the harness (``ProviderView.provider``).",
    )
    display_name = fields.Char(
        string='Display Name',
        help="Human-readable provider name from ``llm.providers``.",
    )
    settings_ns = fields.Char(
        string='Settings Namespace',
        help="Settings namespace this provider reads its configuration from.",
    )
    settings_path = fields.Char(
        string='Settings Path',
        help="The harness ``settingsPath`` segments joined with ``/``.",
    )
    route_active = fields.Boolean(
        string='Route Active',
        help="Whether the harness reports this provider's route as active.",
    )
    declared = fields.Boolean(
        string='Declared',
        help="Whether the provider is explicitly declared in settings.",
    )
    active = fields.Boolean(default=True)

    _sql_constraints = [
        (
            'provider_uniq',
            'unique(provider)',
            'A provider with this id already exists.',
        ),
    ]

    def _check_manager(self):
        """Raise unless the current user is an NPEI Agent Manager."""
        if not self.env.user.has_group(MANAGER_GROUP):
            raise AccessError(
                _("Only NPEI Agent Managers can sync providers from the harness."))

    def _notify(self, message):
        """Build a success ``display_notification`` client action."""
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

    @api.model
    def action_sync_from_harness(self):
        """Upsert local providers from the harness ``llm.providers``.

        Manager-gated. Returns a client notification action so it can back an
        ``ir.actions.server`` menu item.
        """
        self._check_manager()
        value = self.env['npei.agent.harness.client'].sudo()._rpc('llm.providers', {})
        entries = value.get('providers') or []
        synced = 0
        for entry in entries:
            provider = entry.get('provider')
            if not provider:
                continue
            path = entry.get('settingsPath') or []
            vals = {
                'display_name': entry.get('displayName') or provider,
                'settings_ns': entry.get('settingsNs') or False,
                'settings_path': '/'.join(path) if path else False,
                'route_active': bool(entry.get('active')),
                'declared': bool(entry.get('declared')),
            }
            existing = self.search([('provider', '=', provider)], limit=1)
            if existing:
                existing.write(vals)
            else:
                self.create(dict(vals, provider=provider))
            synced += 1
        return self._notify(_("%s provider(s) synced from the harness.", synced))
