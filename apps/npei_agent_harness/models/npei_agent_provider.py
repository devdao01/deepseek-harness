# -*- coding: utf-8 -*-
"""LLM provider mirror.

Odoo-side catalog of harness LLM providers, synced from ``llm/listConfigurableProviders``. The
harness stays the source of truth for provider routing; this mirror is a
read-only management surface plus Odoo archiving.

The harness ``active`` flag (whether the route is live) is stored as
:attr:`route_active` so it does not clash with Odoo's own ``active`` archive
field.
"""
import uuid

from odoo import _, api, fields, models
from odoo.exceptions import AccessError

MANAGER_GROUP = 'npei_agent_harness.group_npei_agent_manager'


class NpeiAgentProvider(models.Model):
    _name = 'npei.agent.provider'
    _inherit = ['mail.thread', 'mail.activity.mixin']
    _description = 'DeepSeek Harness LLM Provider'
    _order = 'seq, provider'

    provider = fields.Char(
        string='Provider',
        required=True,
        index=True,
        copy=False, tracking=True,
        help="Provider id owned by the harness (``ProviderView.provider``).",
    )
    display_name = fields.Char(
        string='Display Name', tracking=True,
        help="Human-readable provider name from ``llm/listConfigurableProviders``.",
    )
    settings_ns = fields.Char(
        string='Settings Namespace', tracking=True,
        help="Settings namespace this provider reads its configuration from "
             "(raw key; the settings_id match partner).",
    )
    settings_id = fields.Many2one(
        'npei.agent.setting',
        string='Settings Namespace Record',
        index=True,
        ondelete='set null', tracking=True,
        help="The settings-namespace mirror matching settings_ns; blank until "
             "settings are synced. Many providers may share one namespace.",
    )
    settings_path = fields.Char(
        string='Settings Path', tracking=True,
        help="The harness ``settingsPath`` segments joined with ``/``.",
    )
    route_active = fields.Boolean(
        string='Route Active', tracking=True,
        help="Whether the harness reports this provider's route as active.",
    )
    declared = fields.Boolean(
        string='Declared', tracking=True,
        help="Whether the provider is explicitly declared in settings.",
    )
    active = fields.Boolean(default=True, tracking=True)
    seq = fields.Integer('Trình tự*:', default=1)
    is_locked = fields.Boolean('Đã Khóa*:', tracking=True)
    uuid = fields.Char('Mã Chuỗi Ngẫu nhiên*:', copy=False, tracking=True,
                       default=lambda self: str(uuid.uuid4()))
    model_ids = fields.One2many(
        'npei.agent.provider.model',
        'provider_id',
        string='Configured Models',
        help="Editable models array pushed to this provider's settings "
             "namespace (settings[ns].user[...path].models).",
    )
    catalog_model_ids = fields.One2many(
        'npei.agent.model',
        'provider_id',
        string='Catalog Models',
        help="Read-only resolved catalog models (llm.models) whose group id "
             "matches this provider.",
    )
    catalog_model_count = fields.Integer(
        string='Catalog Model Count',
        compute='_compute_catalog_model_count',
    )

    @api.depends('catalog_model_ids')
    def _compute_catalog_model_count(self):
        """Count of resolved catalog models linked to this provider."""
        for record in self:
            record.catalog_model_count = len(record.catalog_model_ids)

    def action_view_catalog_models(self):
        """Open the resolved catalog models linked to this provider."""
        self.ensure_one()
        return {
            'type': 'ir.actions.act_window',
            'name': _("Catalog Models"),
            'res_model': 'npei.agent.model',
            'view_mode': 'tree,form',
            'domain': [('provider_id', '=', self.id)],
            'context': {'default_provider_id': self.id},
        }

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
        """Upsert local providers from the harness ``llm/listConfigurableProviders``.

        Manager-gated. Returns a client notification action so it can back an
        ``ir.actions.server`` menu item.
        """
        self._check_manager()
        client = self.env['npei.agent.harness.client'].sudo()
        # llm/listConfigurableProviders carries every configurable route;
        # llm/listProviders lists the routes an adapter currently serves.
        entries = client._rpc('llm/listConfigurableProviders', {}) or []
        active_ids = {row.get('id') for row in (client._rpc('llm/listProviders', {}) or [])}
        synced = 0
        for entry in entries:
            provider = entry.get('provider')
            if not provider:
                continue
            path = entry.get('settingsPath') or []
            settings_ns = entry.get('settingsNs') or False
            setting = self.env['npei.agent.setting'].search(
                [('ns', '=', settings_ns)], limit=1) if settings_ns else False
            vals = {
                'display_name': entry.get('displayName') or provider,
                'settings_ns': settings_ns,
                'settings_id': setting.id if setting else False,
                'settings_path': '/'.join(path) if path else False,
                'route_active': provider in active_ids,
                # An absent `declared` means the route IS declared in settings.
                'declared': entry.get('declared', True),
            }
            existing = self.search([('provider', '=', provider)], limit=1)
            if existing:
                existing.write(vals)
                record = existing
            else:
                record = self.create(dict(vals, provider=provider))
            # Backfill catalog models synced before this provider existed.
            self.env['npei.agent.model'].search([
                ('provider', '=', provider),
                ('provider_id', '!=', record.id),
            ]).write({'provider_id': record.id})
            synced += 1
        return self._notify(_("%s provider(s) synced from the harness.", synced))

    def action_sync_models(self):
        """Mirror every provider's configured models from the harness.

        Manager-gated (delegates to
        ``npei.agent.provider.model.action_sync_from_harness``). Backs the
        provider form's *Sync Models from Harness* button.
        """
        return self.env['npei.agent.provider.model'].action_sync_from_harness()

    def act_lock(self):
        self.write({'is_locked': True})

    def act_unlock(self):
        self.write({'is_locked': False})
